import bcrypt from "bcryptjs";
import { pool, db, proposalUsers, proposalCategories } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SEED_CATEGORIES = [
  { name: "Bisnis & Startup", slug: "bisnis-startup" },
  { name: "Teknologi", slug: "teknologi" },
  { name: "Pendidikan", slug: "pendidikan" },
  { name: "Kesehatan", slug: "kesehatan" },
  { name: "Kreatif & Seni", slug: "kreatif-seni" },
  { name: "Lingkungan", slug: "lingkungan" },
  { name: "Sosial & NGO", slug: "sosial-ngo" },
  { name: "Properti", slug: "properti" },
  { name: "Kuliner & F&B", slug: "kuliner-fnb" },
  { name: "Lainnya", slug: "lainnya" },
];

const DEFAULT_SETTINGS = [
  { key: "payment_mode", value: "direct" },
  { key: "midtrans_environment", value: "sandbox" },
  { key: "midtrans_client_key", value: "" },
  { key: "midtrans_server_key", value: "" },
  { key: "site_title", value: "ProposalHub" },
  { key: "site_tagline", value: "Marketplace Proposal Bisnis Indonesia" },
  { key: "site_description", value: "ProposalHub: Marketplace proposal bisnis terpercaya. Temukan, beli, dan jual proposal bisnis berkualitas tinggi." },
  { key: "footer_brand", value: "ProposalHub" },
  { key: "footer_text", value: "Marketplace proposal bisnis terpercaya Indonesia" },
  { key: "footer_note", value: "Platform mengambil 35% per transaksi. Seller mendapat 65%." },
  { key: "logo_key", value: "" },
  { key: "favicon_key", value: "" },
];

export async function setupProposalMarketplace(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proposal_users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'buyer',
        balance INTEGER NOT NULL DEFAULT 0,
        bank_name TEXT,
        bank_account TEXT,
        account_owner TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS proposal_users_email_idx ON proposal_users(email);

      ALTER TABLE proposal_users ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS proposal_categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS proposal_categories_slug_idx ON proposal_categories(slug);

      CREATE TABLE IF NOT EXISTS proposals (
        id SERIAL PRIMARY KEY,
        seller_id INTEGER NOT NULL REFERENCES proposal_users(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category_id INTEGER REFERENCES proposal_categories(id),
        price INTEGER NOT NULL,
        file_key TEXT,
        preview_image_key TEXT,
        preview_image_key_2 TEXT,
        preview_image_key_3 TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        admin_note TEXT,
        total_sales INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proposal_transactions (
        id SERIAL PRIMARY KEY,
        buyer_id INTEGER NOT NULL REFERENCES proposal_users(id),
        proposal_id INTEGER NOT NULL REFERENCES proposals(id),
        amount INTEGER NOT NULL,
        seller_share INTEGER NOT NULL,
        platform_share INTEGER NOT NULL,
        payment_id TEXT,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMPTZ,
        download_token TEXT,
        download_token_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proposal_payouts (
        id SERIAL PRIMARY KEY,
        seller_id INTEGER NOT NULL REFERENCES proposal_users(id),
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );

      ALTER TABLE proposals ADD COLUMN IF NOT EXISTS preview_image_key_2 TEXT;
      ALTER TABLE proposals ADD COLUMN IF NOT EXISTS preview_image_key_3 TEXT;
      ALTER TABLE proposal_payouts ADD COLUMN IF NOT EXISTS transfer_proof_key TEXT;
      ALTER TABLE proposal_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;
      ALTER TABLE proposal_transactions ADD COLUMN IF NOT EXISTS payment_fee INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS pm_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS pm_settings_key_idx ON pm_settings(key);

      CREATE TABLE IF NOT EXISTS pm_deposits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES proposal_users(id),
        amount INTEGER NOT NULL,
        payment_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const cat of SEED_CATEGORIES) {
      await db.insert(proposalCategories).values(cat).onConflictDoNothing();
    }

    for (const setting of DEFAULT_SETTINGS) {
      await pool.query(
        `INSERT INTO pm_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [setting.key, setting.value],
      );
    }

    const [existingAdmin] = await db
      .select()
      .from(proposalUsers)
      .where(eq(proposalUsers.email, "admin@proposalhub.id"))
      .limit(1);

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash("admin123", 10);
      await db.insert(proposalUsers).values({
        name: "Admin ProposalHub",
        email: "admin@proposalhub.id",
        passwordHash,
        role: "admin",
      });
      logger.info("ProposalHub: akun admin dibuat (admin@proposalhub.id)");
    }

    logger.info("ProposalHub: setup database selesai");
  } catch (err) {
    logger.error({ err }, "ProposalHub: setup database gagal");
  }
}
