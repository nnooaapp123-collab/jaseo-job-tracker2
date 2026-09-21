import cron from "node-cron";
import { db, usersTable, monthlySavingsTable } from "@workspace/db";
import { sql, and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { syncMonthlySavingsForUser } from "../routes/jobs";

const JAKARTA_TIMEZONE = "Asia/Jakarta";

function getJakartaDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function getLastClosedMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function isLastDayOfMonth(year: number, month: number, day: number): boolean {
  const lastDay = new Date(year, month, 0).getDate();
  return day === lastDay;
}

async function runSyncForMonth(year: number, month: number, reason: string) {
  logger.info({ year, month }, `Savings scheduler: mulai sync tabungan — ${reason}`);

  const users = await db
    .select()
    .from(usersTable)
    .where(
      sql`${usersTable.role} <> 'admin' AND NOT (${usersTable.role} = 'editor' AND ${usersTable.writerId} IS NULL)`,
    );

  let synced = 0;
  let errors = 0;

  for (const user of users) {
    try {
      await syncMonthlySavingsForUser(user, { year, month });
      synced++;
    } catch (err) {
      errors++;
      logger.error({ err, userId: user.id, username: user.username }, "Savings scheduler: gagal sync user");
    }
  }

  logger.info({ year, month, synced, errors, total: users.length }, "Savings scheduler: sync tabungan selesai");
}

/**
 * Jalankan sync di hari terakhir bulan (jadwal normal).
 */
export async function syncSavingsEndOfMonth(): Promise<void> {
  const { year, month, day } = getJakartaDateParts();

  if (!isLastDayOfMonth(year, month, day)) {
    logger.debug({ year, month, day }, "Savings scheduler: bukan akhir bulan, dilewati");
    return;
  }

  await runSyncForMonth(year, month, "akhir bulan terdeteksi");
}

/**
 * Catch-up: sync bulan lalu secara idempotent setiap kali server startup.
 * syncMonthlySavingsForUser memakai onConflictDoUpdate sehingga aman diulang —
 * karyawan yang sudah tersync tidak berubah, yang belum (mis. threshold baru
 * terpenuhi atau ada karyawan baru) akan ditambahkan.
 * Dipanggil saat server startup dan setiap hari lewat cron.
 */
export async function catchUpMissedSavings(): Promise<void> {
  const { year, month } = getJakartaDateParts();
  const last = getLastClosedMonth(year, month);

  logger.info(
    { year: last.year, month: last.month },
    "Savings catch-up: menjalankan sync idempotent untuk bulan lalu",
  );

  await runSyncForMonth(last.year, last.month, "catch-up startup idempotent");
}

/**
 * Inisialisasi scheduler tabungan bulanan.
 * - Saat startup: langsung cek catch-up untuk bulan lalu yang mungkin terlewat.
 * - Cron harian 16:02 WIB: sync di hari terakhir bulan (jadwal normal) + catch-up.
 */
export function initSavingsScheduler(): void {
  // Catch-up saat startup — tangani kasus server restart di hari terakhir bulan
  catchUpMissedSavings().catch(err =>
    logger.error({ err }, "Savings catch-up startup: error"),
  );

  cron.schedule(
    "2 16 * * *",
    async () => {
      logger.info("Savings scheduler: running jam 16.02 WIB");
      await syncSavingsEndOfMonth();
      await catchUpMissedSavings(); // jaga-jaga jika ada bulan yang terlewat
    },
    { timezone: JAKARTA_TIMEZONE },
  );

  logger.info("Savings scheduler aktif — berjalan setiap hari jam 16.02 WIB, aktif di hari terakhir bulan (+ catch-up otomatis)");
}
