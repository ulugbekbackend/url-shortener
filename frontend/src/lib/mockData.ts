import type {
  Link,
  ClickEvent,
  TimeSeriesPoint,
  BreakdownItem,
  StatsSummary,
  ApiKey,
} from "../types";

const domains = [
  "github.com",
  "stackoverflow.com",
  "medium.com",
  "dev.to",
  "docs.python.org",
  "react.dev",
  "tailwindcss.com",
  "youtube.com",
  "twitter.com",
  "linkedin.com",
  "news.ycombinator.com",
  "reddit.com",
  "amazon.com",
  "google.com",
  "apple.com",
  "mozilla.org",
];

const titles = [
  "React Documentation",
  "GitHub - Build software better",
  "Stack Overflow - Where Developers Learn",
  "Medium - Read and write",
  "Tailwind CSS - Rapidly build modern websites",
  "YouTube - Broadcast Yourself",
  "Dev.to - Community",
  "Hacker News",
  "Reddit - Dive into anything",
  "Python Docs",
  "Apple",
  "MDN Web Docs",
];

const countries = ["US", "GB", "DE", "FR", "JP", "BR", "IN", "CA", "AU", "NL", "SE", "KR"];
const cities = [
  "New York",
  "London",
  "Berlin",
  "Paris",
  "Tokyo",
  "São Paulo",
  "Mumbai",
  "Toronto",
  "Sydney",
  "Amsterdam",
  "Stockholm",
  "Seoul",
];
const devices: Array<"desktop" | "mobile" | "tablet"> = ["desktop", "mobile", "tablet"];
const oses = ["Windows", "macOS", "Linux", "iOS", "Android"];
const browsers = ["Chrome", "Firefox", "Safari", "Edge", "Opera"];
const referrers = [
  "google.com",
  "twitter.com",
  "reddit.com",
  "news.ycombinator.com",
  "linkedin.com",
  "facebook.com",
  "direct",
  "github.com",
];
const tags = [
  "portfolio",
  "project",
  "blog",
  "docs",
  "marketing",
  "social",
  "reference",
  "tutorial",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function generateCustomCode(): string {
  const words = [
    "portfolio",
    "blog",
    "docs",
    "projects",
    "about",
    "contact",
    "resume",
    "links",
    "github",
    "demo",
  ];
  return randomFrom(words) + "-" + randomInt(1, 99);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// User-specific link storage
const userLinks: Record<string, Link[]> = {};

export function getUserLinks(userId: string): Link[] {
  if (!userLinks[userId]) {
    // Generate initial links for this user
    userLinks[userId] = generateMockLinksForUser(userId, randomInt(8, 20));
  }
  return userLinks[userId];
}

export function generateMockLinksForUser(userId: string, count: number): Link[] {
  const links: Link[] = [];
  for (let i = 0; i < count; i++) {
    const isCustom = Math.random() > 0.7;
    const code = isCustom ? generateCustomCode() : generateCode();
    const domain = randomFrom(domains);
    const path =
      "/" + randomInt(1, 9999) + "/" + randomFrom(["guide", "tutorial", "docs", "api", "blog"]);
    const originalUrl = `https://${domain}${path}`;
    const numTags = randomInt(0, 3);
    const linkTags: string[] = [];
    for (let t = 0; t < numTags; t++) {
      const tag = randomFrom(tags);
      if (!linkTags.includes(tag)) linkTags.push(tag);
    }

    links.push({
      id: `link_${userId}_${String(i + 1).padStart(3, "0")}`,
      code,
      originalUrl,
      shortUrl: `lnk.ly/${code}`,
      title: Math.random() > 0.2 ? randomFrom(titles) : null,
      faviconUrl:
        Math.random() > 0.3 ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null,
      tags: linkTags,
      totalClicks: randomInt(0, 15000),
      isActive: Math.random() > 0.1,
      isPermanent: Math.random() > 0.5,
      isCustom,
      expiresAt: Math.random() > 0.8 ? daysAgo(-randomInt(1, 30)) : null,
      maxClicks: Math.random() > 0.9 ? randomInt(100, 10000) : null,
      hasPassword: Math.random() > 0.9,
      createdAt: daysAgo(randomInt(0, 90)),
      updatedAt: daysAgo(randomInt(0, 10)),
    });
  }
  return links.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function generateTimeSeries(
  days: number,
  interval: "hour" | "day" | "week" = "day",
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const now = new Date();

  if (interval === "hour") {
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(d.getHours() - i);
      points.push({
        date: d.toISOString(),
        clicks: randomInt(5, 200),
        uniqueVisitors: randomInt(3, 150),
      });
    }
  } else if (interval === "week") {
    for (let i = Math.ceil(days / 7); i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      points.push({
        date: d.toISOString(),
        clicks: randomInt(100, 5000),
        uniqueVisitors: randomInt(50, 3000),
      });
    }
  } else {
    for (let i = days; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      points.push({
        date: d.toISOString(),
        clicks: randomInt(20, 800),
        uniqueVisitors: randomInt(10, 500),
      });
    }
  }
  return points;
}

export function generateBreakdown(dimension: string, count: number = 8): BreakdownItem[] {
  const items: BreakdownItem[] = [];
  let source: string[] = [];

  switch (dimension) {
    case "country":
      source = countries;
      break;
    case "city":
      source = cities;
      break;
    case "device":
      source = ["Desktop", "Mobile", "Tablet"];
      break;
    case "os":
      source = oses;
      break;
    case "browser":
      source = browsers;
      break;
    case "referrer":
      source = referrers;
      break;
    case "utm_source":
      source = ["google", "twitter", "newsletter", "github", "linkedin", "direct"];
      break;
    default:
      source = ["Unknown"];
  }

  const total = randomInt(1000, 10000);
  let remaining = total;

  for (let i = 0; i < Math.min(count, source.length); i++) {
    const count_ =
      i === Math.min(count, source.length) - 1
        ? remaining
        : Math.floor(remaining * (0.3 + Math.random() * 0.4));
    remaining -= count_;
    items.push({
      name: source[i],
      count: count_,
      percentage: Math.round((count_ / total) * 100),
    });
  }
  return items.sort((a, b) => b.count - a.count);
}

export function generateStatsSummary(): StatsSummary {
  return {
    totalClicks: randomInt(50000, 500000),
    uniqueVisitors: randomInt(20000, 200000),
    botClicks: randomInt(5000, 50000),
    avgClicksPerDay: randomInt(500, 5000),
  };
}

export function generateApiKeys(): ApiKey[] {
  return [
    {
      id: "key_001",
      name: "Production App",
      prefix: "lnk_prod_",
      lastUsedAt: daysAgo(0),
      createdAt: daysAgo(60),
      revokedAt: null,
    },
    {
      id: "key_002",
      name: "CI/CD Pipeline",
      prefix: "lnk_ci__",
      lastUsedAt: daysAgo(2),
      createdAt: daysAgo(30),
      revokedAt: null,
    },
    {
      id: "key_003",
      name: "Old Integration",
      prefix: "lnk_old_",
      lastUsedAt: daysAgo(45),
      createdAt: daysAgo(90),
      revokedAt: daysAgo(10),
    },
  ];
}

// Backwards compatibility
export const mockLinks = generateMockLinksForUser("default", 24);
