import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, jobsTable, writersTable, editorsTable, usersTable, additionalIncomeTable, monthlySavingsTable, savingsWithdrawalsTable, customersTable, articleOrdersTable, holidaysTable, salaryTransfersTable } from "@workspace/db";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

import {
  CreateJobBody,
  UpdateJobBody,
  ListJobsQueryParams,
  GetJobParams,
  UpdateJobParams,
  DeleteJobParams,
  CreateWriterBody,
  UpdateWriterBody,
  CreateEditorBody,
  GetDailyStatsQueryParams,
  GetSummaryStatsQueryParams,
} from "@workspace/api-zod";

const router = Router();

// Jobs
router.get("/jobs", async (req, res) => {
  const query = ListJobsQueryParams.parse(req.query);

  const jobs = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      website: jobsTable.website,
      username: jobsTable.username,
      password: jobsTable.password,
      notes: jobsTable.notes,
      petunjuk: jobsTable.petunjuk,
      versionTool: jobsTable.versionTool,
      wordCount: jobsTable.wordCount,
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      revisionNotes: jobsTable.revisionNotes,
      isChecked: jobsTable.isChecked,
      jobDate: jobsTable.jobDate,
      createdAt: jobsTable.createdAt,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(
      and(
        query.date ? eq(jobsTable.jobDate, query.date) : undefined,
        query.writerId ? eq(jobsTable.writerId, query.writerId) : undefined
      )
    )
    .orderBy(jobsTable.createdAt, jobsTable.id);

  res.json(jobs.map(j => ({
    ...j,
    createdAt: j.createdAt.toISOString(),
  })));
});

router.post("/jobs", async (req, res) => {
  const body = CreateJobBody.parse(req.body);

  const [job] = await db
    .insert(jobsTable)
    .values({
      jobCode: body.jobCode,
      website: body.website,
      username: body.username ?? null,
      password: body.password ?? null,
      notes: body.notes ?? null,
      petunjuk: body.petunjuk ?? null,
      versionTool: body.versionTool,
      wordCount: body.wordCount,
      writerId: body.writerId ?? null,
      editorId: body.editorId ?? null,
      jobDate: body.jobDate,
    })
    .returning();

  const writer = job.writerId
    ? await db.select().from(writersTable).where(eq(writersTable.id, job.writerId)).then(r => r[0])
    : null;
  const editor = job.editorId
    ? await db.select().from(editorsTable).where(eq(editorsTable.id, job.editorId)).then(r => r[0])
    : null;

  res.status(201).json({
    ...job,
    writerName: writer?.name ?? null,
    editorName: editor?.name ?? null,
    createdAt: job.createdAt.toISOString(),
  });
});

// Lookup petunjuk dari order table (prioritas) atau jobs table — untuk preview di form order
router.get("/jobs/lookup-petunjuk", async (req, res) => {
  const code = (req.query.code ?? "").toString().trim();
  if (!code) { res.json({ petunjuk: null, exists: false }); return; }
  // Cek di articleOrdersTable dulu (sumber utama)
  const [order] = await db
    .select({ petunjuk: articleOrdersTable.petunjuk })
    .from(articleOrdersTable)
    .where(eq(articleOrdersTable.jobCode, code))
    .limit(1);
  if (order) {
    // Cek juga apakah ada job yang ada
    const [job] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.jobCode, code)).limit(1);
    res.json({ petunjuk: order.petunjuk ?? null, exists: !!job });
    return;
  }
  // Fallback: cek di jobs table
  const [job] = await db
    .select({ petunjuk: jobsTable.petunjuk })
    .from(jobsTable)
    .where(eq(jobsTable.jobCode, code))
    .orderBy(desc(jobsTable.createdAt))
    .limit(1);
  res.json({ petunjuk: job?.petunjuk ?? null, exists: !!job });
});

router.get("/jobs/:id", async (req, res) => {
  const { id } = GetJobParams.parse({ id: Number(req.params.id) });

  const [job] = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      website: jobsTable.website,
      username: jobsTable.username,
      password: jobsTable.password,
      notes: jobsTable.notes,
      petunjuk: jobsTable.petunjuk,
      versionTool: jobsTable.versionTool,
      wordCount: jobsTable.wordCount,
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      revisionNotes: jobsTable.revisionNotes,
      isChecked: jobsTable.isChecked,
      jobDate: jobsTable.jobDate,
      createdAt: jobsTable.createdAt,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(eq(jobsTable.id, id));

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ ...job, createdAt: job.createdAt.toISOString() });
});

router.patch("/jobs/:id", async (req, res) => {
  const { id } = UpdateJobParams.parse({ id: Number(req.params.id) });
  const body = UpdateJobBody.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (body.jobCode != null) updates.jobCode = body.jobCode;
  if (body.website != null) updates.website = body.website;
  if (body.username !== undefined) updates.username = body.username;
  if (body.password !== undefined) updates.password = body.password;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.petunjuk !== undefined) updates.petunjuk = body.petunjuk;
  if (body.versionTool != null) updates.versionTool = body.versionTool;
  if (body.wordCount != null) updates.wordCount = body.wordCount;
  if (body.writerId !== undefined) updates.writerId = body.writerId;
  if (body.editorId !== undefined) updates.editorId = body.editorId;
  if (body.isChecked != null) updates.isChecked = body.isChecked;
  if (body.jobDate != null) updates.jobDate = body.jobDate;
  if (body.revisionNotes !== undefined) updates.revisionNotes = body.revisionNotes;

  const [job] = await db
    .update(jobsTable)
    .set(updates)
    .where(eq(jobsTable.id, id))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  // Jika petunjuk diupdate, cascade ke semua job lain dengan jobCode yang sama + articleOrdersTable
  if (updates.petunjuk !== undefined) {
    await db
      .update(jobsTable)
      .set({ petunjuk: job.petunjuk })
      .where(and(eq(jobsTable.jobCode, job.jobCode), sql`${jobsTable.id} != ${job.id}`));
    await db
      .update(articleOrdersTable)
      .set({ petunjuk: job.petunjuk })
      .where(eq(articleOrdersTable.jobCode, job.jobCode));
  }

  const writer = job.writerId
    ? await db.select().from(writersTable).where(eq(writersTable.id, job.writerId)).then(r => r[0])
    : null;
  const editor = job.editorId
    ? await db.select().from(editorsTable).where(eq(editorsTable.id, job.editorId)).then(r => r[0])
    : null;

  res.json({
    ...job,
    writerName: writer?.name ?? null,
    editorName: editor?.name ?? null,
    createdAt: job.createdAt.toISOString(),
  });
});

router.delete("/jobs/delete-all", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Hanya Admin yang bisa menghapus semua data job" }); return; }
  const result = await db.delete(jobsTable);
  req.log.warn({ deletedBy: user.username }, "Semua data job dihapus oleh admin");
  res.json({ ok: true, deleted: (result as any).rowCount ?? 0 });
});

router.delete("/jobs/:id", async (req, res) => {
  const { id } = DeleteJobParams.parse({ id: Number(req.params.id) });

  await db.delete(jobsTable).where(eq(jobsTable.id, id));
  res.json({ success: true });
});

// Writers
router.get("/writers", async (_req, res) => {
  const writers = await db.select().from(writersTable).orderBy(writersTable.name);
  // Find CS-role user for each writer
  const csUsers = await db
    .select({ writerId: usersTable.writerId })
    .from(usersTable)
    .where(eq(usersTable.role, "cs"));
  const csWriterIds = new Set(csUsers.map(u => u.writerId).filter(Boolean) as number[]);

  res.json(writers.map(w => ({
    ...w,
    isCS: csWriterIds.has(w.id),
    createdAt: w.createdAt.toISOString(),
  })));
});

router.post("/writers", async (req, res) => {
  const body = CreateWriterBody.parse(req.body);
  const [writer] = await db.insert(writersTable).values({
    name: body.name,
    fullName: body.fullName ?? null,
    address: body.address ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    bankAccount: body.bankAccount ?? null,
    bankName: body.bankName ?? null,
    accountOwner: body.accountOwner ?? null,
    joinDate: body.joinDate ?? null,
    photoUrl: body.photoUrl ?? null,
    isAlsoEditor: body.isAlsoEditor ?? false,
    maxDailyWords: body.maxDailyWords ?? null,
  }).returning();

  // Auto-buat akun user untuk penulis baru
  try {
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("jaseo12", 10);
    const username = writer.name.toLowerCase().replace(/\s+/g, ".");
    await db
      .insert(usersTable)
      .values({ username, passwordHash: hash, role: "penulis", writerId: writer.id, editorId: null })
      .onConflictDoNothing();
  } catch (err) {
    // Jangan gagalkan response hanya karena user sudah ada
    console.error("Auto-create user gagal:", err);
  }

  res.status(201).json({ ...writer, createdAt: writer.createdAt.toISOString() });
});

router.patch("/writers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateWriterBody.parse(req.body);

  // Fetch existing writer first
  const [existing] = await db.select().from(writersTable).where(eq(writersTable.id, id));
  if (!existing) return res.status(404).json({ error: "Writer not found" });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined && body.name !== null) updates.name = body.name;
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.address !== undefined) updates.address = body.address;
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.bankAccount !== undefined) updates.bankAccount = body.bankAccount;
  if (body.bankName !== undefined) updates.bankName = body.bankName;
  if (body.accountOwner !== undefined) updates.accountOwner = body.accountOwner;
  if (body.joinDate !== undefined) updates.joinDate = body.joinDate;
  if (body.photoUrl !== undefined) updates.photoUrl = body.photoUrl;
  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
    if (!body.isActive && body.lastActiveDate === undefined) {
      // Otomatis isi tanggal nonaktif saat dinonaktifkan
      updates.lastActiveDate = new Date().toISOString().slice(0, 10);
    }
  }
  if (body.lastActiveDate !== undefined) updates.lastActiveDate = body.lastActiveDate;
  if (body.maxDailyWords !== undefined) updates.maxDailyWords = body.maxDailyWords;

  // Handle isAlsoEditor toggle: auto-create/soft-delete editor entry
  if (body.isAlsoEditor !== undefined) {
    updates.isAlsoEditor = body.isAlsoEditor;
    let nextLinkedEditorId = existing.linkedEditorId;

    if (body.isAlsoEditor && !existing.linkedEditorId) {
      const writerName = (body.name as string | undefined) ?? existing.name;
      const [newEditor] = await db.insert(editorsTable).values({ name: writerName }).returning();
      updates.linkedEditorId = newEditor.id;
      nextLinkedEditorId = newEditor.id;
    } else if (!body.isAlsoEditor && existing.linkedEditorId) {
      await db.update(editorsTable).set({ isDeleted: true }).where(eq(editorsTable.id, existing.linkedEditorId));
      updates.linkedEditorId = null;
      nextLinkedEditorId = null;
    } else if (body.isAlsoEditor && existing.linkedEditorId) {
      const writerName = (body.name as string | undefined) ?? existing.name;
      await db.update(editorsTable).set({ name: writerName, isDeleted: false }).where(eq(editorsTable.id, existing.linkedEditorId));
    }

    await db
      .update(usersTable)
      .set({ editorId: body.isAlsoEditor ? nextLinkedEditorId : null })
      .where(eq(usersTable.writerId, id));
  } else if (body.name !== undefined && body.name !== null && existing.isAlsoEditor && existing.linkedEditorId) {
    await db.update(editorsTable).set({ name: body.name }).where(eq(editorsTable.id, existing.linkedEditorId));
  }

  if (Object.keys(updates).length === 0) {
    return res.json({ ...existing, createdAt: existing.createdAt.toISOString() });
  }

  const [writer] = await db.update(writersTable).set(updates).where(eq(writersTable.id, id)).returning();
  if (!writer) return res.status(404).json({ error: "Writer not found" });
  return res.json({ ...writer, createdAt: writer.createdAt.toISOString() });
});

// Editors
router.get("/editors", async (_req, res) => {
  const editors = await db.select().from(editorsTable)
    .where(eq(editorsTable.isDeleted, false))
    .orderBy(editorsTable.name);
  res.json(editors.map(e => ({ ...e, createdAt: e.createdAt.toISOString() })));
});

router.post("/editors", async (req, res) => {
  const body = CreateEditorBody.parse(req.body);
  const [editor] = await db.insert(editorsTable).values({ name: body.name }).returning();
  res.status(201).json({ ...editor, createdAt: editor.createdAt.toISOString() });
});

router.delete("/editors/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.update(editorsTable).set({ isDeleted: true }).where(eq(editorsTable.id, id));
  return res.json({ success: true });
});

router.delete("/writers/:id/permanent", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [writer] = await db.select().from(writersTable).where(eq(writersTable.id, id));
  if (!writer) return res.status(404).json({ error: "Writer not found" });

  await db.transaction(async (tx) => {
    const userCondition = writer.linkedEditorId
      ? sql`${usersTable.writerId} = ${id} OR ${usersTable.editorId} = ${writer.linkedEditorId}`
      : eq(usersTable.writerId, id);

    const usersToDelete = await tx.select({ id: usersTable.id }).from(usersTable).where(userCondition);
    for (const user of usersToDelete) {
      await tx.delete(additionalIncomeTable).where(eq(additionalIncomeTable.userId, user.id));
    }

    await tx.delete(usersTable).where(userCondition);
    await tx.update(jobsTable).set({ writerId: null }).where(eq(jobsTable.writerId, id));

    if (writer.linkedEditorId) {
      await tx.update(jobsTable).set({ editorId: null }).where(eq(jobsTable.editorId, writer.linkedEditorId));
      await tx.delete(editorsTable).where(eq(editorsTable.id, writer.linkedEditorId));
    }

    await tx.delete(writersTable).where(eq(writersTable.id, id));
  });

  return res.json({ success: true });
});

