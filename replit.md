# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Features (Jaseo Job Tracker)
- Dashboard: job management per date, writer/editor assignment, revision workflow
- Pelanggan: customer data (name, WA, email, first order date, notes) — admin/CS only
- Order Artikel: article order tracking (job code, date, customer, articles, words, tool, bank, price, bonus) — admin/CS only
- Pendapatan, Laporan, Profil, Tabungan pages for writers/editors
- Role-based access: admin, cs, editor, penulis
- Revision notifications: writer banner (red) + editor banner (amber)
- Cross-date pending revision panel

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: express-session + bcryptjs + connect-pg-simple (cookie-based sessions)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed:users` — seed initial 8 users (idempotent)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

### Jaseo Job Tracker (`artifacts/jaseo-job-tracker`)
- React + Vite frontend, preview path: `/`
- Daily job assignment dashboard for Jaseo Konten Media content writing agency
- Features: login/logout, job table (inline editable), date filter, summary stats (including "Selesai Diedit"), per-writer and per-editor word count recap, settings for managing writers/editors, profile password changes, reports, salary slip, savings history
- Auth: session-based via AuthContext (fetches GET /api/auth/me on mount)
- Role-based access: Admin > CS > Editor > Penulis. Admin/CS can add jobs and manage team. Editor and penulis+editor can set the Editor column on completed jobs. Penulis can see/check their own jobs and view progress reports.
- Settings writer form includes profile fields: full name, address, email, phone, bank name, bank account, account owner, join date, and photo.
- Writer deletion in Settings has two modes: temporary removal via deactivate/reactivate, and permanent deletion via `/api/writers/:id/permanent`.
- Editors are now intended to come from writers with dual-role status only; standalone editor creation is no longer exposed in Settings. Delete editor button removed.
- Admin can assign/revoke CS role to a penulis user via toggle in WriterManager (PATCH /api/users/:id/assign-cs). CS role badge shown on writer card.
- CS profile data stored in writersTable (CS comes from penulis). All non-admin roles can now edit their own profile if they have a writerId.
- Profile "Cek Tabungan" opens `/tabungan`, which reads from monthly_savings table.
- Tabungan page: Admin can bulk-import historical savings from Excel (POST /api/savings/import). Any user can request savings withdrawal (POST /api/savings/withdraw). Admin can approve (full or partial) or reject via PATCH /api/savings/withdrawals/:id.
- Tabungan page was redesigned to a ledger view (Bulan, Tahun, Masuk, Keluar, Saldo, Alasan Ambil) combining monthly deposits and approved withdrawals with running balance.
- Tabungan link card moved from profil.tsx to pendapatan.tsx (non-admin only).
- Revision workflow: jobs have a `revision_notes` column (text). Editor can write catatan revisi per job (amber highlighted cell in dashboard). Dashboard shows "Butuh Revisi" summary card, per-writer revision count in Rekap Penulis, per-editor revision count in Rekap Editor.
- CS writers excluded from all penulis dropdowns in the job assignment dashboard.
- Dual-role writers show "(+ Editor)" label in the Rekap Penulis section.
- Tagihan (Invoice) page (`/tagihan`, admin/cs only): list invoices, create/edit (customer from list OR manual name, line items, manual tax, manual paid amount), delete, and print-to-PDF view matching the sample layout (TAGIHAN header, items table, TOTAL/PAJAK/SUDAH DIBAYAR/SISA, CATATAN PEMBAYARAN, footer). Invoice number format `DDMMYYYY + 2-digit sequence`, editable, with DB unique constraint (returns 409 on duplicate). Payment status (belum_dibayar/sebagian/lunas) is auto-derived from paid amount vs total — no manual status field. Settings dialog edits company name, payment notes, and footer (stored in app_settings). "Ambil dari Order" prefills line items from a customer's article orders.

### API Server (`artifacts/api-server`)
- Express 5 backend, serves at `/api`
- Routes: /api/jobs, /api/writers, /api/editors, /api/stats/daily, /api/stats/editor-daily, /api/stats/summary, /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/password
- Salary routes: /api/salary/monthly (penulis/editor/admin), /api/salary/cs-monthly (CS/admin), /api/salary/additional (GET/POST/DELETE)
- Savings routes: /api/savings/history (self/admin target user), /api/savings/sync (admin sync all users)
- Report routes: /api/reports/monthly-all, /api/reports/revision-summary (editor/admin, returns jobs with revision notes for a given year+month)
- Invoice routes (admin/cs): GET/PUT /api/invoice-settings, GET /api/invoices/next-number, GET /api/invoices, GET /api/invoices/:id, POST /api/invoices, PATCH /api/invoices/:id, PATCH /api/invoices/:id/status, DELETE /api/invoices/:id. Raw routes + inline zod (not OpenAPI codegen). POST/PATCH are transactional; financial consistency (paid ≤ total, status matches paid) enforced server-side; unique invoice_number → 409.
- /api/users — list all users (admin only)
- /api/writers includes isCS field (derived from usersTable CS role link)
- Job rollover scheduler runs at 16.00 WIB using Asia/Jakarta timezone; unfinished jobs move to the active WIB date (after 16.00 WIB this is the next day).
- Auto-seed creates/syncs admin, CS, and writer users only. Dual-role writer accounts receive their linked editorId; standalone editor users are no longer auto-created.

## Database Schema (lib/db/src/schema/jobs.ts)
- `writers` — penulis artikel, including bankName/accountOwner, `isAlsoEditor`, `linkedEditorId` for dual-role writers, and `maxDailyWords` (kapasitas kata per hari untuk validasi jadwal)
- `editors` — editor artikel
- `jobs` — job harian: kode job, website, user, password, notes, versi tool, jumlah kata, penulis, editor, ceklist selesai, tanggal, revision_notes (catatan revisi dari editor)
- `users` — akun login: username, passwordHash (bcrypt), role (admin/cs/editor/penulis), writerId, editorId
- `additional_income` — pendapatan lainnya (manual admin entries): userId, year, month, amount, description
- `monthly_savings` — tabungan bulanan final per user: userId, year, month, role, amount, sourceWords, sourceJobs, paidAt, notes

## Salary and Savings Rules
- **Penulis**: tiered formula (5k–115k kata), pulsa Rp70k ≥48.100 kata, tabungan Rp100k ≥70.000 kata (separate/not in total), bonus 5% ≥80.000 kata
- **Editor**: 4.7 per kata, pulsa/tabungan/bonus unconditional
- **CS**: sum of all writer gaji + all editor gaji + 5% of top earner; pulsa/tabungan unconditional
- **Dual-role** (penulis+editor): uses editor rules (unconditional) for pulsa/tabungan/bonus
- Monthly savings are generated into `monthly_savings` only for closed Jakarta months. Writers need ≥70.000 completed words; editor, dual-role, and CS savings are generated for active closed months.

## Auth Details
- Session stored in PostgreSQL via connect-pg-simple (`express-session`)
- Secret: SESSION_SECRET env var (fallback: "jaseo-secret-key")
- Cookie: httpOnly, 7-day maxAge, credentials: "include" on all fetch calls
- Default password: `jaseo12`
- Users: admin + akun penulis per writer (username = nama.lowercase). CS berasal dari penulis yang diberi peran CS oleh admin.
- `/api/auth/me` derives `editorId` for penulis+editor from the linked writer record, so older dual-role accounts can edit the dashboard Editor column without requiring manual account sync.

## Notes
- lib/api-zod/src/index.ts only exports from ./generated/api (not ./generated/types) to avoid duplicate export conflicts from Orval codegen.
- custom-fetch.ts has `credentials: "include"` for all requests.
- Development database check on 2026-04-22 found no editor/user record matching Tari.
- Production database check on 2026-04-22 found multiple Tari editor rows already soft-deleted (`is_deleted=true`) plus one active `tari` penulis user/writer record.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
