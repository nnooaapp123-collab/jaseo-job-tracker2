import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const writersTable = pgTable("writers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                     // Nama yang dipakai di job
  fullName: text("full_name"),                      // Nama penulis lengkap
  address: text("address"),                         // Alamat
  email: text("email"),                             // Email
  phone: text("phone"),                             // No WA
  bankAccount: text("bank_account"),                // No rekening
  bankName: text("bank_name"),                      // Nama bank
  accountOwner: text("account_owner"),              // Nama pemilik rekening
  joinDate: text("join_date"),                      // Tanggal bergabung (yyyy-MM-dd)
  photoUrl: text("photo_url"),                      // Foto (base64 data URL)
  isAlsoEditor: boolean("is_also_editor").notNull().default(false), // Penulis merangkap editor
  linkedEditorId: integer("linked_editor_id"),                      // ID editor yang terhubung (jika merangkap)
  isActive: boolean("is_active").notNull().default(true),           // Penulis aktif/nonaktif
  lastActiveDate: text("last_active_date"),                         // Tanggal terakhir aktif (yyyy-MM-dd)
  maxDailyWords: integer("max_daily_words"),                        // Kapasitas maks. kata per hari
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWriterSchema = createInsertSchema(writersTable).omit({ id: true, createdAt: true });
export type InsertWriter = z.infer<typeof insertWriterSchema>;
export type Writer = typeof writersTable.$inferSelect;

export const editorsTable = pgTable("editors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false), // Soft delete — data histori tetap
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEditorSchema = createInsertSchema(editorsTable).omit({ id: true, createdAt: true });
export type InsertEditor = z.infer<typeof insertEditorSchema>;
export type Editor = typeof editorsTable.$inferSelect;

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobCode: text("job_code").notNull(),
  website: text("website").notNull(),
  username: text("username"),
  password: text("password"),
  notes: text("notes"),
  versionTool: text("version_tool").notNull().default("smallseotool"),
  wordCount: integer("word_count").notNull().default(0),
  writerId: integer("writer_id").references(() => writersTable.id),
  editorId: integer("editor_id").references(() => editorsTable.id),
  petunjuk: text("petunjuk"),
  revisionNotes: text("revision_notes"),
  isChecked: boolean("is_checked").notNull().default(false),
  jobDate: text("job_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  role: text("role").notNull().default("penulis"), // admin, cs, editor, penulis
  passwordHash: text("password_hash").notNull(),
  plainPassword: text("plain_password"),            // Disimpan untuk keperluan tampil di pengaturan (admin)
  writerId: integer("writer_id").references(() => writersTable.id),
  editorId: integer("editor_id").references(() => editorsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_username_idx").on(t.username)]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Pendapatan lainnya — diisi manual oleh admin per user per bulan
export const additionalIncomeTable = pgTable("additional_income", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  amount: integer("amount").notNull().default(0),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdditionalIncomeSchema = createInsertSchema(additionalIncomeTable).omit({ id: true, createdAt: true });
export type InsertAdditionalIncome = z.infer<typeof insertAdditionalIncomeSchema>;
export type AdditionalIncome = typeof additionalIncomeTable.$inferSelect;

export const monthlySavingsTable = pgTable("monthly_savings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  role: text("role").notNull(),
  amount: integer("amount").notNull().default(100000),
  sourceWords: integer("source_words").notNull().default(0),
  sourceJobs: integer("source_jobs").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("monthly_savings_user_month_idx").on(t.userId, t.year, t.month)]);

export const insertMonthlySavingsSchema = createInsertSchema(monthlySavingsTable).omit({ id: true, createdAt: true });
export type InsertMonthlySavings = z.infer<typeof insertMonthlySavingsSchema>;
export type MonthlySavings = typeof monthlySavingsTable.$inferSelect;

// Pengajuan pencairan tabungan — diajukan penulis, disetujui/ditolak admin
export const savingsWithdrawalsTable = pgTable("savings_withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  requestedAmount: integer("requested_amount").notNull(),
  approvedAmount: integer("approved_amount"),
  reason: text("reason"),
  adminNote: text("admin_note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const insertSavingsWithdrawalSchema = createInsertSchema(savingsWithdrawalsTable).omit({ id: true, requestedAt: true });
export type InsertSavingsWithdrawal = z.infer<typeof insertSavingsWithdrawalSchema>;
export type SavingsWithdrawal = typeof savingsWithdrawalsTable.$inferSelect;

// ─── Pelanggan (Customers) ────────────────────────────────────────────────────
export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  wa: text("wa"),
  email: text("email"),
  firstOrderDate: text("first_order_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

// ─── Order Artikel ────────────────────────────────────────────────────────────
export const articleOrdersTable = pgTable("article_orders", {
  id: serial("id").primaryKey(),
  jobCode: text("job_code").notNull(),
  orderDate: text("order_date").notNull(),
  deadlineDate: text("deadline_date"),
  customerId: integer("customer_id").references(() => customersTable.id),
  articleCount: integer("article_count").notNull().default(1),
  wordCount: integer("word_count").notNull().default(0),
  tool: text("tool"),
  paymentBank: text("payment_bank"),
  price: integer("price").notNull().default(0),
  bonusArticles: integer("bonus_articles").notNull().default(0),
  bonusValue: integer("bonus_value").notNull().default(0),
  notes: text("notes"),
  website: text("website"),
  siteUser: text("site_user"),
  sitePassword: text("site_password"),
  petunjuk: text("petunjuk"),
  isScheduled: boolean("is_scheduled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArticleOrderSchema = createInsertSchema(articleOrdersTable).omit({ id: true, createdAt: true });
export type InsertArticleOrder = z.infer<typeof insertArticleOrderSchema>;
export type ArticleOrder = typeof articleOrdersTable.$inferSelect;

// ─── Keuangan (Financials) ────────────────────────────────────────────────────
export const financialsTable = pgTable("financials", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),           // 'income' | 'expense'
  category: text("category").notNull(),   // lihat FINANCIAL_CATEGORIES
  amount: integer("amount").notNull().default(0),
  description: text("description"),
  date: text("date").notNull(),           // yyyy-MM-dd
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),  // 'order' | 'savings'
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFinancialSchema = createInsertSchema(financialsTable).omit({ id: true, createdAt: true });
export type InsertFinancial = z.infer<typeof insertFinancialSchema>;
export type Financial = typeof financialsTable.$inferSelect;

// ─── Financial Categories (kategori kustom keuangan) ─────────────────────────
export const financialCategoriesTable = pgTable("financial_categories", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),      // 'income' | 'expense'
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  color: text("color").notNull().default("#94a3b8"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FinancialCategory = typeof financialCategoriesTable.$inferSelect;

// ─── Rekening Bank Perusahaan ────────────────────────────────────────────────
export const companyBankAccountsTable = pgTable("company_bank_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                  // e.g. "BCA", "Mandiri"
  accountNumber: text("account_number"),          // nomor rekening (opsional)
  initialBalance: integer("initial_balance").notNull().default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyBankAccount = typeof companyBankAccountsTable.$inferSelect;

export const bankLedgerEntriesTable = pgTable("bank_ledger_entries", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull().references(() => companyBankAccountsTable.id),
  type: text("type").notNull(),                  // 'in' | 'out'
  amount: integer("amount").notNull().default(0),
  description: text("description"),
  entryDate: text("entry_date").notNull(),       // yyyy-MM-dd
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BankLedgerEntry = typeof bankLedgerEntriesTable.$inferSelect;

// ─── App Settings (key-value store) ──────────────────────────────────────────
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Hari Libur ───────────────────────────────────────────────────────────────
export const holidaysTable = pgTable("holidays", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),        // yyyy-MM-dd
  name: text("name").notNull(),                 // Nama hari libur
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHolidaySchema = createInsertSchema(holidaysTable).omit({ id: true, createdAt: true });
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidaysTable.$inferSelect;

export const salaryTransfersTable = pgTable("salary_transfers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull().defaultNow(),
  transferredBy: integer("transferred_by").references(() => usersTable.id).notNull(),
  notes: text("notes"),
}, (t) => ({
  uniq: uniqueIndex("salary_transfers_user_year_month_idx").on(t.userId, t.year, t.month),
}));

export const insertSalaryTransferSchema = createInsertSchema(salaryTransfersTable).omit({ id: true, transferredAt: true });
export type InsertSalaryTransfer = z.infer<typeof insertSalaryTransferSchema>;
export type SalaryTransfer = typeof salaryTransfersTable.$inferSelect;

// ─── Invoice / Tagihan ───────────────────────────────────────────────────────
export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),                   // e.g. "0906202620"
  invoiceDate: text("invoice_date").notNull(),                       // yyyy-MM-dd
  dueDate: text("due_date"),                                         // yyyy-MM-dd (batas akhir bayar)
  customerId: integer("customer_id").references(() => customersTable.id), // opsional (bisa manual)
  customerName: text("customer_name").notNull(),                     // nama pelanggan (dari daftar / manual)
  status: text("status").notNull().default("belum_dibayar"),        // belum_dibayar | lunas | sebagian
  tax: integer("tax").notNull().default(0),                          // pajak (input manual)
  paidAmount: integer("paid_amount").notNull().default(0),          // sudah dibayar
  notes: text("notes"),                                              // catatan tambahan
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("invoices_invoice_number_idx").on(t.invoiceNumber)]);

export type Invoice = typeof invoicesTable.$inferSelect;

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),                        // jenis tagihan
  quantity: integer("quantity").notNull().default(1),               // banyaknya
  unitPrice: integer("unit_price").notNull().default(0),            // harga satuan
  sortOrder: integer("sort_order").notNull().default(0),
});

export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
