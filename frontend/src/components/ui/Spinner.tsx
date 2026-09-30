import { cn } from "../../lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-surface-300 border-t-primary-600 dark:border-surface-600 dark:border-t-primary-400",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
