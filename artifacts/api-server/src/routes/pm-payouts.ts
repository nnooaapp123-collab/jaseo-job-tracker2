import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { eq, and, desc } from "drizzle-orm";
import { db, proposalPayouts, proposalTransactions, proposalUsers, proposals } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  RequestPmPayoutBody,
  UpdatePmPayoutBody,
  UpdatePmPayoutParams,
} from "@workspace/api-zod";

const objectStorageService = new ObjectStorageService();

const router: IRouter = Router();

const MIN_PAYOUT_AMOUNT = 50000;

function getPmUser(req: import("express").Request) {
  return (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;
}

async function serializePayout(p: typeof proposalPayouts.$inferSelect) {
  const [seller] = await db
    .select({ name: proposalUsers.name, bankName: proposalUsers.bankName, bankAccount: proposalUsers.bankAccount, accountOwner: proposalUsers.accountOwner })
    .from(proposalUsers)
    .where(eq(proposalUsers.id, p.sellerId));

  return {
    id: p.id,
    sellerId: p.sellerId,
    sellerName: seller?.name ?? null,
    sellerBankName: seller?.bankName ?? null,
    sellerBankAccount: seller?.bankAccount ?? null,
    sellerAccountOwner: seller?.accountOwner ?? null,
    amount: p.amount,
    status: p.status,
    adminNote: p.adminNote ?? null,
    transferProofKey: p.transferProofKey ?? null,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt ? p.processedAt.toISOString() : null,
  };
}

async function getSellerBalance(sellerId: number): Promise<number> {
  const paidTransactions = await db
    .select({
      sellerShare: proposalTransactions.sellerShare,
    })
    .from(proposalTransactions)
    .innerJoin(proposals, eq(proposalTransactions.proposalId, proposals.id))
    .where(
      and(
        eq(proposals.sellerId, sellerId),
        eq(proposalTransactions.paymentStatus, "paid")
      )
    );

  const totalEarned = paidTransactions.reduce((acc, t) => acc + t.sellerShare, 0);

  const payouts = await db
    .select()
    .from(proposalPayouts)
    .where(eq(proposalPayouts.sellerId, sellerId));

  const totalReserved = payouts
    .filter((p) => p.status === "pending" || p.status === "approved" || p.status === "paid")
    .reduce((acc, p) => acc + p.amount, 0);
  return Math.max(0, totalEarned - totalReserved);
}

router.post("/pm/payouts", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user || user.role !== "seller") {
    res.status(403).json({ error: "Hanya seller" });
    return;
  }

  const parsed = RequestPmPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.amount < MIN_PAYOUT_AMOUNT) {
    res.status(400).json({ error: `Minimum penarikan Rp ${MIN_PAYOUT_AMOUNT.toLocaleString("id-ID")}` });
    return;
  }

  const balance = await getSellerBalance(pmUserId);
  if (parsed.data.amount > balance) {
    res.status(400).json({ error: "Saldo tidak mencukupi" });
    return;
  }

  const [payout] = await db
    .insert(proposalPayouts)
    .values({
      sellerId: pmUserId,
      amount: parsed.data.amount,
      status: "pending",
    })
    .returning();

  res.status(201).json(await serializePayout(payout));
});

router.get("/pm/payouts/mine", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const rows = await db
    .select()
    .from(proposalPayouts)
    .where(eq(proposalPayouts.sellerId, pmUserId))
    .orderBy(desc(proposalPayouts.requestedAt));

  const result = await Promise.all(rows.map(serializePayout));
  res.json(result);
});

router.get("/pm/payouts/admin", async (req, res): Promise<void> => {
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
    .from(proposalPayouts)
    .orderBy(desc(proposalPayouts.requestedAt));

  const result = await Promise.all(rows.map(serializePayout));
  res.json(result);
});

router.patch("/pm/payouts/:id", async (req, res): Promise<void> => {
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

  const params = UpdatePmPayoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePmPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof proposalPayouts.$inferInsert> = {
    status: parsed.data.status,
    adminNote: parsed.data.adminNote ?? null,
    processedAt: new Date(),
  };
  if (parsed.data.transferProofKey !== undefined) {
    updateData.transferProofKey = parsed.data.transferProofKey ?? null;
  }

  const [updated] = await db
    .update(proposalPayouts)
    .set(updateData)
    .where(eq(proposalPayouts.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Payout tidak ditemukan" });
    return;
  }

  res.json(await serializePayout(updated));
});

router.get("/pm/payouts/:id/proof-image", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const payoutId = Number(req.params.id);
  const [payout] = await db
    .select()
    .from(proposalPayouts)
    .where(eq(proposalPayouts.id, payoutId));

  if (!payout || !payout.transferProofKey) {
    res.status(404).json({ error: "Bukti transfer tidak ditemukan" });
    return;
  }

  const [user] = await db
    .select({ role: proposalUsers.role, id: proposalUsers.id })
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const isAdmin = user.role === "admin";
  const isSeller = payout.sellerId === user.id;
  if (!isAdmin && !isSeller) {
    res.status(403).json({ error: "Akses ditolak" });
    return;
  }

  try {
    const file = await objectStorageService.getObjectEntityFile(payout.transferProofKey);
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, hKey) => res.setHeader(hKey, value));
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(404).json({ error: "File tidak ditemukan" });
  }
});

export { getSellerBalance };
export default router;
