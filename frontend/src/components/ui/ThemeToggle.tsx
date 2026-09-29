import { useUIStore } from "../../stores/uiStore";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();
  return (
    <button
      onClick={toggleTheme}
      className="btn-ghost !p-2 rounded-lg"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
