import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { API_BASE, errorMessage } from "../lib/http";
import { useAuthStore } from "../stores/authStore";
import { useToastStore } from "../stores/toastStore";
import { formatDate } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { Spinner } from "../components/ui/Spinner";
import { Key, Plus, Trash2, AlertTriangle, User, Shield, X, Check, Terminal } from "lucide-react";

type Tab = "api-keys" | "profile";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("api-keys");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Settings</h1>
        <p className="text-surface-600 dark:text-surface-400">Manage your account and API keys</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 dark:border-surface-700">
        <nav className="flex gap-6">
          {[
            { id: "api-keys" as Tab, label: "API Keys", icon: Key },
            { id: "profile" as Tab, label: "Profile", icon: User },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400"
                    : "border-transparent text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100"
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "api-keys" ? <ApiKeysSection /> : <ProfileSection />}
    </div>
  );
}

/** Absolute API base for the copy-paste examples */
const apiUrl = new URL(API_BASE, window.location.origin).href.replace(/\/$/, "");

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ name: string; fullKey: string } | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: api.apiKeys.list,
  });

  const addToast = useToastStore((s) => s.addToast);
  const onError = (err: unknown) => addToast(errorMessage(err), "error");

  const createMutation = useMutation({
    mutationFn: (name: string) => api.apiKeys.create(name),
    onSuccess: (data) => {
      setCreatedKey({ name: data.key.name, fullKey: data.fullKey });
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      addToast("API key revoked", "success");
    },
    onError,
  });

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
        <div className="flex items-start gap-3">
          <Shield size={20} className="mt-0.5 text-primary-600 dark:text-primary-400" />
          <div>
            <p className="text-sm font-medium text-primary-900 dark:text-primary-300">
              API keys allow programmatic access to your links
            </p>
            <p className="mt-1 text-sm text-primary-700 dark:text-primary-400">
              Use the{" "}
              <code className="rounded bg-primary-100 px-1.5 py-0.5 text-xs dark:bg-primary-900/40">
                X-API-Key
              </code>{" "}
              header to authenticate requests. Keys are shown once on creation — store them safely.
            </p>
          </div>
        </div>
      </div>

      {/* Created key modal */}
      {createdKey && (
        <div className="card border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-900 dark:text-amber-300">
                Save your API key — it won't be shown again!
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-3 dark:bg-surface-800">
                <code className="flex-1 text-sm font-mono text-surface-900 dark:text-surface-100 break-all">
                  {createdKey.fullKey}
                </code>
                <CopyButton text={createdKey.fullKey} label="Copy" />
              </div>
              <div className="mt-3 rounded-lg bg-surface-900 p-3 dark:bg-surface-950">
                <p className="mb-1 text-xs text-surface-400">Example usage:</p>
                <code className="text-xs text-emerald-400">
                  curl -H "X-API-Key: {createdKey.fullKey}" {apiUrl}/links
                </code>
              </div>
            </div>
            <button onClick={() => setCreatedKey(null)} className="btn-ghost !p-1">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Create button */}
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> Create API Key
        </button>
      </div>

      {/* Keys list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3">
          {keys?.map((key) => (
            <div key={key.id} className="card !p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-700">
                    <Key size={18} className="text-surface-600 dark:text-surface-400" />
                  </div>
                  <div>
                    <p className="font-medium text-surface-900 dark:text-white">{key.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-surface-500">
                      <code className="font-mono">{key.prefix}••••••••</code>
                      <span>•</span>
                      <span>Created {formatDate(key.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {key.revokedAt ? (
                    <Badge variant="danger">Revoked</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                  <span className="hidden text-xs text-surface-500 sm:block">
                    {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"}
                  </span>
                  {!key.revokedAt && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(`Revoke "${key.name}"? Apps using it will stop working.`)
                        ) {
                          revokeMutation.mutate(key.id);
                        }
                      }}
                      className="btn-ghost !p-2 text-red-500 hover:!bg-red-50 dark:hover:!bg-red-900/20"
                      aria-label="Revoke key"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Code sample */}
      <div className="card">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
          <Terminal size={18} /> Quick Start
        </h3>
        <div className="space-y-3">
          <div className="rounded-lg bg-surface-900 p-4 dark:bg-surface-950">
            <p className="mb-2 text-xs text-surface-400"># Create a short link</p>
            <code className="block text-sm text-emerald-400 whitespace-pre-wrap">
              {`curl -X POST ${apiUrl}/links \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com/long-url"}'`}
            </code>
          </div>
          <div className="rounded-lg bg-surface-900 p-4 dark:bg-surface-950">
            <p className="mb-2 text-xs text-surface-400"># Get link analytics</p>
            <code className="block text-sm text-emerald-400 whitespace-pre-wrap">
              {`curl ${apiUrl}/stats/links/LINK_ID/summary \\
  -H "X-API-Key: YOUR_API_KEY"`}
            </code>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-surface-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-surface-900 dark:text-white">Create API Key</h2>
              <button onClick={() => setShowCreate(false)} className="btn-ghost !p-2">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(newKeyName);
                setShowCreate(false);
                setNewKeyName("");
              }}
            >
              <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production App"
                className="input-field mb-4"
                required
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newKeyName || createMutation.isPending}
                  className="btn-primary"
                >
                  {createMutation.isPending ? <Spinner size="sm" /> : "Create Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [saved, setSaved] = useState(false);

  const profileMutation = useMutation({
    mutationFn: () => api.auth.updateProfile({ name, email }),
    onSuccess: (updated) => {
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <div className="card">
        <h2 className="mb-6 text-lg font-semibold text-surface-900 dark:text-white">
          Profile Information
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            profileMutation.mutate();
          }}
          className="space-y-4"
        >
          <FormError error={profileMutation.error} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              required
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
              Plan
            </label>
            <div className="flex items-center gap-2">
              <Badge variant="info">{user?.plan || "free"}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={profileMutation.isPending} className="btn-primary">
              {profileMutation.isPending ? <Spinner size="sm" /> : "Save Changes"}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> Saved!
              </span>
            )}
          </div>
        </form>
      </div>

      <ChangePasswordCard />
      <DeleteAccountCard />
    </div>
  );
}

