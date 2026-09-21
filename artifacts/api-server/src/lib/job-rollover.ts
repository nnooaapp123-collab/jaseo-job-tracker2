import cron from "node-cron";
import { db, jobsTable } from "@workspace/db";
import { lt, and, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

const JAKARTA_TIMEZONE = "Asia/Jakarta";

function getJakartaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return utcDate.toISOString().slice(0, 10);
}

function getRolloverTargetDate(date = new Date()) {
  const jakarta = getJakartaDateParts(date);
  return jakarta.hour >= 16 ? addDays(jakarta.dateStr, 1) : jakarta.dateStr;
}

export async function rolloverUnfinishedJobs(): Promise<void> {
  try {
    const targetDate = getRolloverTargetDate();

    const result = await db
      .update(jobsTable)
      .set({ jobDate: targetDate })
      .where(
        and(
          lt(jobsTable.jobDate, targetDate),
          eq(jobsTable.isChecked, false),
        ),
      )
      .returning({ id: jobsTable.id, oldDate: jobsTable.jobDate });

    if (result.length > 0) {
      logger.info(
        { count: result.length, movedTo: targetDate },
        "Job rollover: memindahkan job yang belum selesai ke tanggal aktif WIB",
      );
    } else {
      logger.debug({ targetDate }, "Job rollover: tidak ada job yang perlu dipindahkan");
    }
  } catch (err) {
    logger.error({ err }, "Job rollover: gagal menjalankan rollover");
  }
}

/**
 * Inisialisasi scheduler rollover.
 * Jadwal: setiap hari jam 16.00 WIB = 09:00 UTC
 */
export function initJobRolloverScheduler(): void {
  // Jalankan segera saat server start — tangani job yang terlewat
  rolloverUnfinishedJobs();

  cron.schedule("0 16 * * *", async () => {
    logger.info("Job rollover scheduler: menjalankan rollover jam 16.00 WIB");
    await rolloverUnfinishedJobs();
  }, {
    timezone: JAKARTA_TIMEZONE,
  });

  logger.info("Job rollover scheduler aktif — berjalan setiap hari jam 16.00 WIB");
}
