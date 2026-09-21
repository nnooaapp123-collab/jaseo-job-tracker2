import { Router } from "express";
import { db, financialsTable, articleOrdersTable, monthlySavingsTable, usersTable, jobsTable, writersTable, customersTable, financialCategoriesTable } from "@workspace/db";
import { eq, and, gte, lte, asc, desc, sql, ne } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ─── Kategori bawaan (hardcoded, tidak bisa dihapus) ─────────────────────────
export const INCOME_CATEGORIES = [
  { key: "order_artikel",   label: "Order Artikel",   auto: true,  color: "#10b981" },
  { key: "pembuatan_web",   label: "Pembuatan Web",   auto: false, color: "#3b82f6" },
  { key: "pendapatan_lain", label: "Pendapatan Lain", auto: false, color: "#06b6d4" },
];

export const EXPENSE_CATEGORIES = [
  { key: "gaji_penulis",  label: "Gaji Penulis",      auto: true,  color: "#10b981" },
  { key: "gaji_editor",   label: "Gaji Editor",       auto: true,  color: "#3b82f6" },
  { key: "gaji_cs",       label: "Gaji CS",           auto: true,  color: "#8b5cf6" },
  { key: "tabungan",      label: "Tabungan Karyawan", auto: true,  color: "#6366f1" },
  { key: "pulsa",         label: "Pulsa",             auto: true,  color: "#0ea5e9" },
  { key: "alat_kerja",    label: "Perawatan Alat",    auto: false, color: "#ef4444" },
  { key: "iklan",         label: "Biaya Iklan",       auto: false, color: "#f97316" },
  { key: "tool",          label: "Biaya Tool",        auto: false, color: "#a855f7" },
  { key: "koordinasi",    label: "Biaya Koordinasi",  auto: false, color: "#ec4899" },
  { key: "desainer_web",  label: "Desainer Web",      auto: false, color: "#14b8a6" },
  { key: "lain_lain",     label: "Lain-lain",         auto: false, color: "#94a3b8" },
];

const ALL_DEFAULT_KEYS = new Set([
  ...INCOME_CATEGORIES.map(c => c.key),
  ...EXPENSE_CATEGORIES.map(c => c.key),
]);

const CUSTOM_COLOR_PALETTE = [
  "#f59e0b","#84cc16","#d946ef","#f43f5e","#0891b2",
  "#7c3aed","#059669","#64748b","#b45309","#0369a1",
  "#be185d","#9333ea","#c2410c","#15803d","#1d4ed8",
];

// ─── GET /api/financials/categories ──────────────────────────────────────────
router.get("/financials/categories", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Belum login" }); return; }

  const customRows = await db
    .select()
    .from(financialCategoriesTable)
    .orderBy(asc(financialCategoriesTable.createdAt));

  const defaultIncome = INCOME_CATEGORIES.map(c => ({
    id: null, type: "income" as const, key: c.key, label: c.label,
    color: c.color, auto: c.auto, isDefault: true,
  }));
  const defaultExpense = EXPENSE_CATEGORIES.map(c => ({
    id: null, type: "expense" as const, key: c.key, label: c.label,
    color: c.color, auto: c.auto, isDefault: true,
  }));
  const custom = customRows.map(c => ({
    id: c.id, type: c.type as "income" | "expense", key: c.key, label: c.label,
    color: c.color, auto: false, isDefault: false,
  }));

  res.json([...defaultIncome, ...defaultExpense, ...custom]);
});

