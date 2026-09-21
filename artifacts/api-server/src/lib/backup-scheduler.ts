import cron from "node-cron";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const JAKARTA_TZ = "Asia/Jakarta";
const BACKUP_HOUR_KEY = "backup_schedule_hour";
const BACKUP_MINUTE_KEY = "backup_schedule_minute";

let currentTask: cron.ScheduledTask | null = null;

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

async function runScheduledBackup() {
  try {
    logger.info("Backup otomatis dijadwalkan mulai dijalankan...");
    // Dynamic import to avoid circular dependency
    const { runBackupToSheets } = await import("../routes/backup");
    const result = await runBackupToSheets("jadwal-otomatis");
    logger.info(
      { spreadsheetId: result.spreadsheetId, summary: result.summary },
      "Backup otomatis selesai"
    );
  } catch (err: any) {
    logger.error({ err: err?.message }, "Backup otomatis gagal");
  }
}

export async function reinitBackupScheduler(): Promise<void> {
  // Stop existing task
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    logger.info("Backup scheduler lama dihentikan");
  }

  const hour = Number(await getSetting(BACKUP_HOUR_KEY) ?? "16");
  const minute = Number(await getSetting(BACKUP_MINUTE_KEY) ?? "1");

  const cronExpr = `${minute} ${hour} * * *`;
  currentTask = cron.schedule(cronExpr, runScheduledBackup, { timezone: JAKARTA_TZ });

  logger.info(
    { hour, minute, cron: cronExpr },
    `Backup otomatis aktif — dijadwalkan setiap hari jam ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} WIB`
  );
}

export async function initBackupScheduler(): Promise<void> {
  await reinitBackupScheduler();
}
