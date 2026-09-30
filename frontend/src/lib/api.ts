import type { Link, TimeSeriesPoint, BreakdownItem, StatsSummary, ApiKey } from "../types";
import {
  getUserLinks,
  generateTimeSeries,
  generateBreakdown,
  generateStatsSummary,
  generateApiKeys,
} from "./mockData";
import { useAuthStore } from "../stores/authStore";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getCurrentUserId(): string {
  const user = useAuthStore.getState().user;
  return user?.id || "anonymous";
}

export const api = {
  auth: {
    register: async (
      email: string,
      password: string,
      name: string,
    ): Promise<{
      user: { id: string; name: string; email: string; plan: string };
      token: string;
    }> => {
      await delay(600);
      const id = `usr_${Date.now().toString(36)}`;
      const token = `tok_${Math.random().toString(36).substring(2)}`;
      return {
        user: { id, name, email, plan: "free" },
        token,
      };
    },
    login: async (
      email: string,
      _password: string,
    ): Promise<{
      user: { id: string; name: string; email: string; plan: string };
      token: string;
    }> => {
      await delay(600);
      // Simulate finding user by email
      const stored = localStorage.getItem("linkly-users");
      const users: Record<string, { id: string; name: string; email: string; password: string }> =
        stored ? JSON.parse(stored) : {};

      const user = Object.values(users).find((u) => u.email === email);
      if (user) {
        return {
          user: { id: user.id, name: user.name, email: user.email, plan: "free" },
          token: `tok_${Math.random().toString(36).substring(2)}`,
        };
      }
      throw new Error("Invalid email or password");
    },
    saveUser: (user: { id: string; name: string; email: string; password: string }) => {
      const stored = localStorage.getItem("linkly-users");
      const users: Record<string, { id: string; name: string; email: string; password: string }> =
        stored ? JSON.parse(stored) : {};
      users[user.id] = user;
      localStorage.setItem("linkly-users", JSON.stringify(users));
    },
  },
  links: {
    list: async (params?: { search?: string; tag?: string; status?: string }): Promise<Link[]> => {
      await delay(300);
      const userId = getCurrentUserId();
      let result = [...getUserLinks(userId)];

      if (params?.search) {
        const s = params.search.toLowerCase();
        result = result.filter(
          (l) =>
            l.title?.toLowerCase().includes(s) ||
            l.originalUrl.toLowerCase().includes(s) ||
            l.code.toLowerCase().includes(s),
        );
      }
      if (params?.tag) {
        result = result.filter((l) => l.tags.includes(params.tag!));
      }
      if (params?.status === "active") result = result.filter((l) => l.isActive);
      if (params?.status === "disabled") result = result.filter((l) => !l.isActive);
      return result;
    },
    get: async (id: string): Promise<Link | null> => {
      await delay(200);
      const userId = getCurrentUserId();
      const links = getUserLinks(userId);
      const link = links.find((l) => l.id === id);
      // Ownership check: only return if it belongs to current user
      if (link && link.id.includes(userId)) {
        return link;
      }
      // Also allow if user just created it (new links)
      if (link) return link;
      return null;
    },
    create: async (data: {
      url: string;
      customCode?: string;
      title?: string;
      tags?: string[];
    }): Promise<Link> => {
      await delay(500);
      const userId = getCurrentUserId();
      const code = data.customCode || Math.random().toString(36).substring(2, 9);
      const newLink: Link = {
        id: `link_${userId}_${Date.now()}`,
        code,
        originalUrl: data.url,
        shortUrl: `lnk.ly/${code}`,
        title: data.title || null,
        faviconUrl: `https://www.google.com/s2/favicons?domain=${new URL(data.url).hostname}&sz=32`,
        tags: data.tags || [],
        totalClicks: 0,
        isActive: true,
        isPermanent: false,
        isCustom: !!data.customCode,
        expiresAt: null,
        maxClicks: null,
        hasPassword: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Add to user's links
      const links = getUserLinks(userId);
      links.unshift(newLink);
      return newLink;
    },
    delete: async (id: string): Promise<void> => {
      await delay(300);
      const userId = getCurrentUserId();
      const links = getUserLinks(userId);
      const idx = links.findIndex((l) => l.id === id);
      if (idx >= 0) links.splice(idx, 1);
    },
    toggle: async (id: string): Promise<Link> => {
      await delay(200);
      const userId = getCurrentUserId();
      const links = getUserLinks(userId);
      const link = links.find((l) => l.id === id);
      if (!link) throw new Error("Link not found");
      link.isActive = !link.isActive;
      link.updatedAt = new Date().toISOString();
      return { ...link };
    },
  },
  stats: {
    summary: async (_linkId?: string): Promise<StatsSummary> => {
      await delay(300);
      return generateStatsSummary();
    },
    timeseries: async (
      _linkId?: string,
      days?: number,
      interval?: "hour" | "day" | "week",
    ): Promise<TimeSeriesPoint[]> => {
      await delay(400);
      return generateTimeSeries(days || 30, interval || "day");
    },
    breakdown: async (_linkId: string, dimension: string): Promise<BreakdownItem[]> => {
      await delay(300);
      return generateBreakdown(dimension);
    },
    overview: async (): Promise<{
      totalLinks: number;
      totalClicks: number;
      clicksToday: number;
      uniqueVisitors: number;
    }> => {
      await delay(300);
      const userId = getCurrentUserId();
      const links = getUserLinks(userId);
      return {
        totalLinks: links.length,
        totalClicks: links.reduce((s, l) => s + l.totalClicks, 0),
        clicksToday: Math.floor(Math.random() * 5000) + 1000,
        uniqueVisitors: Math.floor(Math.random() * 3000) + 500,
      };
    },
  },
  apiKeys: {
    list: async (): Promise<ApiKey[]> => {
      await delay(300);
      return generateApiKeys();
    },
    create: async (name: string): Promise<{ key: ApiKey; fullKey: string }> => {
      await delay(500);
      const fullKey = `lnk_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
      return {
        key: {
          id: `key_${Date.now()}`,
          name,
          prefix: fullKey.substring(0, 12) + "_",
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
          revokedAt: null,
        },
        fullKey,
      };
    },
    revoke: async (id: string): Promise<void> => {
      await delay(300);
      void id;
    },
  },
  shorten: {
    anonymous: async (_url: string): Promise<{ shortUrl: string; code: string }> => {
      await delay(600);
      const code = Math.random().toString(36).substring(2, 9);
      return { shortUrl: `lnk.ly/${code}`, code };
    },
  },
};
