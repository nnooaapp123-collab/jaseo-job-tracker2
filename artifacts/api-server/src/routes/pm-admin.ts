import { Router, type IRouter, type Request, type Response } from "express";
import { eq, count, desc } from "drizzle-orm";
import { db, proposals, proposalTransactions, proposalUsers, proposalPayouts } from "@workspace/db";

const router: IRouter = Router();

function getPmUser(req: Request) {
  return (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return false;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Hanya admin" });
    return false;
  }

  return true;
}

router.get("/pm/admin/stats", async (req, res): Promise<void> => {
  const isAdmin = await requireAdmin(
    req,
    res
  );
  if (!isAdmin) return;

  const paidTransactions = await db
    .select({
      amount: proposalTransactions.amount,
      sellerShare: proposalTransactions.sellerShare,
      platformShare: proposalTransactions.platformShare,
    })
    .from(proposalTransactions)
    .where(eq(proposalTransactions.paymentStatus, "paid"));

  const totalRevenue = paidTransactions.reduce((acc, t) => acc + t.amount, 0);
  const platformRevenue = paidTransactions.reduce((acc, t) => acc + t.platformShare, 0);
  const sellerPayouts = paidTransactions.reduce((acc, t) => acc + t.sellerShare, 0);
  const totalTransactions = paidTransactions.length;

  const [{ count: totalProposals }] = await db
    .select({ count: count() })
    .from(proposals);

  const [{ count: totalSellers }] = await db
    .select({ count: count() })
    .from(proposalUsers)
    .where(eq(proposalUsers.role, "seller"));

  const [{ count: totalBuyers }] = await db
    .select({ count: count() })
    .from(proposalUsers)
    .where(eq(proposalUsers.role, "buyer"));

  const [{ count: pendingPayouts }] = await db
    .select({ count: count() })
    .from(proposalPayouts)
    .where(eq(proposalPayouts.status, "pending"));

  res.json({
    totalRevenue,
    platformRevenue,
    sellerPayouts,
    totalTransactions,
    totalProposals: Number(totalProposals),
    totalSellers: Number(totalSellers),
    totalBuyers: Number(totalBuyers),
    pendingPayouts: Number(pendingPayouts),
  });
});

router.get("/pm/admin/users", async (req, res): Promise<void> => {
  const isAdmin = await requireAdmin(
    req,
    res
  );
  if (!isAdmin) return;

  const users = await db
    .select()
    .from(proposalUsers)
    .orderBy(desc(proposalUsers.createdAt));

  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      bankName: u.bankName ?? null,
      bankAccount: u.bankAccount ?? null,
      accountOwner: u.accountOwner ?? null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.get("/pm/seller/stats", async (req, res): Promise<void> => {
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

  const sellerProposals = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.sellerId, pmUserId));

  const proposalIds = sellerProposals.map((p) => p.id);
  const totalProposals = proposalIds.length;

  const paidTransactions = await db
    .select({
      sellerShare: proposalTransactions.sellerShare,
    })
    .from(proposalTransactions)
    .where(eq(proposalTransactions.paymentStatus, "paid"));

  const sellerTransactions = await db
    .select({
      sellerShare: proposalTransactions.sellerShare,
      proposalId: proposalTransactions.proposalId,
    })
    .from(proposalTransactions)
    .where(eq(proposalTransactions.paymentStatus, "paid"));

  const ownTransactions = sellerTransactions.filter((t) =>
    proposalIds.includes(t.proposalId)
  );

  const totalSales = ownTransactions.length;
  const totalEarnings = ownTransactions.reduce((acc, t) => acc + t.sellerShare, 0);

  const approvedPayouts = await db
    .select({ amount: proposalPayouts.amount })
    .from(proposalPayouts)
    .where(
      eq(proposalPayouts.sellerId, pmUserId)
    );

  const paidPayouts = approvedPayouts
    .filter((_, idx) => idx >= 0)
    .reduce((acc, p) => acc + p.amount, 0);

  const allPayouts = await db
    .select()
    .from(proposalPayouts)
    .where(eq(proposalPayouts.sellerId, pmUserId));

  const approvedAmount = allPayouts
    .filter((p) => p.status === "approved" || p.status === "paid")
    .reduce((acc, p) => acc + p.amount, 0);

  const pendingPayoutsAmount = allPayouts
    .filter((p) => p.status === "pending")
    .reduce((acc, p) => acc + p.amount, 0);

  const availableBalance = Math.max(0, totalEarnings - approvedAmount);

  res.json({
    totalSales,
    totalEarnings,
    availableBalance,
    pendingPayouts: pendingPayoutsAmount,
    totalProposals,
  });
});

export default router;
