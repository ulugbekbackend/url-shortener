import type {
  ApiKey,
  BreakdownItem,
  Dimension,
  Interval,
  Link,
  LinkChanges,
  LinkInput,
  LinkListParams,
  OverviewStats,
  Page,
  QrOptions,
  StatsQuery,
  StatsSummary,
  Tag,
  TimeSeriesPoint,
  User,
} from "../types";
import { ApiError, request } from "./http";
import { generateApiKeys } from "./mockData";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** from_date for "the last N days"; the server defaults to_date to now */
function since(days?: number) {
  return days ? { fromDate: new Date(Date.now() - days * 86_400_000).toISOString() } : {};
}

function statsPath(linkId: string | undefined, kind: "timeseries" | "breakdown") {
  return linkId ? `/stats/links/${linkId}/${kind}` : `/stats/${kind}`;
}

export const api = {
  auth: {
    register: (email: string, password: string, name: string) =>
      request<User>("/auth/register", {
        method: "POST",
        body: { email, password, name },
        auth: false,
      }),
    login: (email: string, password: string) =>
      request<{ accessToken: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      }),
    logout: () => request<void>("/auth/logout", { method: "POST", auth: false }),
    me: () => request<User>("/auth/me"),
  },
  links: {
    list: (params: LinkListParams = {}) => request<Page<Link>>("/links", { query: { ...params } }),
    /** null when the link doesn't exist or isn't the user's */
    get: async (id: string): Promise<Link | null> => {
      try {
        return await request<Link>(`/links/${id}`);
      } catch (err) {
        // 422: the id is not even a UUID
        if (err instanceof ApiError && (err.status === 404 || err.status === 422)) return null;
        throw err;
      }
    },
    create: (input: LinkInput) => request<Link>("/links", { method: "POST", body: input }),
    update: (id: string, changes: LinkChanges) =>
      request<Link>(`/links/${id}`, { method: "PATCH", body: changes }),
    toggle: (link: Link) =>
      request<Link>(`/links/${link.id}`, { method: "PATCH", body: { isActive: !link.isActive } }),
    delete: (id: string) => request<void>(`/links/${id}`, { method: "DELETE" }),
    qr: (id: string, options: QrOptions) =>
      request<Blob>(`/links/${id}/qr`, { query: { ...options }, responseType: "blob" }),
  },
  tags: {
    list: () => request<Tag[]>("/tags"),
  },
  stats: {
    overview: () => request<OverviewStats>("/stats/overview"),
    summary: ({ linkId, days }: StatsQuery & { linkId: string }) =>
      request<StatsSummary>(`/stats/links/${linkId}/summary`, { query: since(days) }),
    timeseries: ({ linkId, days, includeBots, interval }: StatsQuery & { interval: Interval }) =>
      request<TimeSeriesPoint[]>(statsPath(linkId, "timeseries"), {
        query: { ...since(days), interval, includeBots },
      }),
    breakdown: ({ linkId, days, includeBots, dimension }: StatsQuery & { dimension: Dimension }) =>
      request<BreakdownItem[]>(statsPath(linkId, "breakdown"), {
        query: { ...since(days), dimension, includeBots },
      }),
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
    anonymous: (url: string) =>
      request<Link>("/links/anonymous", { method: "POST", body: { url }, auth: false }),
  },
};
