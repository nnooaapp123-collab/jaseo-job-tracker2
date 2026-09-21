import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { eq, ilike, and, gte, lte, or, desc } from "drizzle-orm";
import { db, proposals, proposalCategories, proposalUsers } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  CreatePmProposalBody,
  UpdatePmProposalBody,
  GetPmProposalParams,
  UpdatePmProposalParams,
  ListPmProposalsQueryParams,
  ModeratePmProposalBody,
  ModeratePmProposalParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function getPmUser(req: import("express").Request) {
  return (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;
}

async function serializeProposal(p: typeof proposals.$inferSelect) {
  const [seller] = await db
    .select({ name: proposalUsers.name })
    .from(proposalUsers)
    .where(eq(proposalUsers.id, p.sellerId));

  let categoryName: string | null = null;
  if (p.categoryId) {
    const [cat] = await db
      .select({ name: proposalCategories.name })
      .from(proposalCategories)
      .where(eq(proposalCategories.id, p.categoryId));
    categoryName = cat?.name ?? null;
  }

  return {
    id: p.id,
    sellerId: p.sellerId,
    sellerName: seller?.name ?? null,
    title: p.title,
    description: p.description,
    categoryId: p.categoryId ?? null,
    categoryName,
    price: p.price,
    hasFile: !!p.fileKey,
    previewImageKey: p.previewImageKey ?? null,
    previewImageKey2: p.previewImageKey2 ?? null,
    previewImageKey3: p.previewImageKey3 ?? null,
    status: p.status,
    totalSales: p.totalSales,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pm/categories", async (_req, res): Promise<void> => {
  const cats = await db
    .select()
    .from(proposalCategories)
    .orderBy(proposalCategories.name);

  res.json(cats);
});

router.get("/pm/proposals", async (req, res): Promise<void> => {
  const parsed = ListPmProposalsQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search : null;
  const categoryId = parsed.success ? parsed.data.categoryId : null;
  const minPrice = parsed.success ? parsed.data.minPrice : null;
  const maxPrice = parsed.success ? parsed.data.maxPrice : null;

  const pmUserId = getPmUser(req);
  let isAdmin = false;
  if (pmUserId) {
    const [maybeAdmin] = await db
      .select({ role: proposalUsers.role })
      .from(proposalUsers)
      .where(eq(proposalUsers.id, pmUserId));
    isAdmin = maybeAdmin?.role === "admin";
  }

  const conditions = isAdmin ? [] : [eq(proposals.status, "active")];

  if (search) {
    conditions.push(
      or(
        ilike(proposals.title, `%${search}%`),
        ilike(proposals.description, `%${search}%`)
      )!
    );
  }

  if (categoryId) {
    conditions.push(eq(proposals.categoryId, categoryId));
  }

  if (minPrice != null) {
    conditions.push(gte(proposals.price, minPrice));
  }

  if (maxPrice != null) {
    conditions.push(lte(proposals.price, maxPrice));
  }

  const rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(desc(proposals.createdAt));

  const result = await Promise.all(rows.map(serializeProposal));
  res.json(result);
});

router.post("/pm/proposals", async (req, res): Promise<void> => {
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
    res.status(403).json({ error: "Hanya seller yang bisa upload proposal" });
    return;
  }

  const parsed = CreatePmProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [proposal] = await db
    .insert(proposals)
    .values({
      sellerId: pmUserId,
      title: parsed.data.title,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId ?? null,
      price: parsed.data.price,
      fileKey: parsed.data.fileKey ?? null,
      previewImageKey: parsed.data.previewImageKey ?? null,
      previewImageKey2: parsed.data.previewImageKey2 ?? null,
      previewImageKey3: parsed.data.previewImageKey3 ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json(await serializeProposal(proposal));
});

router.get("/pm/proposals/my", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.sellerId, pmUserId))
    .orderBy(desc(proposals.createdAt));

  const result = await Promise.all(rows.map(serializeProposal));
  res.json(result);
});

router.get("/pm/proposals/:id", async (req, res): Promise<void> => {
  const params = GetPmProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, params.data.id));

  if (!proposal) {
    res.status(404).json({ error: "Proposal tidak ditemukan" });
    return;
  }

  if (proposal.status !== "active") {
    const pmUserId = getPmUser(req);
    if (!pmUserId) {
      res.status(404).json({ error: "Proposal tidak ditemukan" });
      return;
    }
    const [caller] = await db
      .select({ role: proposalUsers.role })
      .from(proposalUsers)
      .where(eq(proposalUsers.id, pmUserId));
    if (!caller || (caller.role !== "admin" && proposal.sellerId !== pmUserId)) {
      res.status(404).json({ error: "Proposal tidak ditemukan" });
      return;
    }
  }

  res.json(await serializeProposal(proposal));
});

