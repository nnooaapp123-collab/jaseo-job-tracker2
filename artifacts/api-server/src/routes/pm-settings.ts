import { Router, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

const IDENTITY_KEYS = [
  "site_title",
  "site_tagline",
  "site_description",
  "footer_brand",
  "footer_text",
  "footer_note",
  "logo_key",
  "favicon_key",
] as const;

function getPmUserId(req: Request): number | undefined {
  return (req.session as unknown as Record<string, unknown>).pmUserId as number | undefined;
}

async function requirePmAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getPmUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { rows } = await pool.query(
    "SELECT role FROM proposal_users WHERE id = $1",
    [userId],
  );
  if (!rows[0] || rows[0].role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

async function requirePmUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!getPmUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/pm/admin/settings", requirePmAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM pm_settings ORDER BY key");
    const settings = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value ?? ""]));
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "GET /pm/admin/settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/pm/admin/settings", requirePmAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, string>;
    const allowed = [
      "payment_mode",
      "midtrans_environment",
      "midtrans_client_key",
      "midtrans_server_key",
      ...IDENTITY_KEYS,
    ];
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.includes(key)) continue;
      await pool.query(
        `INSERT INTO pm_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value],
      );
    }
    logger.info({ userId: getPmUserId(req) }, "ProposalHub settings updated");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "PATCH /pm/admin/settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUBLIC — identitas situs (judul, deskripsi, footer, dll). Tidak butuh auth.
router.get("/pm/identity", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value, updated_at FROM pm_settings WHERE key = ANY($1::text[])`,
      [IDENTITY_KEYS as unknown as string[]],
    );
    const map = new Map(rows.map((r: { key: string; value: string | null; updated_at: Date }) => [r.key, r]));
    const get = (k: string): string => (map.get(k)?.value ?? "") as string;
    const updatedAt = (k: string): number => {
      const r = map.get(k);
      return r?.updated_at ? new Date(r.updated_at).getTime() : 0;
    };
    const logoKey = get("logo_key");
    const faviconKey = get("favicon_key");
    res.json({
      siteTitle: get("site_title") || "ProposalHub",
      siteTagline: get("site_tagline"),
      siteDescription: get("site_description"),
      footerBrand: get("footer_brand") || get("site_title") || "ProposalHub",
      footerText: get("footer_text"),
      footerNote: get("footer_note"),
      logoUrl: logoKey ? `/api/pm/identity/logo?v=${updatedAt("logo_key")}` : null,
      faviconUrl: faviconKey ? `/api/pm/identity/favicon?v=${updatedAt("favicon_key")}` : null,
    });
  } catch (err) {
    logger.error({ err }, "GET /pm/identity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function serveIdentityAsset(req: Request, res: Response, key: "logo_key" | "favicon_key"): Promise<void> {
  try {
    const { rows } = await pool.query("SELECT value FROM pm_settings WHERE key = $1", [key]);
    const objectKey = rows[0]?.value as string | undefined;
    if (!objectKey) { res.status(404).json({ error: "Belum diatur" }); return; }
    const file = await objectStorageService.getObjectEntityFile(objectKey);
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, hKey) => res.setHeader(hKey, value));
    res.setHeader("Cache-Control", "public, max-age=300");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    req.log.error({ err }, `GET /pm/identity/${key} error`);
    res.status(404).json({ error: "Not found" });
  }
}

router.get("/pm/identity/logo", (req, res) => { void serveIdentityAsset(req, res, "logo_key"); });
router.get("/pm/identity/favicon", (req, res) => { void serveIdentityAsset(req, res, "favicon_key"); });

router.get("/pm/payment-mode", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM pm_settings WHERE key = 'payment_mode'",
    );
    res.json({ payment_mode: rows[0]?.value ?? "direct" });
  } catch {
    res.json({ payment_mode: "direct" });
  }
});

