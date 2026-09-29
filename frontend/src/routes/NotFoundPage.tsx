import { Link } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 dark:bg-surface-950">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-100 dark:bg-primary-900/30">
            <Zap size={32} className="text-primary-600 dark:text-primary-400" />
          </div>
        </div>
        <h1 className="text-6xl font-extrabold text-surface-900 dark:text-white">404</h1>
        <p className="mt-4 text-xl font-medium text-surface-600 dark:text-surface-400">
          Page not found
        </p>
        <p className="mt-2 text-surface-500 dark:text-surface-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link to="/" className="btn-primary">
            <ArrowLeft size={16} /> Go Home
          </Link>
          <Link to="/dashboard" className="btn-secondary">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
