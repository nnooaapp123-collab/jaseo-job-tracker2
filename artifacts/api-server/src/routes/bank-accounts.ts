import { Router } from "express";
import { db, companyBankAccountsTable, bankLedgerEntriesTable, articleOrdersTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, asc, desc, sql, ilike } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Belum login" }); return false; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Hanya Admin" }); return false;
  }
  return true;
}

// ─── Helper: hitung saldo rekening ───────────────────────────────────────────
async function computeBalance(account: { id: number; name: string; initialBalance: number }) {
  // Pemasukan dari order: payment_bank ILIKE '%name%'
  const [orderIncome] = await db
    .select({ total: sql<string>`COALESCE(SUM(price), 0)` })
    .from(articleOrdersTable)
    .where(ilike(articleOrdersTable.paymentBank, `%${account.name}%`));

  // Entri manual masuk
  const [manualIn] = await db
    .select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(bankLedgerEntriesTable)
    .where(and(eq(bankLedgerEntriesTable.bankAccountId, account.id), eq(bankLedgerEntriesTable.type, "in")));

  // Entri manual keluar
  const [manualOut] = await db
    .select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
    .from(bankLedgerEntriesTable)
    .where(and(eq(bankLedgerEntriesTable.bankAccountId, account.id), eq(bankLedgerEntriesTable.type, "out")));

  const balance =
    account.initialBalance +
    Number(orderIncome?.total ?? 0) +
    Number(manualIn?.total ?? 0) -
    Number(manualOut?.total ?? 0);

  return { orderIncome: Number(orderIncome?.total ?? 0), manualIn: Number(manualIn?.total ?? 0), manualOut: Number(manualOut?.total ?? 0), balance };
}

// ─── GET /api/bank-accounts ───────────────────────────────────────────────────
router.get("/bank-accounts", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const accounts = await db
    .select()
    .from(companyBankAccountsTable)
    .orderBy(asc(companyBankAccountsTable.createdAt));

  const result = await Promise.all(
    accounts.map(async (acc) => {
      const { orderIncome, manualIn, manualOut, balance } = await computeBalance(acc);
      return { ...acc, orderIncome, manualIn, manualOut, balance };
    })
  );

  res.json(result);
});

// ─── POST /api/bank-accounts ──────────────────────────────────────────────────
const createSchema = z.object({
  name:           z.string().min(1).max(60),
  accountNumber:  z.string().max(60).nullish(),
  initialBalance: z.number().int().min(0).default(0),
  notes:          z.string().max(200).nullish(),
});

router.post("/bank-accounts", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db
    .insert(companyBankAccountsTable)
    .values(parsed.data)
    .returning();

  res.json({ ok: true, data: row });
});

// ─── PUT /api/bank-accounts/:id ───────────────────────────────────────────────
const updateSchema = z.object({
  name:           z.string().min(1).max(60).optional(),
  accountNumber:  z.string().max(60).nullish(),
  initialBalance: z.number().int().min(0).optional(),
  notes:          z.string().max(200).nullish(),
  isActive:       z.boolean().optional(),
});

router.put("/bank-accounts/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db
    .update(companyBankAccountsTable)
    .set(parsed.data)
    .where(eq(companyBankAccountsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Rekening tidak ditemukan" }); return; }
  res.json({ ok: true, data: row });
});

// ─── DELETE /api/bank-accounts/:id ───────────────────────────────────────────
router.delete("/bank-accounts/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.params.id);
  await db.delete(companyBankAccountsTable).where(eq(companyBankAccountsTable.id, id));
  res.json({ ok: true });
});

