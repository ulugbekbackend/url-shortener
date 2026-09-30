import { create } from "zustand";
import type { User } from "../types";

type AuthStatus = "loading" | "authenticated" | "guest";

interface AuthState {
  /** "loading" until the session has been restored from the refresh cookie (or not). */
  status: AuthStatus;
  isAuthenticated: boolean;
  user: User | null;
  /** Kept in memory only; the httpOnly refresh cookie restores it after a reload. */
  accessToken: string | null;
  /** Where protected pages send a guest: /login after a lost session, / after signing out */
  guestRedirect: string;
  login: (user: User, token: string) => void;
  logout: (options?: { redirectTo?: string }) => void;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
}

// Older builds kept the session (and mock users) in localStorage; drop the leftovers
try {
  localStorage.removeItem("linkly-auth");
  localStorage.removeItem("linkly-users");
} catch {
  // storage unavailable
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  isAuthenticated: false,
  user: null,
  accessToken: null,
  guestRedirect: "/login",
  login: (user, token) =>
    set({
      status: "authenticated",
      isAuthenticated: true,
      user,
      accessToken: token,
      guestRedirect: "/login",
    }),
  logout: (options) =>
    set({
      status: "guest",
      isAuthenticated: false,
      user: null,
      accessToken: null,
      guestRedirect: options?.redirectTo ?? "/login",
    }),
  setToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
}));
