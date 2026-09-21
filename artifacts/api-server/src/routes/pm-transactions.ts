import { Router, type IRouter, type Request } from "express";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { db, proposals, proposalTransactions, proposalUsers } from "@workspace/db";
import {
  CreatePmTransactionBody,
  ConfirmPmPaymentParams,
  GetPmDownloadTokenParams,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";

type FeeType = "flat" | "percent" | "percent_plus_flat";
interface PaymentMethodDef {
  id: string;
  label: string;
  group: string;
  feeType: FeeType;
  feeAmount?: number;
  feeRate?: number;
  feeFixed?: number;
  minFee?: number;
}

const PAYMENT_METHODS: PaymentMethodDef[] = [
  { id: "bca_va",       label: "BCA Virtual Account",     group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "bni_va",       label: "BNI Virtual Account",     group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "bri_va",       label: "BRI Virtual Account",     group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "mandiri_bill", label: "Mandiri Bill Payment",    group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "permata_va",   label: "Permata Virtual Account", group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "other_va",     label: "Bank Lainnya (VA)",       group: "Transfer Bank", feeType: "flat",             feeAmount: 4000 },
  { id: "gopay",        label: "GoPay",                   group: "E-Wallet",      feeType: "percent",          feeRate: 0.02 },
  { id: "shopeepay",    label: "ShopeePay",               group: "E-Wallet",      feeType: "percent",          feeRate: 0.02 },
  { id: "qris",         label: "QRIS",                    group: "E-Wallet",      feeType: "percent",          feeRate: 0.007, minFee: 300 },
  { id: "credit_card",  label: "Kartu Kredit",            group: "Kartu",         feeType: "percent_plus_flat", feeRate: 0.029, feeFixed: 2000 },
  { id: "alfamart",     label: "Alfamart",                group: "Gerai Ritel",   feeType: "flat",             feeAmount: 5000 },
  { id: "indomaret",    label: "Indomaret",               group: "Gerai Ritel",   feeType: "flat",             feeAmount: 5000 },
];

function calcFee(method: PaymentMethodDef, baseAmount: number): number {
  if (method.feeType === "flat") return method.feeAmount ?? 0;
  if (method.feeType === "percent") {
    return Math.max(method.minFee ?? 0, Math.ceil(baseAmount * (method.feeRate ?? 0)));
  }
  return Math.ceil(baseAmount * (method.feeRate ?? 0)) + (method.feeFixed ?? 0);
}

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const PM_WEBHOOK_SECRET = process.env.PM_WEBHOOK_SECRET ?? null;

function getPmUser(req: Request) {
  return (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;
}

async function serializeTransaction(t: typeof proposalTransactions.$inferSelect) {
  const [buyer] = await db
    .select({ name: proposalUsers.name })
    .from(proposalUsers)
    .where(eq(proposalUsers.id, t.buyerId));

  const [proposal] = await db
    .select({ title: proposals.title })
    .from(proposals)
    .where(eq(proposals.id, t.proposalId));

  return {
    id: t.id,
    buyerId: t.buyerId,
    buyerName: buyer?.name ?? null,
    proposalId: t.proposalId,
    proposalTitle: proposal?.title ?? null,
    amount: t.amount,
    sellerShare: t.sellerShare,
    platformShare: t.platformShare,
    paymentMethod: t.paymentMethod ?? null,
    paymentFee: t.paymentFee,
    paymentId: t.paymentId ?? null,
    paymentStatus: t.paymentStatus,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
    downloadToken: t.downloadToken ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

router.post("/pm/transactions", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user || user.role !== "buyer") {
    res.status(403).json({ error: "Hanya buyer yang bisa membeli" });
    return;
  }

  const parsed = CreatePmTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId));

  if (!proposal) {
    res.status(404).json({ error: "Proposal tidak ditemukan" });
    return;
  }

  if (proposal.status !== "active") {
    res.status(400).json({ error: "Proposal tidak tersedia untuk dibeli" });
    return;
  }

  const baseAmount = proposal.price;
  const sellerShare = Math.floor(baseAmount * 0.65);
  const platformShare = baseAmount - sellerShare;

  let paymentMethod: string | null = null;
  let paymentFee = 0;

  if (parsed.data.paymentMethod) {
    const methodDef = PAYMENT_METHODS.find(m => m.id === parsed.data.paymentMethod);
    if (!methodDef) {
      res.status(400).json({ error: "Metode pembayaran tidak valid" });
      return;
    }
    paymentMethod = methodDef.id;
    const expectedFee = calcFee(methodDef, baseAmount);
    if (parsed.data.paymentFee !== undefined && parsed.data.paymentFee !== expectedFee) {
      res.status(400).json({ error: `Biaya layanan tidak sesuai. Seharusnya Rp ${expectedFee.toLocaleString("id-ID")}` });
      return;
    }
    paymentFee = expectedFee;
  }

  const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const [transaction] = await db
    .insert(proposalTransactions)
    .values({
      buyerId: pmUserId,
      proposalId: proposal.id,
      amount: baseAmount,
      sellerShare,
      platformShare,
      paymentMethod,
      paymentFee,
      paymentId,
      paymentStatus: "pending",
    })
    .returning();

  res.status(201).json(await serializeTransaction(transaction));
});