router.delete("/writers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.update(writersTable).set({ isActive: false, lastActiveDate: new Date().toISOString().slice(0, 10) }).where(eq(writersTable.id, id));
  return res.json({ success: true });
});

// Batch import jobs dari Excel
router.post("/jobs/batch", async (req, res) => {
  const { jobs } = req.body as { jobs: Array<{
    jobCode: string; website: string; jobDate: string;
    username?: string | null; password?: string | null;
    notes?: string | null; versionTool?: string | null;
    wordCount?: number | null; writerId?: number | null;
  }> };
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: "Jobs array kosong" });
  }
  const inserted = await db.insert(jobsTable).values(
    jobs.map(j => ({
      jobCode: j.jobCode,
      website: j.website,
      jobDate: j.jobDate,
      username: j.username ?? null,
      password: j.password ?? null,
      notes: j.notes ?? null,
      versionTool: j.versionTool ?? "",
      wordCount: j.wordCount ?? 0,
      writerId: j.writerId ?? null,
    }))
  ).returning();
  return res.status(201).json({ count: inserted.length });
});

// Batch update petunjuk berdasarkan kode job
router.post("/jobs/batch-petunjuk", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || (currentUser.role !== "cs" && currentUser.role !== "admin")) {
    res.status(403).json({ error: "Hanya CS atau Admin yang bisa import petunjuk" }); return;
  }

  const { items } = req.body as { items: Array<{ jobCode: string; petunjuk: string }> };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Items array kosong" }); return;
  }

  let updated = 0;
  const notFound: string[] = [];

  for (const item of items) {
    const code = (item.jobCode ?? "").trim();
    if (!code) continue;
    const petunjukVal = item.petunjuk ?? null;
    const result = await db
      .update(jobsTable)
      .set({ petunjuk: petunjukVal })
      .where(eq(jobsTable.jobCode, code))
      .returning({ id: jobsTable.id });
    // Sync ke articleOrdersTable juga
    await db
      .update(articleOrdersTable)
      .set({ petunjuk: petunjukVal })
      .where(eq(articleOrdersTable.jobCode, code));
    if (result.length > 0) updated++;
    else notFound.push(code);
  }

  res.json({ updated, notFound });
});

// Stats
router.get("/stats/daily", async (req, res) => {
  const query = GetDailyStatsQueryParams.parse(req.query);

  const rows = await db
    .select({
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      totalWords: sql<number>`sum(${jobsTable.wordCount})`,
      totalJobs: sql<number>`count(*)`,
      completedJobs: sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
      revisionJobs: sql<number>`sum(case when ${jobsTable.revisionNotes} is not null and ${jobsTable.revisionNotes} <> '' then 1 else 0 end)`,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .where(
      and(
        query.date ? eq(jobsTable.jobDate, query.date) : undefined,
        sql`${jobsTable.writerId} is not null`
      )
    )
    .groupBy(jobsTable.writerId, writersTable.name);

  res.json(rows.map(r => ({
    writerId: r.writerId!,
    writerName: r.writerName ?? "Unknown",
    totalWords: Number(r.totalWords) || 0,
    totalJobs: Number(r.totalJobs) || 0,
    completedJobs: Number(r.completedJobs) || 0,
    revisionJobs: Number(r.revisionJobs) || 0,
  })));
});

router.get("/stats/editor-daily", async (req, res) => {
  const query = GetDailyStatsQueryParams.parse(req.query);

  const rows = await db
    .select({
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      totalEdited: sql<number>`count(*)`,
      totalWords: sql<number>`sum(${jobsTable.wordCount})`,
      revisionJobs: sql<number>`sum(case when ${jobsTable.revisionNotes} is not null and ${jobsTable.revisionNotes} <> '' then 1 else 0 end)`,
    })
    .from(jobsTable)
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(
      and(
        query.date ? eq(jobsTable.jobDate, query.date) : undefined,
        sql`${jobsTable.editorId} is not null`
      )
    )
    .groupBy(jobsTable.editorId, editorsTable.name);

  res.json(rows.map(r => ({
    editorId: r.editorId!,
    editorName: r.editorName ?? "Unknown",
    totalEdited: Number(r.totalEdited) || 0,
    totalWords: Number(r.totalWords) || 0,
    revisionJobs: Number(r.revisionJobs) || 0,
  })));
});

router.get("/stats/summary", async (req, res) => {
  const query = GetSummaryStatsQueryParams.parse(req.query);

  const condition = query.date ? eq(jobsTable.jobDate, query.date) : undefined;

  const [jobStats] = await db
    .select({
      totalJobs: sql<number>`count(*)`,
      totalWords: sql<number>`sum(${jobsTable.wordCount})`,
      completedJobs: sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
      editedJobs: sql<number>`sum(case when ${jobsTable.editorId} is not null then 1 else 0 end)`,
      revisionJobs: sql<number>`sum(case when ${jobsTable.revisionNotes} is not null and ${jobsTable.revisionNotes} <> '' then 1 else 0 end)`,
    })
    .from(jobsTable)
    .where(condition);

  // Total revisi belum diselesaikan lintas semua tanggal
  const [pendingAll] = await db
    .select({ total: sql<number>`count(*)` })
    .from(jobsTable)
    .where(and(
      sql`${jobsTable.revisionNotes} is not null`,
      sql`${jobsTable.revisionNotes} <> ''`,
    ));

  const [writerCount] = await db
    .select({ total: sql<number>`count(*)` })
    .from(writersTable);

  const total = Number(jobStats?.totalJobs) || 0;
  const completed = Number(jobStats?.completedJobs) || 0;

  res.json({
    totalJobs: total,
    totalWords: Number(jobStats?.totalWords) || 0,
    completedJobs: completed,
    pendingJobs: total - completed,
    totalWriters: Number(writerCount?.total) || 0,
    editedJobs: Number(jobStats?.editedJobs) || 0,
    revisionJobs: Number(jobStats?.revisionJobs) || 0,
    totalPendingRevisions: Number(pendingAll?.total) || 0,
  });
});

// ─── Users: List (admin only) ────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!me || me.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const allUsers = await db.select().from(usersTable);
  const writerIds = allUsers.map(u => u.writerId).filter(Boolean) as number[];
  const editorIds = allUsers.map(u => u.editorId).filter(Boolean) as number[];

  const writers = writerIds.length > 0
    ? await db.select().from(writersTable).where(sql`${writersTable.id} = ANY(${sql`ARRAY[${sql.join(writerIds.map(id => sql`${id}`), sql`, `)}]::int[]`})`)
    : [];
  const editors = editorIds.length > 0
    ? await db.select().from(editorsTable).where(sql`${editorsTable.id} = ANY(${sql`ARRAY[${sql.join(editorIds.map(id => sql`${id}`), sql`, `)}]::int[]`})`)
    : [];

  const writerMap    = new Map(writers.map(w => [w.id, w]));
  const editorMap    = new Map(editors.map(e => [e.id, e]));

  const result = allUsers
    // Lewati user yang terhubung ke editor yang sudah dihapus (isDeleted=true)
    .filter(u => {
      if (u.editorId) {
        const editor = editorMap.get(u.editorId);
        if (!editor || editor.isDeleted) return false;
      }
      return true;
    })
    .map(u => {
      const writer = u.writerId ? writerMap.get(u.writerId) : null;
      const editor = u.editorId ? editorMap.get(u.editorId) : null;
      const displayName = writer?.name ?? editor?.name ?? u.username;
      return {
        id: u.id,
        username: u.username,
        role: u.role,
        displayName,
        writerId: u.writerId ?? null,
        writerName: writer?.name ?? null,
        editorId: u.editorId ?? null,
        editorName: editor?.name ?? null,
        isActive: writer ? (writer.isActive ?? true) : true,
        plainPassword: u.plainPassword ?? "jaseo12",
      };
    });

  res.json(result);
});

// ─── Helper: formula gaji penulis ───────────────────────────────────────────
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

// ─── Salary: Monthly (penulis / editor / admin) ──────────────────────────────
router.get("/salary/monthly", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (currentUser.role === "cs") { res.status(403).json({ error: "Gunakan /salary/cs-monthly untuk CS" }); return; }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  let targetUser = currentUser;
  if (currentUser.role === "admin" && req.query.targetUserId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(req.query.targetUserId as string)));
    if (u) targetUser = u;
  }

  const targetRole     = targetUser.role;
  const targetWriterId = targetUser.writerId;
  const targetEditorId = targetUser.editorId;

  // ── Query writer: selesai (untuk gaji) dan semua (untuk info) ────────────
  let totalWords = 0;   // selesai
  let totalJobs  = 0;   // selesai
  let allWords   = 0;   // semua
  let allJobs    = 0;   // semua
  let writerName: string | null = null;
  let writerLinkedEditorId: number | null = null;

  if (targetWriterId) {
    // Selesai saja (is_checked = true) → untuk kalkulasi gaji
    const [wsSelesai] = await db
      .select({
        writerName:     writersTable.name,
        linkedEditorId: writersTable.linkedEditorId,
        totalWords:     sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
        totalJobs:      sql<number>`count(*)`,
      })
      .from(jobsTable)
      .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
      .where(and(
        eq(jobsTable.writerId, targetWriterId),
        eq(jobsTable.isChecked, true),
        sql`${jobsTable.jobDate} >= ${startDate}`,
        sql`${jobsTable.jobDate} <= ${endDate}`
      ))
      .groupBy(writersTable.name, writersTable.linkedEditorId);

    // Semua job (untuk info total)
    const [wsAll] = await db
      .select({
        allWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
        allJobs:  sql<number>`count(*)`,
      })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.writerId, targetWriterId),
        sql`${jobsTable.jobDate} >= ${startDate}`,
        sql`${jobsTable.jobDate} <= ${endDate}`
      ));

    totalWords           = Number(wsSelesai?.totalWords) || 0;
    totalJobs            = Number(wsSelesai?.totalJobs) || 0;
    allWords             = Number(wsAll?.allWords) || 0;
    allJobs              = Number(wsAll?.allJobs) || 0;
    writerName           = wsSelesai?.writerName ?? null;
    writerLinkedEditorId = wsSelesai?.linkedEditorId ?? null;
  }

  // ── Query editor: selesai (untuk gaji) dan semua (untuk info) ────────────
  let editorId: number | null = null;
  let editorName: string | null = null;
  let editorTotalWords = 0;   // selesai
  let editorTotalJobs  = 0;   // selesai
  let allEditorWords   = 0;   // semua
  let allEditorJobs    = 0;   // semua

  const checkEditorId = targetEditorId ?? writerLinkedEditorId ?? null;
  if (checkEditorId) {
    // Selesai saja
    const [esSelesai] = await db
      .select({
        editorId:   jobsTable.editorId,
        editorName: editorsTable.name,
        totalWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
        totalJobs:  sql<number>`count(*)`,
      })
      .from(jobsTable)
      .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
      .where(and(
        eq(jobsTable.editorId, checkEditorId),
        eq(jobsTable.isChecked, true),
        sql`${jobsTable.jobDate} >= ${startDate}`,
        sql`${jobsTable.jobDate} <= ${endDate}`
      ))
      .groupBy(jobsTable.editorId, editorsTable.name);

    // Semua job editor
    const [esAll] = await db
      .select({
        allWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
        allJobs:  sql<number>`count(*)`,
      })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.editorId, checkEditorId),
        sql`${jobsTable.jobDate} >= ${startDate}`,
        sql`${jobsTable.jobDate} <= ${endDate}`
      ));

    editorId         = esSelesai?.editorId ?? null;
    editorName       = esSelesai?.editorName ?? null;
    editorTotalWords = Number(esSelesai?.totalWords) || 0;
    editorTotalJobs  = Number(esSelesai?.totalJobs) || 0;
    allEditorWords   = Number(esAll?.allWords) || 0;
    allEditorJobs    = Number(esAll?.allJobs) || 0;
  }

  res.json({
    userId:   targetUser.id,
    role:     targetRole,
    writerId: targetWriterId ?? null,
    writerName,
    year, month,
    totalWords, totalJobs,     // selesai (untuk gaji)
    allWords, allJobs,          // semua (untuk info)
    editorId, editorName,
    editorTotalWords, editorTotalJobs,   // selesai
    allEditorWords, allEditorJobs,        // semua
  });
});

