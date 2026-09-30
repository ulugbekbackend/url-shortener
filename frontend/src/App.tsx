import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/Spinner";
import { api } from "./lib/api";
import { refreshAccessToken } from "./lib/http";
import { useAuthStore } from "./stores/authStore";

const LandingPage = lazy(() =>
  import("./routes/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const DashboardPage = lazy(() =>
  import("./routes/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const LinksPage = lazy(() => import("./routes/LinksPage").then((m) => ({ default: m.LinksPage })));
const LinkAnalyticsPage = lazy(() =>
  import("./routes/LinkAnalyticsPage").then((m) => ({ default: m.LinkAnalyticsPage })),
);
const SettingsPage = lazy(() =>
  import("./routes/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const LoginPage = lazy(() => import("./routes/AuthPages").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("./routes/AuthPages").then((m) => ({ default: m.RegisterPage })),
);
const BulkUploadPage = lazy(() =>
  import("./routes/BulkUploadPage").then((m) => ({ default: m.BulkUploadPage })),
);
const NotFoundPage = lazy(() =>
  import("./routes/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const guestRedirect = useAuthStore((s) => s.guestRedirect);
  const location = useLocation();
  if (status === "loading") return <PageLoader />;
  if (status === "guest") {
    // Only a lost session should bring the user back here after signing in again
    const state = guestRedirect === "/login" ? { from: location } : undefined;
    return <Navigate to={guestRedirect} replace state={state} />;
  }
  return <>{children}</>;
}

/** Restore the session from the refresh cookie once, when the app starts. */
function useSessionRestore() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "loading") return;
    let cancelled = false;
    (async () => {
      const token = await refreshAccessToken();
      try {
        const user = token ? await api.auth.me() : null;
        if (cancelled) return;
        if (token && user) useAuthStore.getState().login(user, token);
        else useAuthStore.getState().logout();
      } catch {
        if (!cancelled) useAuthStore.getState().logout();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);
}

function App() {
  useSessionRestore();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AppLayout />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/links"
            element={
              <ProtectedRoute>
                <LinksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/links/new"
            element={
              <ProtectedRoute>
                <LinksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/links/bulk"
            element={
              <ProtectedRoute>
                <BulkUploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/links/:id"
            element={
              <ProtectedRoute>
                <LinkAnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default App;
