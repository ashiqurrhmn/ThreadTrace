'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { API_BASE, apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ImportJob {
  id: string;
  fileName: string;
  format: string;
  importType: string;
  status: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  rejectedDetails: Array<{ rowNumber: number; lotCode: string; reason: string }>;
  createdBy: string;
  createdAt: string;
}

export default function ImportsPage() {
  const { token, user } = useAuth();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [latestJob, setLatestJob] = useState<ImportJob | null>(null);
  const [importType, setImportType] = useState<'CUTTING_REPORT' | 'PACKING_LIST' | 'LOT_EVENTS'>('CUTTING_REPORT');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ items: ImportJob[] }>('/imports', { token });
      setJobs(res.items);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('importType', importType);
      const job = await apiFetch<ImportJob>('/imports/upload', {
        method: 'POST',
        token,
        body: fd,
      });
      setLatestJob(job);
      setFile(null);
      await loadJobs();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const canUpload = user.role === 'AUDITOR' || user.role === 'FACTORY_ADMIN';

  if (!token) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600">
        Switch to <strong>Auditor</strong> or <strong>Factory Admin</strong> to test CSV / Excel bulk imports.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          Bulk Factory CSV &amp; Excel Data Import
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload daily cutting reports, packing lists, and production event logs in CSV or Excel (<code className="bg-slate-100 px-1 rounded">.xlsx</code>) format with automated mass-balance validation and row-level exception reporting.
        </p>
      </div>

      {/* Download Templates */}
      <div className="card p-4 bg-emerald-50/60 border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-emerald-950">
          <strong>Sample Import Templates:</strong> Download standard factory CSV and Excel templates to test bulk ingestion and row-level validation.
        </div>
        <div className="flex gap-2">
          <a
            href={`${API_BASE}/imports/samples/cutting_report_sample.csv`}
            className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> cutting_report_sample.csv
          </a>
          <a
            href={`${API_BASE}/imports/samples/packing_list_sample.xlsx`}
            className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-semibold inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> packing_list_sample.xlsx
          </a>
        </div>
      </div>

      {canUpload && (
        <form onSubmit={handleUpload} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Report Type</label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as typeof importType)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="CUTTING_REPORT">Cutting Report (CUT)</option>
                <option value="PACKING_LIST">Packing List (PACK)</option>
                <option value="LOT_EVENTS">General Lot Events</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Select CSV or Excel (.xlsx) File</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs border rounded-lg p-2"
              />
            </div>
            <button
              type="submit"
              disabled={!file || uploading}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> {uploading ? 'Importing...' : 'Run Validated Import'}
            </button>
          </div>
          {error && <div className="text-xs text-red-700 font-medium">{error}</div>}
        </form>
      )}

      {latestJob && (
        <div className="card p-5 space-y-3 border-emerald-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-sm text-slate-900">
              Latest Import Result: {latestJob.fileName} ({latestJob.format})
            </h2>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Accepted: {latestJob.acceptedRows}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 inline-flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Rejected: {latestJob.rejectedRows}
              </span>
            </div>
          </div>

          {latestJob.rejectedDetails.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-red-50 text-red-900 border-b">
                  <tr>
                    <th className="px-3 py-2">Row #</th>
                    <th className="px-3 py-2">Lot Code</th>
                    <th className="px-3 py-2">Rejection Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {latestJob.rejectedDetails.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{r.lotCode}</td>
                      <td className="px-3 py-2 text-red-700">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Import History */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 bg-slate-50 border-b text-xs font-bold uppercase text-slate-500">
          Import History ({jobs.length})
        </div>
        <table className="w-full text-xs text-left">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="px-4 py-2.5">File</th>
              <th className="px-4 py-2.5">Format</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Rows (OK / Bad)</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setLatestJob(j)}>
                <td className="px-4 py-2.5 font-medium text-slate-900">{j.fileName}</td>
                <td className="px-4 py-2.5">{j.format}</td>
                <td className="px-4 py-2.5">{j.importType}</td>
                <td className="px-4 py-2.5">
                  <span className="text-emerald-700 font-bold">{j.acceptedRows}</span> /{' '}
                  <span className="text-red-700 font-bold">{j.rejectedRows}</span> (of {j.totalRows})
                </td>
                <td className="px-4 py-2.5 font-semibold">{j.status}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No bulk imports yet. Download a sample above and upload it!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