// ─── Salary: CS Monthly ───────────────────────────────────────────────────────
router.get("/salary/cs-monthly", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (currentUser.role !== "cs" && currentUser.role !== "admin") {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  // Kata per writer (SELESAI saja — is_checked = true)
  const writerRows = await db
    .select({
      writerId:       jobsTable.writerId,
      writerName:     writersTable.name,
      linkedEditorId: writersTable.linkedEditorId,
      totalWords:     sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .where(and(
      sql`${jobsTable.writerId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`
    ))
    .groupBy(jobsTable.writerId, writersTable.name, writersTable.linkedEditorId);

  // Kata per editor (SELESAI saja)
  const editorRows = await db
    .select({
      editorId:   jobsTable.editorId,
      editorName: editorsTable.name,
      totalWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.editorId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`
    ))
    .groupBy(jobsTable.editorId, editorsTable.name);

  // Buat map editorId → words (untuk dual-role lookup)
  const editorWordsMap = new Map<number, number>();
  for (const e of editorRows) {
    if (e.editorId) editorWordsMap.set(e.editorId, Number(e.totalWords) || 0);
  }

  // Hitung gaji masing-masing writer (termasuk combined jika dual-role)
  const writerSalaries = writerRows.map(r => hitungGajiPenulis(Number(r.totalWords) || 0));
  const totalWriterSalary = writerSalaries.reduce((a, b) => a + b, 0);

  // Hitung gaji editor STANDALONE (bukan dual-role writer)
  const dualRoleEditorIds = new Set(writerRows.map(r => r.linkedEditorId).filter(Boolean));
  const standaloneEditorSalaries = editorRows
    .filter(e => e.editorId && !dualRoleEditorIds.has(e.editorId))
    .map(e => Math.floor((Number(e.totalWords) || 0) * 4.7));
  const totalEditorSalary = [
    ...editorRows
      .filter(e => e.editorId && dualRoleEditorIds.has(e.editorId))
      .map(e => Math.floor((Number(e.totalWords) || 0) * 4.7)),
    ...standaloneEditorSalaries,
  ].reduce((a, b) => a + b, 0);

  // Pencapaian tertinggi: per-penulis (combined writer+editor jika dual-role)
  // Hanya penulis yang dipertimbangkan (standalone editor TIDAK masuk perbandingan ini)
  const perWriterCombined = writerRows.map(r => {
    const writerSal = hitungGajiPenulis(Number(r.totalWords) || 0);
    const editorWords = r.linkedEditorId ? (editorWordsMap.get(r.linkedEditorId) ?? 0) : 0;
    const editorSal   = Math.floor(editorWords * 4.7);
    return writerSal + editorSal;
  });

  const topAchievement    = perWriterCombined.length > 0 ? Math.max(...perWriterCombined) : 0;
  const bonus             = Math.floor(topAchievement * 0.05);
  // Pendapatan CS = pencapaian tertinggi satu penulis + 5% bonus dari pencapaian itu
  const pendapatanArtikel = topAchievement + bonus;

  res.json({
    year, month,
    totalWriterSalary,
    totalEditorSalary,
    topAchievement,
    bonus,
    pendapatanArtikel,
    writerCount: writerRows.length,
    editorCount: editorRows.length,
  });
});

// ─── Pending Revisions (lintas tanggal) ──────────────────────────────────────
router.get("/jobs/pending-revisions", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      website: jobsTable.website,
      wordCount: jobsTable.wordCount,
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      revisionNotes: jobsTable.revisionNotes,
      isChecked: jobsTable.isChecked,
      jobDate: jobsTable.jobDate,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.revisionNotes} is not null`,
      sql`${jobsTable.revisionNotes} <> ''`,
    ))
    .orderBy(jobsTable.jobDate, jobsTable.id);

  res.json(rows);
});

// ─── Revision Rechecked: penulis sudah ceklist ulang, editor belum hapus catatan ─
router.get("/jobs/revision-rechecked", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      website: jobsTable.website,
      wordCount: jobsTable.wordCount,
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      revisionNotes: jobsTable.revisionNotes,
      isChecked: jobsTable.isChecked,
      jobDate: jobsTable.jobDate,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.revisionNotes} is not null`,
      sql`${jobsTable.revisionNotes} <> ''`,
      eq(jobsTable.isChecked, true),
    ))
    .orderBy(jobsTable.jobDate, jobsTable.id);

  res.json(rows);
});

// ─── Reports: Revision Summary (editor/admin) ────────────────────────────────
router.get("/reports/revision-summary", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  // Restrict to editor's own jobs unless admin
  const isAdmin = currentUser.role === "admin";
  const myEditorId = currentUser.editorId;

  const rows = await db
    .select({
      jobId: jobsTable.id,
      jobCode: jobsTable.jobCode,
      writerId: jobsTable.writerId,
      writerName: writersTable.name,
      editorId: jobsTable.editorId,
      editorName: editorsTable.name,
      revisionNotes: jobsTable.revisionNotes,
      isChecked: jobsTable.isChecked,
      jobDate: jobsTable.jobDate,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
      sql`${jobsTable.revisionNotes} is not null`,
      sql`${jobsTable.revisionNotes} <> ''`,
      !isAdmin && myEditorId ? eq(jobsTable.editorId, myEditorId) : undefined,
    ))
    .orderBy(jobsTable.editorId, jobsTable.jobDate);

  res.json(rows);
});

// ─── Reports: Monthly All (admin only) ────────────────────────────────────────
router.get("/reports/monthly-all", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Akses hanya untuk Admin" }); return;
  }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  // ── Semua writers (aktif maupun tidak, agar laporan bulan lalu tetap lengkap) ─
  const allWriters = await db.select().from(writersTable);
  const writerMap  = new Map(allWriters.map(w => [w.id, w]));

  // ── Jobs per writer: selesai ──────────────────────────────────────────────────
  const doneByWriter = await db
    .select({
      writerId:  jobsTable.writerId,
      doneJobs:  sql<number>`count(*)`,
      doneWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .where(and(
      sql`${jobsTable.writerId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.writerId);

  // ── Jobs per writer: semua ────────────────────────────────────────────────────
  const allByWriter = await db
    .select({
      writerId: jobsTable.writerId,
      allJobs:  sql<number>`count(*)`,
      allWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .where(and(
      sql`${jobsTable.writerId} is not null`,
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.writerId);

  const doneMapW  = new Map(doneByWriter.map(r => [r.writerId!, r]));
  const allMapW   = new Map(allByWriter.map(r => [r.writerId!, r]));

  // ── Jobs per editor: selesai ──────────────────────────────────────────────────
  const doneByEditor = await db
    .select({
      editorId:  jobsTable.editorId,
      editorName: editorsTable.name,
      doneJobs:  sql<number>`count(*)`,
      doneWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.editorId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.editorId, editorsTable.name);

  // ── Jobs per editor: semua ────────────────────────────────────────────────────
  const allByEditor = await db
    .select({
      editorId: jobsTable.editorId,
      allJobs:  sql<number>`count(*)`,
      allWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .where(and(
      sql`${jobsTable.editorId} is not null`,
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.editorId);

  const doneMapE = new Map(doneByEditor.map(r => [r.editorId!, r]));
  const allMapE  = new Map(allByEditor.map(r => [r.editorId!, r]));

  // ── Bangun data per writer ────────────────────────────────────────────────────
  const dualRoleEditorIds = new Set(allWriters.map(w => w.linkedEditorId).filter(Boolean));

  // Kumpulkan writer yang punya data bulan ini
  const activeWriterIds = new Set([
    ...doneByWriter.map(r => r.writerId!),
    ...allByWriter.map(r => r.writerId!),
  ]);

  const writers = [...activeWriterIds].map(wid => {
    const info      = writerMap.get(wid);
    const done      = doneMapW.get(wid);
    const all       = allMapW.get(wid);
    const doneWords = Number(done?.doneWords) || 0;
    const income    = hitungGajiPenulis(doneWords);
    const edId      = info?.linkedEditorId ?? null;
    const isDual    = !!(info?.isAlsoEditor && edId);
    const editorDone = edId ? doneMapE.get(edId) : null;
    const editorIncome = edId ? Math.floor((Number(editorDone?.doneWords) || 0) * 4.7) : 0;
    const combined  = income + editorIncome;
    // Bonus: 5% hanya jika ≥80.000 kata tulis (dual-role base-nya combined)
    const bonus = doneWords >= 80_000
      ? Math.floor(combined * 0.05)
      : 0;
    return {
      writerId:      wid,
      writerName:    info?.name ?? "Unknown",
      allJobs:       Number(all?.allJobs) || 0,
      doneJobs:      Number(done?.doneJobs) || 0,
      allWords:      Number(all?.allWords) || 0,
      doneWords,
      income,
      editorIncome,
      bonus,
      combinedIncome: combined + bonus,
      linkedEditorId: edId,
    };
  });

  // ── Bangun data per editor (standalone saja) ──────────────────────────────────
  const activeEditorIds = new Set([
    ...doneByEditor.map(r => r.editorId!),
    ...allByEditor.map(r => r.editorId!),
  ]);

  const editors = [...activeEditorIds].map(eid => {
    const doneE    = doneMapE.get(eid);
    const allE     = allMapE.get(eid);
    const doneWords = Number(doneE?.doneWords) || 0;
    const isDual   = dualRoleEditorIds.has(eid);
    const gaji     = Math.floor(doneWords * 4.7);
    // Editor tidak mendapat bonus (bonus hanya untuk penulis ≥80k kata)
    const bonus    = 0;
    return {
      editorId:   eid,
      editorName: doneE?.editorName ?? "Unknown",
      allJobs:    Number(allE?.allJobs) || 0,
      doneJobs:   Number(doneE?.doneJobs) || 0,
      allWords:   Number(allE?.allWords) || 0,
      doneWords,
      income:     gaji,
      bonus,
      isDualRole: isDual,
    };
  });

  // ── CS salary (same logic as /salary/cs-monthly) ─────────────────────────────
  const perWriterCombined = writers.map(w => w.combinedIncome);
  const topAchievement    = perWriterCombined.length > 0 ? Math.max(...perWriterCombined) : 0;
  const bonus             = Math.floor(topAchievement * 0.05);

  // ── Additional income per user ────────────────────────────────────────────────
  const allUsersForAdd = await db.select().from(usersTable);
  const additionalRows = await db.select().from(additionalIncomeTable).where(
    and(eq(additionalIncomeTable.year, year), eq(additionalIncomeTable.month, month))
  );
  const addByUserId = new Map<number, number>();
  for (const r of additionalRows) {
    addByUserId.set(r.userId, (addByUserId.get(r.userId) ?? 0) + r.amount);
  }
  // Map: writerId → userId
  const writerIdToUserId = new Map<number, number>(
    allUsersForAdd.filter(u => u.writerId != null).map(u => [u.writerId!, u.id])
  );
  // Map: editorId → userId (standalone editor user)
  const editorIdToUserId = new Map<number, number>(
    allUsersForAdd.filter(u => u.editorId != null && u.writerId == null).map(u => [u.editorId!, u.id])
  );
  // CS users
  const csUserIds = allUsersForAdd.filter(u => u.role === "cs").map(u => u.id);
  const csAdditional = csUserIds.reduce((s, uid) => s + (addByUserId.get(uid) ?? 0), 0);

  const writersWithAdd = writers.map(w => ({
    ...w,
    additionalIncome: addByUserId.get(writerIdToUserId.get(w.writerId) ?? -1) ?? 0,
  }));
  const editorsWithAdd = editors.map(e => ({
    ...e,
    additionalIncome: addByUserId.get(editorIdToUserId.get(e.editorId) ?? -1) ?? 0,
  }));

  res.json({
    year, month,
    writers:  writersWithAdd.sort((a, b) => b.income - a.income),
    editors:  editorsWithAdd.sort((a, b) => a.editorName.localeCompare(b.editorName)),
    cs: { topAchievement, bonus, pendapatanArtikel: topAchievement + bonus, additionalIncome: csAdditional },
  });
});

// ─── Expense Estimate: estimasi pengeluaran gaji akhir bulan ─────────────────
router.get("/reports/expense-estimate", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Akses hanya untuk Admin" }); return;
  }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate   = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const PULSA    = 70_000;
  const TABUNGAN = 100_000;

  // ── Kata per writer (selesai) ─────────────────────────────────────────────
  const writerRows = await db
    .select({
      writerId:       jobsTable.writerId,
      writerName:     writersTable.name,
      linkedEditorId: writersTable.linkedEditorId,
      isAlsoEditor:   writersTable.isAlsoEditor,
      totalWords:     sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .where(and(
      sql`${jobsTable.writerId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.writerId, writersTable.name, writersTable.linkedEditorId, writersTable.isAlsoEditor);

  // ── Kata per editor (selesai) ─────────────────────────────────────────────
  const editorRows = await db
    .select({
      editorId:   jobsTable.editorId,
      editorName: editorsTable.name,
      totalWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    })
    .from(jobsTable)
    .leftJoin(editorsTable, eq(jobsTable.editorId, editorsTable.id))
    .where(and(
      sql`${jobsTable.editorId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    ))
    .groupBy(jobsTable.editorId, editorsTable.name);

  const editorWordsMap = new Map<number, number>(
    editorRows.map(e => [e.editorId!, Number(e.totalWords) || 0])
  );
  const dualRoleEditorIds = new Set(writerRows.map(r => r.linkedEditorId).filter(Boolean));

  // ── Hitung per writer ─────────────────────────────────────────────────────
  let totalGajiPenulis    = 0;
  let totalPulsaPenulis   = 0;
  let totalTabunganPenulis = 0;
  let penulisPulsaCount   = 0;
  let penulisTabunganCount = 0;

  const perWriterCombined: number[] = [];

  for (const r of writerRows) {
    const kata     = Number(r.totalWords) || 0;
    const isDual   = r.isAlsoEditor && r.linkedEditorId;
    const gajiW    = hitungGajiPenulis(kata);
    const edKata   = isDual ? (editorWordsMap.get(r.linkedEditorId!) ?? 0) : 0;
    const gajiE    = isDual ? Math.floor(edKata * 4.7) : 0;
    const combined = gajiW + gajiE;
    perWriterCombined.push(combined);

    // Gaji pokok writer (tidak termasuk editor portion — itu di bagian editor)
    totalGajiPenulis += gajiW;
    if (isDual) totalGajiPenulis += gajiE; // dual-role: editor gaji masuk penulis row

    // Bonus writer: ≥80.000 kata tulis (dual-role base-nya combined)
    if (kata >= 80_000) {
      totalGajiPenulis += Math.floor(combined * 0.05);
    }

    // Pulsa
    const mendapatPulsa = isDual || kata >= 48_100;
    if (mendapatPulsa) { totalPulsaPenulis += PULSA; penulisPulsaCount++; }

    // Tabungan
    const mendapatTabungan = isDual || kata >= 70_000;
    if (mendapatTabungan) { totalTabunganPenulis += TABUNGAN; penulisTabunganCount++; }
  }

  // ── Hitung per standalone editor ─────────────────────────────────────────
  let totalGajiEditor    = 0;
  let totalPulsaEditor   = 0;
  let totalTabunganEditor = 0;
  let standaloneEditorCount = 0;

  for (const e of editorRows) {
    if (dualRoleEditorIds.has(e.editorId!)) continue; // skip dual-role (sudah masuk writer)
    const kata = Number(e.totalWords) || 0;
    const gaji = Math.floor(kata * 4.7);
    totalGajiEditor    += gaji; // editor tidak mendapat bonus
    totalPulsaEditor   += PULSA;
    totalTabunganEditor += TABUNGAN;
    standaloneEditorCount++;
  }

  // ── Hitung CS ─────────────────────────────────────────────────────────────
  const csUsers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "cs"));

  let csGaji    = 0;
  let csPulsa   = 0;
  let csTabungan = 0;
  const csCount  = csUsers.length;

  if (csCount > 0) {
    const topAchievement = perWriterCombined.length > 0 ? Math.max(...perWriterCombined) : 0;
    const csBonus        = Math.floor(topAchievement * 0.05);
    csGaji    = topAchievement + csBonus;
    csPulsa   = PULSA * csCount;
    csTabungan = TABUNGAN * csCount;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalGaji    = totalGajiPenulis + totalGajiEditor + csGaji;
  const totalPulsa   = totalPulsaPenulis + totalPulsaEditor + csPulsa;
  const totalTabungan = totalTabunganPenulis + totalTabunganEditor + csTabungan;
  const grandTotal   = totalGaji + totalPulsa + totalTabungan;

  res.json({
    year, month,
    totalGaji, totalPulsa, totalTabungan, grandTotal,
    penulis: {
      count:           writerRows.length,
      totalGaji:       totalGajiPenulis,
      pulsaCount:      penulisPulsaCount,
      totalPulsa:      totalPulsaPenulis,
      tabunganCount:   penulisTabunganCount,
      totalTabungan:   totalTabunganPenulis,
    },
    editor: {
      count:         standaloneEditorCount,
      totalGaji:     totalGajiEditor,
      totalPulsa:    totalPulsaEditor,
      totalTabungan: totalTabunganEditor,
    },
    cs: {
      count:    csCount,
      gaji:     csGaji,
      pulsa:    csPulsa,
      tabungan: csTabungan,
    },
  });
});

// ─── Additional Income: CRUD ─────────────────────────────────────────────────
router.get("/salary/additional", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const targetUserId = parseInt(req.query.userId as string);
  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  // Setiap user hanya bisa melihat miliknya sendiri, admin bisa semua
  if (currentUser.role !== "admin" && currentUser.id !== targetUserId) {
    res.status(403).json({ error: "Akses ditolak" }); return;
  }

  const rows = await db
    .select()
    .from(additionalIncomeTable)
    .where(and(
      eq(additionalIncomeTable.userId, targetUserId),
      eq(additionalIncomeTable.year, year),
      eq(additionalIncomeTable.month, month)
    ));

  res.json(rows.map(r => ({
    id: r.id,
    userId: r.userId,
    year: r.year,
    month: r.month,
    amount: r.amount,
    description: r.description ?? null,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/salary/additional", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Hanya admin yang dapat menambah pendapatan lainnya" }); return;
  }

  const { userId: targetUserId, year, month, amount, description } = req.body;
  if (!targetUserId || !year || !month || amount === undefined) {
    res.status(400).json({ error: "userId, year, month, amount wajib diisi" }); return;
  }

  const [row] = await db.insert(additionalIncomeTable).values({
    userId: targetUserId,
    year,
    month,
    amount,
    description: description ?? null,
  }).returning();

  res.status(201).json({
    id: row.id,
    userId: row.userId,
    year: row.year,
    month: row.month,
    amount: row.amount,
    description: row.description ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/salary/additional/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Hanya admin yang dapat menghapus pendapatan lainnya" }); return;
  }

  const id = parseInt(req.params.id);
  await db.delete(additionalIncomeTable).where(eq(additionalIncomeTable.id, id));
  res.json({ success: true });
});

// ─── Profile: data profil user ────────────────────────────────────────────────
router.get("/profile", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Admin bisa lihat profil user lain
  let targetUser = sessionUser;
  if (sessionUser.role === "admin" && req.query.userId) {
    const targetId = parseInt(req.query.userId as string);
    if (!isNaN(targetId)) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
      if (u) targetUser = u;
    }
  }

  // Data profil dari writers/editors table
  let writerProfile: typeof writersTable.$inferSelect | null = null;
  let editorProfile: typeof editorsTable.$inferSelect | null = null;

  if (targetUser.writerId) {
    const [w] = await db.select().from(writersTable).where(eq(writersTable.id, targetUser.writerId));
    writerProfile = w ?? null;
  }
  if (targetUser.editorId) {
    const [e] = await db.select().from(editorsTable).where(eq(editorsTable.id, targetUser.editorId));
    editorProfile = e ?? null;
  }

  // Kinerja bulan ini
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth() + 1;
  const start    = `${year}-${String(month).padStart(2, "0")}-01`;
  const end      = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
  const dateRange = and(sql`${jobsTable.jobDate} >= ${start}`, sql`${jobsTable.jobDate} <= ${end}`);

  let kinerja = { allJobs: 0, doneJobs: 0, allWords: 0, doneWords: 0 };

  if (targetUser.writerId) {
    const rows = await db.select({
      allJobs:   sql<number>`count(*)`,
      allWords:  sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
      doneJobs:  sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
      doneWords: sql<number>`sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end)`,
    }).from(jobsTable).where(and(eq(jobsTable.writerId, targetUser.writerId!), dateRange));
    const r = rows[0];
    kinerja = {
      allJobs:   Number(r?.allJobs) || 0,
      doneJobs:  Number(r?.doneJobs) || 0,
      allWords:  Number(r?.allWords) || 0,
      doneWords: Number(r?.doneWords) || 0,
    };
  } else if (targetUser.editorId) {
    const rows = await db.select({
      allJobs:   sql<number>`count(*)`,
      allWords:  sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
      doneJobs:  sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
      doneWords: sql<number>`sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end)`,
    }).from(jobsTable).where(and(eq(jobsTable.editorId, targetUser.editorId!), dateRange));
    const r = rows[0];
    kinerja = {
      allJobs:   Number(r?.allJobs) || 0,
      doneJobs:  Number(r?.doneJobs) || 0,
      allWords:  Number(r?.allWords) || 0,
      doneWords: Number(r?.doneWords) || 0,
    };
  }

  res.json({
    userId:      targetUser.id,
    username:    targetUser.username,
    role:        targetUser.role,
    writerId:    targetUser.writerId ?? null,
    editorId:    targetUser.editorId ?? null,
    name:        writerProfile?.name ?? editorProfile?.name ?? targetUser.username,
    fullName:    writerProfile?.fullName ?? null,
    email:       writerProfile?.email ?? null,
    phone:       writerProfile?.phone ?? null,
    bankAccount:  writerProfile?.bankAccount ?? null,
    bankName:     writerProfile?.bankName ?? null,
    accountOwner: writerProfile?.accountOwner ?? null,
    address:      writerProfile?.address ?? null,
    joinDate:    writerProfile?.joinDate ?? null,
    photoUrl:    writerProfile?.photoUrl ?? null,
    isActive:    writerProfile?.isActive ?? true,
    isAlsoEditor: writerProfile?.isAlsoEditor ?? false,
    maxDailyWords: writerProfile?.maxDailyWords ?? null,
    kinerja,
  });
});

const TABUNGAN_BULANAN = 100_000;

function getJakartaYearMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find(p => p.type === "year")?.value),
    month: Number(parts.find(p => p.type === "month")?.value),
  };
}

function getLastClosedJakartaMonth() {
  const { year, month } = getJakartaYearMonth();
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function monthEndJakartaDate(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(Date.UTC(year, month - 1, lastDay, 16, 59, 59));
}

function buildMonthRange(startYear: number, startMonth: number, endYear: number, endMonth: number) {
  const months: Array<{ year: number; month: number }> = [];
  let cy = startYear;
  let cm = startMonth;
  while (cy < endYear || (cy === endYear && cm <= endMonth)) {
    months.push({ year: cy, month: cm });
    cm++;
    if (cm > 12) {
      cm = 1;
      cy++;
    }
  }
  return months;
}

type SavingsMonthlyRow = { year: number; month: number; doneWords: number; doneJobs: number };

async function getWriterMonthlySavingsRows(writerId: number): Promise<SavingsMonthlyRow[]> {
  const rows = await db.select({
    yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
    doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
    doneJobs: sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
  })
  .from(jobsTable)
  .where(eq(jobsTable.writerId, writerId))
  .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`);

  return rows.map(r => {
    const [year, month] = (r.yearMonth ?? "0-0").split("-").map(Number);
    return { year, month, doneWords: Number(r.doneWords) || 0, doneJobs: Number(r.doneJobs) || 0 };
  });
}

async function getEditorMonthlySavingsRows(editorId: number): Promise<SavingsMonthlyRow[]> {
  const rows = await db.select({
    yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
    doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
    doneJobs: sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
  })
  .from(jobsTable)
  .where(eq(jobsTable.editorId, editorId))
  .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`);

  return rows.map(r => {
    const [year, month] = (r.yearMonth ?? "0-0").split("-").map(Number);
    return { year, month, doneWords: Number(r.doneWords) || 0, doneJobs: Number(r.doneJobs) || 0 };
  });
}

async function getSystemMonthlyActivityRows(): Promise<SavingsMonthlyRow[]> {
  const rows = await db.select({
    yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
    doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
    doneJobs: sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
  })
  .from(jobsTable)
  .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`);

  return rows.map(r => {
    const [year, month] = (r.yearMonth ?? "0-0").split("-").map(Number);
    return { year, month, doneWords: Number(r.doneWords) || 0, doneJobs: Number(r.doneJobs) || 0 };
  });
}

export async function syncMonthlySavingsForUser(
  targetUser: typeof usersTable.$inferSelect,
  endMonth?: { year: number; month: number },
) {
  const lastClosed = endMonth ?? getLastClosedJakartaMonth();
  let startYear = lastClosed.year - 1;
  let startMonth = lastClosed.month + 1;
  if (startMonth > 12) {
    startMonth = 1;
    startYear++;
  }

  let linkedEditorId: number | null = null;
  let joinDate: string | null = null;
  if (targetUser.writerId) {
    const [writer] = await db.select().from(writersTable).where(eq(writersTable.id, targetUser.writerId));
    linkedEditorId = writer?.linkedEditorId ?? null;
    joinDate = writer?.joinDate ?? null;
  }
  if (joinDate) {
    const [jy, jm] = joinDate.split("-").map(Number);
    if (jy && jm) {
      startYear = jy;
      startMonth = jm;
    }
  }

  const months = buildMonthRange(startYear, startMonth, lastClosed.year, lastClosed.month);
  if (months.length === 0) return;

  const editorId = targetUser.editorId ?? linkedEditorId ?? null;
  const writerRows = targetUser.writerId ? await getWriterMonthlySavingsRows(targetUser.writerId) : [];
  const editorRows = editorId ? await getEditorMonthlySavingsRows(editorId) : [];
  const systemRows = targetUser.role === "cs" ? await getSystemMonthlyActivityRows() : [];
  const writerMap = new Map(writerRows.map(r => [`${r.year}-${r.month}`, r]));
  const editorMap = new Map(editorRows.map(r => [`${r.year}-${r.month}`, r]));
  const systemMap = new Map(systemRows.map(r => [`${r.year}-${r.month}`, r]));

  for (const { year, month } of months) {
    const key = `${year}-${month}`;
    const writer = writerMap.get(key);
    const editor = editorMap.get(key);
    const system = systemMap.get(key);
    const writerWords = writer?.doneWords ?? 0;
    const editorWords = editor?.doneWords ?? 0;
    const writerJobs = writer?.doneJobs ?? 0;
    const editorJobs = editor?.doneJobs ?? 0;
    const hasDualRole = Boolean(linkedEditorId);

    let eligible = false;
    let role = targetUser.role;
    let sourceWords = writerWords;
    let sourceJobs = writerJobs;
    let notes = "";

    if (targetUser.role === "cs") {
      eligible = (system?.doneJobs ?? 0) > 0;
      sourceWords = system?.doneWords ?? 0;
      sourceJobs = system?.doneJobs ?? 0;
      notes = "Tabungan CS otomatis akhir bulan";
    } else if (targetUser.role === "editor") {
      eligible = editorJobs > 0;
      sourceWords = editorWords;
      sourceJobs = editorJobs;
      notes = "Tabungan editor otomatis akhir bulan";
    } else if (hasDualRole) {
      eligible = writerJobs + editorJobs > 0;
      role = "penulis+editor";
      sourceWords = writerWords + editorWords;
      sourceJobs = writerJobs + editorJobs;
      notes = "Tabungan penulis merangkap editor otomatis akhir bulan";
    } else if (targetUser.role === "penulis") {
      eligible = writerWords >= 70_000;
      notes = "Tabungan penulis otomatis akhir bulan jika mencapai minimal 70.000 kata";
    }

    if (!eligible) continue;

    const [existingSavings] = await db.select({
      notes: monthlySavingsTable.notes,
    }).from(monthlySavingsTable).where(and(
      eq(monthlySavingsTable.userId, targetUser.id),
      eq(monthlySavingsTable.year, year),
      eq(monthlySavingsTable.month, month),
    )).limit(1);

    // Riwayat yang sengaja diimpor admin adalah sumber historis final.
    // Sync otomatis tetap boleh membuat/memperbarui bulan lain, tetapi tidak
    // menimpa nominal dan catatan hasil import.
    if (existingSavings?.notes?.startsWith("[import]")) continue;

    const values = {
      userId: targetUser.id,
      year,
      month,
      role,
      amount: TABUNGAN_BULANAN,
      sourceWords,
      sourceJobs,
      paidAt: monthEndJakartaDate(year, month),
      notes,
    };

    await db.insert(monthlySavingsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [monthlySavingsTable.userId, monthlySavingsTable.year, monthlySavingsTable.month],
        set: {
          role: values.role,
          amount: values.amount,
          sourceWords: values.sourceWords,
          sourceJobs: values.sourceJobs,
          paidAt: values.paidAt,
          notes: values.notes,
        },
      });
  }
}

// ─── Salary History: riwayat gaji bulanan ─────────────────────────────────────
router.get("/salary/history", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Admin bisa lihat riwayat user lain
  let targetUser = sessionUser;
  if (sessionUser.role === "admin" && req.query.userId) {
    const targetId = parseInt(req.query.userId as string);
    if (!isNaN(targetId)) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
      if (u) targetUser = u;
    }
  }

  const targetRole     = targetUser.role;
  const targetWriterId = targetUser.writerId;
  const targetEditorId = targetUser.editorId;

  // Tentukan joinDate sebagai awal riwayat
  let joinDate: string | null = null;
  let linkedEditorId: number | null = null;

  if (targetWriterId) {
    const [w] = await db.select().from(writersTable).where(eq(writersTable.id, targetWriterId));
    joinDate        = w?.joinDate ?? null;
    linkedEditorId  = w?.linkedEditorId ?? null;
  }

  // Tentukan bulan mulai: dari joinDate atau 12 bulan ke belakang
  const now        = new Date();
  const nowYear    = now.getFullYear();
  const nowMonth   = now.getMonth() + 1;

  let startYear  = nowYear - 1;
  let startMonth = nowMonth + 1;
  if (joinDate) {
    const [jy, jm] = joinDate.split("-").map(Number);
    startYear  = jy;
    startMonth = jm;
  }

  // Bangun daftar semua (year, month) dari start sampai sekarang
  type MonthKey = { year: number; month: number };
  const allMonths: MonthKey[] = [];
  let cy = startYear, cm = startMonth;
  while (cy < nowYear || (cy === nowYear && cm <= nowMonth)) {
    allMonths.push({ year: cy, month: cm });
    cm++;
    if (cm > 12) { cm = 1; cy++; }
  }

  // Query semua data yang dibutuhkan sekaligus (writer + linked editor)
  const editorIdToQuery = targetEditorId ?? linkedEditorId ?? null;

  // Ambil semua jobs writer grouped by bulan
  type MonthlyRow = { year: number; month: number; doneWords: number; doneJobs: number };
  let writerMonthly: MonthlyRow[] = [];
  if (targetWriterId) {
    const rows = await db.select({
      yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
      doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
      doneJobs:  sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
    })
    .from(jobsTable)
    .where(eq(jobsTable.writerId, targetWriterId))
    .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`);
    writerMonthly = rows.map(r => {
      const [y, m] = (r.yearMonth ?? "0-0").split("-").map(Number);
      return { year: y, month: m, doneWords: Number(r.doneWords) || 0, doneJobs: Number(r.doneJobs) || 0 };
    });
  }

  // Ambil semua jobs editor grouped by bulan
  let editorMonthly: MonthlyRow[] = [];
  if (editorIdToQuery) {
    const rows = await db.select({
      yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
      doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
      doneJobs:  sql<number>`sum(case when ${jobsTable.isChecked} then 1 else 0 end)`,
    })
    .from(jobsTable)
    .where(eq(jobsTable.editorId, editorIdToQuery))
    .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`);
    editorMonthly = rows.map(r => {
      const [y, m] = (r.yearMonth ?? "0-0").split("-").map(Number);
      return { year: y, month: m, doneWords: Number(r.doneWords) || 0, doneJobs: Number(r.doneJobs) || 0 };
    });
  }

  const writerMap = new Map(writerMonthly.map(r => [`${r.year}-${r.month}`, r]));
  const editorMap = new Map(editorMonthly.map(r => [`${r.year}-${r.month}`, r]));

  // Untuk CS: query cs-monthly per bulan (reuse formula)
  type CsMonthRow = { year: number; month: number; amount: number };
  let csMonthly: CsMonthRow[] = [];
  if (targetRole === "cs") {
    // Ambil semua writer rows grouped by bulan
    const allCsRows = await db.select({
      yearMonth:      sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
      writerId:       jobsTable.writerId,
      linkedEditorId: writersTable.linkedEditorId,
      doneWords:      sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
    })
    .from(jobsTable)
    .leftJoin(writersTable, eq(jobsTable.writerId, writersTable.id))
    .where(sql`${jobsTable.writerId} is not null`)
    .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`, jobsTable.writerId, writersTable.linkedEditorId);

    // Ambil editor monthly totals
    const editorCsRows = await db.select({
      yearMonth: sql<string>`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`,
      editorId:  jobsTable.editorId,
      doneWords: sql<number>`coalesce(sum(case when ${jobsTable.isChecked} then ${jobsTable.wordCount} else 0 end), 0)`,
    })
    .from(jobsTable)
    .where(sql`${jobsTable.editorId} is not null`)
    .groupBy(sql`to_char(${jobsTable.jobDate}::date, 'YYYY-MM')`, jobsTable.editorId);

    // Group by bulan
    const csByMonth = new Map<string, typeof allCsRows>();
    for (const row of allCsRows) {
      const key = row.yearMonth ?? "";
      if (!csByMonth.has(key)) csByMonth.set(key, []);
      csByMonth.get(key)!.push(row);
    }
    const editorByMonth = new Map<string, Map<number, number>>();
    for (const row of editorCsRows) {
      const key = row.yearMonth ?? "";
      if (!editorByMonth.has(key)) editorByMonth.set(key, new Map());
      if (row.editorId) editorByMonth.get(key)!.set(row.editorId, Number(row.doneWords) || 0);
    }

    for (const [ym, wrRows] of csByMonth) {
      const [y, m] = ym.split("-").map(Number);
      const edMap = editorByMonth.get(ym) ?? new Map();
      const perWriter = wrRows.map(r => {
        const wSal   = hitungGajiPenulis(Number(r.doneWords) || 0);
        const eSal   = r.linkedEditorId ? Math.floor((edMap.get(r.linkedEditorId) ?? 0) * 4.7) : 0;
        return wSal + eSal;
      });
      const top   = perWriter.length > 0 ? Math.max(...perWriter) : 0;
      const bonus = Math.floor(top * 0.05);
      csMonthly.push({ year: y, month: m, amount: top + bonus });
    }
  }
  const csMap = new Map(csMonthly.map(r => [`${r.year}-${r.month}`, r.amount]));

  // Ambil pendapatan tambahan user ini per bulan
  const additionalRows = await db.select().from(additionalIncomeTable)
    .where(eq(additionalIncomeTable.userId, targetUser.id));
  const addMap = new Map(additionalRows.map(r => [`${r.year}-${r.month}`, r.amount]));

  // Bangun hasil per bulan
  let cumulative = 0;
  const months = allMonths.map(({ year, month }) => {
    const key        = `${year}-${month}`;
    const wr         = writerMap.get(key);
    const ed         = editorMap.get(key);
    const wrIncome   = hitungGajiPenulis(wr?.doneWords ?? 0);
    const edIncome   = ed ? Math.floor((ed.doneWords ?? 0) * 4.7) : 0;
    const csIncome   = csMap.get(key) ?? 0;
    const addIncome  = addMap.get(key) ?? 0;

    let income = 0;
    if (targetRole === "cs")           income = csIncome + addIncome;
    else if (targetRole === "editor")  income = edIncome + addIncome;
    else                               income = wrIncome + edIncome + addIncome; // penulis & admin

    cumulative += income;
    return {
      year, month,
      doneJobs:      (wr?.doneJobs ?? 0) + (ed?.doneJobs ?? 0),
      doneWords:     (wr?.doneWords ?? 0) + (ed?.doneWords ?? 0),
      writerIncome:  wrIncome,
      editorIncome:  edIncome,
      csIncome,
      additionalIncome: addIncome,
      income,
      cumulative,
    };
  });

  res.json({
    role: targetRole,
    joinDate,
    totalIncome: cumulative,
    months: months.filter(m => m.income > 0 || (m.year === nowYear && m.month === nowMonth)),
  });
});