function ChangePasswordCard() {
  const login = useAuthStore((s) => s.login);
  const addToast = useToastStore((s) => s.addToast);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && next !== confirm;

  const passwordMutation = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: ({ accessToken, user }) => {
      // The server ended every other session and issued new tokens for this one
      login(user, accessToken);
      setCurrent("");
      setNext("");
      setConfirm("");
      addToast("Password updated. Other devices have been signed out.", "success");
    },
  });

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">
        Change Password
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) passwordMutation.mutate();
        }}
        className="space-y-4"
      >
        <FormError error={passwordMutation.error} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Current Password
          </label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input-field"
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            New Password
          </label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="input-field"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-field"
            autoComplete="new-password"
            required
          />
          {mismatch && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Passwords don't match</p>
          )}
        </div>
        <button
          type="submit"
          disabled={passwordMutation.isPending || mismatch}
          className="btn-primary"
        >
          {passwordMutation.isPending ? <Spinner size="sm" /> : "Update Password"}
        </button>
      </form>
    </div>
  );
}

function DeleteAccountCard() {
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => api.auth.deleteAccount(password),
    onSuccess: () => {
      logout({ redirectTo: "/" });
      queryClient.clear();
    },
  });

  return (
    <div className="card border-red-200 dark:border-red-800">
      <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
      <p className="mb-4 text-sm text-surface-600 dark:text-surface-400">
        Once you delete your account, there is no going back. All your links and analytics data will
        be permanently removed.
      </p>
      {confirming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            deleteMutation.mutate();
          }}
          className="space-y-3"
        >
          <FormError error={deleteMutation.error} />
          <label
            htmlFor="delete-account-password"
            className="block text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Enter your password to confirm
          </label>
          <input
            id="delete-account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
            autoComplete="current-password"
            autoFocus
            required
          />
          <div className="flex gap-3">
            <button type="submit" disabled={deleteMutation.isPending} className="btn-danger">
              {deleteMutation.isPending ? <Spinner size="sm" /> : "Delete my account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPassword("");
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setConfirming(true)} className="btn-danger">
          Delete Account
        </button>
      )}
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
