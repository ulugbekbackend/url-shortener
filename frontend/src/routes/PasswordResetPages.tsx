import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { ApiError, errorMessage } from "../lib/http";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { Spinner } from "../components/ui/Spinner";
import { Zap, ArrowRight, Eye, EyeOff, MailCheck, CheckCircle2 } from "lucide-react";

/** Logo, subtitle and card, same frame as the sign-in pages */
function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-50 px-4 dark:bg-surface-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600">
              <Zap size={22} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-surface-900 dark:text-white">Linkly</span>
          </Link>
          <p className="mt-2 text-surface-600 dark:text-surface-400">{subtitle}</p>
        </div>

        <div className="card">{children}</div>

        <div className="mt-4 flex justify-center">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
    >
      {children}
    </div>
  );
}

function BackToSignIn() {
  return (
    <p className="mt-6 text-center text-sm text-surface-600 dark:text-surface-400">
      Remembered it?{" "}
      <Link
        to="/login"
        className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
      >
        Sign in
      </Link>
    </p>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Could not send the reset email. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell subtitle="Check your inbox">
        <div className="text-center">
          <MailCheck size={40} className="mx-auto text-primary-600 dark:text-primary-400" />
          <p className="mt-4 text-surface-700 dark:text-surface-300">
            If an account exists for <strong>{email}</strong>, we've sent a link to reset its
            password. The link is valid for one hour.
          </p>
          <p className="mt-3 text-sm text-surface-500 dark:text-surface-400">
            Nothing arrived? Check the spam folder, or{" "}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              try again
            </button>
            .
          </p>
        </div>
        <BackToSignIn />
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Reset your password">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-sm text-surface-600 dark:text-surface-400">
          Enter the email you signed up with and we'll send you a link to choose a new password.
        </p>
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-field"
            required
            autoFocus
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <>
              Send reset link <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
      <BackToSignIn />
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  // Read once: the token is then dropped from the address bar and browser history
  const [token] = useState(() => params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkDead, setLinkDead] = useState(false);

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setLinkDead(false);
      setError("Passwords don't match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setLinkDead(err instanceof ApiError && err.code === "INVALID_RESET_TOKEN");
      setError(errorMessage(err, "Could not reset the password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell subtitle="Reset your password">
        <ErrorBox>This reset link is incomplete. Open the link from the email again.</ErrorBox>
        <p className="mt-6 text-center text-sm">
          <Link
            to="/forgot-password"
            className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Request a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell subtitle="Password updated">
        <div className="text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600 dark:text-emerald-400" />
          <p className="mt-4 text-surface-700 dark:text-surface-300">
            Your password has been changed and you were signed out everywhere.
          </p>
          <Link to="/login" className="btn-primary mt-6 w-full">
            Sign in <ArrowRight size={16} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <ErrorBox>
            {error}
            {linkDead && (
              <>
                {" "}
                <Link to="/forgot-password" className="font-medium underline">
                  Request a new link
                </Link>
              </>
            )}
          </ErrorBox>
        )}
        <div>
          <label
            htmlFor="reset-password"
            className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            New password
          </label>
          <div className="relative">
            <input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="input-field !pr-10"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor="reset-confirm"
            className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input-field"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <>
              Set new password <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