router.get("/savings/history", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  let targetUser = sessionUser;
  if (sessionUser.role === "admin" && req.query.userId) {
    const targetId = parseInt(req.query.userId as string);
    if (!isNaN(targetId)) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
      if (user) targetUser = user;
    }
  }

  await syncMonthlySavingsForUser(targetUser);

  const rows = await db.select().from(monthlySavingsTable)
    .where(eq(monthlySavingsTable.userId, targetUser.id))
    .orderBy(desc(monthlySavingsTable.year), desc(monthlySavingsTable.month));

  // Hitung total penarikan yang sudah disetujui agar saldo net akurat
  const approvedWithdrawals = await db.select().from(savingsWithdrawalsTable)
    .where(and(
      eq(savingsWithdrawalsTable.userId, targetUser.id),
      eq(savingsWithdrawalsTable.status, "approved"),
    ));
  const totalWithdrawn = approvedWithdrawals.reduce((s, r) => s + (r.approvedAmount ?? 0), 0);
  const totalDeposits = rows.reduce((sum, row) => sum + row.amount, 0);

  res.json({
    userId: targetUser.id,
    role: targetUser.role,
    totalDeposits,
    totalWithdrawn,
    totalSavings: totalDeposits - totalWithdrawn,
    months: rows.map(row => ({
      id: row.id,
      year: row.year,
      month: row.month,
      role: row.role,
      amount: row.amount,
      sourceWords: row.sourceWords,
      sourceJobs: row.sourceJobs,
      paidAt: row.paidAt?.toISOString() ?? null,
      notes: row.notes,
    })),
  });
});

