import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { capitalize, displayUrl, formatNumber, formatDate, truncate } from "../lib/utils";
import { Spinner } from "../components/ui/Spinner";
import { CopyButton } from "../components/ui/CopyButton";
import type { DateRange, Interval } from "../types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Link2, MousePointerClick, Users, TrendingUp, Calendar } from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

const dateRanges: { label: string; value: DateRange; days: number }[] = [
  { label: "24h", value: "24h", days: 1 },
  { label: "7d", value: "7d", days: 7 },
  { label: "30d", value: "30d", days: 30 },
  { label: "90d", value: "90d", days: 90 },
];

function NoData({ className }: { className: string }) {
  return (
    <div
      className={`flex items-center justify-center text-sm text-surface-500 dark:text-surface-400 ${className}`}
    >
      No clicks in this period yet
    </div>
  );
}

export function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const days = dateRanges.find((r) => r.value === dateRange)?.days || 30;
  const interval: Interval = days <= 1 ? "hour" : days <= 30 ? "day" : "week";

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: api.stats.overview,
  });

  const { data: timeseries, isLoading: tsLoading } = useQuery({
    queryKey: ["stats", "timeseries", days, interval],
    queryFn: () => api.stats.timeseries({ days, interval }),
  });

  const { data: countries, isLoading: countriesLoading } = useQuery({
    queryKey: ["stats", "breakdown", "country", days],
    queryFn: () => api.stats.breakdown({ dimension: "country", days }),
  });

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["stats", "breakdown", "device", days],
    queryFn: () => api.stats.breakdown({ dimension: "device", days }),
  });

  const { data: topLinksPage } = useQuery({
    queryKey: ["links", "top"],
    queryFn: () => api.links.list({ sort: "clicks", pageSize: 5 }),
  });

  const topLinks = topLinksPage?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Dashboard</h1>
          <p className="text-surface-600 dark:text-surface-400">
            Overview of your link performance
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-800">
          {dateRanges.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                dateRange === r.value
                  ? "bg-primary-600 text-white"
                  : "text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Total Links",
            value: overview?.totalLinks || 0,
            icon: Link2,
            color: "text-primary-600 dark:text-primary-400",
          },
          {
            label: "Total Clicks",
            value: overview?.totalClicks || 0,
            icon: MousePointerClick,
            color: "text-emerald-600 dark:text-emerald-400",
          },
          {
            label: "Clicks Today",
            value: overview?.clicksToday || 0,
            icon: TrendingUp,
            color: "text-purple-600 dark:text-purple-400",
          },
          {
            label: "Unique Visitors",
            value: overview?.uniqueVisitors || 0,
            icon: Users,
            color: "text-amber-600 dark:text-amber-400",
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-surface-600 dark:text-surface-400">
                  {kpi.label}
                </p>
                <Icon size={20} className={kpi.color} />
              </div>
              {overviewLoading ? (
                <div className="mt-3">
                  <Spinner size="sm" />
                </div>
              ) : (
                <p className="mt-2 text-2xl font-bold text-surface-900 dark:text-white">
                  {formatNumber(kpi.value)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeseries chart */}
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">
              Clicks Over Time
            </h2>
            <Calendar size={18} className="text-surface-400" />
          </div>
          {tsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-200)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return interval === "hour"
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
                  labelFormatter={(v) => new Date(String(v)).toLocaleDateString()}
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
                  name="Unique Visitors"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Devices pie chart */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">Devices</h2>
          {devicesLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : !devices?.length ? (
            <NoData className="h-64" />
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={devices}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {devices?.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {devices?.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-sm">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-surface-600 dark:text-surface-400">
                      {capitalize(d.name)}
                    </span>
                    <span className="font-medium text-surface-900 dark:text-white">
                      {d.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top countries */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-surface-900 dark:text-white">
            Top Countries
          </h2>
          {countriesLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Spinner />
            </div>
          ) : !countries?.length ? (
            <NoData className="h-48" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={countries} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-200)" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--color-surface-400)" />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 12 }}
                  stroke="var(--color-surface-400)"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface-800)",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Clicks" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top links table */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Top Links</h2>
            <Link
              to="/links"
              className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {topLinks.map((link) => (
              <div
                key={link.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-surface-100 p-3 dark:border-surface-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-surface-900 dark:text-white">
                    {link.title || truncate(link.originalUrl, 40)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-primary-600 dark:text-primary-400">
                      {displayUrl(link.shortUrl)}
                    </span>
                    <CopyButton text={link.shortUrl} label="" className="!text-xs" />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-surface-900 dark:text-white">
                    {formatNumber(link.totalClicks)}
                  </p>
                  <p className="text-xs text-surface-500">{formatDate(link.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
