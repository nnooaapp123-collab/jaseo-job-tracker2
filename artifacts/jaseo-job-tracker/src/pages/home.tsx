import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon, Loader2, Plus, Trash2, Lock,
  CheckCheck, FileDown, Filter, FileUp, AlertTriangle, Bell, X,
  UserRound, Mail, MessageCircle, CalendarDays,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { JobDetailModal } from "@/components/job-detail-modal";
import { exportJobsToExcel } from "@/lib/export-excel";

import {
  useListJobs, getListJobsQueryKey,
  useCreateJob, useUpdateJob, useDeleteJob,
  useGetDailyStats, getGetDailyStatsQueryKey,
  useGetEditorDailyStats, getGetEditorDailyStatsQueryKey,
  useGetSummaryStats, getGetSummaryStatsQueryKey,
  useListWriters, getListWritersQueryKey,
  useListEditors, getListEditorsQueryKey,
  useBatchCreateJobs,
} from "@workspace/api-client-react";

// ─── InlineInput: simpan hanya saat blur (bukan setiap keystroke) ─────────────
function InlineInput({
  value, onSave, disabled, className, type, placeholder, ...rest
}: {
  value: string | number;
  onSave: (v: string) => void;
  disabled?: boolean;
  className?: string;
  type?: string;
  placeholder?: string;
  [key: string]: unknown;
}) {
  const [local, setLocal] = useState(String(value ?? ""));
  const [focused, setFocused] = useState(false);

  // Sinkronkan dari server hanya saat tidak sedang diedit
  useEffect(() => {
    if (!focused) setLocal(String(value ?? ""));
  }, [value, focused]);

  return (
    <Input
      {...rest as React.InputHTMLAttributes<HTMLInputElement>}
      type={type}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const current = String(value ?? "");
        if (current !== local) onSave(local);
      }}
    />
  );
}