router.post("/savings/sync", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  // Skip standalone editor accounts (legacy) — hanya penulis, cs, dan dual-role
  const users = await db.select().from(usersTable).where(
    sql`${usersTable.role} <> 'admin' AND NOT (${usersTable.role} = 'editor' AND ${usersTable.writerId} IS NULL)`
  );
  for (const user of users) {
    await syncMonthlySavingsForUser(user);
  }

  res.json({ ok: true, syncedUsers: users.length });
});

// ─── Assign CS role ────────────────────────────────────────────────────────
// Admin can toggle a penulis/editor user's role to cs (and back)
router.patch("/users/:id/assign-cs", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!targetUser) { res.status(404).json({ error: "User tidak ditemukan" }); return; }

  const { asCs } = req.body as { asCs: boolean };
  if (typeof asCs !== "boolean") { res.status(400).json({ error: "Field asCs wajib diisi" }); return; }

  const newRole = asCs ? "cs" : "penulis";
  // Only allow penulis→cs or cs→penulis transitions
  if (asCs && targetUser.role !== "penulis") { res.status(400).json({ error: "Hanya penulis yang bisa dijadikan CS" }); return; }
  if (!asCs && targetUser.role !== "cs") { res.status(400).json({ error: "User ini bukan CS" }); return; }

  await db.update(usersTable).set({ role: newRole }).where(eq(usersTable.id, targetId));
  res.json({ ok: true, newRole });
});

