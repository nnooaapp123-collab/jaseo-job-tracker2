import * as XLSX from "xlsx";

interface Job {
  jobCode: string;
  website: string;
  username?: string | null;
  password?: string | null;
  notes?: string | null;
  petunjuk?: string | null;
  versionTool: string;
  wordCount: number;
  writerName?: string | null;
  editorName?: string | null;
  isChecked: boolean;
  jobDate: string;
}

const versionLabel: Record<string, string> = {
  smallseotool: "SmallSEOTool",
  copyscape: "Copyscape",
  other: "Other",
};

export function exportJobsToExcel(jobs: Job[], dateStr: string, filterLabel: string) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Daftar Job — Tanggal di kolom pertama ───────────────────────
  const jobRows = jobs.map((j) => ({
    "Tanggal": j.jobDate,
    "Kode Job": j.jobCode,
    "Website": j.website,
    "User": j.username || "",
    "Password": j.password || "",
    "Notes": j.notes || "",
    "Versi": versionLabel[j.versionTool] ?? j.versionTool,
    "Jumlah Kata": j.wordCount,
    "Penulis": j.writerName || "",
    "Editor": j.editorName || "",
    "Selesai": j.isChecked ? "Ya" : "Tidak",
  }));

  const ws1 = XLSX.utils.json_to_sheet(jobRows);

  // Column widths
  ws1["!cols"] = [
    { wch: 12 }, // Tanggal
    { wch: 14 }, // Kode Job
    { wch: 22 }, // Website
    { wch: 14 }, // User
    { wch: 14 }, // Password
    { wch: 28 }, // Notes
    { wch: 14 }, // Versi
    { wch: 12 }, // Jumlah Kata
    { wch: 16 }, // Penulis
    { wch: 16 }, // Editor
    { wch: 10 }, // Selesai
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "Daftar Job");

  // ── Sheet 2: Petunjuk — Tanggal di kolom pertama ─────────────────────────
  const petunjukRows = jobs
    .filter((j) => j.petunjuk)
    .map((j) => ({
      "Tanggal": j.jobDate,
      "Kode Job": j.jobCode,
      "Website": j.website,
      "Penulis": j.writerName || "",
      "Petunjuk Penulisan": j.petunjuk || "",
    }));

  const ws2 = XLSX.utils.json_to_sheet(
    petunjukRows.length > 0
      ? petunjukRows
      : [{ "Keterangan": "Belum ada job dengan petunjuk untuk filter ini." }]
  );

  ws2["!cols"] = [
    { wch: 12 }, // Tanggal
    { wch: 14 }, // Kode Job
    { wch: 22 }, // Website
    { wch: 16 }, // Penulis
    { wch: 60 }, // Petunjuk
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "Petunjuk Penulisan");

  // ── Sheet 3: Rekap Kata ──────────────────────────────────────────────────
  const writerMap = new Map<
    string,
    { totalJobs: number; completedJobs: number; totalWords: number }
  >();

  for (const j of jobs) {
    const key = j.writerName || "(Belum Ada Penulis)";
    const existing = writerMap.get(key) ?? { totalJobs: 0, completedJobs: 0, totalWords: 0 };
    writerMap.set(key, {
      totalJobs: existing.totalJobs + 1,
      completedJobs: existing.completedJobs + (j.isChecked ? 1 : 0),
      totalWords: existing.totalWords + j.wordCount,
    });
  }

  const rekapRows = Array.from(writerMap.entries()).map(([name, stat]) => ({
    "Nama Penulis": name,
    "Total Job": stat.totalJobs,
    "Selesai": stat.completedJobs,
    "Total Kata": stat.totalWords,
  }));

  const ws3 = XLSX.utils.json_to_sheet(
    rekapRows.length > 0
      ? rekapRows
      : [{ "Keterangan": "Tidak ada data." }]
  );

  ws3["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];

  XLSX.utils.book_append_sheet(wb, ws3, "Rekap Kata");

  // ── Generate filename & download ─────────────────────────────────────────
  const safeFilter = filterLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `jaseo-jobs_${dateStr}_${safeFilter}.xlsx`;

  XLSX.writeFile(wb, filename);
}
