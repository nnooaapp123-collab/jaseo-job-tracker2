import { Router } from "express";
// Google Sheets integration via @replit/connectors-sdk
import { ReplitConnectors } from "@replit/connectors-sdk";
import * as XLSX from "xlsx";
import {
  db, jobsTable, writersTable, usersTable,
  monthlySavingsTable, savingsWithdrawalsTable,
  articleOrdersTable, customersTable, appSettingsTable,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();
const connectors = new ReplitConnectors();

const JAKARTA_TZ = "Asia/Jakarta";
const SPREADSHEET_ID_KEY = "backup_spreadsheet_id";
const BACKUP_HOUR_KEY = "backup_schedule_hour";
const BACKUP_MINUTE_KEY = "backup_schedule_minute";

// ─── Auth guard ───────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return false; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang bisa melakukan backup" }); return false;
  }
  return true;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}

// ─── Google Sheets helpers ────────────────────────────────────────────────────

async function getOrCreateSpreadsheet(): Promise<string> {
  // Check stored ID first
  const stored = await getSetting(SPREADSHEET_ID_KEY);
  if (stored) {
    // Verify it still exists
    try {
      const verifyRes = await connectors.proxy("google-sheet", `/v4/spreadsheets/${stored}?fields=spreadsheetId`, { method: "GET" });
      const data: any = await (verifyRes as any).json();
      if (data?.spreadsheetId) return stored;
    } catch {}
  }

  // Create new spreadsheet
  const createRes = await connectors.proxy("google-sheet", "/v4/spreadsheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: "Jaseo Job Tracker — Backup" },
      sheets: [
        { properties: { title: "Jobs", index: 0 } },
        { properties: { title: "Tabungan", index: 1 } },
        { properties: { title: "Penarikan Tabungan", index: 2 } },
        { properties: { title: "Order Artikel", index: 3 } },
        { properties: { title: "Pelanggan", index: 4 } },
        { properties: { title: "Log Backup", index: 5 } },
      ],
    }),
  });
  const createData: any = await (createRes as any).json();
  if (!createData?.spreadsheetId) {
    throw new Error("Gagal membuat spreadsheet Google Sheets. Response: " + JSON.stringify(createData));
  }
  const id = createData.spreadsheetId as string;
  await setSetting(SPREADSHEET_ID_KEY, id);
  return id;
}

async function ensureSheets(spreadsheetId: string, sheetNames: string[]) {
  const infoRes = await connectors.proxy("google-sheet", `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { method: "GET" });
  const info: any = await (infoRes as any).json();
  const existing = new Set<string>((info?.sheets ?? []).map((s: any) => s.properties?.title as string).filter(Boolean));
  const toAdd = sheetNames.filter(n => !existing.has(n));
  if (toAdd.length === 0) return;
  await connectors.proxy("google-sheet", `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: toAdd.map(title => ({ addSheet: { properties: { title } } })) }),
  });
}

