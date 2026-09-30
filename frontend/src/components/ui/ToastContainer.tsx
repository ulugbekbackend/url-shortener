import { useToastStore } from "../../stores/toastStore";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.type === "success" ? CheckCircle2 : toast.type === "error" ? AlertCircle : Info;
        const colors =
          toast.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
            : toast.type === "error"
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
              : "border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300";

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right ${colors}`}
            role="alert"
          >
            <Icon size={18} />
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
