export interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
  createdAt: string;
}

export interface Link {
  id: string;
  code: string;
  originalUrl: string;
  shortUrl: string;
  title: string | null;
  faviconUrl: string | null;
  tags: string[];
  totalClicks: number;
  isActive: boolean;
  isPermanent: boolean;
  isCustom: boolean;
  expiresAt: string | null;
  maxClicks: number | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
  linkCount: number;
}

export interface LinkListParams {
  search?: string;
  tag?: string;
  status?: "active" | "disabled";
  sort?: "created" | "clicks";
  page?: number;
  pageSize?: number;
}

export interface LinkInput {
  url: string;
  customCode?: string;
  title?: string;
  tags?: string[];
  expiresAt?: string | null;
  maxClicks?: number | null;
  password?: string;
  isPermanent?: boolean;
}

/** PATCH semantics: only present fields change; null clears a nullable field. */
export interface LinkChanges {
  title?: string | null;
  tags?: string[];
  expiresAt?: string | null;
  maxClicks?: number | null;
  isActive?: boolean;
  isPermanent?: boolean;
}

export interface BulkRowResult {
  row: number;
  url: string;
  status: "success" | "error";
  code?: string | null;
  shortUrl?: string | null;
  error?: string | null;
}

export interface BulkImportResult {
  created: number;
  failed: number;
  results: BulkRowResult[];
}

export interface QrOptions {
  format: "png" | "svg";
  /** Pixels per QR module */
  scale?: number;
  border?: number;
  dark?: string;
  light?: string;
}

export interface ClickEvent {
  id: string;
  linkId: string;
  clickedAt: string;
  countryCode: string | null;
  city: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | null;
  os: string | null;
  browser: string | null;
  referrerDomain: string | null;
  isBot: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export interface TimeSeriesPoint {
  date: string;
  clicks: number;
  uniqueVisitors: number;
}

export interface BreakdownItem {
  name: string;
  count: number;
  percentage: number;
}

export interface StatsSummary {
  totalClicks: number;
  uniqueVisitors: number;
  botClicks: number;
  avgClicksPerDay: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface OverviewStats {
  totalLinks: number;
  totalClicks: number;
  clicksToday: number;
  uniqueVisitors: number;
}

export type Dimension =
  "country" | "city" | "device" | "os" | "browser" | "referrer" | "utm_source";

export interface StatsQuery {
  /** A single link; omitted means all of the user's links */
  linkId?: string;
  /** Only the last N days; omitted means all time */
  days?: number;
  includeBots?: boolean;
}

export type DateRange = "24h" | "7d" | "30d" | "90d" | "custom";
export type Interval = "hour" | "day" | "week";
