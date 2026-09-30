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
  login: (user: User, token: string) => void;
  logout: () => void;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  updateProfile: (name: string, email: string) => void;
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
  login: (user, token) =>
    set({ status: "authenticated", isAuthenticated: true, user, accessToken: token }),
  logout: () => set({ status: "guest", isAuthenticated: false, user: null, accessToken: null }),
  setToken: (token) => set({ accessToken: token }),
  setUser: (user) => set({ user }),
  updateProfile: (name, email) =>
    set((state) => (state.user ? { user: { ...state.user, name, email } } : state)),
}));
