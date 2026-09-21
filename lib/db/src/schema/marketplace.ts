import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const proposalUsers = pgTable("proposal_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("buyer"),
  balance: integer("balance").notNull().default(0),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  accountOwner: text("account_owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("proposal_users_email_idx").on(t.email)]);

export const insertProposalUserSchema = createInsertSchema(proposalUsers).omit({
  id: true,
  createdAt: true,
});
export type InsertProposalUser = z.infer<typeof insertProposalUserSchema>;
export type ProposalUser = typeof proposalUsers.$inferSelect;

export const proposalCategories = pgTable("proposal_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
}, (t) => [uniqueIndex("proposal_categories_slug_idx").on(t.slug)]);

export const insertProposalCategorySchema = createInsertSchema(proposalCategories).omit({ id: true });
export type InsertProposalCategory = z.infer<typeof insertProposalCategorySchema>;
export type ProposalCategory = typeof proposalCategories.$inferSelect;

export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id"),
  price: integer("price").notNull(),
  fileKey: text("file_key"),
  previewImageKey: text("preview_image_key"),
  previewImageKey2: text("preview_image_key_2"),
  previewImageKey3: text("preview_image_key_3"),
  status: text("status").notNull().default("draft"),
  adminNote: text("admin_note"),
  totalSales: integer("total_sales").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  totalSales: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;

export const proposalTransactions = pgTable("proposal_transactions", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  proposalId: integer("proposal_id").notNull(),
  amount: integer("amount").notNull(),
  sellerShare: integer("seller_share").notNull(),
  platformShare: integer("platform_share").notNull(),
  paymentMethod: text("payment_method"),
  paymentFee: integer("payment_fee").notNull().default(0),
  paymentId: text("payment_id"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  downloadToken: text("download_token"),
  downloadTokenExpiresAt: timestamp("download_token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProposalTransaction = typeof proposalTransactions.$inferSelect;

export const proposalPayouts = pgTable("proposal_payouts", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  transferProofKey: text("transfer_proof_key"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type ProposalPayout = typeof proposalPayouts.$inferSelect;

export const pmSettings = pgTable("pm_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pm_settings_key_idx").on(t.key)]);

export type PmSetting = typeof pmSettings.$inferSelect;

export const pmDeposits = pgTable("pm_deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  paymentId: text("payment_id"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PmDeposit = typeof pmDeposits.$inferSelect;