// ─── POST /api/financials/categories ─────────────────────────────────────────
const newCategorySchema = z.object({
  type:  z.enum(["income", "expense"]),
  label: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.post("/financials/categories", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = newCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const { type, label, color: colorInput } = parsed.data;

  // Derive unique slug key from label
  const baseKey = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .substring(0, 40);
  let key = baseKey || `kategori_${Date.now()}`;

  // Ensure uniqueness
  const existingKeys = new Set([
    ...ALL_DEFAULT_KEYS,
    ...(await db.select({ key: financialCategoriesTable.key }).from(financialCategoriesTable)).map(r => r.key),
  ]);
  if (existingKeys.has(key)) {
    let i = 2;
    while (existingKeys.has(`${key}_${i}`)) i++;
    key = `${key}_${i}`;
  }

  // Auto-assign color from palette if not provided
  const usedColors = new Set(
    (await db.select({ color: financialCategoriesTable.color }).from(financialCategoriesTable)).map(r => r.color)
  );
  const color = colorInput ?? (CUSTOM_COLOR_PALETTE.find(c => !usedColors.has(c)) ?? CUSTOM_COLOR_PALETTE[usedColors.size % CUSTOM_COLOR_PALETTE.length]);

  const [row] = await db
    .insert(financialCategoriesTable)
    .values({ type, key, label, color })
    .returning();

  res.json({ ok: true, data: { id: row.id, type: row.type, key: row.key, label: row.label, color: row.color, auto: false, isDefault: false } });
});

// ─── DELETE /api/financials/categories/:id ────────────────────────────────────
router.delete("/financials/categories/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const [row] = await db.select().from(financialCategoriesTable).where(eq(financialCategoriesTable.id, id));
  if (!row) { res.status(404).json({ error: "Kategori tidak ditemukan" }); return; }

  await db.delete(financialCategoriesTable).where(eq(financialCategoriesTable.id, id));
  res.json({ ok: true });
});

