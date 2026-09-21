import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, writersTable, editorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const LoginBody = z.object({
  username: z.string(),
  password: z.string(),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(4),
});

const LoginAsBody = z.object({
  userId: z.number().int().positive(),
});

async function buildAuthUser(user: typeof usersTable.$inferSelect, isImpersonating = false) {
  let writerName: string | null = null;
  let editorName: string | null = null;
  let effectiveEditorId = user.editorId ?? null;
  let isAlsoEditor = false;

  if (user.writerId) {
    const [w] = await db.select().from(writersTable).where(eq(writersTable.id, user.writerId));
    writerName = w?.name ?? null;
    isAlsoEditor = !!w?.isAlsoEditor;
    if (!effectiveEditorId && w?.isAlsoEditor && w.linkedEditorId) {
      effectiveEditorId = w.linkedEditorId;
    }
  }
  if (effectiveEditorId) {
    const [e] = await db.select().from(editorsTable).where(eq(editorsTable.id, effectiveEditorId));
    editorName = e?.name ?? null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    writerId: user.writerId ?? null,
    writerName,
    editorId: effectiveEditorId,
    editorName,
    isAlsoEditor,
    isImpersonating,
  };
}

router.post("/login", async (req: Request, res: Response) => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, body.data.username.trim()));

  if (!user) {
    res.status(401).json({ error: "Username atau password salah." });
    return;
  }

  const valid = await bcrypt.compare(body.data.password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Username atau password salah." });
    return;
  }

  (req.session as any).userId = user.id;
  delete (req.session as any).originalAdminId;

  // Simpan plain password agar admin bisa lihat
  if (!user.plainPassword) {
    await db.update(usersTable)
      .set({ plainPassword: body.data.password })
      .where(eq(usersTable.id, user.id));
  }

  const authUser = await buildAuthUser(user);
  res.json(authUser);
});

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get("/me", async (req: Request, res: Response) => {
  const userId = (req.session as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const isImpersonating = !!(req.session as any).originalAdminId;
  const authUser = await buildAuthUser(user, isImpersonating);
  res.json(authUser);
});

router.patch("/password", async (req: Request, res: Response) => {
  const userId = (req.session as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const body = ChangePasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Password minimal 4 karakter." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Password saat ini salah." });
    return;
  }

  const newHash = await bcrypt.hash(body.data.newPassword, 10);
  await db.update(usersTable)
    .set({ passwordHash: newHash, plainPassword: body.data.newPassword })
    .where(eq(usersTable.id, userId));

  res.json({ success: true });
});

// ─── Login sebagai user lain (admin only) ──────────────────────────────────
router.post("/login-as", async (req: Request, res: Response) => {
  const sessionUserId = (req.session as any).userId;
  const alreadyImpersonating = (req.session as any).originalAdminId;

  if (!sessionUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (alreadyImpersonating) {
    res.status(400).json({ error: "Sudah dalam mode impersonasi. Kembali ke admin dulu." });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!me || me.role !== "admin") {
    res.status(403).json({ error: "Hanya admin yang dapat menggunakan fitur ini." });
    return;
  }

  const body = LoginAsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "userId tidak valid" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, body.data.userId));
  if (!target) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }
  if (target.role === "admin") {
    res.status(400).json({ error: "Tidak bisa impersonasi akun admin lain." });
    return;
  }

  (req.session as any).originalAdminId = me.id;
  (req.session as any).userId = target.id;

  const authUser = await buildAuthUser(target, true);
  res.json(authUser);
});

// ─── Kembali ke admin ──────────────────────────────────────────────────────
router.post("/restore-admin", async (req: Request, res: Response) => {
  const originalAdminId = (req.session as any).originalAdminId;
  if (!originalAdminId) {
    res.status(400).json({ error: "Tidak sedang dalam mode impersonasi." });
    return;
  }

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, originalAdminId));
  if (!admin || admin.role !== "admin") {
    res.status(403).json({ error: "Akun admin tidak ditemukan." });
    return;
  }

  (req.session as any).userId = originalAdminId;
  delete (req.session as any).originalAdminId;

  const authUser = await buildAuthUser(admin, false);
  res.json(authUser);
});

export default router;