router.patch("/pm/proposals/:id", async (req, res): Promise<void> => {
  const pmUserId = getPmUser(req);
  if (!pmUserId) {
    res.status(401).json({ error: "Login dulu" });
    return;
  }

  const params = UpdatePmProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Proposal tidak ditemukan" });
    return;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (existing.sellerId !== pmUserId && user?.role !== "admin") {
    res.status(403).json({ error: "Tidak diizinkan" });
    return;
  }

  const parsed = UpdatePmProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const SELLER_ALLOWED_STATUSES = new Set(["draft", "pending", "archived"]);

  if (parsed.data.status != null && user?.role !== "admin") {
    if (!SELLER_ALLOWED_STATUSES.has(parsed.data.status)) {
      res.status(403).json({ error: "Seller tidak dapat mengubah status ke " + parsed.data.status });
      return;
    }
  }

  const update: Partial<typeof proposals.$inferSelect> = {};
  if (parsed.data.title != null) update.title = parsed.data.title;
  if (parsed.data.description != null) update.description = parsed.data.description;
  if (parsed.data.categoryId !== undefined) update.categoryId = parsed.data.categoryId;
  if (parsed.data.price != null) update.price = parsed.data.price;
  if (parsed.data.fileKey !== undefined) update.fileKey = parsed.data.fileKey;
  if (parsed.data.previewImageKey !== undefined) update.previewImageKey = parsed.data.previewImageKey;
  if (parsed.data.previewImageKey2 !== undefined) update.previewImageKey2 = parsed.data.previewImageKey2;
  if (parsed.data.previewImageKey3 !== undefined) update.previewImageKey3 = parsed.data.previewImageKey3;
  if (parsed.data.status != null) update.status = parsed.data.status;

  const [updated] = await db
    .update(proposals)
    .set(update)
    .where(eq(proposals.id, params.data.id))
    .returning();

  res.json(await serializeProposal(updated));
});

router.patch("/pm/proposals/:id/moderate", async (req, res): Promise<void> => {
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

  const params = ModeratePmProposalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ModeratePmProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(proposals)
    .set({
      status: parsed.data.status,
      adminNote: parsed.data.adminNote ?? null,
    })
    .where(eq(proposals.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Proposal tidak ditemukan" });
    return;
  }

  res.json(await serializeProposal(updated));
});

async function serveObjectKey(
  req: import("express").Request,
  res: import("express").Response,
  key: string,
  inline = true,
): Promise<void> {
  try {
    const file = await objectStorageService.getObjectEntityFile(key);
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, hKey) => res.setHeader(hKey, value));
    if (!inline) {
      res.setHeader("Content-Disposition", `attachment; filename="${key.split("/").pop() ?? "file"}"`);
    }
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(404).json({ error: "File not found" });
  }
}

async function checkPreviewAccess(
  req: import("express").Request,
  res: import("express").Response,
  proposalRow: { status: string; sellerId: number } | undefined,
): Promise<boolean> {
  if (!proposalRow) { res.status(404).json({ error: "Not found" }); return false; }
  if (proposalRow.status === "active") return true;
  const pmUserId = getPmUser(req);
  if (!pmUserId) { res.status(404).json({ error: "Not found" }); return false; }
  const [caller] = await db.select({ role: proposalUsers.role }).from(proposalUsers).where(eq(proposalUsers.id, pmUserId));
  if (!caller || (caller.role !== "admin" && proposalRow.sellerId !== pmUserId)) {
    res.status(404).json({ error: "Not found" }); return false;
  }
  return true;
}

router.get("/pm/proposals/:id/preview-image", async (req, res): Promise<void> => {
  const params = GetPmProposalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid proposal ID" }); return; }
  const [p] = await db
    .select({ previewImageKey: proposals.previewImageKey, status: proposals.status, sellerId: proposals.sellerId })
    .from(proposals).where(eq(proposals.id, params.data.id));
  if (!p?.previewImageKey) { res.status(404).json({ error: "No preview image" }); return; }
  if (!await checkPreviewAccess(req, res, p)) return;
  await serveObjectKey(req, res, p.previewImageKey);
});

router.get("/pm/proposals/:id/preview-image-2", async (req, res): Promise<void> => {
  const params = GetPmProposalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid proposal ID" }); return; }
  const [p] = await db
    .select({ previewImageKey2: proposals.previewImageKey2, status: proposals.status, sellerId: proposals.sellerId })
    .from(proposals).where(eq(proposals.id, params.data.id));
  if (!p?.previewImageKey2) { res.status(404).json({ error: "No preview image" }); return; }
  if (!await checkPreviewAccess(req, res, p)) return;
  await serveObjectKey(req, res, p.previewImageKey2);
});

router.get("/pm/proposals/:id/preview-image-3", async (req, res): Promise<void> => {
  const params = GetPmProposalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid proposal ID" }); return; }
  const [p] = await db
    .select({ previewImageKey3: proposals.previewImageKey3, status: proposals.status, sellerId: proposals.sellerId })
    .from(proposals).where(eq(proposals.id, params.data.id));
  if (!p?.previewImageKey3) { res.status(404).json({ error: "No preview image" }); return; }
  if (!await checkPreviewAccess(req, res, p)) return;
  await serveObjectKey(req, res, p.previewImageKey3);
});

router.get("/pm/proposals/:id/admin-file", async (req, res): Promise<void> => {
  const params = GetPmProposalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid proposal ID" }); return; }
  const pmUserId = getPmUser(req);
  if (!pmUserId) { res.status(401).json({ error: "Login dulu" }); return; }
  const [p] = await db
    .select({ fileKey: proposals.fileKey, sellerId: proposals.sellerId })
    .from(proposals).where(eq(proposals.id, params.data.id));
  if (!p?.fileKey) { res.status(404).json({ error: "File tidak ditemukan" }); return; }
  const [caller] = await db.select({ role: proposalUsers.role }).from(proposalUsers).where(eq(proposalUsers.id, pmUserId));
  if (!caller || (caller.role !== "admin" && p.sellerId !== pmUserId)) {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }
  await serveObjectKey(req, res, p.fileKey, false);
});

export default router;