async function clearSheet(spreadsheetId: string, sheetName: string) {
  await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:ZZ:clear`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
  );
}

async function writeSheet(spreadsheetId: string, sheetName: string, rows: string[][]) {
  if (rows.length === 0) return;
  await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    }
  );
}

async function appendRow(spreadsheetId: string, sheetName: string, row: string[]) {
  await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    }
  );
}

// ─── Core data fetcher (shared by both backup targets) ────────────────────────
export async function fetchAllBackupData() {
  const jobs = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      jobDate: jobsTable.jobDate,
      website: jobsTable.website,
      username: jobsTable.username,
      notes: jobsTable.notes,
      wordCount: jobsTable.wordCount,
      isChecked: jobsTable.isChecked,
      petunjuk: jobsTable.petunjuk,
      revisionNotes: jobsTable.revisionNotes,
      versionTool: jobsTable.versionTool,
      writerName: writersTable.name,
      createdAt: jobsTable.createdAt,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .orderBy(asc(jobsTable.jobDate), asc(jobsTable.id));

  const savings = await db
    .select({
      id: monthlySavingsTable.id,
      userId: monthlySavingsTable.userId,
      username: usersTable.username,
      year: monthlySavingsTable.year,
      month: monthlySavingsTable.month,
      amount: monthlySavingsTable.amount,
      sourceWords: monthlySavingsTable.sourceWords,
      sourceJobs: monthlySavingsTable.sourceJobs,
      notes: monthlySavingsTable.notes,
      paidAt: monthlySavingsTable.paidAt,
    })
    .from(monthlySavingsTable)
    .leftJoin(usersTable, eq(monthlySavingsTable.userId, usersTable.id))
    .orderBy(asc(monthlySavingsTable.year), asc(monthlySavingsTable.month));

  const withdrawals = await db
    .select({
      id: savingsWithdrawalsTable.id,
      userId: savingsWithdrawalsTable.userId,
      username: usersTable.username,
      requestedAmount: savingsWithdrawalsTable.requestedAmount,
      approvedAmount: savingsWithdrawalsTable.approvedAmount,
      reason: savingsWithdrawalsTable.reason,
      adminNote: savingsWithdrawalsTable.adminNote,
      status: savingsWithdrawalsTable.status,
      requestedAt: savingsWithdrawalsTable.requestedAt,
      processedAt: savingsWithdrawalsTable.processedAt,
    })
    .from(savingsWithdrawalsTable)
    .leftJoin(usersTable, eq(savingsWithdrawalsTable.userId, usersTable.id))
    .orderBy(asc(savingsWithdrawalsTable.requestedAt));

  // orders: select all columns (no custom projection) — avoids missing-column errors
  const orders = await db
    .select({
      id: articleOrdersTable.id,
      jobCode: articleOrdersTable.jobCode,
      orderDate: articleOrdersTable.orderDate,
      deadlineDate: articleOrdersTable.deadlineDate,
      customerId: articleOrdersTable.customerId,
      articleCount: articleOrdersTable.articleCount,
      wordCount: articleOrdersTable.wordCount,
      tool: articleOrdersTable.tool,
      paymentBank: articleOrdersTable.paymentBank,
      price: articleOrdersTable.price,
      bonusArticles: articleOrdersTable.bonusArticles,
      bonusValue: articleOrdersTable.bonusValue,
      notes: articleOrdersTable.notes,
      website: articleOrdersTable.website,
      siteUser: articleOrdersTable.siteUser,
      petunjuk: articleOrdersTable.petunjuk,
      isScheduled: articleOrdersTable.isScheduled,
      createdAt: articleOrdersTable.createdAt,
    })
    .from(articleOrdersTable)
    .orderBy(asc(articleOrdersTable.createdAt));

  const customers = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      wa: customersTable.wa,
      email: customersTable.email,
      firstOrderDate: customersTable.firstOrderDate,
      notes: customersTable.notes,
      createdAt: customersTable.createdAt,
    })
    .from(customersTable)
    .orderBy(asc(customersTable.name));

  return { jobs, savings, withdrawals, orders, customers };
}

// ─── Build sheet rows ─────────────────────────────────────────────────────────
function buildSheetData(data: Awaited<ReturnType<typeof fetchAllBackupData>>) {
  const { jobs, savings, withdrawals, orders, customers } = data;

  const jobRows: string[][] = [
    ["ID", "Job Code", "Tanggal", "Website", "Username", "Kata", "Penulis", "Selesai", "Tool", "Petunjuk", "Catatan Revisi", "Catatan", "Dibuat"],
    ...jobs.map(j => [
      String(j.id), j.jobCode ?? "", j.jobDate ?? "", j.website ?? "", j.username ?? "",
      String(j.wordCount ?? 0), j.writerName ?? "",
      j.isChecked ? "Ya" : "Tidak",
      j.versionTool ?? "", j.petunjuk ?? "", j.revisionNotes ?? "", j.notes ?? "",
      j.createdAt ? new Date(j.createdAt).toISOString() : "",
    ]),
  ];

  const savingsRows: string[][] = [
    ["ID", "User ID", "Username", "Tahun", "Bulan", "Jumlah (Rp)", "Kata Sumber", "Job Sumber", "Catatan", "Dibayar"],
    ...savings.map(s => [
      String(s.id), String(s.userId), s.username ?? "", String(s.year), String(s.month),
      String(s.amount ?? 0), String(s.sourceWords ?? 0), String(s.sourceJobs ?? 0),
      s.notes ?? "", s.paidAt ? new Date(s.paidAt).toISOString() : "",
    ]),
  ];

  const wdRows: string[][] = [
    ["ID", "User ID", "Username", "Diminta (Rp)", "Disetujui (Rp)", "Alasan", "Catatan Admin", "Status", "Tgl Pengajuan", "Tgl Diproses"],
    ...withdrawals.map(w => [
      String(w.id), String(w.userId), w.username ?? "",
      String(w.requestedAmount ?? 0), String(w.approvedAmount ?? 0),
      w.reason ?? "", w.adminNote ?? "", w.status ?? "",
      w.requestedAt ? new Date(w.requestedAt).toISOString() : "",
      w.processedAt ? new Date(w.processedAt).toISOString() : "",
    ]),
  ];

  const orderRows: string[][] = [
    ["ID", "Job Code", "Tanggal Order", "Website", "User Situs", "Jml Artikel", "Bonus", "Total Kata", "Deadline", "Status Jadwal", "Harga Total (Rp)", "Bonus Value (Rp)", "Tool", "Bank", "Petunjuk", "Catatan", "Dibuat"],
    ...orders.map(o => [
      String(o.id), o.jobCode ?? "", o.orderDate ?? "", o.website ?? "", o.siteUser ?? "",
      String(o.articleCount ?? 0), String(o.bonusArticles ?? 0), String(o.wordCount ?? 0),
      o.deadlineDate ?? "", o.isScheduled ? "Sudah dijadwalkan" : "Belum dijadwalkan",
      String(o.price ?? 0), String(o.bonusValue ?? 0),
      o.tool ?? "", o.paymentBank ?? "", o.petunjuk ?? "", o.notes ?? "",
      o.createdAt ? new Date(o.createdAt).toISOString() : "",
    ]),
  ];

  const custRows: string[][] = [
    ["ID", "Nama", "Email", "WA", "Tgl Order Pertama", "Catatan", "Dibuat"],
    ...customers.map(c => [
      String(c.id), c.name ?? "", c.email ?? "", c.wa ?? "",
      c.firstOrderDate ?? "", c.notes ?? "",
      c.createdAt ? new Date(c.createdAt).toISOString() : "",
    ]),
  ];

  return { jobRows, savingsRows, wdRows, orderRows, custRows };
}

// ─── Core backup to Google Sheets (also used by scheduler) ───────────────────
export async function runBackupToSheets(triggeredBy = "system"): Promise<{
  spreadsheetId: string; spreadsheetUrl: string;
  summary: { jobs: number; savings: number; withdrawals: number; orders: number; customers: number };
}> {
  const data = await fetchAllBackupData();
  const { jobs, savings, withdrawals, orders, customers } = data;
  const { jobRows, savingsRows, wdRows, orderRows, custRows } = buildSheetData(data);

  const spreadsheetId = await getOrCreateSpreadsheet();
  const sheetNames = ["Jobs", "Tabungan", "Penarikan Tabungan", "Order Artikel", "Pelanggan", "Log Backup"];
  await ensureSheets(spreadsheetId, sheetNames);

  await clearSheet(spreadsheetId, "Jobs");         await writeSheet(spreadsheetId, "Jobs", jobRows);
  await clearSheet(spreadsheetId, "Tabungan");     await writeSheet(spreadsheetId, "Tabungan", savingsRows);
  await clearSheet(spreadsheetId, "Penarikan Tabungan"); await writeSheet(spreadsheetId, "Penarikan Tabungan", wdRows);
  await clearSheet(spreadsheetId, "Order Artikel"); await writeSheet(spreadsheetId, "Order Artikel", orderRows);
  await clearSheet(spreadsheetId, "Pelanggan");    await writeSheet(spreadsheetId, "Pelanggan", custRows);

  // Log entry
  const nowJakarta = new Date().toLocaleString("id-ID", { timeZone: JAKARTA_TZ });
  await appendRow(spreadsheetId, "Log Backup", [
    nowJakarta, triggeredBy,
    `Jobs: ${jobs.length} | Tabungan: ${savings.length} | Penarikan: ${withdrawals.length} | Order: ${orders.length} | Pelanggan: ${customers.length}`,
  ]);

  logger.info({ by: triggeredBy, spreadsheetId }, "Backup Google Sheets selesai");

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    summary: { jobs: jobs.length, savings: savings.length, withdrawals: withdrawals.length, orders: orders.length, customers: customers.length },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/backup/run — manual backup to Google Sheets
router.post("/backup/run", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const userId = (req.session as any).userId;
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  req.log.info({ by: adminUser.username }, "Backup ke Google Sheets dimulai");
  try {
    const result = await runBackupToSheets(adminUser.username);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Backup Google Sheets gagal");
    res.status(500).json({ error: "Backup gagal: " + (err?.message ?? String(err)) });
  }
});

// GET /api/backup/download — download Excel file
router.get("/backup/download", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const data = await fetchAllBackupData();
    const { jobRows, savingsRows, wdRows, orderRows, custRows } = buildSheetData(data);

    const wb = XLSX.utils.book_new();
    const addSheet = (name: string, rows: string[][]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Bold header row
      const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
        if (cell) cell.s = { font: { bold: true } };
      }
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet("Jobs", jobRows);
    addSheet("Tabungan", savingsRows);
    addSheet("Penarikan Tabungan", wdRows);
    addSheet("Order Artikel", orderRows);
    addSheet("Pelanggan", custRows);

    const nowStr = new Date().toLocaleDateString("id-ID", { timeZone: JAKARTA_TZ }).replace(/\//g, "-");
    const filename = `Backup_Jaseo_${nowStr}.xlsx`;
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: "Gagal membuat file backup: " + err?.message });
  }
});

// GET /api/backup/schedule — get current schedule settings
router.get("/backup/schedule", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const hour = await getSetting(BACKUP_HOUR_KEY) ?? "16";
  const minute = await getSetting(BACKUP_MINUTE_KEY) ?? "1";
  res.json({ hour: Number(hour), minute: Number(minute) });
});

// POST /api/backup/schedule — update schedule (triggers restart of cron job)
router.post("/backup/schedule", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { hour, minute } = req.body as { hour: number; minute: number };
  if (hour === undefined || minute === undefined || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    res.status(400).json({ error: "Jam harus 0-23, menit harus 0-59" }); return;
  }
  await setSetting(BACKUP_HOUR_KEY, String(hour));
  await setSetting(BACKUP_MINUTE_KEY, String(minute));
  // Re-initialize scheduler with new time
  const { reinitBackupScheduler } = await import("../lib/backup-scheduler");
  await reinitBackupScheduler();
  res.json({ ok: true, hour, minute });
});

export default router;
