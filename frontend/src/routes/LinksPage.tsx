import { useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { SHORT_HOST } from "../lib/config";
import { useDebouncedValue } from "../lib/hooks";
import { errorMessage } from "../lib/http";
import { displayUrl, downloadBlob, formatDate, formatNumber } from "../lib/utils";
import { useToastStore } from "../stores/toastStore";
import type { Link } from "../types";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { Spinner } from "../components/ui/Spinner";
import { QRModal } from "../components/ui/QRModal";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  ExternalLink,
  BarChart3,
  QrCode,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Edit,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
} from "lucide-react";

type StatusFilter = "all" | "active" | "disabled";
type SortBy = "created" | "clicks";

const PAGE_SIZE = 20;

/** Link mutations change link lists, tag counts and stats alike */
function invalidateLinkData(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["links", "link", "tags", "stats"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function LinksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("created");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [page, setPage] = useState(1);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(location.pathname === "/links/new");
  const [editLink, setEditLink] = useState<Link | null>(null);
  const [qrLink, setQrLink] = useState<Link | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["links", debouncedSearch, statusFilter, selectedTag, sortBy, page],
    queryFn: () =>
      api.links.list({
        search: debouncedSearch || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        tag: selectedTag || undefined,
        sort: sortBy,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: api.tags.list });

  const onMutationError = (err: unknown) => addToast(errorMessage(err), "error");

  const [exporting, setExporting] = useState(false);
  const exportLinks = async () => {
    setExporting(true);
    try {
      downloadBlob(await api.links.exportCsv(), "links.csv");
    } catch (err) {
      onMutationError(err);
    } finally {
      setExporting(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: api.links.delete,
    onSuccess: () => {
      invalidateLinkData(queryClient);
      addToast("Link deleted", "success");
    },
    onError: onMutationError,
  });

  const toggleMutation = useMutation({
    mutationFn: api.links.toggle,
    onSuccess: (link) => {
      invalidateLinkData(queryClient);
      addToast(link.isActive ? "Link enabled" : "Link disabled", "success");
    },
    onError: onMutationError,
  });

  const links = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = Boolean(debouncedSearch || selectedTag || statusFilter !== "all");

  // Any filter change starts again from the first page
  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Links</h1>
          <p className="text-surface-600 dark:text-surface-400">{total} links total</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportLinks} disabled={exporting} className="btn-secondary">
            {exporting ? <Spinner size="sm" /> : <Download size={16} />} Export CSV
          </button>
          <RouterLink to="/links/bulk" className="btn-secondary">
            <Upload size={16} /> Bulk upload
          </RouterLink>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus size={18} /> New Link
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card !p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => withPageReset(setSearch)(e.target.value)}
              placeholder="Search links..."
              className="input-field !pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-surface-400" />
            <select
              value={statusFilter}
              onChange={(e) => withPageReset(setStatusFilter)(e.target.value as StatusFilter)}
              className="input-field !w-auto"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => withPageReset(setSortBy)(e.target.value as SortBy)}
              className="input-field !w-auto"
            >
              <option value="created">Newest first</option>
              <option value="clicks">Most clicks</option>
            </select>
            {tags && tags.length > 0 && (
              <select
                value={selectedTag}
                onChange={(e) => withPageReset(setSelectedTag)(e.target.value)}
                className="input-field !w-auto"
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name} ({tag.linkCount})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Links table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <div className="card text-center py-12">
          <p className="text-lg font-medium text-surface-900 dark:text-white">
            Could not load links
          </p>
          <p className="mt-2 text-surface-600 dark:text-surface-400">{errorMessage(error)}</p>
        </div>
      ) : links.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-lg font-medium text-surface-900 dark:text-white">No links found</p>
          <p className="mt-2 text-surface-600 dark:text-surface-400">
            {filtersActive
              ? "Try adjusting your search or filters."
              : "Create your first link to get started."}
          </p>
          {!filtersActive && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4">
              <Plus size={18} /> Create Link
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-200 dark:border-surface-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                    Link
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500 md:table-cell">
                    Original URL
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-surface-500">
                    Clicks
                  </th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500 sm:table-cell">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-surface-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
                {links.map((link) => (
                  <tr
                    key={link.id}
                    className="hover:bg-surface-50 dark:hover:bg-surface-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {link.faviconUrl ? (
                          <img
                            src={link.faviconUrl}
                            alt=""
                            className="h-5 w-5 rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded bg-surface-200 dark:bg-surface-700">
                            <ExternalLink size={10} className="text-surface-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-surface-900 dark:text-white">
                            {link.title || link.code}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-primary-600 dark:text-primary-400">
                              {displayUrl(link.shortUrl)}
                            </span>
                            <CopyButton text={link.shortUrl} label="" className="!text-xs" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="max-w-[200px] truncate text-sm text-surface-600 dark:text-surface-400">
                        {link.originalUrl}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-surface-900 dark:text-white">
                        {formatNumber(link.totalClicks)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="text-sm text-surface-600 dark:text-surface-400">
                        {formatDate(link.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={link.isActive ? "success" : "danger"}>
                        {link.isActive ? "Active" : "Disabled"}
                      </Badge>
                      {link.isCustom && (
                        <Badge variant="info" className="ml-1.5">
                          Custom
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === link.id ? null : link.id)}
                          className="btn-ghost !p-1.5"
                          aria-label="Actions"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenu === link.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800">
                            <button
                              onClick={() => {
                                navigate(`/links/${link.id}`);
                                setOpenMenu(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
                            >
                              <BarChart3 size={14} /> Analytics
                            </button>
                            <button
                              onClick={() => {
                                setEditLink(link);
                                setOpenMenu(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
                            >
                              <Edit size={14} /> Edit
                            </button>
                            <button
                              onClick={() => {
                                setQrLink(link);
                                setOpenMenu(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
                            >
                              <QrCode size={14} /> QR Code
                            </button>
                            <button
                              onClick={() => {
                                toggleMutation.mutate(link);
                                setOpenMenu(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-700"
                            >
                              {link.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                              {link.isActive ? "Disable" : "Enable"}
                            </button>
                            <hr className="my-1 border-surface-200 dark:border-surface-700" />
                            <button
                              onClick={() => {
                                setOpenMenu(null);
                                if (
                                  window.confirm(
                                    `Delete ${displayUrl(link.shortUrl)}? Its analytics will be lost.`,
                                  )
                                ) {
                                  deleteMutation.mutate(link.id);
                                }
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-surface-200 px-4 py-3 dark:border-surface-700">
              <span className="text-sm text-surface-600 dark:text-surface-400">
                Page {page} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  className="btn-secondary !px-3 !py-1.5 text-sm"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pageCount}
                  className="btn-secondary !px-3 !py-1.5 text-sm"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateModal && <CreateLinkModal onClose={() => setShowCreateModal(false)} />}
      {editLink && <EditLinkModal link={editLink} onClose={() => setEditLink(null)} />}
      {qrLink && <QRModal link={qrLink} onClose={() => setQrLink(null)} />}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setTagInput("");
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
        Tags
      </label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="badge bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="hover:text-red-500"
              aria-label={`Remove tag ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag..."
          className="input-field flex-1"
          maxLength={50}
        />
        <button type="button" onClick={addTag} className="btn-secondary">
          Add
        </button>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-surface-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-surface-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="btn-ghost !p-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
      {errorMessage(error)}
    </div>
  );
}

function CreateLinkModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.links.create({
        url,
        customCode: customCode || undefined,
        title: title || undefined,
        tags,
      }),
    onSuccess: (link) => {
      invalidateLinkData(queryClient);
      navigate(`/links/${link.id}`);
    },
  });

  return (
    <Modal title="Create New Link" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="space-y-4"
      >
        <FormError error={createMutation.error} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Destination URL *
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/very-long-url..."
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Custom Alias (optional)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-surface-500">{SHORT_HOST}/</span>
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))}
              placeholder="my-custom-link"
              className="input-field flex-1"
              maxLength={50}
              pattern="[A-Za-z0-9_-]{3,50}"
            />
          </div>
          <p className="mt-1 text-xs text-surface-500">
            3-50 chars, letters, numbers, hyphens, underscores
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My awesome link"
            className="input-field"
            maxLength={200}
          />
        </div>

        <TagEditor tags={tags} onChange={setTags} />

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={createMutation.isPending || !url} className="btn-primary">
            {createMutation.isPending ? <Spinner size="sm" /> : "Create Link"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditLinkModal({ link, onClose }: { link: Link; onClose: () => void }) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [title, setTitle] = useState(link.title ?? "");
  const [tags, setTags] = useState<string[]>(link.tags);

  const updateMutation = useMutation({
    mutationFn: () => api.links.update(link.id, { title: title.trim() || null, tags }),
    onSuccess: () => {
      invalidateLinkData(queryClient);
      addToast("Link updated", "success");
      onClose();
    },
  });

  return (
    <Modal title={`Edit ${displayUrl(link.shortUrl)}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateMutation.mutate();
        }}
        className="space-y-4"
      >
        <FormError error={updateMutation.error} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={link.code}
            className="input-field"
            maxLength={200}
          />
        </div>

        <TagEditor tags={tags} onChange={setTags} />

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={updateMutation.isPending} className="btn-primary">
            {updateMutation.isPending ? <Spinner size="sm" /> : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
