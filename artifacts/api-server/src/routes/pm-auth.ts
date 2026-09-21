import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, proposalUsers } from "@workspace/db";
import { PmRegisterBody, PmLoginBody } from "@workspace/api-zod";

const router: IRouter = Router();

function serializeUser(user: typeof proposalUsers.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    bankName: user.bankName,
    bankAccount: user.bankAccount,
    accountOwner: user.accountOwner,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/pm/auth/register", async (req, res): Promise<void> => {
  const parsed = PmRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, role } = parsed.data;

  if (!["buyer", "seller"].includes(role)) {
    res.status(400).json({ error: "Role harus buyer atau seller" });
    return;
  }

  const existing = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.email, email));

  if (existing.length > 0) {
    res.status(400).json({ error: "Email sudah terdaftar" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(proposalUsers)
    .values({ name, email, passwordHash, role })
    .returning();

  (req.session as unknown as Record<string, unknown>).pmUserId = user.id;

  res.status(201).json(serializeUser(user));
});

router.post("/pm/auth/login", async (req, res): Promise<void> => {
  const parsed = PmLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.email, email));

  if (!user) {
    res.status(401).json({ error: "Email atau password salah" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email atau password salah" });
    return;
  }

  (req.session as unknown as Record<string, unknown>).pmUserId = user.id;

  res.json(serializeUser(user));
});

router.post("/pm/auth/logout", async (req, res): Promise<void> => {
  (req.session as unknown as Record<string, unknown>).pmUserId = undefined;
  res.json({ success: true });
});

router.get("/pm/auth/me", async (req, res): Promise<void> => {
  const pmUserId = (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;

  if (!pmUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db
    .select()
    .from(proposalUsers)
    .where(eq(proposalUsers.id, pmUserId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

export default router;
