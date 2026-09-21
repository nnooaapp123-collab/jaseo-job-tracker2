import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { initJobRolloverScheduler } from "./lib/job-rollover";
import { initBackupScheduler } from "./lib/backup-scheduler";
import { initSavingsScheduler } from "./lib/savings-scheduler";
import { autoSeedUsers } from "./lib/auto-seed";
import { setupProposalMarketplace } from "./lib/pm-setup";
import { pool } from "@workspace/db";

const PgStore = ConnectPgSimple(session);

const app: Express = express();
const sessionSecret = process.env.SESSION_SECRET;
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

if (process.env.NODE_ENV === "production" && !sessionSecret) {
  throw new Error("SESSION_SECRET wajib diisi pada environment production.");
}

// Express perlu mempercayai proxy HTTPS (Nginx) agar secure cookie dapat
// mengenali koneksi asli sebagai HTTPS.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: process.env.APP_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Buat tabel session secara manual agar tidak bergantung pada file table.sql
// (connect-pg-simple createTableIfMissing tidak berfungsi di build esbuild)
pool.query(`
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
  ) WITH (OIDS=FALSE);
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`).catch((err: Error) => logger.warn({ err }, "Session table setup warning (mungkin sudah ada)"));

app.use(
  session({
    store: new PgStore({
      pool,
      // createTableIfMissing dihapus — tabel dibuat manual di atas
    }),
    secret: sessionSecret || "jaseo-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: sessionCookieSecure,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

app.use("/api", router);

// Buat akun default jika belum ada user sama sekali (production first-run)
autoSeedUsers();

// Setup tabel dan data awal ProposalHub (idempotent, aman dijalankan berulang)
setupProposalMarketplace();

// Aktifkan scheduler rollover job jam 16.00 WIB
initJobRolloverScheduler();

// Connector Google Sheets bawaan Replit tidak tersedia di VPS. Scheduler
// sengaja dapat dimatikan sampai integrasi backup dipindahkan ke provider
// Google resmi atau storage backup lain.
if (process.env.ENABLE_GOOGLE_SHEETS_BACKUP !== "false") {
  initBackupScheduler();
} else {
  logger.warn("Backup Google Sheets dinonaktifkan melalui ENABLE_GOOGLE_SHEETS_BACKUP=false");
}

// Aktifkan scheduler tabungan bulanan — sync setiap akhir bulan jam 16.00 WIB
initSavingsScheduler();

export default app;