// ─── CustomerContactPopover — kontak pelanggan untuk editor ───────────────────
function CustomerContactPopover({ jobCode }: { jobCode: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<{ name: string | null; email: string | null; wa: string | null } | null>(null);

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && contact === null) {
      setLoading(true);
      try {
        const res = await fetch(`/api/jobs/customer-contact/${encodeURIComponent(jobCode)}`, { credentials: "include" });
        const json = await res.json();
        setContact(json);
      } catch {
        setContact({ name: null, email: null, wa: null });
      } finally {
        setLoading(false);
      }
    }
  };

  const waNumber = contact?.wa ? contact.wa.replace(/\D/g, "") : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          title="Lihat kontak pelanggan"
        >
          <UserRound className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2" align="end">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat kontak...
          </div>
        ) : !contact?.name ? (
          <p className="text-sm text-muted-foreground italic">Tidak ada data pelanggan untuk job ini.</p>
        ) : (
          <>
            <p className="font-semibold text-sm leading-snug">{contact.name}</p>
            <div className="space-y-1.5">
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline break-all"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {contact.email}
                </a>
              ) : null}
              {waNumber ? (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                  {contact.wa}
                </a>
              ) : null}
              {!contact.email && !contact.wa && (
                <p className="text-xs text-muted-foreground italic">Tidak ada kontak tersimpan.</p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const [filterWriterId, setFilterWriterId] = useState<string>("all");
  const [detailJobId, setDetailJobId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentUser } = useAuth();

  // Auto-filter ke penulis yang login
  useEffect(() => {
    if (currentUser?.role === "penulis" && currentUser.writerId) {
      setFilterWriterId(currentUser.writerId.toString());
    }
  }, [currentUser?.role, currentUser?.writerId]);

  const { data: jobs = [], isLoading: isLoadingJobs } = useListJobs(
    { date: dateStr },
    { query: { queryKey: getListJobsQueryKey({ date: dateStr }) } }
  );

  const filteredJobs = filterWriterId === "all"
    ? jobs
    : jobs.filter(j => j.writerId?.toString() === filterWriterId);

  // Penulis yang masih punya job revisi belum diselesaikan (revisionNotes terisi & belum diceklis ulang).
  // Selama ada revisi yang belum dibereskan, kolom "Selesai" job lain milik penulis itu dikunci.
  const writersWithPendingRevision = useMemo(() => {
    const set = new Set<number>();
    for (const j of jobs) {
      const notes = (j as unknown as { revisionNotes?: string | null }).revisionNotes;
      if (j.writerId != null && notes != null && notes.trim() !== "" && !j.isChecked) {
        set.add(j.writerId);
      }
    }
    return set;
  }, [jobs]);

  const selectedDetailJob = detailJobId !== null ? (jobs.find(j => j.id === detailJobId) ?? null) : null;

  const { data: dailyStats = [], isLoading: isLoadingDaily } = useGetDailyStats(
    { date: dateStr },
    { query: { queryKey: getGetDailyStatsQueryKey({ date: dateStr }) } }
  );
  const { data: editorStats = [], isLoading: isLoadingEditorStats } = useGetEditorDailyStats(
    { date: dateStr },
    { query: { queryKey: getGetEditorDailyStatsQueryKey({ date: dateStr }) } }
  );
  const { data: summaryStats, isLoading: isLoadingSummary } = useGetSummaryStats(
    { date: dateStr },
    { query: { queryKey: getGetSummaryStatsQueryKey({ date: dateStr }) } }
  );

  const { data: writers = [] } = useListWriters({ query: { queryKey: getListWritersQueryKey() } });
  const { data: editors = [] } = useListEditors({ query: { queryKey: getListEditorsQueryKey() } });

  // Revisi pending lintas semua tanggal
  const PENDING_REVISIONS_KEY = ["pending-revisions"];
  const REVISION_RECHECKED_KEY = ["revision-rechecked"];
  type PendingRevisionJob = {
    id: number; jobCode: string; website: string; wordCount: number;
    writerId: number | null; writerName: string | null;
    editorId: number | null; editorName: string | null;
    revisionNotes: string | null; isChecked: boolean; jobDate: string;
  };
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: pendingRevisions = [] } = useQuery<PendingRevisionJob[]>({
    queryKey: PENDING_REVISIONS_KEY,
    queryFn: async () => {
      const res = await fetch(`${base}/api/jobs/pending-revisions`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal mengambil revisi pending");
      return res.json();
    },
  });
  // Artikel yang sudah diceklist ulang penulis setelah diminta revisi — perlu dicek editor
  const { data: revisionRechecked = [] } = useQuery<PendingRevisionJob[]>({
    queryKey: REVISION_RECHECKED_KEY,
    queryFn: async () => {
      const res = await fetch(`${base}/api/jobs/revision-rechecked`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal mengambil data rechecked");
      return res.json();
    },
  });
  // Dismiss state — reset tiap refresh
  const [dismissedPenulis, setDismissedPenulis] = useState(false);
  const [dismissedEditor, setDismissedEditor] = useState(false);
  // Exclude CS-role writers from penulis dropdowns
  const activeWriters = writers
    .filter(w => w.isActive && !(w as unknown as { isCS?: boolean }).isCS)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  // Filter dropdown: hanya penulis yang punya job di tanggal terpilih (excl. CS)
  const writerIdsInJobs = new Set(jobs.map(j => j.writerId).filter(Boolean) as number[]);
  const writersWithJobs = activeWriters.filter(w => writerIdsInJobs.has(w.id));

  // Build a map for quick writer lookup (for dual-role label and isCS)
  const writerById = new Map(writers.map(w => [w.id, w]));

  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const batchCreateJobs = useBatchCreateJobs();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // ─── Pindah Tanggal ─────────────────────────────────────────────────
  const [moveDateJob, setMoveDateJob] = useState<{ id: number; jobCode: string; currentDate: string } | null>(null);
  const [moveDateValue, setMoveDateValue] = useState("");

  // ─── Excel Import State ─────────────────────────────────────────────
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPetunjukImportOpen, setIsPetunjukImportOpen] = useState(false);
  const [petunjukRows, setPetunjukRows] = useState<Array<{ jobCode: string; petunjuk: string }>>([]);
  const [petunjukImportErrors, setPetunjukImportErrors] = useState<string[]>([]);
  const [petunjukImporting, setPetunjukImporting] = useState(false);
  const petunjukFileRef = useRef<HTMLInputElement>(null);

  const [importRows, setImportRows] = useState<Array<{
    jobCode: string; website: string; username: string; password: string;
    notes: string; versionTool: string; wordCount: number;
    writerName: string; writerId: number | null; jobDate: string;
    _writerFound: boolean;
  }>>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  // ─── Template Excel Download ─────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const headers = ["Tanggal", "Kode Job", "Website", "Username", "Password", "Notes", "Versi Tool", "Kata", "Penulis"];
    const hints   = [
      "Tanggal job format YYYY-MM-DD (contoh: 2025-04-20)",
      "Kode unik job (contoh: JS-001)",
      "URL website klien (contoh: https://example.com)",
      "Username login website",
      "Password login website",
      "Catatan tambahan (opsional)",
      "Versi AI tool (contoh: GPT-4, Gemini)",
      "Jumlah kata artikel (angka)",
      "Nama penulis sesuai data (contoh: Budi Santoso)",
    ];
    const example = [
      format(new Date(), "yyyy-MM-dd"),
      "JS-001", "https://example.com", "admin@example.com", "password123",
      "Artikel SEO tentang teknologi", "GPT-4o", "1500",
      "Budi Santoso",
    ];

    const wsData = [headers, hints, example];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Atur lebar kolom
    ws["!cols"] = headers.map(() => ({ wch: 28 }));

    XLSX.utils.book_append_sheet(wb, ws, "Template Job");
    XLSX.writeFile(wb, `template-import-job.xlsx`);
  };

  const WRITER_COL_ALIASES: Record<string, string> = {
    "kode job": "jobCode", "kode": "jobCode", "job code": "jobCode", "job_code": "jobCode", "code": "jobCode",
    "website": "website", "web": "website", "situs": "website", "domain": "website",
    "username": "username", "user": "username", "user name": "username",
    "password": "password", "pass": "password",
    "notes": "notes", "catatan": "notes", "keterangan": "notes", "note": "notes",
    "tool": "versionTool", "tools": "versionTool", "versi": "versionTool", "version": "versionTool", "versi tool": "versionTool",
    "kata": "wordCount", "word": "wordCount", "words": "wordCount", "jumlah kata": "wordCount", "word count": "wordCount", "wordcount": "wordCount",
    "penulis": "writerName", "writer": "writerName", "author": "writerName", "nama penulis": "writerName",
    "tanggal": "jobDate", "date": "jobDate", "tanggal job": "jobDate", "job date": "jobDate",
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (raw.length === 0) { setImportErrors(["File Excel kosong atau tidak ada data di sheet pertama."]); return; }

      // Map column headers
      const firstRow = raw[0];
      const colMap: Record<string, string> = {};
      for (const key of Object.keys(firstRow)) {
        const normalized = key.toLowerCase().trim();
        if (WRITER_COL_ALIASES[normalized]) {
          colMap[key] = WRITER_COL_ALIASES[normalized];
        }
      }

      const errors: string[] = [];
      if (!Object.values(colMap).includes("jobCode")) errors.push("Kolom 'Kode Job' tidak ditemukan.");
      if (!Object.values(colMap).includes("website")) errors.push("Kolom 'Website' tidak ditemukan.");

      const rows = raw.map((r, i) => {
        const get = (field: string) => {
          const col = Object.entries(colMap).find(([, v]) => v === field)?.[0];
          return col ? String(r[col] ?? "").trim() : "";
        };
        const writerNameRaw = get("writerName");
        const matched = writers.find(w => w.name.toLowerCase() === writerNameRaw.toLowerCase() || (w.fullName ?? "").toLowerCase() === writerNameRaw.toLowerCase());
        const jobDateRaw = get("jobDate") || dateStr;
        // Parse Excel numeric date if needed
        let jobDate = jobDateRaw;
        if (/^\d{5}$/.test(jobDateRaw)) {
          const d = XLSX.SSF.parse_date_code(Number(jobDateRaw));
          jobDate = `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
        }

        return {
          jobCode: get("jobCode") || `ROW-${i + 2}`,
          website: get("website"),
          username: get("username"),
          password: get("password"),
          notes: get("notes"),
          versionTool: get("versionTool") || "",
          wordCount: parseInt(get("wordCount")) || 0,
          writerName: writerNameRaw,
          writerId: matched ? matched.id : null,
          jobDate,
          _writerFound: !writerNameRaw || !!matched,
        };
      }).filter(r => r.website); // skip rows tanpa website

      if (rows.length === 0) errors.push("Tidak ada baris valid ditemukan (pastikan kolom 'Website' terisi).");
      setImportErrors(errors);
      setImportRows(rows);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleImportSubmit = () => {
    if (importRows.length === 0) return;
    batchCreateJobs.mutate({
      data: {
        jobs: importRows.map(r => ({
          jobCode: r.jobCode,
          website: r.website,
          jobDate: r.jobDate || dateStr,
          username: r.username || null,
          password: r.password || null,
          notes: r.notes || null,
          versionTool: r.versionTool || "",
          wordCount: r.wordCount,
          writerId: r.writerId,
        })),
      }
    }, {
      onSuccess: (data) => {
        toast({ title: `${data.count} job berhasil diimpor` });
        invalidateAll(dateStr);
        setIsImportOpen(false);
        setImportRows([]);
        setImportErrors([]);
      },
      onError: () => toast({ title: "Gagal mengimpor job", variant: "destructive" }),
    });
  };
  // ─── Petunjuk Import Handlers ───────────────────────────────────────
  const handleDownloadPetunjukTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = ["Kode Job", "Petunjuk"];
    const hints   = [
      "Kode job yang sudah ada di sistem (contoh: JS-001)",
      "Teks petunjuk penulisan (boleh beberapa baris dalam satu sel)",
    ];
    const example = [
      "JS-001",
      "1. Tulis artikel SEO dengan minimal 1500 kata.\n2. Gunakan keyword utama di judul dan paragraf pertama.\n3. Sertakan minimal 3 heading H2.",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, hints, example]);
    ws["!cols"] = [{ wch: 20 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws, "Template Petunjuk");
    XLSX.writeFile(wb, "template-import-petunjuk.xlsx");
  };

  const handlePetunjukFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, raw: false });
      if (!raw.length) { setPetunjukImportErrors(["File kosong atau tidak ada data."]); return; }

      const errors: string[] = [];
      const rows: { jobCode: string; petunjuk: string }[] = [];

      // Cari header row
      const rawArr = raw as unknown as unknown[][];
      const headerRow = (rawArr[0] ?? []).map(h => String(h ?? "").toLowerCase().trim());
      const jobCodeIdx = headerRow.findIndex(h => ["kode job", "kode", "job code", "job_code", "code"].includes(h));
      const petunjukIdx = headerRow.findIndex(h => ["petunjuk", "petunjuk penulisan", "instruction", "instruksi"].includes(h));

      if (jobCodeIdx === -1) errors.push("Kolom 'Kode Job' tidak ditemukan.");
      if (petunjukIdx === -1) errors.push("Kolom 'Petunjuk' tidak ditemukan.");

      if (errors.length === 0) {
        for (let i = 1; i < rawArr.length; i++) {
          const row = rawArr[i] ?? [];
          const kode = String(row[jobCodeIdx] ?? "").trim();
          const teks = String(row[petunjukIdx] ?? "").trim();
          if (!kode && !teks) continue; // lewati baris kosong
          if (!kode) { errors.push(`Baris ${i + 1}: Kode Job kosong.`); continue; }
          rows.push({ jobCode: kode, petunjuk: teks });
        }
      }

      setPetunjukImportErrors(errors);
      setPetunjukRows(rows);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handlePetunjukImportSubmit = async () => {
    if (petunjukRows.length === 0) return;
    setPetunjukImporting(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/jobs/batch-petunjuk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items: petunjukRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      const notFoundMsg = data.notFound?.length
        ? ` (${data.notFound.length} kode tidak ditemukan: ${data.notFound.slice(0, 3).join(", ")}${data.notFound.length > 3 ? "..." : ""})`
        : "";
      toast({ title: `${data.updated} petunjuk berhasil diupdate${notFoundMsg}` });
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey({ date: dateStr }) });
      setIsPetunjukImportOpen(false);
      setPetunjukRows([]);
      setPetunjukImportErrors([]);
    } catch {
      toast({ title: "Gagal mengimpor petunjuk", variant: "destructive" });
    } finally {
      setPetunjukImporting(false);
    }
  };

  const [newJob, setNewJob] = useState({
    jobCode: "", website: "", username: "", password: "",
    notes: "", petunjuk: "", versionTool: "",
    wordCount: "0", writerId: "none", jobDate: dateStr,
  });

  const openAddDialog = () => {
    setNewJob(prev => ({ ...prev, jobDate: dateStr }));
    setIsAddDialogOpen(true);
  };

  // Permissions — admin has all CS privileges + more
  const isAdminOrCS = currentUser?.role === "admin" || currentUser?.role === "cs";

  const canCheckSelesai = (job: typeof jobs[0]) => {
    if (isAdminOrCS || currentUser?.role === "editor") return true;
    if (currentUser?.role === "penulis") {
      return currentUser.writerId !== null && currentUser.writerId === job.writerId;
    }
    return false;
  };

  const canEditEditor = () => (
    isAdminOrCS ||
    currentUser?.role === "editor" ||
    !!currentUser?.editorId ||
    !!currentUser?.isAlsoEditor
  );
  const canDeleteJob = () => isAdminOrCS;
  const canAddJob = () => isAdminOrCS;

  // Semua editor (apapun perannya) + admin/CS bisa tandai revisi
  const isEditor = currentUser?.role === "editor" || !!currentUser?.isAlsoEditor || !!currentUser?.editorId;
  const canMarkRevision = isAdminOrCS || isEditor;

  // Invalidasi penuh — dipakai saat operasi revisi (mark/clear) karena bisa mengubah tabel pending revisions
  const invalidateAll = (date: string) => {
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetSummaryStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetDailyStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetEditorDailyStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: PENDING_REVISIONS_KEY });
    queryClient.invalidateQueries({ queryKey: REVISION_RECHECKED_KEY });
  };

  // Invalidasi ringan — dipakai saat update field biasa (isChecked, editor, dll)
  // Tidak menyentuh PENDING_REVISIONS_KEY agar tabel revisi di atas tidak berubah ukuran → layout stabil
  const invalidateJobsOnly = (date: string) => {
    queryClient.invalidateQueries({ queryKey: getListJobsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetSummaryStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetDailyStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: getGetEditorDailyStatsQueryKey({ date }) });
    queryClient.invalidateQueries({ queryKey: REVISION_RECHECKED_KEY });
  };

  const handleAddJob = () => {
    if (!newJob.jobCode || !newJob.website) {
      toast({ title: "Validasi", description: "Kode Job dan Website wajib diisi.", variant: "destructive" });
      return;
    }
    createJob.mutate({
      data: {
        jobCode: newJob.jobCode,
        website: newJob.website,
        username: newJob.username || null,
        password: newJob.password || null,
        notes: newJob.notes || null,
        petunjuk: newJob.petunjuk || null,
        versionTool: newJob.versionTool,
        wordCount: parseInt(newJob.wordCount) || 0,
        writerId: newJob.writerId !== "none" ? parseInt(newJob.writerId) : null,
        editorId: null,
        jobDate: newJob.jobDate || dateStr,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Job ditambahkan" });
        invalidateAll(newJob.jobDate || dateStr);
        invalidateAll(dateStr);
        setIsAddDialogOpen(false);
        setNewJob({
          jobCode: "", website: "", username: "", password: "",
          notes: "", petunjuk: "", versionTool: "",
          wordCount: "0", writerId: "none", jobDate: dateStr,
        });
      }
    });
  };

  const handleUpdateJob = (id: number, field: string, value: unknown) => {
    updateJob.mutate({ id, data: { [field]: value } }, {
      onSuccess: () => invalidateJobsOnly(dateStr),
    });
  };

  // Tandai revisi → uncheck job sekaligus
  const handleMarkRevision = (id: number) => {
    updateJob.mutate({ id, data: { revisionNotes: "revisi", isChecked: false } }, {
      onSuccess: () => invalidateAll(dateStr),
    });
  };

  // Hapus revisi → re-check job sekaligus
  const handleClearRevision = (id: number) => {
    updateJob.mutate({ id, data: { revisionNotes: null, isChecked: true } }, {
      onSuccess: () => invalidateAll(dateStr),
    });
  };

  const handleDeleteJob = (id: number) => {
    if (!confirm("Yakin ingin menghapus job ini?")) return;
    deleteJob.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Job dihapus" });
        invalidateAll(dateStr);
      }
    });
  };

  const handleExport = () => {
    const jobsToExport = filterWriterId === "all" ? jobs : filteredJobs;
    const writerObj = writers.find(w => w.id.toString() === filterWriterId);
    const filterLabel = filterWriterId === "all" ? "semua" : (writerObj?.name ?? filterWriterId);
    exportJobsToExcel(jobsToExport, dateStr, filterLabel);
    toast({ title: "Ekspor berhasil", description: "File Excel berhasil diunduh." });
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight">Dashboard Redaksi</h2>
          <p className="text-muted-foreground text-sm">
            Pantau dan alokasikan tugas penulisan untuk tanggal {format(selectedDate, "d MMMM yyyy", { locale: localeId })}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[190px] justify-start text-left font-medium shadow-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "PPP", { locale: localeId })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} initialFocus />
            </PopoverContent>
          </Popover>

          <Button variant="outline" className="shadow-sm" onClick={handleExport} disabled={jobs.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Export Excel
          </Button>

          {/* Import Excel — CS only */}
          {canAddJob() && (
            <>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
              <Dialog open={isImportOpen} onOpenChange={open => { setIsImportOpen(open); if (!open) { setImportRows([]); setImportErrors([]); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="shadow-sm" onClick={() => setIsImportOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Import Excel
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Import Job dari Excel</DialogTitle>
                    <DialogDescription>
                      Upload file Excel (.xlsx/.xls). Kolom yang dikenali:{" "}
                      <strong>Kode Job, Website, Username, Password, Notes, Tool, Kata, Penulis, Tanggal</strong>.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    {/* Template download */}
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">Butuh template?</p>
                        <p className="text-xs text-muted-foreground">Download template Excel dengan kolom dan contoh data yang benar.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                        <FileDown className="h-4 w-4 mr-1.5" />
                        Download Template
                      </Button>
                    </div>

                    {/* Upload area */}
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => importFileRef.current?.click()}
                    >
                      <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Klik untuk pilih file Excel</p>
                      <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, atau .csv — baris kosong akan dilewati</p>
                    </div>

                    {/* Error messages */}
                    {importErrors.length > 0 && (
                      <div className="space-y-1">
                        {importErrors.map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {e}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preview table */}
                    {importRows.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">{importRows.length} baris ditemukan — preview:</p>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="whitespace-nowrap">Tanggal</TableHead>
                                <TableHead className="whitespace-nowrap">Kode Job</TableHead>
                                <TableHead className="whitespace-nowrap">Website</TableHead>
                                <TableHead className="whitespace-nowrap">Penulis</TableHead>
                                <TableHead className="whitespace-nowrap">Kata</TableHead>
                                <TableHead className="whitespace-nowrap">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importRows.slice(0, 20).map((r, i) => (
                                <TableRow key={i} className={r.website ? "" : "opacity-40"}>
                                  <TableCell className="text-xs">{r.jobDate}</TableCell>
                                  <TableCell className="font-mono text-xs">{r.jobCode}</TableCell>
                                  <TableCell className="text-xs max-w-[160px] truncate">{r.website}</TableCell>
                                  <TableCell className="text-xs">
                                    {r.writerName ? (
                                      <span className={r._writerFound ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}>
                                        {r.writerName}{!r._writerFound && " ⚠"}
                                      </span>
                                    ) : <span className="text-muted-foreground">-</span>}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">{r.wordCount || "-"}</TableCell>
                                  <TableCell className="text-xs">
                                    {!r._writerFound && r.writerName
                                      ? <span className="text-amber-500">Penulis tidak ditemukan</span>
                                      : <span className="text-emerald-500">OK</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {importRows.length > 20 && (
                                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">... dan {importRows.length - 20} baris lainnya</TableCell></TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        {importRows.some(r => !r._writerFound && r.writerName) && (
                          <p className="text-xs text-amber-500 mt-2">⚠ Penulis yang tidak cocok akan diimpor tanpa penugasan penulis.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setIsImportOpen(false); setImportRows([]); setImportErrors([]); }}>Batal</Button>
                    <Button onClick={handleImportSubmit} disabled={importRows.length === 0 || importErrors.length > 0 || batchCreateJobs.isPending}>
                      {batchCreateJobs.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Import {importRows.length > 0 ? `${importRows.length} Job` : ""}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {/* Import Petunjuk — CS only */}
          {canAddJob() && (
            <>
              <input ref={petunjukFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePetunjukFile} />
              <Dialog open={isPetunjukImportOpen} onOpenChange={open => { setIsPetunjukImportOpen(open); if (!open) { setPetunjukRows([]); setPetunjukImportErrors([]); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="shadow-sm" onClick={() => setIsPetunjukImportOpen(true)}>
                    <FileUp className="mr-2 h-4 w-4" />
                    Import Petunjuk
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Import Petunjuk Job dari Excel</DialogTitle>
                    <DialogDescription>
                      Upload file Excel dengan kolom <strong>Kode Job</strong> dan <strong>Petunjuk</strong>.
                      Petunjuk akan diupdate pada job yang sudah ada di sistem sesuai kode job-nya.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    {/* Template download */}
                    <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">Download template terlebih dahulu</p>
                        <p className="text-xs text-muted-foreground">Template berisi kolom Kode Job dan Petunjuk dengan contoh data.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleDownloadPetunjukTemplate}>
                        <FileDown className="h-4 w-4 mr-1.5" />
                        Download Template
                      </Button>
                    </div>

                    {/* Upload area */}
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => petunjukFileRef.current?.click()}
                    >
                      <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Klik untuk pilih file Excel</p>
                      <p className="text-xs text-muted-foreground mt-1">.xlsx atau .xls — petunjuk boleh multi-baris dalam satu sel</p>
                    </div>

                    {/* Errors */}
                    {petunjukImportErrors.length > 0 && (
                      <div className="space-y-1">
                        {petunjukImportErrors.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            {e}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Preview */}
                    {petunjukRows.length > 0 && petunjukImportErrors.length === 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-emerald-600">{petunjukRows.length} baris siap diimpor</p>
                        <div className="rounded-lg border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold w-32">Kode Job</th>
                                <th className="text-left px-3 py-2 font-semibold">Petunjuk (preview)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {petunjukRows.slice(0, 10).map((r, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="px-3 py-2 font-mono font-medium text-primary">{r.jobCode}</td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-pre-line line-clamp-3">
                                    {r.petunjuk || <span className="italic">kosong</span>}
                                  </td>
                                </tr>
                              ))}
                              {petunjukRows.length > 10 && (
                                <tr className="border-t border-border">
                                  <td colSpan={2} className="px-3 py-2 text-center text-muted-foreground italic">
                                    ...dan {petunjukRows.length - 10} baris lainnya
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setIsPetunjukImportOpen(false); setPetunjukRows([]); setPetunjukImportErrors([]); }}>
                      Batal
                    </Button>
                    <Button
                      onClick={handlePetunjukImportSubmit}
                      disabled={petunjukRows.length === 0 || petunjukImportErrors.length > 0 || petunjukImporting}
                    >
                      {petunjukImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Update {petunjukRows.length > 0 ? `${petunjukRows.length} Petunjuk` : ""}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          {canAddJob() && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-sm" onClick={openAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Job
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full sm:max-w-[680px] max-h-[90vh] flex flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Tambah Job Baru</DialogTitle>
                  <DialogDescription>Masukkan detail penugasan artikel.</DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="jobCode">Kode Job</Label>
                    <Input id="jobCode" value={newJob.jobCode} onChange={e => setNewJob({ ...newJob, jobCode: e.target.value })} placeholder="Contoh: JOB-006" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={newJob.website} onChange={e => setNewJob({ ...newJob, website: e.target.value })} placeholder="Contoh: example.com" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" value={newJob.username} onChange={e => setNewJob({ ...newJob, username: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" value={newJob.password} onChange={e => setNewJob({ ...newJob, password: e.target.value })} />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label htmlFor="notes">Notes (Singkat)</Label>
                    <Input id="notes" value={newJob.notes} onChange={e => setNewJob({ ...newJob, notes: e.target.value })} placeholder="Instruksi ringkas..." />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label htmlFor="petunjuk">Petunjuk Penulisan</Label>
                    <textarea
                      id="petunjuk" value={newJob.petunjuk}
                      onChange={e => setNewJob({ ...newJob, petunjuk: e.target.value })}
                      rows={4} placeholder="Tulis petunjuk lengkap untuk penulis..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="versionTool">Versi (Tools)</Label>
                    <Input id="versionTool" value={newJob.versionTool} onChange={e => setNewJob({ ...newJob, versionTool: e.target.value })} placeholder="cth: SmallSEOTool, Copyscape..." />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wordCount">Jumlah Kata</Label>
                    <Input id="wordCount" type="number" value={newJob.wordCount} onChange={e => setNewJob({ ...newJob, wordCount: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="writer">Penulis</Label>
                    <Select value={newJob.writerId} onValueChange={v => setNewJob({ ...newJob, writerId: v })}>
                      <SelectTrigger id="writer"><SelectValue placeholder="Pilih Penulis" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Belum Ada --</SelectItem>
                        {activeWriters.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="jobDate">Tanggal Job</Label>
                    <Input id="jobDate" type="date" value={newJob.jobDate} onChange={e => setNewJob({ ...newJob, jobDate: e.target.value })} />
                  </div>
                </div>
                </div>{/* /overflow-y-auto */}
                <DialogFooter className="shrink-0 pt-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Batal</Button>
                  <Button onClick={handleAddJob} disabled={createJob.isPending}>
                    {createJob.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Job
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── Notifikasi Penulis: ada artikel yang butuh direvisi ─────────────── */}
      {(() => {
        if (dismissedPenulis) return null;
        const myPending = currentUser?.writerId
          ? pendingRevisions.filter(j => j.writerId === currentUser.writerId)
          : [];
        if (myPending.length === 0) return null;
        return (
          <div className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-4 py-3">
            <Bell className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Kamu masih memiliki {myPending.length} artikel yang perlu direvisi
              </p>
              <ul className="mt-1 space-y-0.5">
                {myPending.map(j => (
                  <li key={j.id} className="text-xs text-red-600 dark:text-red-400">
                    <button
                      onClick={() => setDetailJobId(j.id)}
                      className="font-mono font-medium hover:underline"
                    >
                      {j.jobCode}
                    </button>
                    {" · "}
                    <span className="truncate">{j.website}</span>
                    {" · "}
                    <span className="text-muted-foreground">{format(new Date(j.jobDate), "dd MMM", { locale: localeId })}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setDismissedPenulis(true)}
              className="text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0 mt-0.5"
              title="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })()}

      {/* ── Notifikasi Editor: penulis sudah selesai revisi, perlu dicek ─────── */}
      {(() => {
        if (dismissedEditor) return null;
        const myRechecked = currentUser?.editorId
          ? revisionRechecked.filter(j => j.editorId === currentUser.editorId)
          : [];
        if (myRechecked.length === 0) return null;
        return (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {myRechecked.length} artikel revisi yang kamu minta sudah diselesaikan penulis — silakan periksa
              </p>
              <ul className="mt-1 space-y-0.5">
                {myRechecked.map(j => (
                  <li key={j.id} className="text-xs text-amber-700 dark:text-amber-400">
                    <button
                      onClick={() => setDetailJobId(j.id)}
                      className="font-mono font-medium hover:underline"
                    >
                      {j.jobCode}
                    </button>
                    {" · "}
                    <span>{j.writerName ?? "-"}</span>
                    {" · "}
                    <span className="truncate">{j.website}</span>
                    {" · "}
                    <span className="text-muted-foreground">{format(new Date(j.jobDate), "dd MMM", { locale: localeId })}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setDismissedEditor(true)}
              className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 shrink-0 mt-0.5"
              title="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })()}

      {/* Summary Cards — 5 cards including Selesai Diedit */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Total Job",     value: summaryStats?.totalJobs ?? 0, color: "text-primary" },
          { label: "Total Kata",    value: (summaryStats?.totalWords ?? 0).toLocaleString(), color: "text-primary" },
          { label: "Selesai Tulis", value: summaryStats?.completedJobs ?? 0, color: "text-emerald-600 dark:text-emerald-500" },
          { label: "Selesai Diedit",value: summaryStats?.editedJobs ?? 0, color: "text-purple-600 dark:text-purple-400" },
          { label: "Butuh Revisi",  value: (summaryStats as unknown as { totalPendingRevisions?: number })?.totalPendingRevisions ?? 0, color: "text-red-600 dark:text-red-400" },
          { label: "Pending",       value: summaryStats?.pendingJobs ?? 0, color: "text-rose-500 dark:text-rose-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-card shadow-sm border-border p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
            <div className={cn("text-3xl font-bold font-serif", color)}>
              {isLoadingSummary ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : value}
            </div>
          </Card>
        ))}
      </div>

      {/* Panel Revisi Belum Diselesaikan — lintas semua tanggal */}
      {pendingRevisions.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 shadow-sm">
          <div className="p-4 border-b border-red-100 dark:border-red-900 flex items-center gap-2 bg-red-50 dark:bg-red-950/40 rounded-t-lg">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span className="font-semibold text-red-700 dark:text-red-300 text-sm">
              Revisi Belum Diselesaikan
            </span>
            <span className="ml-auto text-xs text-red-600 dark:text-red-400 font-medium bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded-full">
              {pendingRevisions.length} artikel
            </span>
          </div>
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">Tanggal</TableHead>
                <TableHead className="font-semibold text-foreground">Kode Job</TableHead>
                <TableHead className="font-semibold text-foreground">Website</TableHead>
                <TableHead className="font-semibold text-foreground">Penulis</TableHead>
                <TableHead className="font-semibold text-foreground">Editor</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Kata</TableHead>
                {(isAdminOrCS || isEditor) && <TableHead className="w-[90px] text-center font-semibold">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRevisions.map(job => {
                const isSelf = !!currentUser?.writerId && currentUser.writerId === job.writerId;
                const canClear = (isAdminOrCS || isEditor) && !isSelf;
                return (
                  <TableRow key={job.id} className="bg-red-50/60 dark:bg-red-950/20 hover:bg-red-100/60 dark:hover:bg-red-950/40">
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(job.jobDate), "dd MMM yyyy", { locale: localeId })}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setDetailJobId(job.id)}
                        className="font-mono font-medium text-sm text-primary hover:underline"
                      >
                        {job.jobCode}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={job.website}>
                      {job.website}
                    </TableCell>
                    <TableCell className="text-xs">{job.writerName ?? "-"}</TableCell>
                    <TableCell className="text-xs">{job.editorName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{job.wordCount.toLocaleString()}</TableCell>
                    {(isAdminOrCS || isEditor) && (
                      <TableCell className="text-center">
                        {canClear ? (
                          <button
                            onClick={() => handleClearRevision(job.id)}
                            title="Hapus tanda revisi — artikel selesai"
                            className="text-xs px-2 py-1 rounded border font-medium transition-colors bg-red-100 border-red-400 text-red-700 dark:bg-red-950/60 dark:border-red-500 dark:text-red-300 hover:bg-emerald-100 hover:border-emerald-400 hover:text-emerald-700"
                          >
                            Selesai ✓
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Filter toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span>Filter Penulis:</span>
        </div>
        <Select value={filterWriterId} onValueChange={setFilterWriterId}>
          <SelectTrigger className="w-[200px] h-9 bg-background shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Penulis</SelectItem>
            {writersWithJobs.length === 0 ? (
              <SelectItem value="__none__" disabled>Tidak ada penulis hari ini</SelectItem>
            ) : (
              writersWithJobs.map(w => (
                <SelectItem key={w.id} value={w.id.toString()}>
                  {w.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {filterWriterId !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilterWriterId("all")} className="text-xs h-9">
            Reset Filter
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          Menampilkan <strong>{filteredJobs.length}</strong> job
        </span>
      </div>

      {/* Totals untuk penulis yang difilter */}
      {filterWriterId !== "all" && (() => {
        const ws = dailyStats.find(s => s.writerId?.toString() === filterWriterId);
        const totalWords = filteredJobs.reduce((sum, j) => sum + (j.wordCount || 0), 0);
        const doneWords  = filteredJobs.filter(j => j.isChecked).reduce((sum, j) => sum + (j.wordCount || 0), 0);
        const doneJobs   = filteredJobs.filter(j => j.isChecked).length;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Job",   value: filteredJobs.length,                   color: "text-primary" },
              { label: "Selesai",     value: `${doneJobs} / ${filteredJobs.length}`, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Total Kata",  value: totalWords.toLocaleString("id-ID"),    color: "text-primary" },
              { label: "Kata Selesai", value: doneWords.toLocaleString("id-ID"),   color: "text-emerald-600 dark:text-emerald-400" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="p-3 flex flex-col gap-0.5 shadow-sm bg-muted/30">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={cn("text-xl font-bold font-mono", color)}>{value}</span>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Main Job Table */}
      <Card className="shadow-sm border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px] font-bold text-foreground">Kode Job</TableHead>
                <TableHead className="min-w-[130px] font-bold text-foreground">Website</TableHead>
                <TableHead className="w-[100px] font-bold text-foreground">User</TableHead>
                <TableHead className="w-[100px] font-bold text-foreground">Password</TableHead>
                <TableHead className="min-w-[100px] font-bold text-foreground">Notes</TableHead>
                <TableHead className="min-w-[160px] font-bold text-foreground">Versi</TableHead>
                <TableHead className="w-[75px] text-right font-bold text-foreground">Jml Kata</TableHead>
                <TableHead className="w-[120px] font-bold text-foreground">Penulis</TableHead>
                <TableHead className="w-[120px] font-bold text-foreground">Editor</TableHead>
                <TableHead className="w-[70px] text-center font-bold text-foreground text-red-600 dark:text-red-400">Revisi</TableHead>
                <TableHead className="w-[65px] text-center font-bold text-foreground">Selesai</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingJobs ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-muted-foreground">
                    {jobs.length === 0 ? "Tidak ada job untuk tanggal ini." : "Tidak ada job untuk penulis yang dipilih."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => {
                  const editorFilled = !!job.editorId;
                  const checkAllowed = canCheckSelesai(job);
                  const editEditorAllowed = canEditEditor();
                  const isPenulis = currentUser?.role === "penulis";

                  // Filter editor: penulis yang merangkap editor tidak bisa jadi editor artikel sendiri
                  const jobWriter = writers.find(w => w.id === job.writerId);
                  const blockedEditorId = jobWriter?.linkedEditorId ?? null;
                  const availableEditors = (blockedEditorId
                    ? editors.filter(e => e.id !== blockedEditorId)
                    : editors
                  ).slice().sort((a, b) => a.name.localeCompare(b.name, "id"));

                  const rawRevisionNotes = (job as unknown as { revisionNotes?: string | null }).revisionNotes;
                  const hasRevision = rawRevisionNotes != null && rawRevisionNotes !== "";

                  // Kunci ceklist "Selesai" jika penulis job ini masih punya revisi belum dibereskan
                  // di job lain — hanya job revisi itu sendiri yang boleh diceklis dulu.
                  // Berlaku untuk penulis saja; admin/CS/editor tetap bisa override.
                  const lockedByRevision =
                    currentUser?.role === "penulis" &&
                    job.writerId != null &&
                    writersWithPendingRevision.has(job.writerId) &&
                    !(hasRevision && !job.isChecked);

                  // Editor tidak boleh mengurusi artikelnya sendiri
                  const isSelfWrittenJob = !!currentUser?.writerId && currentUser.writerId === job.writerId;

                  return (
                    <TableRow key={job.id} className={cn(
                      hasRevision ? "bg-red-50 dark:bg-red-950/30" : (job.isChecked && "bg-muted/30")
                    )}>
                      {/* Kode Job — clickable */}
                      <TableCell className="font-medium">
                        <button
                          onClick={() => setDetailJobId(job.id)}
                          className="font-mono text-sm font-semibold text-primary hover:underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 text-left"
                          title="Klik untuk lihat petunjuk"
                        >
                          {job.jobCode}
                        </button>
                      </TableCell>

                      <TableCell>
                        <InlineInput value={job.website} onSave={v => handleUpdateJob(job.id, "website", v)} disabled={isPenulis}
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 -ml-2 disabled:opacity-100 disabled:cursor-default" />
                      </TableCell>

                      <TableCell>
                        <InlineInput value={job.username || ""} onSave={v => handleUpdateJob(job.id, "username", v || null)} disabled={isPenulis} placeholder="-"
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 -ml-2 disabled:opacity-100 disabled:cursor-default" />
                      </TableCell>

                      <TableCell>
                        <InlineInput value={job.password || ""} onSave={v => handleUpdateJob(job.id, "password", v || null)} disabled={isPenulis} placeholder="-"
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 -ml-2 font-mono text-xs disabled:opacity-100 disabled:cursor-default" />
                      </TableCell>

                      <TableCell>
                        <InlineInput value={job.notes || ""} onSave={v => handleUpdateJob(job.id, "notes", v || null)} disabled={isPenulis} placeholder="-"
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 -ml-2 disabled:opacity-100 disabled:cursor-default" />
                      </TableCell>

                      <TableCell>
                        <InlineInput value={job.versionTool || ""} onSave={v => handleUpdateJob(job.id, "versionTool", v || null)} disabled={isPenulis} placeholder="-"
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 -ml-2 disabled:opacity-100 disabled:cursor-default" />
                      </TableCell>

                      <TableCell className="text-right">
                        <InlineInput
                          type="number"
                          value={job.wordCount}
                          onSave={v => handleUpdateJob(job.id, "wordCount", parseInt(v) || 0)}
                          disabled={isPenulis}
                          className="h-8 border-transparent hover:border-input focus-visible:border-ring bg-transparent p-1 px-2 text-right -ml-2 w-20 font-mono disabled:opacity-100 disabled:cursor-default"
                        />
                      </TableCell>

                      <TableCell>
                        {isPenulis ? (
                          <span className="text-sm px-2">
                            {job.writerName || "-"}
                            {job.writerId && writerById.get(job.writerId)?.isAlsoEditor && (
                              <span className="ml-1.5 text-xs text-purple-600 dark:text-purple-400 font-normal">(+ Editor)</span>
                            )}
                          </span>
                        ) : (
                          <Select value={job.writerId?.toString() || "none"} onValueChange={v => handleUpdateJob(job.id, "writerId", v === "none" ? null : parseInt(v))}>
                            <SelectTrigger className="h-8 border-transparent hover:border-input bg-transparent -ml-2"><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- Kosong --</SelectItem>
                              {activeWriters.map(w => (
                                <SelectItem key={w.id} value={w.id.toString()}>
                                  {w.name}{w.isAlsoEditor ? " (+ Editor)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>

                      {/* Editor — hanya bisa diisi jika job sudah selesai, dan bukan artikel sendiri */}
                      <TableCell className={cn("w-[120px] max-w-[120px] transition-colors", editorFilled && "bg-emerald-50 dark:bg-emerald-950/30")}>
                        {editEditorAllowed && job.isChecked && !isSelfWrittenJob ? (
                          <Select value={job.editorId?.toString() || "none"} onValueChange={v => handleUpdateJob(job.id, "editorId", v === "none" ? null : parseInt(v))}>
                            <SelectTrigger className={cn("h-8 w-full border-transparent hover:border-input bg-transparent -ml-2 overflow-hidden", editorFilled && "text-emerald-700 dark:text-emerald-400 font-medium")}>
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- Kosong --</SelectItem>
                              {availableEditors.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-1 px-1 overflow-hidden" title={editorFilled ? job.editorName ?? undefined : (!job.isChecked ? "Centang 'Selesai' terlebih dahulu" : undefined)}>
                            {editorFilled ? (
                              <><CheckCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium truncate">{job.editorName}</span></>
                            ) : (
                              <span className="text-xs text-muted-foreground truncate">
                                {editEditorAllowed && !job.isChecked ? <Lock className="h-3 w-3 opacity-40" /> : "-"}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Revisi — editor & admin/CS bisa tandai/hapus, kecuali pada artikel sendiri */}
                      <TableCell className="text-center">
                        {hasRevision ? (
                          (isAdminOrCS || isEditor) && !isSelfWrittenJob ? (
                            <button
                              onClick={() => handleClearRevision(job.id)}
                              title="Klik untuk hapus tanda revisi"
                              className="text-xs px-2.5 py-1 rounded border font-medium transition-colors bg-red-100 border-red-400 text-red-700 dark:bg-red-950/60 dark:border-red-500 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60"
                            >
                              Revisi ✓
                            </button>
                          ) : (
                            <span className="text-xs px-2.5 py-1 rounded border font-medium bg-red-100 border-red-400 text-red-700 dark:bg-red-950/60 dark:border-red-500 dark:text-red-300 cursor-default select-none">
                              Revisi
                            </span>
                          )
                        ) : canMarkRevision && job.isChecked && !isSelfWrittenJob && !!job.editorId ? (
                          <button
                            onClick={() => handleMarkRevision(job.id)}
                            className="text-xs px-2.5 py-1 rounded border font-medium transition-colors border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-300 dark:hover:bg-red-950/30"
                          >
                            Revisi
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground opacity-30">—</span>
                        )}
                      </TableCell>

                      {/* Selesai */}
                      <TableCell className="text-center">
                        <div className="flex justify-center items-center">
                          {checkAllowed && !lockedByRevision ? (
                            <Checkbox checked={job.isChecked} onCheckedChange={c => handleUpdateJob(job.id, "isChecked", !!c)}
                              className={cn("h-5 w-5",
                                hasRevision
                                  ? "data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                                  : "data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                              )} />
                          ) : (
                            <div className="flex items-center justify-center h-5 w-5 rounded border border-border"
                              title={lockedByRevision ? "Selesaikan revisi terlebih dahulu sebelum mencentang job lain" : "Tidak bisa mencentang job ini"}>
                              {job.isChecked
                                ? hasRevision
                                  ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                  : <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                                : <Lock className="h-3 w-3 text-muted-foreground/50" />}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Delete + Pindah Tanggal + Kontak Pelanggan */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <CustomerContactPopover jobCode={job.jobCode} />
                          {isAdminOrCS && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Pindah ke tanggal lain"
                              onClick={() => { setMoveDateJob({ id: job.id, jobCode: job.jobCode, currentDate: job.jobDate }); setMoveDateValue(job.jobDate); }}>
                              <CalendarDays className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteJob() && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteJob(job.id)} disabled={deleteJob.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Rekap Kata Penulis */}
      <div className="pt-2">
        <h3 className="text-lg font-serif font-bold tracking-tight mb-4">Rekap Penulis</h3>
        <Card className="shadow-sm border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-foreground">Nama Penulis</TableHead>
                <TableHead className="text-right font-bold text-foreground">Total Job</TableHead>
                <TableHead className="text-right font-bold text-foreground">Selesai</TableHead>
                <TableHead className="text-right font-bold text-foreground text-amber-600 dark:text-amber-400">Revisi</TableHead>
                <TableHead className="text-right font-bold text-foreground w-[150px]">Total Kata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDaily ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : dailyStats.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Belum ada data penulis.</TableCell></TableRow>
              ) : (
                dailyStats.map((stat) => {
                  const writerInfo = writerById.get(stat.writerId);
                  const isAlsoEd = writerInfo?.isAlsoEditor ?? false;
                  const revJobs = (stat as unknown as { revisionJobs?: number }).revisionJobs ?? 0;
                  return (
                    <TableRow key={stat.writerId}>
                      <TableCell className="font-medium">
                        {stat.writerName}
                        {isAlsoEd && (
                          <span className="ml-1.5 text-xs text-purple-600 dark:text-purple-400 font-normal">(+ Editor)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{stat.totalJobs}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(stat.completedJobs === stat.totalJobs && stat.totalJobs > 0 ? "text-emerald-600 font-medium" : "")}>
                          {stat.completedJobs} / {stat.totalJobs}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(revJobs > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
                          {revJobs}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-primary">
                        {stat.totalWords.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Rekap Editor */}
      <div>
        <h3 className="text-lg font-serif font-bold tracking-tight mb-4">Rekap Editor</h3>
        <Card className="shadow-sm border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-foreground">Nama Editor</TableHead>
                <TableHead className="text-right font-bold text-foreground">Artikel Diedit</TableHead>
                <TableHead className="text-right font-bold text-foreground text-amber-600 dark:text-amber-400">Revisi</TableHead>
                <TableHead className="text-right font-bold text-foreground w-[150px]">Total Kata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingEditorStats ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : editorStats.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Belum ada artikel yang diedit hari ini.</TableCell></TableRow>
              ) : (
                editorStats.map((stat) => {
                  const revJobs = (stat as unknown as { revisionJobs?: number }).revisionJobs ?? 0;
                  return (
                    <TableRow key={stat.editorId}>
                      <TableCell className="font-medium">{stat.editorName}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-purple-600 dark:text-purple-400 font-medium">{stat.totalEdited}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(revJobs > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
                          {revJobs}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-primary">
                        {stat.totalWords.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Pindah Tanggal Dialog */}
      <Dialog open={moveDateJob !== null} onOpenChange={o => { if (!o) setMoveDateJob(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Pindah Tanggal Job</DialogTitle>
            <DialogDescription>
              Job <span className="font-mono font-semibold text-primary">{moveDateJob?.jobCode}</span> saat ini
              terjadwal pada <span className="font-mono">{moveDateJob?.currentDate}</span>.
              Pilih tanggal tujuan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Tanggal Baru</Label>
            <Input type="date" value={moveDateValue} onChange={e => setMoveDateValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDateJob(null)}>Batal</Button>
            <Button
              disabled={!moveDateValue || moveDateValue === moveDateJob?.currentDate || updateJob.isPending}
              onClick={() => {
                if (!moveDateJob || !moveDateValue) return;
                updateJob.mutate({ id: moveDateJob.id, data: { jobDate: moveDateValue } }, {
                  onSuccess: () => {
                    toast({ title: `Job ${moveDateJob.jobCode} dipindah ke ${moveDateValue}` });
                    invalidateAll(dateStr);
                    invalidateAll(moveDateValue);
                    setMoveDateJob(null);
                  }
                });
              }}
            >
              {updateJob.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail modal */}
      <JobDetailModal
        job={selectedDetailJob}
        open={detailJobId !== null}
        onClose={() => setDetailJobId(null)}
        dateStr={dateStr}
      />
    </div>
  );
}