// ─── Savings Withdrawals ───────────────────────────────────────────────────
router.get("/savings/withdrawals", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }

  const filterUserIdParam = req.query.userId ? parseInt(String(req.query.userId)) : null;

  let rows;
  if (sessionUser.role === "admin") {
    // Admin sees all (or filtered by userId) requests with user info
    const baseQuery = db.select({
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
      .innerJoin(usersTable, eq(savingsWithdrawalsTable.userId, usersTable.id));
    rows = await (filterUserIdParam
      ? baseQuery.where(eq(savingsWithdrawalsTable.userId, filterUserIdParam))
      : baseQuery
    ).orderBy(desc(savingsWithdrawalsTable.requestedAt));
  } else {
    rows = await db.select({
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
      .innerJoin(usersTable, eq(savingsWithdrawalsTable.userId, usersTable.id))
      .where(eq(savingsWithdrawalsTable.userId, sessionUserId))
      .orderBy(desc(savingsWithdrawalsTable.requestedAt));
  }

  res.json(rows.map(r => ({
    ...r,
    requestedAt: r.requestedAt?.toISOString() ?? null,
    processedAt: r.processedAt?.toISOString() ?? null,
  })));
});

router.post("/savings/withdraw", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (sessionUser.role === "admin") { res.status(403).json({ error: "Admin tidak bisa mengajukan pencairan" }); return; }

  const { requestedAmount, reason } = req.body as { requestedAmount: number; reason?: string };
  if (!requestedAmount || requestedAmount < 1) { res.status(400).json({ error: "Jumlah tidak valid" }); return; }

  // Check no pending request already exists
  const [existing] = await db.select().from(savingsWithdrawalsTable)
    .where(and(eq(savingsWithdrawalsTable.userId, sessionUserId), eq(savingsWithdrawalsTable.status, "pending")));
  if (existing) { res.status(400).json({ error: "Sudah ada pengajuan yang menunggu persetujuan" }); return; }

  const [row] = await db.insert(savingsWithdrawalsTable).values({
    userId: sessionUserId,
    requestedAmount,
    reason: reason || null,
    status: "pending",
  }).returning();

  res.json({ ok: true, id: row.id });
});

router.patch("/savings/withdrawals/:id", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const { status, approvedAmount, adminNote } = req.body as {
    status: "approved" | "rejected";
    approvedAmount?: number;
    adminNote?: string;
  };

  if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "Status tidak valid" }); return; }
  if (status === "approved" && (!Number.isSafeInteger(approvedAmount) || approvedAmount! < 1)) {
    res.status(400).json({ error: "Jumlah disetujui tidak valid" }); return;
  }

  const result = await db.transaction(async tx => {
    const [withdrawal] = await tx.select().from(savingsWithdrawalsTable)
      .where(eq(savingsWithdrawalsTable.id, id))
      .for("update");
    if (!withdrawal) return { statusCode: 404, error: "Pengajuan tidak ditemukan" };
    if (withdrawal.status !== "pending") {
      return { statusCode: 409, error: "Pengajuan ini sudah diproses" };
    }

    // Serialisasikan seluruh approval milik user yang sama agar dua request
    // paralel tidak sama-sama membaca saldo lama lalu menghabiskannya dua kali.
    await tx.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, withdrawal.userId))
      .for("update");

    if (status === "approved") {
      if (approvedAmount! > withdrawal.requestedAmount) {
        return { statusCode: 400, error: "Jumlah disetujui tidak boleh melebihi jumlah pengajuan" };
      }

      const [depositTotal] = await tx.select({
        total: sql<number>`coalesce(sum(${monthlySavingsTable.amount}), 0)`,
      }).from(monthlySavingsTable)
        .where(eq(monthlySavingsTable.userId, withdrawal.userId));
      const [withdrawalTotal] = await tx.select({
        total: sql<number>`coalesce(sum(${savingsWithdrawalsTable.approvedAmount}), 0)`,
      }).from(savingsWithdrawalsTable).where(and(
        eq(savingsWithdrawalsTable.userId, withdrawal.userId),
        eq(savingsWithdrawalsTable.status, "approved"),
      ));
      const availableBalance = Number(depositTotal?.total ?? 0) - Number(withdrawalTotal?.total ?? 0);
      if (approvedAmount! > availableBalance) {
        return { statusCode: 400, error: "Jumlah disetujui melebihi saldo tabungan tersedia" };
      }
    }

    await tx.update(savingsWithdrawalsTable).set({
      status,
      approvedAmount: status === "approved" ? approvedAmount! : null,
      adminNote: adminNote?.trim() || null,
      processedAt: new Date(),
    }).where(and(
      eq(savingsWithdrawalsTable.id, id),
      eq(savingsWithdrawalsTable.status, "pending"),
    ));
    return { statusCode: 200 };
  });

  if (result.statusCode !== 200) {
    res.status(result.statusCode).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// ─── Admin Manual Withdrawal (langsung approved, tanpa request karyawan) ────
router.post("/savings/admin-withdrawal", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const { userId, amount, reason, month, year } = req.body as { userId: number; amount: number; reason?: string; month?: number; year?: number };
  if (!userId || !amount || amount < 1) { res.status(400).json({ error: "userId dan amount wajib diisi" }); return; }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!targetUser) { res.status(404).json({ error: "User tidak ditemukan" }); return; }

  // Gunakan bulan/tahun yang dipilih, default ke hari ini
  let processedAt = new Date();
  if (month && year && month >= 1 && month <= 12 && year >= 2000) {
    processedAt = new Date(year, month - 1, 15, 12, 0, 0); // tengah bulan, tengah hari
  }

  const [row] = await db.insert(savingsWithdrawalsTable).values({
    userId,
    requestedAmount: amount,
    approvedAmount: amount,
    reason: reason || null,
    adminNote: `Input manual oleh admin (${sessionUser.username})`,
    status: "approved",
    processedAt,
  }).returning();

  req.log.info({ withdrawalId: row.id, targetUserId: userId, amount }, "Admin manual withdrawal inserted");
  res.json({ ok: true, id: row.id });
});

// ─── Admin: list all users' savings summary ──────────────────────────────────
router.get("/savings/admin-overview", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  // Semua user non-admin, kecuali akun editor lama yang berdiri sendiri (role=editor dan writerId=null)
  const allUsers = await db.select().from(usersTable).where(
    sql`${usersTable.role} <> 'admin' AND NOT (${usersTable.role} = 'editor' AND ${usersTable.writerId} IS NULL)`
  );

  const result = await Promise.all(allUsers.map(async (u) => {
    const savings = await db.select().from(monthlySavingsTable)
      .where(eq(monthlySavingsTable.userId, u.id))
      .orderBy(asc(monthlySavingsTable.year), asc(monthlySavingsTable.month));

    const withdrawals = await db.select().from(savingsWithdrawalsTable)
      .where(and(eq(savingsWithdrawalsTable.userId, u.id), eq(savingsWithdrawalsTable.status, "approved")))
      .orderBy(asc(savingsWithdrawalsTable.processedAt));

    const totalIn = savings.reduce((s, r) => s + r.amount, 0);
    const totalOut = withdrawals.reduce((s, r) => s + (r.approvedAmount ?? 0), 0);

    // Build ledger rows
    type LedgerRow = {
      type: "in" | "out";
      year: number; month: number;
      amount: number;
      notes: string | null;
      reason: string | null;
      id: number;
      withdrawalId?: number;
      isManual?: boolean;
    };

    const ledger: LedgerRow[] = [
      ...savings.map(r => ({ type: "in" as const, year: r.year, month: r.month, amount: r.amount, notes: r.notes, reason: null, id: r.id })),
      ...withdrawals.map(r => {
        const d = r.processedAt ?? r.requestedAt;
        return {
          type: "out" as const,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          amount: r.approvedAmount ?? 0,
          notes: null,
          reason: r.reason,
          id: r.id,
          withdrawalId: r.id,
          isManual: r.adminNote?.includes("Input manual") ?? false,
        };
      }),
    ].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month !== b.month ? a.month - b.month : a.type.localeCompare(b.type));

    // Running saldo
    let running = 0;
    const ledgerWithSaldo = ledger.map(row => {
      if (row.type === "in") running += row.amount;
      else running -= row.amount;
      return { ...row, saldo: running };
    });

    // Writer name
    let name = u.username;
    if (u.writerId) {
      const [w] = await db.select().from(writersTable).where(eq(writersTable.id, u.writerId));
      if (w) name = w.name;
    }

    return { userId: u.id, username: u.username, name, role: u.role, totalIn, totalOut, saldo: totalIn - totalOut, ledger: ledgerWithSaldo };
  }));

  // Filter hanya yang punya data
  res.json(result.filter(u => u.totalIn > 0 || u.totalOut > 0 || true)); // tampil semua karyawan
});

// ─── Admin: delete a manual withdrawal ──────────────────────────────────────
router.delete("/savings/admin-withdrawal/:id", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }

  const [row] = await db.select().from(savingsWithdrawalsTable).where(eq(savingsWithdrawalsTable.id, id));
  if (!row) { res.status(404).json({ error: "Data tidak ditemukan" }); return; }
  // Hanya bisa hapus withdrawal yang adminNote-nya berisi "Input manual"
  if (!row.adminNote?.includes("Input manual")) {
    res.status(403).json({ error: "Hanya pengeluaran manual yang bisa dihapus" }); return;
  }

  await db.delete(savingsWithdrawalsTable).where(eq(savingsWithdrawalsTable.id, id));
  res.json({ ok: true });
});

// ─── Savings Import (admin bulk insert historical records) ──────────────────
router.post("/savings/import", async (req, res) => {
  const sessionUserId = (req.session as any).userId;
  if (!sessionUserId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [sessionUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!sessionUser || sessionUser.role !== "admin") { res.status(403).json({ error: "Akses ditolak" }); return; }

  const { rows } = req.body as {
    rows: Array<{ userId: number; year: number; month: number; amount: number; notes?: string }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "Data tidak valid" }); return; }
  if (rows.length > 1000) { res.status(400).json({ error: "Maksimal 1.000 baris per import" }); return; }

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (
      !Number.isSafeInteger(row.userId) || row.userId < 1 ||
      !Number.isSafeInteger(row.year) || row.year < 2020 || row.year > 2030 ||
      !Number.isSafeInteger(row.month) || row.month < 1 || row.month > 12 ||
      !Number.isSafeInteger(row.amount) || row.amount < 1
    ) {
      skipped++;
      continue;
    }
    // Check if user exists
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
    if (!user) { skipped++; continue; }

    // Upsert — if exists update amount, else insert
    const [existing] = await db.select().from(monthlySavingsTable)
      .where(and(
        eq(monthlySavingsTable.userId, row.userId),
        eq(monthlySavingsTable.year, row.year),
        eq(monthlySavingsTable.month, row.month),
      ));

    if (existing) {
      await db.update(monthlySavingsTable).set({
        amount: row.amount,
        notes: `[import] ${row.notes?.trim() || "Import manual oleh admin"}`,
      }).where(eq(monthlySavingsTable.id, existing.id));
    } else {
      const lastDay = new Date(row.year, row.month, 0);
      await db.insert(monthlySavingsTable).values({
        userId: row.userId,
        year: row.year,
        month: row.month,
        role: user.role,
        amount: row.amount,
        sourceWords: 0,
        sourceJobs: 0,
        paidAt: lastDay,
        notes: `[import] ${row.notes?.trim() || "Import manual oleh admin"}`,
      });
    }
    inserted++;
  }

  res.json({ ok: true, inserted, skipped });
});

router.delete("/savings/delete-all", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Hanya Admin yang bisa menghapus semua data tabungan" }); return; }
  await db.delete(savingsWithdrawalsTable);
  const result = await db.delete(monthlySavingsTable);
  req.log.warn({ deletedBy: user.username }, "Semua data tabungan dihapus oleh admin");
  res.json({ ok: true, deleted: (result as any).rowCount ?? 0 });
});

// ─── Kontak pelanggan berdasarkan job_code ─────────────────
router.get("/jobs/customer-contact/:jobCode", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { jobCode } = req.params;
  const [row] = await db
    .select({
      name:  customersTable.name,
      email: customersTable.email,
      wa:    customersTable.wa,
    })
    .from(articleOrdersTable)
    .leftJoin(customersTable, eq(articleOrdersTable.customerId, customersTable.id))
    .where(eq(articleOrdersTable.jobCode, jobCode))
    .limit(1);
  res.json(row ?? { name: null, email: null, wa: null });
});

// ═══════════════════════════════════════════════════════════
// PELANGGAN (CUSTOMERS)
// ═══════════════════════════════════════════════════════════

