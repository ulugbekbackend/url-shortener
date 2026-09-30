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

export type DateRange = "24h" | "7d" | "30d" | "90d" | "custom";
export type Interval = "hour" | "day" | "week";