// ─── GET /api/bank-accounts/:id/ledger ───────────────────────────────────────
router.get("/bank-accounts/:id/ledger", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.params.id);
  const { from, to } = req.query as { from?: string; to?: string };

  const [account] = await db
    .select()
    .from(companyBankAccountsTable)
    .where(eq(companyBankAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Rekening tidak ditemukan" }); return; }

  // Order income yang cocok
  let orderQ = db
    .select({
      id:          articleOrdersTable.id,
      date:        articleOrdersTable.orderDate,
      amount:      articleOrdersTable.price,
      description: articleOrdersTable.jobCode,
      website:     articleOrdersTable.website,
    })
    .from(articleOrdersTable)
    .where(ilike(articleOrdersTable.paymentBank, `%${account.name}%`))
    .$dynamic();

  if (from) orderQ = orderQ.where(gte(articleOrdersTable.orderDate, from));
  if (to)   orderQ = orderQ.where(lte(articleOrdersTable.orderDate, to));

  const orders = await orderQ.orderBy(desc(articleOrdersTable.orderDate));
  const orderEntries = orders.map(o => ({
    id:          `order_${o.id}`,
    _id:         o.id,
    type:        "in" as const,
    amount:      Number(o.amount ?? 0),
    description: o.description ? `Order ${o.description}${o.website ? ` — ${o.website}` : ""}` : "Order Artikel",
    date:        o.date ?? "",
    source:      "order" as const,
  }));

  // Manual entries
  let manualQ = db
    .select()
    .from(bankLedgerEntriesTable)
    .where(eq(bankLedgerEntriesTable.bankAccountId, id))
    .$dynamic();

  if (from) manualQ = manualQ.where(gte(bankLedgerEntriesTable.entryDate, from));
  if (to)   manualQ = manualQ.where(lte(bankLedgerEntriesTable.entryDate, to));

  const manualRows = await manualQ.orderBy(desc(bankLedgerEntriesTable.entryDate));
  const manualEntries = manualRows.map(m => ({
    id:          `manual_${m.id}`,
    _id:         m.id,
    type:        m.type as "in" | "out",
    amount:      Number(m.amount ?? 0),
    description: m.description ?? "",
    date:        m.entryDate,
    source:      "manual" as const,
  }));

  // Gabung dan urutkan by date+id asc untuk running balance yang deterministik
  // (entri tanggal sama diurutkan by _id asc = urutan dibuat)
  const sorted = [...orderEntries, ...manualEntries].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a._id - b._id;
  });

  let running = account.initialBalance;
  const balanceMap: Record<string, number> = {};
  for (const e of sorted) {
    running += e.type === "in" ? e.amount : -e.amount;
    balanceMap[e.id] = running;
  }

  // Tampilkan descending (terbaru di atas)
  const all = [...sorted].reverse();
  const withBalance = all.map(e => ({ ...e, runningBalance: balanceMap[e.id] ?? 0 }));

  const { balance, orderIncome, manualIn, manualOut } = await computeBalance(account);

  res.json({
    account: { ...account, balance, orderIncome, manualIn, manualOut },
    entries: withBalance,
  });
});

// ─── POST /api/bank-accounts/:id/entries ─────────────────────────────────────
const entrySchema = z.object({
  type:        z.enum(["in", "out"]),
  amount:      z.number().int().min(1),
  description: z.string().max(200).optional(),
  entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/bank-accounts/:id/entries", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.params.id);
  const userId = (req.session as any)?.userId;

  const [account] = await db.select().from(companyBankAccountsTable).where(eq(companyBankAccountsTable.id, id));
  if (!account) { res.status(404).json({ error: "Rekening tidak ditemukan" }); return; }

  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db
    .insert(bankLedgerEntriesTable)
    .values({ ...parsed.data, bankAccountId: id, createdBy: userId })
    .returning();

  res.json({ ok: true, data: row });
});

// ─── PUT /api/bank-accounts/:id/entries/:entryId ─────────────────────────────
const updateEntrySchema = z.object({
  type:        z.enum(["in", "out"]).optional(),
  amount:      z.number().int().min(1).optional(),
  description: z.string().max(200).nullish(),
  entryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.put("/bank-accounts/:id/entries/:entryId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const entryId = Number(req.params.entryId);
  const parsed = updateEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }

  const [row] = await db
    .update(bankLedgerEntriesTable)
    .set(parsed.data)
    .where(eq(bankLedgerEntriesTable.id, entryId))
    .returning();

  if (!row) { res.status(404).json({ error: "Entri tidak ditemukan" }); return; }
  res.json({ ok: true, data: row });
});

// ─── DELETE /api/bank-accounts/:id/entries/:entryId ──────────────────────────
router.delete("/bank-accounts/:id/entries/:entryId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const entryId = Number(req.params.entryId);
  await db.delete(bankLedgerEntriesTable).where(eq(bankLedgerEntriesTable.id, entryId));
  res.json({ ok: true });
});

export default router;
