import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { displayUrl, formatNumber, getCountryFlag } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { Spinner } from "../components/ui/Spinner";
import { QRModal } from "../components/ui/QRModal";
import type { DateRange, Dimension, Interval } from "../types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  ExternalLink,
  BarChart3,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  MousePointerClick,
  Users,
  Bot,
  QrCode,
  Eye,
} from "lucide-react";

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

const RANGE_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

function useBreakdown(
  linkId: string | undefined,
  dimension: Dimension,
  days: number,
  includeBots: boolean,
) {
  return useQuery({
    queryKey: ["stats", "breakdown", linkId, dimension, days, includeBots],
    queryFn: () => api.stats.breakdown({ linkId, dimension, days, includeBots }),
    enabled: !!linkId,
  });
}

function NoData() {
  return <p className="text-sm text-surface-500 dark:text-surface-400">No data for this period</p>;
}

export function LinkAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [interval, setInterval] = useState<Interval>("day");
  const [showBots, setShowBots] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const days = RANGE_DAYS[dateRange] ?? 30;
  // Hourly buckets over 90 days are more than the API serves
  const effectiveInterval: Interval = dateRange === "90d" && interval === "hour" ? "day" : interval;

  const { data: link, isLoading: linkLoading } = useQuery({
    queryKey: ["link", id],
    queryFn: () => api.links.get(id!),
    enabled: !!id,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["stats", "summary", id, days],
    queryFn: () => api.stats.summary({ linkId: id!, days }),
    enabled: !!link,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: timeseries, isLoading: tsLoading } = useQuery({
    queryKey: ["stats", "timeseries", id, days, effectiveInterval, showBots],
    queryFn: () =>
      api.stats.timeseries({
        linkId: id,
        days,
        interval: effectiveInterval,
        includeBots: showBots,
      }),
    enabled: !!link,
  });

  const statsLinkId = link ? id : undefined;
  const { data: countries } = useBreakdown(statsLinkId, "country", days, showBots);
  const { data: browsers } = useBreakdown(statsLinkId, "browser", days, showBots);
  const { data: referrers } = useBreakdown(statsLinkId, "referrer", days, showBots);
  const { data: devices } = useBreakdown(statsLinkId, "device", days, showBots);
  const { data: osData } = useBreakdown(statsLinkId, "os", days, showBots);

  if (linkLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="card text-center py-12">
        <p className="text-lg font-medium text-surface-900 dark:text-white">Link not found</p>
        <Link to="/links" className="btn-primary mt-4">
          Back to Links
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link to="/links" className="btn-ghost !w-fit">
          <ArrowLeft size={16} /> Back to Links
        </Link>
        <div className="card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {link.faviconUrl && (
                <img src={link.faviconUrl} alt="" className="h-10 w-10 rounded-lg" />
              )}
              <div>
                <h1 className="text-xl font-bold text-surface-900 dark:text-white">
                  {link.title || link.code}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
                    {displayUrl(link.shortUrl)}
                  </span>
                  <CopyButton text={link.shortUrl} />
                  <Badge variant={link.isActive ? "success" : "danger"}>
                    {link.isActive ? "Active" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowQR(true)} className="btn-secondary">
                <QrCode size={16} /> QR Code
              </button>
              <a
                href={link.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <ExternalLink size={16} /> Visit
              </a>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
            <span>Destination:</span>
            <span className="truncate text-surface-700 dark:text-surface-300">
              {link.originalUrl}
            </span>
          </div>
          {link.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {link.tags.map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
          {(["24h", "7d", "30d", "90d"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                dateRange === r
                  ? "bg-primary-600 text-white"
                  : "text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
            {(["hour", "day", "week"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                disabled={i === "hour" && dateRange === "90d"}
                title={
                  i === "hour" && dateRange === "90d" ? "Not available for 90 days" : undefined
                }
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  effectiveInterval === i
                    ? "bg-primary-600 text-white"
                    : "text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowBots(!showBots)}
            className={`btn-secondary ${showBots ? "!border-amber-500 !text-amber-600 dark:!text-amber-400" : ""}`}
          >
            <Bot size={16} /> {showBots ? "Bots included" : "Bots excluded"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total Clicks",
            value: summary?.totalClicks || 0,
            icon: MousePointerClick,
            color: "text-primary-600 dark:text-primary-400",
          },
          {
            label: "Unique Visitors",
            value: summary?.uniqueVisitors || 0,
            icon: Users,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Bot Clicks",
            value: summary?.botClicks || 0,
            icon: Bot,
            color: "text-amber-600 dark:text-amber-400",
          },
          {
            label: "Avg/Day",
            value: summary?.avgClicksPerDay || 0,
            icon: BarChart3,
            color: "text-purple-600 dark:text-purple-400",
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-surface-600 dark:text-surface-400">
                  {kpi.label}
                </p>
                <Icon size={18} className={kpi.color} />
              </div>
              {summaryLoading ? (
                <div className="mt-2">
                  <Spinner size="sm" />
                </div>
              ) : (
                <p className="mt-1 text-2xl font-bold text-surface-900 dark:text-white">
                  {formatNumber(kpi.value)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Timeseries */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">
          Clicks Over Time
        </h2>
        {tsLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-200)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return effectiveInterval === "hour"
                    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : d.toLocaleDateString([], { month: "short", day: "numeric" });
                }}
                tick={{ fontSize: 12 }}
                stroke="var(--color-surface-400)"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-surface-400)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-surface-800)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                labelFormatter={(v) => new Date(String(v)).toLocaleString()}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                name="Clicks"
              />
              <Line
                type="monotone"
                dataKey="uniqueVisitors"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
                name="Unique"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Countries */}
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
            <Globe size={18} /> Top Countries
          </h3>
          <div className="space-y-3">
            {countries?.length === 0 && <NoData />}
            {countries?.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="text-lg">{getCountryFlag(item.name)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-surface-900 dark:text-white">
                      {item.name}
                    </span>
                    <span className="text-sm text-surface-500">
                      {formatNumber(item.count)} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Browsers */}
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
            <Monitor size={18} /> Browsers
          </h3>
          <div className="space-y-3">
            {browsers?.length === 0 && <NoData />}
            {browsers?.map((item, i) => (
              <div key={item.name} className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: COLORS[i % COLORS.length] + "20" }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-surface-900 dark:text-white">
                      {item.name}
                    </span>
                    <span className="text-sm text-surface-500">
                      {formatNumber(item.count)} ({item.percentage}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Devices */}
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
            <Smartphone size={18} /> Devices
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { name: "Desktop", icon: Monitor, data: devices?.find((d) => d.name === "desktop") },
              { name: "Mobile", icon: Smartphone, data: devices?.find((d) => d.name === "mobile") },
              { name: "Tablet", icon: Tablet, data: devices?.find((d) => d.name === "tablet") },
            ].map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.name} className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                    <Icon size={20} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <p className="text-lg font-bold text-surface-900 dark:text-white">
                    {d.data ? `${d.data.percentage}%` : "—"}
                  </p>
                  <p className="text-xs text-surface-500">{d.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Referrers */}
        <div className="card">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-surface-900 dark:text-white">
            <Eye size={18} /> Top Referrers
          </h3>
          <div className="space-y-3">
            {referrers?.length === 0 && <NoData />}
            {referrers?.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg border border-surface-100 p-3 dark:border-surface-700"
              >
                <span className="text-sm font-medium text-surface-900 dark:text-white">
                  {item.name}
                </span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-surface-900 dark:text-white">
                    {formatNumber(item.count)}
                  </span>
                  <span className="ml-2 text-xs text-surface-500">{item.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* OS breakdown */}
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">
          Operating Systems
        </h3>
        {osData?.length === 0 && <NoData />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {osData?.map((item, i) => (
            <div
              key={item.name}
              className="rounded-lg border border-surface-100 p-4 text-center dark:border-surface-700"
            >
              <div
                className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] + "20" }}
              >
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
              </div>
              <p className="text-sm font-medium text-surface-900 dark:text-white">{item.name}</p>
              <p className="text-lg font-bold text-surface-900 dark:text-white">
                {item.percentage}%
              </p>
              <p className="text-xs text-surface-500">{formatNumber(item.count)} clicks</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2 text-sm text-surface-500 dark:text-surface-400">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        Live data — auto-refreshes every 10 seconds
      </div>

      {/* QR Modal */}
      {showQR && <QRModal link={link} onClose={() => setShowQR(false)} />}
    </div>
  );
}