router.post("/pm/payments/stub-initiate", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const { paymentId } = req.body as { paymentId?: string };
  if (!paymentId) {
    res.status(400).json({ error: "paymentId diperlukan" });
    return;
  }

  const [transaction] = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.paymentId, paymentId));

  if (!transaction) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }

  if (transaction.buyerId !== pmUserId) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  if (transaction.paymentStatus === "paid") {
    res.json({ success: true, alreadyPaid: true, transactionId: transaction.id });
    return;
  }

  const downloadToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(proposalTransactions)
    .set({ paymentStatus: "paid", paidAt: new Date(), downloadToken, downloadTokenExpiresAt: expiresAt })
    .where(eq(proposalTransactions.id, transaction.id));

  const [currentProposal] = await db
    .select({ totalSales: proposals.totalSales })
    .from(proposals)
    .where(eq(proposals.id, transaction.proposalId));

  await db
    .update(proposals)
    .set({ totalSales: (currentProposal?.totalSales ?? 0) + 1 })
    .where(eq(proposals.id, transaction.proposalId));

  res.json({ success: true, transactionId: transaction.id });
});

router.post("/pm/payments/webhook", async (req, res): Promise<void> => {
  if (!PM_WEBHOOK_SECRET) {
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }
  const secret = req.headers["x-pm-webhook-secret"];
  if (!secret || secret !== PM_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  const { paymentId, status } = req.body as { paymentId?: string; status?: string };
  if (!paymentId || status !== "paid") {
    res.status(400).json({ error: "Invalid payload: paymentId and status=paid required" });
    return;
  }

  const [transaction] = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.paymentId, paymentId));

  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (transaction.paymentStatus === "paid") {
    res.json({ success: true, alreadyPaid: true, transactionId: transaction.id });
    return;
  }

  const downloadToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(proposalTransactions)
    .set({ paymentStatus: "paid", paidAt: new Date(), downloadToken, downloadTokenExpiresAt: expiresAt })
    .where(eq(proposalTransactions.id, transaction.id));

  const [currentProposal] = await db
    .select({ totalSales: proposals.totalSales })
    .from(proposals)
    .where(eq(proposals.id, transaction.proposalId));

  await db
    .update(proposals)
    .set({ totalSales: (currentProposal?.totalSales ?? 0) + 1 })
    .where(eq(proposals.id, transaction.proposalId));

  res.json({ success: true, transactionId: transaction.id });
});

