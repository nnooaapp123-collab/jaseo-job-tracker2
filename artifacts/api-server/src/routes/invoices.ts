import { Router } from "express";
import { db, invoicesTable, invoiceItemsTable, customersTable, usersTable, appSettingsTable, type InvoiceCompanySnapshot } from "@workspace/db";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// ─── Auth helper: Admin atau CS ─────────────────────────────────────────────
async function requireAdminOrCs(req: any, res: any): Promise<boolean> {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Belum login" }); return false; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (user.role !== "admin" && user.role !== "cs")) {
    res.status(403).json({ error: "Hanya Admin/CS" }); return false;
  }
  return true;
}

// ─── Settings helpers (app_settings key-value) ──────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

const INV_COMPANY_KEY = "invoice_company_name";
const INV_PAYMENT_KEY = "invoice_payment_notes";
const INV_FOOTER_KEY = "invoice_footer";
const INV_LOGO_KEY = "invoice_logo";
const INV_ADDRESS_KEY = "invoice_company_address";
const INV_PROFILES_KEY = "invoice_company_profiles";

const DEFAULT_COMPANY = "JASEO KONTEN MEDIA";
const DEFAULT_ADDRESS = "Krinjing RT 06, Mertelu, Gedangsari, Gunungkidul, Yogyakarta";
const DEFAULT_PAYMENT = [
  "Pembayaran ke salah satu",
  "BRI : 697901009557530 an. supriyadi",
  "Mandiri: 1370007589589 an. supriyadi",
  "BCA : 8950242486 an. supriyadi",
  "BNI : 0293238948 an. supriyadi",
  "OVO/GOPAY/DANA/FLIP: 085228980753 an. supriyadi",
  "BTPN/JENIUS 90200061510 an. Supriyadi",
].join("\n");
const DEFAULT_FOOTER = [
  "Jika sudah transfer silahkan konfirmasi ke nomor 0822-6231-4961 agar bisa segera kami proses.",
  "Selanjutnya silahkan infokan detail login pengerjaan atau email untuk pengiriman artikel nantinya.",
  "Terima kasih",
].join("\n");

// ─── Zod schemas ────────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE_RE, "Format tanggal harus yyyy-MM-dd");

const itemSchema = z.object({
  description: z.string().min(1, "Keterangan wajib diisi"),
  quantity: z.coerce.number().int().min(0).default(1),
  unitPrice: z.coerce.number().int().min(0).default(0),
});

const invoiceBodySchema = z.object({
  invoiceNumber: z.string().min(1, "Nomor tagihan wajib diisi"),
  invoiceDate: dateField,
  dueDate: z.union([dateField, z.literal(""), z.null()]).optional(),
  companyProfileId: z.string().nullish(),
  customerId: z.coerce.number().int().nullish(),
  customerName: z.string().min(1, "Nama pelanggan wajib diisi"),
  status: z.enum(["belum_dibayar", "lunas", "sebagian"]).default("belum_dibayar"),
  tax: z.coerce.number().int().min(0).default(0),
  paidAmount: z.coerce.number().int().min(0).default(0),
  notes: z.string().nullish(),
  items: z.array(itemSchema).min(1, "Minimal satu baris tagihan"),
});

// Pastikan paidAmount/status konsisten dengan total yang dihitung dari item + pajak.
// Kembalikan pesan error jika tidak valid, atau null jika valid.
function validateFinancials(data: z.infer<typeof invoiceBodySchema>): string | null {
  const subtotal = data.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal + data.tax;
  if (data.paidAmount > total) {
    return "Jumlah dibayar tidak boleh melebihi total tagihan";
  }
  if (data.status === "lunas" && data.paidAmount < total) {
    return "Status 'Lunas' tetapi jumlah dibayar belum sama dengan total";
  }
  if (data.status === "belum_dibayar" && data.paidAmount > 0) {
    return "Status 'Belum Dibayar' tetapi sudah ada jumlah dibayar";
  }
  return null;
}

const companyProfileSchema = z.object({
  id: z.string().min(1).max(100),
  companyName: z.string().trim().min(1),
  address: z.string().max(1000).default(""),
  paymentNotes: z.string(),
  footer: z.string(),
  logoUrl: z
    .string()
    .max(1_500_000, "Ukuran logo terlalu besar (maks ±1 MB)")
    .refine(
      (v) => v === "" || /^data:image\/(png|jpeg|webp);base64,/.test(v),
      "Logo harus berupa gambar PNG, JPG, atau WebP",
    )
    .optional()
    .default(""),
});
const settingsSchema = z.object({
  profiles: z.array(companyProfileSchema).min(1, "Minimal satu profil perusahaan").max(25),
  defaultProfileId: z.string().min(1),
}).superRefine((settings, ctx) => {
  const ids = settings.profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID profil perusahaan tidak boleh duplikat" });
  }
  if (!ids.includes(settings.defaultProfileId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pilih profil perusahaan default yang tersedia" });
  }
});

type CompanyProfile = z.infer<typeof companyProfileSchema>;