// ─── Auth helper ─────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Belum login" }); return false; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Hanya Admin" }); return false;
  }
  return true;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function dateRange(year?: string, month?: string): { from: string | null; to: string | null } {
  if (!year) return { from: null, to: null };
  const y = String(year);
  if (!month || month === "all") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const m = String(month).padStart(2, "0");
  const lastDay = new Date(Number(y), Number(month), 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

// ─── Auto income: dari order artikel ─────────────────────────────────────────
async function getAutoIncome(from: string | null, to: string | null) {
  let q = db.select({
    id: articleOrdersTable.id,
    amount: articleOrdersTable.price,
    date: articleOrdersTable.orderDate,
    description: articleOrdersTable.jobCode,
    website: articleOrdersTable.website,
    articleCount: articleOrdersTable.articleCount,
  }).from(articleOrdersTable)
    .$dynamic();

  if (from) q = q.where(and(gte(articleOrdersTable.orderDate, from), lte(articleOrdersTable.orderDate, to!)));

  const rows = await q.orderBy(asc(articleOrdersTable.orderDate));
  return rows
    .filter(r => (r.amount ?? 0) > 0)
    .map(r => ({
      id: `auto_income_${r.id}`,
      type: "income" as const,
      category: "order_artikel",
      categoryLabel: "Order Artikel",
      amount: r.amount ?? 0,
      description: `Order ${r.description ?? ""} — ${r.website ?? ""} (${r.articleCount ?? 0} artikel)`,
      date: r.date,
      isAuto: true,
      referenceId: r.id,
      referenceType: "order",
    }));
}

// ─── Auto expense: bonus artikel dari order ───────────────────────────────────
async function getAutoBonus(from: string | null, to: string | null) {
  let q = db.select({
    id: articleOrdersTable.id,
    amount: articleOrdersTable.bonusValue,
    date: articleOrdersTable.orderDate,
    description: articleOrdersTable.jobCode,
    website: articleOrdersTable.website,
    bonusArticles: articleOrdersTable.bonusArticles,
  }).from(articleOrdersTable)
    .$dynamic();

  if (from) q = q.where(and(gte(articleOrdersTable.orderDate, from), lte(articleOrdersTable.orderDate, to!)));

  const rows = await q.orderBy(asc(articleOrdersTable.orderDate));
  return rows
    .filter(r => (r.amount ?? 0) > 0)
    .map(r => ({
      id: `auto_bonus_${r.id}`,
      type: "expense" as const,
      category: "bonus_artikel",
      categoryLabel: "Bonus Artikel",
      amount: r.amount ?? 0,
      description: `Bonus ${r.description ?? ""} — ${r.website ?? ""} (${r.bonusArticles ?? 0} artikel)`,
      date: r.date,
      isAuto: true,
      referenceId: r.id,
      referenceType: "order",
    }));
}

// ─── Auto expense: tabungan dari monthly_savings ──────────────────────────────
async function getAutoTabungan(yearFilter?: string, monthFilter?: string) {
  let q = db.select({
    year: monthlySavingsTable.year,
    month: monthlySavingsTable.month,
    total: sql<number>`SUM(${monthlySavingsTable.amount})`.as("total"),
  }).from(monthlySavingsTable)
    .groupBy(monthlySavingsTable.year, monthlySavingsTable.month)
    .$dynamic();

  if (yearFilter) q = q.where(eq(monthlySavingsTable.year, Number(yearFilter)));

  const rows = await q.orderBy(asc(monthlySavingsTable.year), asc(monthlySavingsTable.month));
  return rows
    .filter(r => r.month !== null && Number(r.total ?? 0) > 0)
    .filter(r => {
      if (!monthFilter || monthFilter === "all") return true;
      return r.month === Number(monthFilter);
    })
    .map(r => ({
      id: `auto_tabungan_${r.year}_${r.month}`,
      type: "expense" as const,
      category: "tabungan",
      categoryLabel: "Tabungan Karyawan",
      amount: Number(r.total ?? 0),
      description: `Tabungan bulan ${MONTHS[r.month! - 1]} ${r.year}`,
      date: `${r.year}-${String(r.month).padStart(2, "0")}-${String(new Date(r.year, r.month!, 0).getDate()).padStart(2, "0")}`,
      isAuto: true,
      referenceId: null,
      referenceType: "savings",
    }));
}

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"];

// ─── Helper: rumus gaji penulis (sama dengan jobs.ts) ────────────────────────
// Pengurang tiap tier sesuai dokumen acuan. Proteksi: gaji tidak pernah turun
// saat kata bertambah — tiap tier diberi lantai = gaji tertinggi tier sebelumnya.
function hitungGajiPenulis(kata: number): number {
  if (kata <= 0)      return 0;
  if (kata >= 115000) return Math.max(kata * 32 - 1_650_000, hitungGajiPenulis(114999));
  if (kata >= 103000) return Math.max(kata * 32 - 1_600_000, hitungGajiPenulis(102999));
  if (kata >= 91200)  return Math.max(kata * 32 - 1_500_000, hitungGajiPenulis(91199));
  if (kata >= 79200)  return Math.max(kata * 32 - 1_400_000, hitungGajiPenulis(79199));
  if (kata >= 76800)  return Math.max(kata * 32 - 1_350_000, hitungGajiPenulis(76799));
  if (kata >= 72000)  return Math.max(kata * 32 - 1_300_000, hitungGajiPenulis(71999));
  if (kata >= 67200)  return Math.max(kata * 32 - 1_200_000, hitungGajiPenulis(67199));
  if (kata >= 55200)  return Math.max(kata * 32 - 1_100_000, hitungGajiPenulis(55199));
  return Math.floor((kata * 25) / 2);
}

// ─── Auto expense: gaji penulis dari jobs selesai ─────────────────────────────
async function getAutoGajiPenulis(yearFilter?: string, monthFilter?: string) {
  const rows = await db.select({
    writerId: jobsTable.writerId,
    wordCount: jobsTable.wordCount,
    jobDate:   jobsTable.jobDate,
  }).from(jobsTable)
    .where(and(
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.writerId} IS NOT NULL`,
      sql`${jobsTable.wordCount} > 0`,
    ));

  // Group: monthKey → writerId → totalWords
  const byMonth = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (!row.jobDate || !row.writerId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (yearFilter && !mk.startsWith(yearFilter)) continue;
    if (monthFilter && monthFilter !== "all" && Number(mk.slice(5, 7)) !== Number(monthFilter)) continue;
    if (!byMonth.has(mk)) byMonth.set(mk, new Map());
    const m = byMonth.get(mk)!;
    m.set(row.writerId, (m.get(row.writerId) ?? 0) + (row.wordCount ?? 0));
  }

  const result = [];
  for (const [mk, writerMap] of byMonth.entries()) {
    let total = 0;
    for (const [, words] of writerMap) total += hitungGajiPenulis(words);
    if (total <= 0) continue;
    const [y, m] = mk.split("-");
    result.push({
      id: `auto_gaji_penulis_${mk}`,
      type: "expense" as const,
      category: "gaji_penulis",
      categoryLabel: "Gaji Penulis",
      amount: total,
      description: `Gaji penulis bulan ${MONTHS[Number(m) - 1]} ${y}`,
      date: `${mk}-01`,
      isAuto: true,
      referenceId: null,
      referenceType: "jobs",
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Auto expense: gaji editor (standalone + dual-role) dari jobs selesai ─────
async function getAutoGajiEditor(yearFilter?: string, monthFilter?: string) {
  const rows = await db.select({
    editorId: jobsTable.editorId,
    wordCount: jobsTable.wordCount,
    jobDate:   jobsTable.jobDate,
  }).from(jobsTable)
    .where(and(
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.editorId} IS NOT NULL`,
      sql`${jobsTable.wordCount} > 0`,
    ));

  // Group: monthKey → editorId → totalWords (semua editor, termasuk dual-role)
  const byMonth = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (!row.jobDate || !row.editorId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (yearFilter && !mk.startsWith(yearFilter)) continue;
    if (monthFilter && monthFilter !== "all" && Number(mk.slice(5, 7)) !== Number(monthFilter)) continue;
    if (!byMonth.has(mk)) byMonth.set(mk, new Map());
    const m = byMonth.get(mk)!;
    m.set(row.editorId, (m.get(row.editorId) ?? 0) + (row.wordCount ?? 0));
  }

  const result = [];
  for (const [mk, editorMap] of byMonth.entries()) {
    let total = 0;
    for (const [, words] of editorMap) total += Math.floor(words * 4.7);
    if (total <= 0) continue;
    const [y, m] = mk.split("-");
    result.push({
      id: `auto_gaji_editor_${mk}`,
      type: "expense" as const,
      category: "gaji_editor",
      categoryLabel: "Gaji Editor",
      amount: total,
      description: `Gaji editor bulan ${MONTHS[Number(m) - 1]} ${y}`,
      date: `${mk}-01`,
      isAuto: true,
      referenceId: null,
      referenceType: "jobs",
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Auto expense: gaji CS dari pendapatan tertinggi penulis ─────────────────
async function getAutoGajiCS(yearFilter?: string, monthFilter?: string) {
  const allWriters = await db.select({
    id: writersTable.id,
    linkedEditorId: writersTable.linkedEditorId,
  }).from(writersTable);
  const writerLinkedEditor = new Map(allWriters.map(w => [w.id, w.linkedEditorId]));

  const writerRows = await db.select({
    writerId: jobsTable.writerId,
    wordCount: jobsTable.wordCount,
    jobDate:   jobsTable.jobDate,
  }).from(jobsTable)
    .where(and(eq(jobsTable.isChecked, true), sql`${jobsTable.writerId} IS NOT NULL`, sql`${jobsTable.wordCount} > 0`));

  const editorRows = await db.select({
    editorId: jobsTable.editorId,
    wordCount: jobsTable.wordCount,
    jobDate:   jobsTable.jobDate,
  }).from(jobsTable)
    .where(and(eq(jobsTable.isChecked, true), sql`${jobsTable.editorId} IS NOT NULL`, sql`${jobsTable.wordCount} > 0`));

  // Group by month
  const wByMonth = new Map<string, Map<number, number>>();
  for (const row of writerRows) {
    if (!row.jobDate || !row.writerId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (yearFilter && !mk.startsWith(yearFilter)) continue;
    if (monthFilter && monthFilter !== "all" && Number(mk.slice(5, 7)) !== Number(monthFilter)) continue;
    if (!wByMonth.has(mk)) wByMonth.set(mk, new Map());
    const m = wByMonth.get(mk)!;
    m.set(row.writerId, (m.get(row.writerId) ?? 0) + (row.wordCount ?? 0));
  }

  const eByMonth = new Map<string, Map<number, number>>();
  for (const row of editorRows) {
    if (!row.jobDate || !row.editorId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (!eByMonth.has(mk)) eByMonth.set(mk, new Map());
    const m = eByMonth.get(mk)!;
    m.set(row.editorId, (m.get(row.editorId) ?? 0) + (row.wordCount ?? 0));
  }

  const allMonths = new Set([...wByMonth.keys()]);
  const result = [];

  for (const mk of allMonths) {
    const wMap = wByMonth.get(mk) ?? new Map();
    const eMap = eByMonth.get(mk) ?? new Map();

    let topCombined = 0;
    for (const [wid, words] of wMap) {
      const wIncome = hitungGajiPenulis(words);
      const eid = writerLinkedEditor.get(wid);
      const eIncome = eid ? Math.floor((eMap.get(eid) ?? 0) * 4.7) : 0;
      const combined = wIncome + eIncome;
      if (combined > topCombined) topCombined = combined;
    }

    if (topCombined <= 0) continue;
    const bonus = Math.floor(topCombined * 0.05);
    const csGaji = topCombined + bonus;
    const [y, m] = mk.split("-");
    result.push({
      id: `auto_gaji_cs_${mk}`,
      type: "expense" as const,
      category: "gaji_cs",
      categoryLabel: "Gaji CS",
      amount: csGaji,
      description: `Gaji CS bulan ${MONTHS[Number(m) - 1]} ${y}`,
      date: `${mk}-01`,
      isAuto: true,
      referenceId: null,
      referenceType: "jobs",
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Auto expense: pulsa karyawan ────────────────────────────────────────────
// Penulis: ≥ 48.000 kata/bulan → Rp 70.000
// Penulis merangkap editor (dual-role): otomatis dapat jika ada job apapun
// Editor standalone: otomatis dapat jika ada job
// CS: selalu otomatis dapat jika bulan ada aktivitas (1 CS)
const PULSA_AMOUNT = 70_000;

async function getAutoPulsa(yearFilter?: string, monthFilter?: string) {
  const allWriters = await db.select({
    id: writersTable.id,
    linkedEditorId: writersTable.linkedEditorId,
  }).from(writersTable);
  const dualRoleEditorIds = new Set(allWriters.map(w => w.linkedEditorId).filter(Boolean) as number[]);
  const isDualRoleWriter = new Set(allWriters.filter(w => w.linkedEditorId).map(w => w.id));

  const writerRows = await db.select({
    writerId: jobsTable.writerId,
    wordCount: jobsTable.wordCount,
    jobDate:   jobsTable.jobDate,
  }).from(jobsTable).where(and(
    eq(jobsTable.isChecked, true),
    sql`${jobsTable.writerId} IS NOT NULL`,
    sql`${jobsTable.wordCount} > 0`,
  ));

  const editorRows = await db.select({
    editorId: jobsTable.editorId,
    jobDate:  jobsTable.jobDate,
  }).from(jobsTable).where(and(
    eq(jobsTable.isChecked, true),
    sql`${jobsTable.editorId} IS NOT NULL`,
  ));

  // monthKey → writerId → totalWords
  const wByMonth = new Map<string, Map<number, number>>();
  const activeMonths = new Set<string>();

  for (const row of writerRows) {
    if (!row.jobDate || !row.writerId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (yearFilter && !mk.startsWith(yearFilter)) continue;
    if (monthFilter && monthFilter !== "all" && Number(mk.slice(5, 7)) !== Number(monthFilter)) continue;
    activeMonths.add(mk);
    if (!wByMonth.has(mk)) wByMonth.set(mk, new Map());
    const m = wByMonth.get(mk)!;
    m.set(row.writerId, (m.get(row.writerId) ?? 0) + (row.wordCount ?? 0));
  }

  // monthKey → Set<standaloneEditorId>
  const eByMonth = new Map<string, Set<number>>();
  for (const row of editorRows) {
    if (!row.jobDate || !row.editorId) continue;
    const mk = row.jobDate.slice(0, 7);
    if (yearFilter && !mk.startsWith(yearFilter)) continue;
    if (monthFilter && monthFilter !== "all" && Number(mk.slice(5, 7)) !== Number(monthFilter)) continue;
    activeMonths.add(mk);
    if (dualRoleEditorIds.has(row.editorId)) continue; // dual-role sudah dihitung via writer
    if (!eByMonth.has(mk)) eByMonth.set(mk, new Set());
    eByMonth.get(mk)!.add(row.editorId);
  }

  const result = [];
  for (const mk of activeMonths) {
    const [y, m] = mk.split("-");
    let count = 0;

    // Penulis: ≥ 48.000 kata, atau dual-role (otomatis dapat sebagai editor)
    const wMap = wByMonth.get(mk) ?? new Map();
    for (const [wid, words] of wMap) {
      if (isDualRoleWriter.has(wid) || words >= 48_000) count++;
    }

    // Editor standalone
    count += eByMonth.get(mk)?.size ?? 0;

    // CS (1 per bulan jika ada aktivitas)
    count += 1;

    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    result.push({
      id: `auto_pulsa_${mk}`,
      type: "expense" as const,
      category: "pulsa",
      categoryLabel: "Pulsa",
      amount: count * PULSA_AMOUNT,
      description: `Pulsa ${count} karyawan bulan ${MONTHS[Number(m) - 1]} ${y}`,
      date: `${y}-${m.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      isAuto: true,
      referenceId: null,
      referenceType: "jobs",
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── GET /api/financials ──────────────────────────────────────────────────────
router.get("/financials", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const { year, month, type, category } = req.query as Record<string, string>;
  const { from, to } = dateRange(year, month);

  // Manual entries
  let manualQ = db.select().from(financialsTable).$dynamic();
  const conditions: any[] = [];
  if (from) conditions.push(gte(financialsTable.date, from));
  if (to) conditions.push(lte(financialsTable.date, to));
  if (type && type !== "all") conditions.push(eq(financialsTable.type, type));
  if (category && category !== "all") conditions.push(eq(financialsTable.category, category));
  if (conditions.length) manualQ = manualQ.where(and(...conditions));
  const manualRows = await manualQ.orderBy(desc(financialsTable.date));

  const incomeCategories = INCOME_CATEGORIES.map(c => c.key);
  const expenseCategories = EXPENSE_CATEGORIES.map(c => c.key);

  const manual = manualRows.map(r => ({
    id: `manual_${r.id}`,
    _id: r.id,
    type: r.type as "income" | "expense",
    category: r.category,
    categoryLabel: getCategoryLabel(r.category, r.type as "income" | "expense"),
    amount: r.amount,
    description: r.description ?? "",
    date: r.date,
    isAuto: false,
    referenceId: r.referenceId,
    referenceType: r.referenceType,
    createdAt: r.createdAt,
  }));

  // Auto entries (skip if category filter doesn't match)
  const wantIncome = !type || type === "all" || type === "income";
  const wantExpense = !type || type === "all" || type === "expense";
  const wantCat = (cat: string) => !category || category === "all" || category === cat;

  const autoIncome = (wantIncome && wantCat("order_artikel"))
    ? await getAutoIncome(from, to) : [];
  const autoTabungan = (wantExpense && wantCat("tabungan"))
    ? await getAutoTabungan(year, month) : [];
  const autoGajiPenulis = (wantExpense && wantCat("gaji_penulis"))
    ? await getAutoGajiPenulis(year, month) : [];
  const autoGajiEditor = (wantExpense && wantCat("gaji_editor"))
    ? await getAutoGajiEditor(year, month) : [];
  const autoGajiCS = (wantExpense && wantCat("gaji_cs"))
    ? await getAutoGajiCS(year, month) : [];
  const autoPulsa = (wantExpense && wantCat("pulsa"))
    ? await getAutoPulsa(year, month) : [];

  const all = [...manual, ...autoIncome, ...autoTabungan,
               ...autoGajiPenulis, ...autoGajiEditor, ...autoGajiCS, ...autoPulsa]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  res.json(all);
});

function getCategoryLabel(cat: string, type: "income" | "expense") {
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (cats as any[]).find(c => c.key === cat)?.label ?? cat;
}

// ─── GET /api/financials/summary ─────────────────────────────────────────────
router.get("/financials/summary", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const { year, month } = req.query as Record<string, string>;
  const { from, to } = dateRange(year, month);

  // Collect all transactions
  const manualQ = db.select().from(financialsTable).$dynamic();
  const mc: any[] = [];
  if (from) mc.push(gte(financialsTable.date, from));
  if (to) mc.push(lte(financialsTable.date, to));
  const manualRows = mc.length ? await manualQ.where(and(...mc)) : await manualQ;

  const [autoIncome, autoTabungan, autoGajiPenulis, autoGajiEditor, autoGajiCS, autoPulsa] =
    await Promise.all([
      getAutoIncome(from, to),
      getAutoTabungan(year, month),
      getAutoGajiPenulis(year, month),
      getAutoGajiEditor(year, month),
      getAutoGajiCS(year, month),
      getAutoPulsa(year, month),
    ]);

  // Paksa amount selalu number agar tidak ada string concatenation dari SQL bigint
  const slim = (r: { type: string; category: string; amount: number | string; date: string }) =>
    ({ type: r.type, category: r.category, amount: Number(r.amount ?? 0), date: r.date });

  const allTx = [
    ...manualRows.map(r => slim({ type: r.type, category: r.category, amount: r.amount, date: r.date })),
    ...autoIncome.map(slim), ...autoTabungan.map(slim),
    ...autoGajiPenulis.map(slim), ...autoGajiEditor.map(slim), ...autoGajiCS.map(slim),
    ...autoPulsa.map(slim),
  ];

  const totalIncome = allTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = allTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const netProfit = totalIncome - totalExpense;

  // By category
  const byCategoryMap: Record<string, { type: string; label: string; total: number }> = {};
  for (const tx of allTx) {
    if (!byCategoryMap[tx.category]) {
      byCategoryMap[tx.category] = {
        type: tx.type,
        label: getCategoryLabel(tx.category, tx.type as "income" | "expense"),
        total: 0,
      };
    }
    byCategoryMap[tx.category].total += Number(tx.amount);
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([key, val]) => ({ category: key, ...val }))
    .sort((a, b) => b.total - a.total);

  // By month (last 24 months or full year range)
  const byMonthMap: Record<string, { year: number; month: number; income: number; expense: number }> = {};
  for (const tx of allTx) {
    if (!tx.date) continue;
    const key = tx.date.slice(0, 7); // yyyy-MM
    if (!byMonthMap[key]) {
      const [y, m] = key.split("-");
      byMonthMap[key] = { year: Number(y), month: Number(m), income: 0, expense: 0 };
    }
    if (tx.type === "income") byMonthMap[key].income += tx.amount;
    else byMonthMap[key].expense += tx.amount;
  }
  const byMonth = Object.entries(byMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      key,
      ...val,
      monthLabel: `${MONTHS[val.month - 1].slice(0, 3)} ${val.year}`,
      netProfit: val.income - val.expense,
    }));

  res.json({ totalIncome, totalExpense, netProfit, byCategory, byMonth });
});

// ─── GET /api/financials/years ───────────────────────────────────────────────
router.get("/financials/years", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  // Collect all years from all sources
  const manualYears = await db.selectDistinct({ y: sql<string>`SUBSTRING(${financialsTable.date}, 1, 4)` })
    .from(financialsTable).orderBy(sql`1`);
  const orderYears = await db.selectDistinct({ y: sql<string>`SUBSTRING(${articleOrdersTable.orderDate}, 1, 4)` })
    .from(articleOrdersTable).orderBy(sql`1`);
  const savingsYears = await db.selectDistinct({ y: sql<string>`CAST(${monthlySavingsTable.year} AS TEXT)` })
    .from(monthlySavingsTable).orderBy(sql`1`);

  const allYears = new Set([
    ...manualYears.map(r => r.y),
    ...orderYears.map(r => r.y),
    ...savingsYears.map(r => r.y),
  ]);
  const currentYear = String(new Date().getFullYear());
  allYears.add(currentYear);

  res.json([...allYears].filter(Boolean).sort().reverse());
});

// ─── POST /api/financials ─────────────────────────────────────────────────────
const createSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1),
  amount: z.number().int().min(0),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/financials", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const userId = (req.session as any).userId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db.insert(financialsTable).values({
    ...parsed.data,
    createdBy: userId,
  }).returning();

  res.json({ ok: true, data: { ...row, id: `manual_${row.id}`, _id: row.id, isAuto: false } });
});

// ─── PUT /api/financials/:id ──────────────────────────────────────────────────
const updateSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  category: z.string().min(1).optional(),
  amount: z.number().int().min(0).optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.put("/financials/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db.update(financialsTable)
    .set(parsed.data)
    .where(eq(financialsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
  res.json({ ok: true, data: row });
});

// ─── DELETE /api/financials/:id ───────────────────────────────────────────────
router.delete("/financials/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "ID tidak valid" }); return; }

  await db.delete(financialsTable).where(eq(financialsTable.id, id));
  res.json({ ok: true });
});

// ─── GET /api/reports/bonus ──────────────────────────────────────────────────
router.get("/reports/bonus", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

  const rows = await db
    .select({
      orderId:       articleOrdersTable.id,
      orderDate:     articleOrdersTable.orderDate,
      customerId:    articleOrdersTable.customerId,
      customerName:  customersTable.name,
      jobCode:       articleOrdersTable.jobCode,
      website:       articleOrdersTable.website,
      bonusArticles: articleOrdersTable.bonusArticles,
      bonusValue:    articleOrdersTable.bonusValue,
    })
    .from(articleOrdersTable)
    .leftJoin(customersTable, eq(articleOrdersTable.customerId, customersTable.id))
    .where(
      and(
        gte(articleOrdersTable.orderDate, `${year}-01-01`),
        lte(articleOrdersTable.orderDate, `${year}-12-31`),
        sql`${articleOrdersTable.bonusValue} > 0`,
      )
    )
    .orderBy(asc(articleOrdersTable.orderDate));

  const result = rows.map(r => {
    const d = r.orderDate ? new Date(r.orderDate) : new Date();
    return {
      orderId:       r.orderId,
      orderDate:     r.orderDate ?? "",
      month:         d.getUTCMonth() + 1,
      year:          d.getUTCFullYear(),
      customerId:    r.customerId ?? null,
      customerName:  r.customerName ?? "Tanpa Pelanggan",
      jobCode:       r.jobCode ?? "",
      website:       r.website ?? null,
      bonusArticles: r.bonusArticles ?? 0,
      bonusValue:    Number(r.bonusValue ?? 0),
    };
  });

  const totalBonus        = result.reduce((s, r) => s + r.bonusValue, 0);
  const totalBonusArticles = result.reduce((s, r) => s + r.bonusArticles, 0);
  const totalCustomers    = new Set(result.map(r => String(r.customerId ?? "none"))).size;

  res.json({ year, summary: { totalBonus, totalBonusArticles, totalCustomers }, rows: result });
});

export default router;