router.post("/pm/transactions/:id/confirm", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const [user] = await db
    .select({ role: proposalUsers.role })
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin only — payment confirmation goes through the webhook" });
    return;
  }

  const params = ConfirmPmPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [transaction] = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.id, params.data.id));

  if (!transaction) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }

  if (transaction.paymentStatus === "paid") {
    res.json(await serializeTransaction(transaction));
    return;
  }

  const downloadToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(proposalTransactions)
    .set({ paymentStatus: "paid", paidAt: new Date(), downloadToken, downloadTokenExpiresAt: expiresAt })
    .where(eq(proposalTransactions.id, params.data.id))
    .returning();

  const [currentProposal] = await db
    .select({ totalSales: proposals.totalSales })
    .from(proposals)
    .where(eq(proposals.id, transaction.proposalId));

  await db
    .update(proposals)
    .set({ totalSales: (currentProposal?.totalSales ?? 0) + 1 })
    .where(eq(proposals.id, transaction.proposalId));

  res.json(await serializeTransaction(updated));
});

router.get("/pm/transactions/purchases", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const rows = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.buyerId, pmUserId))
    .orderBy(desc(proposalTransactions.createdAt));

  const result = await Promise.all(rows.map(serializeTransaction));
  res.json(result);
});

router.get("/pm/transactions/admin", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Hanya admin" });
    return;
  }

  const rows = await db
    .select()
    .from(proposalTransactions)
    .orderBy(desc(proposalTransactions.createdAt));

  const result = await Promise.all(rows.map(serializeTransaction));
  res.json(result);
});

router.get("/pm/transactions/:id/download-token", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const params = GetPmDownloadTokenParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [transaction] = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.id, params.data.id));

  if (!transaction) {
    res.status(404).json({ error: "Transaksi tidak ditemukan" });
    return;
  }

  if (transaction.buyerId !== pmUserId) {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  if (transaction.paymentStatus !== "paid" || !transaction.downloadToken) {
    res.status(403).json({ error: "Pembayaran belum dikonfirmasi" });
    return;
  }

  if (transaction.downloadTokenExpiresAt && transaction.downloadTokenExpiresAt < new Date()) {
    const newToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .update(proposalTransactions)
      .set({ downloadToken: newToken, downloadTokenExpiresAt: expiresAt })
      .where(eq(proposalTransactions.id, transaction.id));
    const downloadUrl = `/api/pm/download?token=${newToken}`;
    res.json({ downloadToken: newToken, downloadUrl });
    return;
  }

  const downloadUrl = `/api/pm/download?token=${transaction.downloadToken}`;
  res.json({ downloadToken: transaction.downloadToken, downloadUrl });
});

router.get("/pm/download", async (req, res): Promise<void> => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ error: "Token diperlukan" });
    return;
  }

  const [transaction] = await db
    .select()
    .from(proposalTransactions)
    .where(eq(proposalTransactions.downloadToken, token));

  if (!transaction) {
    res.status(404).json({ error: "Token tidak valid" });
    return;
  }

  if (transaction.downloadTokenExpiresAt && transaction.downloadTokenExpiresAt < new Date()) {
    res.status(403).json({ error: "Token sudah kadaluarsa" });
    return;
  }

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, transaction.proposalId));

  if (!proposal || !proposal.fileKey) {
    res.status(404).json({ error: "File tidak ditemukan" });
    return;
  }

  try {
    const objectPath = proposal.fileKey;
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(file);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const fileName = proposal.title.replace(/[^a-zA-Z0-9]/g, "_") + ".pdf";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    if (response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        start(controller) {
          function pump() {
            reader.read().then(({ done, value }) => {
              if (done) { controller.close(); return; }
              controller.enqueue(value);
              pump();
            });
          }
          pump();
        }
      });
      const { Readable } = await import("stream");
      Readable.fromWeb(stream as unknown as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } else {
      res.status(500).json({ error: "Gagal mengunduh file" });
    }
  } catch {
    res.status(500).json({ error: "Gagal mengunduh file" });
  }
});

export default router;