function snapshotProfile(profile: CompanyProfile): InvoiceCompanySnapshot {
  const { id, ...company } = profile;
  return { profileId: id, ...company };
}

async function getLegacyCompanyProfile(): Promise<CompanyProfile> {
  const [companyName, address, paymentNotes, footer, logoUrl] = await Promise.all([
    getSetting(INV_COMPANY_KEY),
    getSetting(INV_ADDRESS_KEY),
    getSetting(INV_PAYMENT_KEY),
    getSetting(INV_FOOTER_KEY),
    getSetting(INV_LOGO_KEY),
  ]);
  return {
    id: "jaseo-default",
    companyName: companyName ?? DEFAULT_COMPANY,
    address: address ?? DEFAULT_ADDRESS,
    paymentNotes: paymentNotes ?? DEFAULT_PAYMENT,
    footer: footer ?? DEFAULT_FOOTER,
    logoUrl: logoUrl ?? "",
  };
}

async function getInvoiceSettings(): Promise<{ profiles: CompanyProfile[]; defaultProfileId: string }> {
  const rawProfiles = await getSetting(INV_PROFILES_KEY);
  if (!rawProfiles) {
    const legacyProfile = await getLegacyCompanyProfile();
    return { profiles: [legacyProfile], defaultProfileId: legacyProfile.id };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawProfiles);
  } catch {
    throw new Error("Data profil perusahaan tidak dapat dibaca");
  }
  const parsed = settingsSchema.safeParse(decoded);
  if (!parsed.success) throw new Error("Data profil perusahaan tidak valid");
  return parsed.data;
}

// Parse :id param; kirim 400 dan kembalikan null jika tidak valid.
function parseId(req: any, res: any): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID tidak valid" });
    return null;
  }
  return id;
}

function isUniqueViolation(err: unknown): boolean {
  // Drizzle membungkus error pg, jadi periksa error itu sendiri dan rantai cause-nya.
  let cur: any = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    if (cur.code === "23505") return true;
    cur = cur.cause;
  }
  return false;
}

// ─── GET /api/invoice-settings ──────────────────────────────────────────────
router.get("/invoice-settings", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  res.json(await getInvoiceSettings());
});

// ─── PUT /api/invoice-settings ──────────────────────────────────────────────
router.put("/invoice-settings", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }); return; }
  const previousCompany = await getLegacyCompanyProfile();
  const previousSnapshot = snapshotProfile(previousCompany);
  const defaultProfile = parsed.data.profiles.find((profile) => profile.id === parsed.data.defaultProfileId)!;
  const values = [
    [INV_PROFILES_KEY, JSON.stringify(parsed.data)],
    [INV_COMPANY_KEY, defaultProfile.companyName],
    [INV_ADDRESS_KEY, defaultProfile.address],
    [INV_PAYMENT_KEY, defaultProfile.paymentNotes],
    [INV_FOOTER_KEY, defaultProfile.footer],
    [INV_LOGO_KEY, defaultProfile.logoUrl],
  ] as const;

  await db.transaction(async (tx) => {
    // Bekukan invoice lama memakai data yang sedang tampil sebelum pengaturan berubah.
    await tx
      .update(invoicesTable)
      .set({ companySnapshot: previousSnapshot })
      .where(isNull(invoicesTable.companySnapshot));

    for (const [key, value] of values) {
      await tx
        .insert(appSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
    }
  });
  res.json({ ok: true });
});

// ─── GET /api/invoices/next-number ──────────────────────────────────────────
// Format: DDMMYYYY + urutan 2 digit (mis. 0906202601)
router.get("/invoices/next-number", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const now = new Date();
  const jakarta = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const dd = String(jakarta.getDate()).padStart(2, "0");
  const mm = String(jakarta.getMonth() + 1).padStart(2, "0");
  const yyyy = String(jakarta.getFullYear());
  const prefix = `${dd}${mm}${yyyy}`;
  // hitung berapa invoice yang sudah memakai prefix hari ini
  const todays = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(eq(invoicesTable.invoiceDate, `${yyyy}-${mm}-${dd}`));
  const seq = String(todays.length + 1).padStart(2, "0");
  res.json({ invoiceNumber: `${prefix}${seq}` });
});

// ─── GET /api/invoices ──────────────────────────────────────────────────────
router.get("/invoices", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const rows = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceDate: invoicesTable.invoiceDate,
      dueDate: invoicesTable.dueDate,
      customerId: invoicesTable.customerId,
      customerName: invoicesTable.customerName,
      status: invoicesTable.status,
      tax: invoicesTable.tax,
      paidAmount: invoicesTable.paidAmount,
      notes: invoicesTable.notes,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .orderBy(desc(invoicesTable.createdAt));

  // Hitung total per invoice (subtotal + pajak)
  const withTotals = await Promise.all(
    rows.map(async (inv) => {
      const items = await db
        .select()
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, inv.id));
      const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const total = subtotal + inv.tax;
      return { ...inv, subtotal, total, remaining: total - inv.paidAmount, itemCount: items.length };
    }),
  );
  res.json(withTotals);
});

