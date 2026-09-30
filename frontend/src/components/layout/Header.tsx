import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuthStore } from "../../stores/authStore";
import { useUIStore } from "../../stores/uiStore";
import { ThemeToggle } from "../ui/ThemeToggle";
import { LayoutDashboard, Link2, Settings, LogOut, Menu, X, Zap } from "lucide-react";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/links", label: "Links", icon: Link2 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Sign out locally even if the server can't be reached
    }
    logout();
    queryClient.clear();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-surface-200 bg-white/80 backdrop-blur-lg dark:border-surface-700 dark:bg-surface-900/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="btn-ghost !p-2 lg:hidden"
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link to={isAuthenticated ? "/dashboard" : "/"} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-surface-900 dark:text-white">Linkly</span>
          </Link>
        </div>

        {isAuthenticated && (
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                      : "text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-surface-900 dark:text-white">{user.name}</p>
                <p className="text-xs text-surface-500">{user.email}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="btn-ghost !p-2"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost text-sm">
                Log in
              </Link>
              <Link to="/register" className="btn-primary text-sm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && isAuthenticated && (
        <div className="border-t border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900 lg:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={toggleSidebar}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                      : "text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
