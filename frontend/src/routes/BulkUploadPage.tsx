import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Table,
} from "lucide-react";
import { api } from "../lib/api";
import { parseCsv } from "../lib/csv";
import { errorMessage } from "../lib/http";
import { displayUrl, downloadBlob } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { Spinner } from "../components/ui/Spinner";

// Same limits the server enforces
const MAX_ROWS = 500;
const MAX_BYTES = 1024 * 1024;

export function BulkUploadPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [preview, setPreview] = useState<string[][]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (csv: File) => api.links.bulk(csv),
    onSuccess: () => {
      for (const key of ["links", "tags", "stats"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const results = upload.data;
  const rowCount = Math.max(0, preview.length - 1);

  const loadFile = (f: File) => {
    upload.reset();
    setFileError("");
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setFileError("Please choose a .csv file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("The file is larger than 1 MB.");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(parseCsv(String(ev.target?.result ?? "")));
    reader.readAsText(f);
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setFileError("");
    upload.reset();
  };

  const downloadTemplate = () => {
    const csv =
      'url,title,tags,custom_code\nhttps://example.com/page1,Example Page,"tag1,tag2",\nhttps://example.com/page2,Another Page,tag3,my-alias';
    downloadBlob(new Blob([csv], { type: "text/csv" }), "linkly-bulk-template.csv");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/links" className="btn-ghost">
          <ArrowLeft size={16} /> Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Bulk Upload</h1>
          <p className="text-surface-600 dark:text-surface-400">
            Create up to {MAX_ROWS} links at once from a CSV file
          </p>
        </div>
      </div>

      {/* Upload area */}
      {!file && (
        <div className="card">
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-300 p-12 text-center dark:border-surface-600"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) loadFile(f);
            }}
          >
            <Upload size={40} className="mb-4 text-surface-400" />
            <p className="text-lg font-medium text-surface-900 dark:text-white">
              Drop your CSV file here
            </p>
            <p className="mt-1 text-sm text-surface-500">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
                e.target.value = "";
              }}
              className="hidden"
              data-testid="csv-input"
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn-primary mt-4">
              <FileText size={16} /> Select CSV File
            </button>
            <button onClick={downloadTemplate} className="btn-ghost mt-3 text-sm">
              <Download size={14} /> Download template
            </button>
            {fileError && (
              <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">{fileError}</p>
            )}
          </div>
        </div>
      )}

      {/* Preview */}
      {file && !results && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-primary-600 dark:text-primary-400" />
              <div>
                <p className="font-medium text-surface-900 dark:text-white">{file.name}</p>
                <p className="text-sm text-surface-500">
                  {(file.size / 1024).toFixed(1)} KB • {rowCount} rows
                </p>
              </div>
            </div>
            <button onClick={reset} className="btn-ghost text-sm">
              Choose different file
            </button>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/50">
                    {(preview[0] || []).map((header, i) => (
                      <th
                        key={i}
                        className="px-4 py-2 text-left font-medium text-surface-600 dark:text-surface-400"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
                  {preview.slice(1, 6).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="px-4 py-2 text-surface-700 dark:text-surface-300 max-w-[200px] truncate"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rowCount > 5 && (
                <p className="px-4 py-2 text-xs text-surface-500 text-center">
                  Showing 5 of {rowCount} rows
                </p>
              )}
            </div>
          )}

          {rowCount > MAX_ROWS && (
            <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
              The file has {rowCount} rows; at most {MAX_ROWS} can be imported at once.
            </p>
          )}
          {upload.isError && (
            <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
              {errorMessage(upload.error, "Upload failed")}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-surface-500">{rowCount} links will be created</p>
            <button
              onClick={() => upload.mutate(file)}
              disabled={upload.isPending || rowCount === 0 || rowCount > MAX_ROWS}
              className="btn-primary"
            >
              {upload.isPending ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Table size={16} /> Process & Create
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card text-center">
              <p className="text-3xl font-bold text-surface-900 dark:text-white">
                {results.results.length}
              </p>
              <p className="text-sm text-surface-500">Total processed</p>
            </div>
            <div className="card text-center border-emerald-200 dark:border-emerald-800">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {results.created}
              </p>
              <p className="text-sm text-surface-500">Successful</p>
            </div>
            <div className="card text-center border-red-200 dark:border-red-800">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{results.failed}</p>
              <p className="text-sm text-surface-500">Failed</p>
            </div>
          </div>

          {/* Results table */}
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <th className="px-3 py-2 text-left font-medium text-surface-500">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-surface-500">URL</th>
                    <th className="px-3 py-2 text-left font-medium text-surface-500">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-surface-500">Short URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
                  {results.results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-surface-500">{r.row}</td>
                      <td className="px-3 py-2 text-surface-700 dark:text-surface-300 max-w-[200px] truncate">
                        {r.url}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "success" ? (
                          <Badge variant="success">
                            <CheckCircle2 size={12} className="mr-1" /> Created
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <XCircle size={12} className="mr-1" /> {r.error}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-primary-600 dark:text-primary-400">
                        {r.shortUrl ? (
                          <span className="flex items-center gap-1.5">
                            {displayUrl(r.shortUrl)}
                            <CopyButton text={r.shortUrl} label="" className="!text-xs" />
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary">
              Upload Another File
            </button>
            <Link to="/links" className="btn-primary">
              View All Links
            </Link>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
          <AlertTriangle size={18} className="text-amber-500" /> CSV Format
        </h3>
        <ul className="space-y-2 text-sm text-surface-600 dark:text-surface-400">
          <li>
            • First row must be headers:{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              url
            </code>
            ,{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              title
            </code>
            ,{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              tags
            </code>{" "}
            and{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              custom_code
            </code>{" "}
            (all but url optional)
          </li>
          <li>
            • URLs must start with{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              http://
            </code>{" "}
            or{" "}
            <code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs dark:bg-surface-700">
              https://
            </code>
          </li>
          <li>• Maximum {MAX_ROWS} rows and 1 MB per upload, UTF-8 encoded</li>
          <li>• Tags should be comma-separated within quotes</li>
          <li>• Invalid rows will be skipped and reported in results</li>
        </ul>
      </div>
    </div>
  );
}