// ─── GET /api/invoices/:id ──────────────────────────────────────────────────
router.get("/invoices/:id", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const id = parseId(req, res);
  if (id === null) return;
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Tagihan tidak ditemukan" }); return; }
  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, id))
    .orderBy(asc(invoiceItemsTable.sortOrder), asc(invoiceItemsTable.id));
  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const total = subtotal + inv.tax;
  res.json({
    ...inv,
    companySnapshot: inv.companySnapshot ?? snapshotProfile(await getLegacyCompanyProfile()),
    items,
    subtotal,
    total,
    remaining: total - inv.paidAmount,
  });
});

// ─── POST /api/invoices ─────────────────────────────────────────────────────
router.post("/invoices", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const parsed = invoiceBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }); return; }
  const finErr = validateFinancials(parsed.data);
  if (finErr) { res.status(400).json({ error: finErr }); return; }
  const companySettings = await getInvoiceSettings();
  const companyProfileId = parsed.data.companyProfileId || companySettings.defaultProfileId;
  const selectedCompany = companySettings.profiles.find((profile) => profile.id === companyProfileId);
  if (!selectedCompany) { res.status(400).json({ error: "Profil perusahaan tidak ditemukan" }); return; }
  const companySnapshot = snapshotProfile(selectedCompany);
  const { items, ...inv } = parsed.data;

  try {
    const createdId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(invoicesTable)
        .values({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate || null,
          customerId: inv.customerId ?? null,
          customerName: inv.customerName,
          status: inv.status,
          tax: inv.tax,
          paidAmount: inv.paidAmount,
          notes: inv.notes ?? null,
          companySnapshot,
        })
        .returning();
      await tx.insert(invoiceItemsTable).values(
        items.map((it, idx) => ({
          invoiceId: created.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          sortOrder: idx,
        })),
      );
      return created.id;
    });
    res.status(201).json({ id: createdId });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Nomor tagihan sudah dipakai, gunakan nomor lain" });
      return;
    }
    throw err;
  }
});

// ─── PATCH /api/invoices/:id ────────────────────────────────────────────────
router.patch("/invoices/:id", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const id = parseId(req, res);
  if (id === null) return;
  const [existing] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Tagihan tidak ditemukan" }); return; }

  const parsed = invoiceBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid" }); return; }
  const finErr = validateFinancials(parsed.data);
  if (finErr) { res.status(400).json({ error: finErr }); return; }
  const { items, ...inv } = parsed.data;
  const companySnapshot = existing.companySnapshot ?? snapshotProfile(await getLegacyCompanyProfile());

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(invoicesTable)
        .set({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate || null,
          customerId: inv.customerId ?? null,
          customerName: inv.customerName,
          status: inv.status,
          tax: inv.tax,
          paidAmount: inv.paidAmount,
          notes: inv.notes ?? null,
          companySnapshot,
        })
        .where(eq(invoicesTable.id, id));

      // ganti seluruh baris
      await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
      await tx.insert(invoiceItemsTable).values(
        items.map((it, idx) => ({
          invoiceId: id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          sortOrder: idx,
        })),
      );
    });
    res.json({ ok: true });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Nomor tagihan sudah dipakai, gunakan nomor lain" });
      return;
    }
    throw err;
  }
});

// ─── PATCH /api/invoices/:id/status ─────────────────────────────────────────
router.patch("/invoices/:id/status", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const id = parseId(req, res);
  if (id === null) return;
  const schema = z.object({
    status: z.enum(["belum_dibayar", "lunas", "sebagian"]),
    paidAmount: z.coerce.number().int().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Data tidak valid" }); return; }

  // Hitung total dari item untuk validasi konsistensi pembayaran.
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Tagihan tidak ditemukan" }); return; }
  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) + inv.tax;
  const nextPaid = parsed.data.paidAmount ?? inv.paidAmount;
  if (nextPaid > total) {
    res.status(400).json({ error: "Jumlah dibayar tidak boleh melebihi total tagihan" }); return;
  }
  if (parsed.data.status === "lunas" && nextPaid < total) {
    res.status(400).json({ error: "Status 'Lunas' tetapi jumlah dibayar belum sama dengan total" }); return;
  }
  if (parsed.data.status === "belum_dibayar" && nextPaid > 0) {
    res.status(400).json({ error: "Status 'Belum Dibayar' tetapi sudah ada jumlah dibayar" }); return;
  }

  await db
    .update(invoicesTable)
    .set({
      status: parsed.data.status,
      ...(parsed.data.paidAmount !== undefined ? { paidAmount: parsed.data.paidAmount } : {}),
    })
    .where(eq(invoicesTable.id, id));
  res.json({ ok: true });
});

// ─── DELETE /api/invoices/:id ───────────────────────────────────────────────
router.delete("/invoices/:id", async (req, res) => {
  if (!(await requireAdminOrCs(req, res))) return;
  const id = parseId(req, res);
  if (id === null) return;
  // invoice_items dihapus otomatis via ON DELETE CASCADE
  const deleted = await db.delete(invoicesTable).where(eq(invoicesTable.id, id)).returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Tagihan tidak ditemukan" }); return; }
  res.json({ ok: true });
});

export default router;
