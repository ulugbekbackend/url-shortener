import { cn } from "../../lib/utils";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}

const variants = {
  default: "bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-300",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400",
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span className={cn("badge", variants[variant], className)}>
      {children}
    </span>
  );
}