router.get("/pm/wallet/balance", requirePmUser, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      "SELECT balance FROM proposal_users WHERE id = $1",
      [getPmUserId(req)],
    );
    res.json({ balance: rows[0]?.balance ?? 0 });
  } catch (err) {
    req.log.error({ err }, "GET /pm/wallet/balance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pm/wallet/deposits", requirePmUser, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, amount, payment_id, status, note, created_at
       FROM pm_deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [getPmUserId(req)],
    );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET /pm/wallet/deposits error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pm/wallet/deposit", requirePmUser, async (req: Request, res: Response) => {
  try {
    const { amount, paymentMode } = req.body as { amount: number; paymentMode?: string };
    if (!amount || Number(amount) < 10000) {
      res.status(400).json({ error: "Minimal deposit Rp10.000" });
      return;
    }
    const intAmount = Math.floor(Number(amount));

    const { rows: settingRows } = await pool.query(
      "SELECT value FROM pm_settings WHERE key = 'midtrans_environment'",
    );
    const env = settingRows[0]?.value ?? "sandbox";

    await pool.query(
      `INSERT INTO pm_deposits (user_id, amount, status, note) VALUES ($1, $2, 'completed', $3)`,
      [getPmUserId(req), intAmount, env === "sandbox" ? "Deposit (Sandbox/Demo)" : "Deposit via Midtrans"],
    );
    await pool.query(
      `UPDATE proposal_users SET balance = balance + $1 WHERE id = $2`,
      [intAmount, getPmUserId(req)],
    );

    const { rows } = await pool.query(
      "SELECT balance FROM proposal_users WHERE id = $1",
      [getPmUserId(req)],
    );
    res.json({ ok: true, balance: rows[0]?.balance ?? 0 });
  } catch (err) {
    req.log.error({ err }, "POST /pm/wallet/deposit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/pm/wallet/pay", requirePmUser, async (req: Request, res: Response) => {
  try {
    const { proposalId, walletAmount } = req.body as { proposalId: number; walletAmount: number };
    const userId = getPmUserId(req)!;

    const { rows: propRows } = await pool.query(
      "SELECT * FROM proposals WHERE id = $1 AND status = 'active'",
      [proposalId],
    );
    if (!propRows[0]) {
      res.status(404).json({ error: "Proposal tidak ditemukan atau tidak aktif" });
      return;
    }
    const price: number = Number(propRows[0].price);
    const useWallet = Math.min(Math.floor(Number(walletAmount) || 0), price);
    const remaining = price - useWallet;

    const { rows: userRows } = await pool.query(
      "SELECT balance FROM proposal_users WHERE id = $1",
      [userId],
    );
    const balance: number = Number(userRows[0]?.balance ?? 0);
    if (balance < useWallet) {
      res.status(400).json({ error: "Saldo tidak mencukupi" });
      return;
    }

    const sellerShare = Math.floor(price * 0.65);
    const platformShare = price - sellerShare;
    const paymentId = `wallet-${Date.now()}-${userId}`;

    const { rows: txRows } = await pool.query(
      `INSERT INTO proposal_transactions
       (buyer_id, proposal_id, amount, seller_share, platform_share, payment_id, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, proposalId, price, sellerShare, platformShare, paymentId, remaining === 0 ? "paid" : "pending"],
    );
    const txId: number = Number(txRows[0].id);

    if (useWallet > 0) {
      await pool.query(
        "UPDATE proposal_users SET balance = balance - $1 WHERE id = $2",
        [useWallet, userId],
      );
      await pool.query(
        "INSERT INTO pm_deposits (user_id, amount, status, note) VALUES ($1, $2, 'completed', $3)",
        [userId, -useWallet, `Pembayaran proposal #${proposalId} (saldo)`],
      );
    }

    if (remaining === 0) {
      await pool.query(
        "UPDATE proposal_transactions SET paid_at = NOW() WHERE id = $1",
        [txId],
      );
      await pool.query(
        "UPDATE proposals SET total_sales = total_sales + 1 WHERE id = $1",
        [proposalId],
      );
    }

    res.json({ txId, paymentId, remaining, paid: remaining === 0 });
  } catch (err) {
    req.log.error({ err }, "POST /pm/wallet/pay error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/pm/profile/bank", requirePmUser, async (req: Request, res: Response) => {
  const userId = getPmUserId(req)!;
  const { bankName, bankAccount, accountOwner } = req.body as {
    bankName?: string;
    bankAccount?: string;
    accountOwner?: string;
  };
  try {
    await pool.query(
      "UPDATE proposal_users SET bank_name = $1, bank_account = $2, account_owner = $3 WHERE id = $4",
      [bankName ?? null, bankAccount ?? null, accountOwner ?? null, userId],
    );
    const { rows } = await pool.query(
      "SELECT id, name, email, role, balance, bank_name AS \"bankName\", bank_account AS \"bankAccount\", account_owner AS \"accountOwner\" FROM proposal_users WHERE id = $1",
      [userId],
    );
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /pm/profile/bank error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
