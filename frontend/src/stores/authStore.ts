import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateProfile: (name: string, email: string) => void;
}

// Load from localStorage
function getStoredAuth(): { user: User | null; token: string | null } {
  try {
    const stored = localStorage.getItem("linkly-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return { user: parsed.user, token: parsed.token };
    }
  } catch {
    // ignore
  }
  return { user: null, token: null };
}

const stored = getStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!stored.user,
  user: stored.user,
  accessToken: stored.token,
  login: (user, token) => {
    localStorage.setItem("linkly-auth", JSON.stringify({ user, token }));
    set({ isAuthenticated: true, user, accessToken: token });
  },
  logout: () => {
    localStorage.removeItem("linkly-auth");
    set({ isAuthenticated: false, user: null, accessToken: null });
  },
  updateProfile: (name, email) =>
    set((state) => {
      if (!state.user) return state;
      const updated = { ...state.user, name, email };
      localStorage.setItem(
        "linkly-auth",
        JSON.stringify({ user: updated, token: state.accessToken }),
      );
      return { user: updated };
    }),
}));