router.get("/customers", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const rows = await db.select().from(customersTable).orderBy(customersTable.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/customers", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { name, wa, email, firstOrderDate, notes } = req.body;
  if (!name) { res.status(400).json({ error: "Nama wajib diisi" }); return; }
  const [row] = await db.insert(customersTable).values({ name, wa, email, firstOrderDate, notes }).returning();
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/customers/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  const { name, wa, email, firstOrderDate, notes } = req.body;
  const [row] = await db.update(customersTable)
    .set({ name, wa, email, firstOrderDate, notes })
    .where(eq(customersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Pelanggan tidak ditemukan" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/customers/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// JADWALKAN JOB — pecah order menjadi baris job harian
// ═══════════════════════════════════════════════════════════

// GET /api/jadwalkan/word-loads?writerIds=1,2,3&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Mengembalikan total kata yang sudah dijadwalkan per penulis per tanggal
router.get("/jadwalkan/word-loads", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { writerIds: writerIdsRaw, startDate, endDate } = req.query as {
    writerIds?: string; startDate?: string; endDate?: string;
  };

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate dan endDate diperlukan" }); return;
  }

  const writerIdList = (writerIdsRaw ?? "")
    .split(",")
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  if (writerIdList.length === 0) {
    res.json({}); return;
  }

  // Query: sum wordCount per writerId per jobDate dalam rentang tanggal
  const rows = await db
    .select({
      writerId: jobsTable.writerId,
      jobDate: jobsTable.jobDate,
      totalWords: sql<number>`COALESCE(SUM(${jobsTable.wordCount}), 0)::int`,
    })
    .from(jobsTable)
    .where(
      and(
        inArray(jobsTable.writerId, writerIdList),
        sql`${jobsTable.jobDate} >= ${startDate}`,
        sql`${jobsTable.jobDate} <= ${endDate}`,
      )
    )
    .groupBy(jobsTable.writerId, jobsTable.jobDate);

  // Bangun map { writerId: { date: totalWords } }
  const result: Record<number, Record<string, number>> = {};
  for (const row of rows) {
    if (row.writerId === null) continue;
    if (!result[row.writerId]) result[row.writerId] = {};
    result[row.writerId][row.jobDate] = row.totalWords;
  }

  res.json(result);
});

router.post("/jadwalkan", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { orderId, startDate, assignments } = req.body as {
    orderId: number;
    startDate: string; // yyyy-MM-dd
    assignments: { writerId: number | null; count: number; perInterval?: number; intervalDays?: number }[];
  };

  if (!orderId || !startDate || !Array.isArray(assignments) || assignments.length === 0) {
    res.status(400).json({ error: "Parameter tidak lengkap" }); return;
  }

  // Load order
  const [order] = await db.select().from(articleOrdersTable).where(eq(articleOrdersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (order.isScheduled) { res.status(409).json({ error: "Order ini sudah dijadwalkan" }); return; }

  const totalArticles = (order.articleCount ?? 0) + (order.bonusArticles ?? 0);
  const totalAssigned = assignments.reduce((s, a) => s + (a.count || 0), 0);
  if (totalAssigned !== totalArticles) {
    res.status(400).json({ error: `Total artikel yang dialokasikan (${totalAssigned}) tidak sesuai dengan total artikel order (${totalArticles})` });
    return;
  }

  // Hitung hari kerja (Senin–Sabtu) dari startDate sampai deadline
  function getWorkingDays(from: string, to: string): string[] {
    const days: string[] = [];
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const cur = new Date(fy, fm - 1, fd);
    const end = new Date(ty, tm - 1, td);
    while (cur <= end) {
      if (cur.getDay() !== 0) { // bukan Minggu
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        days.push(`${y}-${m}-${d}`);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  const deadline = order.deadlineDate || startDate;
  let workingDays = getWorkingDays(startDate, deadline);
  if (workingDays.length === 0) workingDays = [deadline]; // fallback: deadline itu sendiri

  // Distribusi per penulis berdasarkan ritme interval
  // k = indeks artikel (0-based), perInterval = artikel per kelompok, intervalDays = jarak hari kerja
  function getWriterDate(k: number, perInterval: number, intervalDays: number): string {
    const batchIdx = Math.floor(k / Math.max(1, perInterval));
    const dayOffset = batchIdx * Math.max(1, intervalDays);
    return workingDays[Math.min(dayOffset, workingDays.length - 1)];
  }

  // 1. Bangun raw rows dengan date tapi tanpa nomor urut
  type RawJob = { date: string; writerId: number | null };
  const rawJobs: RawJob[] = [];

  for (const asgn of assignments) {
    const pi = Math.max(1, asgn.perInterval ?? 1);
    const id = Math.max(1, asgn.intervalDays ?? 1);
    for (let k = 0; k < asgn.count; k++) {
      rawJobs.push({ date: getWriterDate(k, pi, id), writerId: asgn.writerId ?? null });
    }
  }

  // 2. Urutkan berdasar tanggal (stable — urutan penulis dalam hari yang sama dipertahankan)
  rawJobs.sort((a, b) => a.date.localeCompare(b.date));

  // 3. Beri nomor urut setelah sorting → penomoran konsisten dengan preview
  const jobRows: (typeof jobsTable.$inferInsert)[] = rawJobs.map((raw, idx) => {
    const seq = idx + 1;
    const isBonus = seq > order.articleCount;
    const label = isBonus
      ? `Bonus ${seq - order.articleCount}`
      : `Artikel ${seq}`;
    const notes = order.notes ? `${label} - ${order.notes}` : label;

    return {
      jobCode: order.jobCode,
      website: order.website || "",
      username: order.siteUser || null,
      password: order.sitePassword || null,
      notes,
      versionTool: order.tool || "",
      wordCount: order.wordCount ?? 0,
      writerId: raw.writerId,
      editorId: null,
      petunjuk: order.petunjuk || null,
      revisionNotes: null,
      isChecked: false,
      jobDate: raw.date,
    };
  });

  // Bulk insert ke jobs
  await db.insert(jobsTable).values(jobRows);

  // Tandai order sebagai sudah dijadwalkan
  await db.update(articleOrdersTable)
    .set({ isScheduled: true })
    .where(eq(articleOrdersTable.id, orderId));

  res.json({ ok: true, created: jobRows.length });
});

// ═══════════════════════════════════════════════════════════
// ORDER ARTIKEL
// ═══════════════════════════════════════════════════════════

router.get("/article-orders", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const rows = await db
    .select({
      id: articleOrdersTable.id,
      jobCode: articleOrdersTable.jobCode,
      orderDate: articleOrdersTable.orderDate,
      deadlineDate: articleOrdersTable.deadlineDate,
      customerId: articleOrdersTable.customerId,
      customerName: customersTable.name,
      customerWa: customersTable.wa,
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
      sitePassword: articleOrdersTable.sitePassword,
      petunjuk: articleOrdersTable.petunjuk,
      // Cek apakah job_code ada di tabel jobs
      jobExists: sql<boolean>`EXISTS(
        SELECT 1 FROM jobs WHERE job_code = ${articleOrdersTable.jobCode}
      )`,
      isScheduled: articleOrdersTable.isScheduled,
      createdAt: articleOrdersTable.createdAt,
    })
    .from(articleOrdersTable)
    .leftJoin(customersTable, eq(articleOrdersTable.customerId, customersTable.id))
    .orderBy(desc(articleOrdersTable.orderDate), desc(articleOrdersTable.id));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/article-orders", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { jobCode, orderDate, deadlineDate, customerId, articleCount, wordCount, tool, paymentBank, price, bonusArticles, bonusValue, notes, website, siteUser, sitePassword, petunjuk } = req.body;
  if (!jobCode || !orderDate) { res.status(400).json({ error: "Kode Job dan Tanggal wajib diisi" }); return; }
  const [row] = await db.insert(articleOrdersTable).values({
    jobCode, orderDate, deadlineDate: deadlineDate || null,
    customerId: customerId ? parseInt(customerId) : null,
    articleCount: articleCount ?? 1,
    wordCount: wordCount ?? 0,
    tool, paymentBank,
    price: price ?? 0,
    bonusArticles: bonusArticles ?? 0,
    bonusValue: bonusValue ?? 0,
    notes,
    website: website || null,
    siteUser: siteUser || null,
    sitePassword: sitePassword || null,
    petunjuk: petunjuk || null,
  }).returning();
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/article-orders/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  const { jobCode, orderDate, deadlineDate, customerId, articleCount, wordCount, tool, paymentBank, price, bonusArticles, bonusValue, notes, website, siteUser, sitePassword, petunjuk } = req.body;
  const [row] = await db.update(articleOrdersTable)
    .set({
      jobCode, orderDate, deadlineDate: deadlineDate || null,
      customerId: customerId != null ? parseInt(customerId) : null,
      articleCount, wordCount, tool, paymentBank, price, bonusArticles, bonusValue, notes,
      website: website || null,
      siteUser: siteUser || null,
      sitePassword: sitePassword || null,
      petunjuk: petunjuk !== undefined ? (petunjuk || null) : undefined,
    })
    .where(eq(articleOrdersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

// ─── PATCH /api/article-orders/:id/mark-done ─────────────────────────────────
// Tandai order selesai tanpa membuat job (untuk order lama yang tidak perlu dijadwalkan)
router.patch("/article-orders/:id/mark-done", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (user.role !== "admin" && user.role !== "cs")) {
    res.status(403).json({ error: "Hanya Admin atau CS" }); return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const [order] = await db.select().from(articleOrdersTable).where(eq(articleOrdersTable.id, id));
  if (!order) { res.status(404).json({ error: "Order tidak ditemukan" }); return; }
  if (order.isScheduled) { res.status(409).json({ error: "Order sudah ditandai selesai" }); return; }
  await db.update(articleOrdersTable).set({ isScheduled: true }).where(eq(articleOrdersTable.id, id));
  req.log.info({ orderId: id, markedBy: user.username }, "Order artikel ditandai selesai manual");
  res.json({ ok: true });
});

router.delete("/article-orders/delete-all", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") { res.status(403).json({ error: "Hanya Admin yang bisa menghapus semua data order" }); return; }
  const result = await db.delete(articleOrdersTable);
  req.log.warn({ deletedBy: user.username }, "Semua data order artikel dihapus oleh admin");
  res.json({ ok: true, deleted: (result as any).rowCount ?? 0 });
});

router.delete("/article-orders/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(req.params.id);
  await db.delete(articleOrdersTable).where(eq(articleOrdersTable.id, id));
  res.json({ ok: true });
});

// ─── Export Excel: Order Artikel ─────────────────────────────────────────────
router.get("/article-orders/export", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select({
      jobCode: articleOrdersTable.jobCode,
      orderDate: articleOrdersTable.orderDate,
      deadlineDate: articleOrdersTable.deadlineDate,
      customerName: customersTable.name,
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
      sitePassword: articleOrdersTable.sitePassword,
      petunjuk: articleOrdersTable.petunjuk,
    })
    .from(articleOrdersTable)
    .leftJoin(customersTable, eq(articleOrdersTable.customerId, customersTable.id))
    .orderBy(desc(articleOrdersTable.orderDate), desc(articleOrdersTable.id));

  const headers = [
    "Kode Job", "Tanggal Order (yyyy-MM-dd)", "Tanggal Deadline (yyyy-MM-dd)",
    "Nama Pelanggan", "Jumlah Artikel", "Jumlah Kata",
    "Tool", "Bank Bayar", "Harga (Rp)",
    "Bonus Artikel", "Nilai Bonus (Rp)", "Catatan",
    "Website", "User", "Password",
    "Petunjuk Penulisan",
  ];
  const data = rows.map(r => [
    r.jobCode,
    r.orderDate ?? "",
    r.deadlineDate ?? "",
    r.customerName ?? "",
    r.articleCount,
    r.wordCount,
    r.tool ?? "",
    r.paymentBank ?? "",
    r.price,
    r.bonusArticles,
    r.bonusValue,
    r.notes ?? "",
    r.website ?? "",
    r.siteUser ?? "",
    r.sitePassword ?? "",
    r.petunjuk ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = [22, 24, 24, 22, 16, 14, 16, 16, 16, 16, 16, 22, 28, 20, 20, 60].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Order Artikel");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename=order_artikel_${today}.xlsx`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── Template Download: Order Artikel ────────────────────────────────────────
router.get("/article-orders/template", (req, res) => {
  const headers = [
    "Kode Job", "Tanggal Order (yyyy-MM-dd)", "Tanggal Deadline (yyyy-MM-dd)",
    "Nama Pelanggan", "Jumlah Artikel", "Jumlah Kata",
    "Tool", "Bank Bayar", "Harga (Rp)",
    "Bonus Artikel", "Nilai Bonus (Rp)", "Catatan",
    "Website", "User", "Password",
    "Petunjuk Penulisan",
  ];
  const example = [
    "JS-001", "2024-01-15", "2024-01-20",
    "Toko ABC", "5", "500",
    "GPT-4o", "BCA", "500000",
    "0", "0", "",
    "https://tokoseo.com/wp-admin", "editor_toko", "p@ssw0rd123",
    "Tulis petunjuk lengkap di sini (opsional, akan disimpan ke data Job di Dashboard)",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = [22, 24, 24, 22, 16, 14, 16, 16, 16, 16, 16, 22, 28, 20, 20, 60].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Order");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=template_order_artikel.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── Import Excel: Order Artikel ─────────────────────────────────────────────
router.post("/article-orders/import", upload.single("file"), async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.file) { res.status(400).json({ error: "File tidak ditemukan" }); return; }

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

  if (rows.length === 0) { res.status(400).json({ error: "File kosong atau tidak ada data" }); return; }

  // Fetch customers for name lookup
  const allCustomers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const custMap: Record<string, number> = {};
  for (const c of allCustomers) custMap[c.name.trim().toLowerCase()] = c.id;

  const inserted: number[] = [];
  const skipped: string[] = [];
  const petunjukUpdated: string[] = [];

  for (const row of rows) {
    const jobCode = (row["Kode Job"] ?? "").toString().trim();
    const orderDate = (row["Tanggal Order (yyyy-MM-dd)"] ?? "").toString().trim();
    if (!jobCode || !orderDate) { skipped.push(`Baris tanpa kode/tanggal`); continue; }

    const custName = (row["Nama Pelanggan"] ?? "").toString().trim().toLowerCase();
    const customerId = custName ? (custMap[custName] ?? null) : null;

    // Jika ada kolom "Petunjuk Penulisan" dan job_code ada di jobs table → update petunjuk
    const petunjukVal = (row["Petunjuk Penulisan"] ?? "").toString().trim();
    if (petunjukVal) {
      const existingJob = await db.select({ id: jobsTable.id }).from(jobsTable)
        .where(eq(jobsTable.jobCode, jobCode)).limit(1);
      if (existingJob.length > 0) {
        await db.update(jobsTable).set({ petunjuk: petunjukVal }).where(eq(jobsTable.jobCode, jobCode));
        petunjukUpdated.push(jobCode);
      }
    }

    const [r] = await db.insert(articleOrdersTable).values({
      jobCode,
      orderDate,
      deadlineDate: (row["Tanggal Deadline (yyyy-MM-dd)"] ?? "").toString().trim() || null,
      customerId,
      articleCount: parseInt(row["Jumlah Artikel"] ?? "1") || 1,
      wordCount: parseInt(row["Jumlah Kata"] ?? "0") || 0,
      tool: (row["Tool"] ?? "").toString().trim() || null,
      paymentBank: (row["Bank Bayar"] ?? "").toString().trim() || null,
      price: parseInt(row["Harga (Rp)"] ?? "0") || 0,
      bonusArticles: parseInt(row["Bonus Artikel"] ?? "0") || 0,
      bonusValue: parseInt(row["Nilai Bonus (Rp)"] ?? "0") || 0,
      notes: (row["Catatan"] ?? "").toString().trim() || null,
      website: (row["Website"] ?? "").toString().trim() || null,
      siteUser: (row["User"] ?? "").toString().trim() || null,
      sitePassword: (row["Password"] ?? "").toString().trim() || null,
    }).returning({ id: articleOrdersTable.id });
    inserted.push(r.id);
  }

  res.json({ inserted: inserted.length, skipped: skipped.length, skippedDetails: skipped, petunjukUpdated: petunjukUpdated.length });
});

// ─── Template Download: Pelanggan ─────────────────────────────────────────────
router.get("/customers/template", (req, res) => {
  const headers = ["Nama", "No WA", "Email", "Tgl Pertama Order (yyyy-MM-dd)", "Notes"];
  const example = ["Toko ABC", "081234567890", "toko@email.com", "2024-01-01", "Pelanggan lama"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 28 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template Pelanggan");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=template_pelanggan.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── Import Excel: Pelanggan ──────────────────────────────────────────────────
router.post("/customers/import", upload.single("file"), async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (!req.file) { res.status(400).json({ error: "File tidak ditemukan" }); return; }

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

  if (rows.length === 0) { res.status(400).json({ error: "File kosong atau tidak ada data" }); return; }

  const inserted: number[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const name = (row["Nama"] ?? "").toString().trim();
    if (!name) { skipped.push("Baris tanpa nama"); continue; }

    const [r] = await db.insert(customersTable).values({
      name,
      wa: (row["No WA"] ?? "").toString().trim() || null,
      email: (row["Email"] ?? "").toString().trim() || null,
      firstOrderDate: (row["Tgl Pertama Order (yyyy-MM-dd)"] ?? "").toString().trim() || null,
      notes: (row["Notes"] ?? "").toString().trim() || null,
    }).returning({ id: customersTable.id });
    inserted.push(r.id);
  }

  res.json({ inserted: inserted.length, skipped: skipped.length, skippedDetails: skipped });
});

// ─── Hari Libur ───────────────────────────────────────────────────────────────
router.get("/holidays", async (req, res) => {
  const rows = await db.select().from(holidaysTable).orderBy(holidaysTable.date);
  res.json(rows);
});

router.post("/holidays", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (user.role !== "admin" && user.role !== "cs")) {
    res.status(403).json({ error: "Hanya Admin atau CS yang bisa mengelola hari libur" }); return;
  }
  const { date, name } = req.body as { date: string; name: string };
  if (!date || !name) { res.status(400).json({ error: "date dan name wajib diisi" }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "Format tanggal harus yyyy-MM-dd" }); return; }
  const [existing] = await db.select().from(holidaysTable).where(eq(holidaysTable.date, date));
  if (existing) { res.status(409).json({ error: "Tanggal ini sudah ada di daftar libur" }); return; }
  const [row] = await db.insert(holidaysTable).values({ date, name }).returning();
  res.status(201).json(row);
});

router.post("/holidays/batch", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (user.role !== "admin" && user.role !== "cs")) {
    res.status(403).json({ error: "Hanya Admin atau CS yang bisa mengelola hari libur" }); return;
  }
  const items = req.body as Array<{ date: string; name: string }>;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Body harus berupa array {date, name}" }); return;
  }
  const existing = await db.select({ date: holidaysTable.date }).from(holidaysTable);
  const existingDates = new Set(existing.map(r => r.date));
  const toInsert = items.filter(i =>
    i.date && i.name && /^\d{4}-\d{2}-\d{2}$/.test(i.date) && !existingDates.has(i.date)
  );
  if (toInsert.length === 0) { res.json({ inserted: 0, skipped: items.length }); return; }
  const rows = await db.insert(holidaysTable).values(toInsert).returning();
  res.status(201).json({ inserted: rows.length, skipped: items.length - rows.length, rows });
});

router.delete("/holidays/:id", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (user.role !== "admin" && user.role !== "cs")) {
    res.status(403).json({ error: "Hanya Admin atau CS yang bisa mengelola hari libur" }); return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  await db.delete(holidaysTable).where(eq(holidaysTable.id, id));
  res.json({ ok: true });
});

// ─── Salary: Year Matrix (Rekap Gaji Tahunan) ────────────────────────────────
router.get("/salary/year-matrix", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser || currentUser.role !== "admin") {
    res.status(403).json({ error: "Akses hanya untuk Admin" }); return;
  }

  const year = parseInt(req.query.year as string);
  if (!year) { res.status(400).json({ error: "year wajib diisi" }); return; }

  const startDate = `${year}-01-01`;
  const endDate   = `${year}-12-31`;

  const [allUsers, allWriters, allEditors, writerJobsByMonth, editorJobsByMonth, additionalRows, transfers] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(writersTable),
    db.select().from(editorsTable).where(eq(editorsTable.isDeleted, false)),
    db.select({
      writerId:  jobsTable.writerId,
      month:     sql<number>`EXTRACT(MONTH FROM ${jobsTable.jobDate}::date)::int`,
      doneWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    }).from(jobsTable).where(and(
      sql`${jobsTable.writerId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    )).groupBy(jobsTable.writerId, sql`EXTRACT(MONTH FROM ${jobsTable.jobDate}::date)`),
    db.select({
      editorId:  jobsTable.editorId,
      month:     sql<number>`EXTRACT(MONTH FROM ${jobsTable.jobDate}::date)::int`,
      doneWords: sql<number>`coalesce(sum(${jobsTable.wordCount}), 0)`,
    }).from(jobsTable).where(and(
      sql`${jobsTable.editorId} is not null`,
      eq(jobsTable.isChecked, true),
      sql`${jobsTable.jobDate} >= ${startDate}`,
      sql`${jobsTable.jobDate} <= ${endDate}`,
    )).groupBy(jobsTable.editorId, sql`EXTRACT(MONTH FROM ${jobsTable.jobDate}::date)`),
    db.select().from(additionalIncomeTable).where(eq(additionalIncomeTable.year, year)),
    db.select().from(salaryTransfersTable).where(eq(salaryTransfersTable.year, year)),
  ]);

  // Lookup maps
  const writerDoneMap = new Map<string, number>();
  for (const r of writerJobsByMonth) {
    writerDoneMap.set(`${r.writerId}-${r.month}`, Number(r.doneWords));
  }
  const editorDoneMap = new Map<string, number>();
  for (const r of editorJobsByMonth) {
    editorDoneMap.set(`${r.editorId}-${r.month}`, Number(r.doneWords));
  }
  const additionalMap = new Map<string, number>();
  for (const r of additionalRows) {
    const key = `${r.userId}-${r.month}`;
    additionalMap.set(key, (additionalMap.get(key) ?? 0) + r.amount);
  }
  const transferMap = new Map<string, typeof transfers[0]>();
  for (const t of transfers) {
    transferMap.set(`${t.userId}-${t.month}`, t);
  }
  const writerMap = new Map(allWriters.map(w => [w.id, w]));
  const editorMap = new Map(allEditors.map(e => [e.id, e]));

  // Karyawan aktif yang tampil di rekap gaji:
  // - Role penulis/cs: writerId harus ada dan writer.isActive === true
  // - Role "editor" (standalone) dikecualikan — di sistem baru, editor berasal dari
  //   penulis dual-role saja; akun role=editor adalah akun lama yang sudah deprecated
  const activeNonAdminUsers = allUsers.filter(u => {
    if (u.role === "admin" || u.role === "editor") return false;
    if (u.writerId) {
      const w = writerMap.get(u.writerId);
      return !!(w?.isActive);
    }
    return false;
  });

  // Precompute per-month writer combined income (needed for CS calculation)
  // Harus sama dengan laporan: combinedIncome = wIncome + eIncome + writerBonus
  const monthWriterCombined = new Map<number, number[]>();
  for (let m = 1; m <= 12; m++) {
    const incomes: number[] = [];
    for (const u of activeNonAdminUsers) {
      if (!u.writerId) continue;
      const w = writerMap.get(u.writerId);
      if (!w) continue;
      const wWords  = writerDoneMap.get(`${u.writerId}-${m}`) ?? 0;
      const wIncome = hitungGajiPenulis(wWords);
      const edId    = w.isAlsoEditor ? w.linkedEditorId : null;
      const eWords  = edId ? (editorDoneMap.get(`${edId}-${m}`) ?? 0) : 0;
      const eIncome = Math.floor(eWords * 4.7);
      const combined = wIncome + eIncome;
      // Sama dengan laporan: bonus writer 5% jika ≥80.000 kata tulis
      const writerBonus = wWords >= 80_000 ? Math.floor(combined * 0.05) : 0;
      incomes.push(combined + writerBonus);
    }
    monthWriterCombined.set(m, incomes);
  }

  const employees: any[] = [];
  for (const emp of activeNonAdminUsers) {
    const writer    = emp.writerId ? writerMap.get(emp.writerId) : undefined;
    const isDualRole = !!(writer?.isAlsoEditor && writer?.linkedEditorId);
    const months: Record<number, { salary: number; transferred: boolean; transferredAt: string | null }> = {};

    for (let m = 1; m <= 12; m++) {
      const transfer   = transferMap.get(`${emp.id}-${m}`);
      const additional = additionalMap.get(`${emp.id}-${m}`) ?? 0;
      let salary = 0;

      if (emp.role === "cs") {
        const incomes      = monthWriterCombined.get(m) ?? [];
        const top          = incomes.length > 0 ? Math.max(...incomes) : 0;
        const csBonus      = Math.floor(top * 0.05);
        salary = top + csBonus + 70_000 + additional;
      } else if (writer) {
        const wWords  = writerDoneMap.get(`${emp.writerId}-${m}`) ?? 0;
        const wIncome = hitungGajiPenulis(wWords);
        const edId    = isDualRole ? writer.linkedEditorId! : null;
        const eWords  = edId ? (editorDoneMap.get(`${edId}-${m}`) ?? 0) : 0;
        const eIncome = Math.floor(eWords * 4.7);
        const pulsa   = isDualRole ? 70_000 : (wWords >= 48_100 ? 70_000 : 0);
        const bonus   = wWords >= 80_000 ? Math.floor((wIncome + eIncome + pulsa) * 0.05) : 0;
        salary = wIncome + eIncome + pulsa + bonus + additional;
      } else if (emp.editorId) {
        const eWords  = editorDoneMap.get(`${emp.editorId}-${m}`) ?? 0;
        const eIncome = Math.floor(eWords * 4.7);
        salary = eIncome + 70_000 + additional;
      }

      months[m] = {
        salary,
        transferred:    !!transfer,
        transferredAt:  transfer ? (transfer.transferredAt as Date).toISOString() : null,
      };
    }

    let displayName = emp.username;
    if (writer) displayName = writer.name;
    else if (emp.editorId) {
      const ed = editorMap.get(emp.editorId);
      if (ed) displayName = ed.name;
    }

    employees.push({ userId: emp.id, name: displayName, role: emp.role, isDualRole, months });
  }

  employees.sort((a, b) => a.name.localeCompare(b.name, "id"));

  const monthTotals: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthTotals[m] = employees.reduce((s, e) => s + (e.months[m]?.salary ?? 0), 0);
  }

  res.json({ year, employees, monthTotals });
});

// ─── Salary: Mark Transfer (toggle) ─────────────────────────────────────────
router.post("/salary/transfer", async (req, res) => {
  const adminId = (req.session as any).userId;
  if (!adminId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  if (!admin || admin.role !== "admin") {
    res.status(403).json({ error: "Hanya Admin yang bisa menandai transfer" }); return;
  }

  const { userId, year, month, notes } = req.body as { userId: number; year: number; month: number; notes?: string };
  if (!userId || !year || !month) {
    res.status(400).json({ error: "userId, year, month wajib diisi" }); return;
  }

  // Upsert: if exists delete, otherwise insert (toggle)
  const existing = await db.select().from(salaryTransfersTable).where(
    and(
      eq(salaryTransfersTable.userId, userId),
      eq(salaryTransfersTable.year, year),
      eq(salaryTransfersTable.month, month),
    )
  );

  if (existing.length > 0) {
    await db.delete(salaryTransfersTable).where(
      and(
        eq(salaryTransfersTable.userId, userId),
        eq(salaryTransfersTable.year, year),
        eq(salaryTransfersTable.month, month),
      )
    );
    res.json({ transferred: false, transferredAt: null });
  } else {
    const [inserted] = await db.insert(salaryTransfersTable).values({
      userId, year, month, transferredBy: adminId, notes: notes ?? null,
    }).returning();
    res.json({ transferred: true, transferredAt: (inserted.transferredAt as Date).toISOString() });
  }
});

// ─── Salary: Transfer Status (for individual employee) ───────────────────────
router.get("/salary/transfer-status", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const year  = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month) {
    res.status(400).json({ error: "year dan month wajib diisi" }); return;
  }

  // Admin can check any user; others check only themselves
  let targetId = userId;
  if (req.query.userId) {
    const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (caller?.role === "admin") targetId = parseInt(req.query.userId as string);
  }

  const rows = await db.select().from(salaryTransfersTable).where(
    and(
      eq(salaryTransfersTable.userId, targetId),
      eq(salaryTransfersTable.year, year),
      eq(salaryTransfersTable.month, month),
    )
  );

  if (rows.length > 0) {
    res.json({ transferred: true, transferredAt: (rows[0].transferredAt as Date).toISOString() });
  } else {
    res.json({ transferred: false, transferredAt: null });
  }
});

export default router;
