import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { errorMessage } from "../lib/http";
import { displayUrl } from "../lib/utils";
import { CopyButton } from "../components/ui/CopyButton";
import { Spinner } from "../components/ui/Spinner";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { useAuthStore } from "../stores/authStore";
import {
  Zap,
  ArrowRight,
  BarChart3,
  Shield,
  QrCode,
  Globe,
  Clock,
  MousePointerClick,
  Link2,
  TrendingUp,
  Star,
  ChevronRight,
} from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function LandingPage() {
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { isAuthenticated } = useAuthStore();

  // If user is authenticated, show dashboard link prominently
  void isAuthenticated;

  const shorten = useMutation({ mutationFn: (longUrl: string) => api.shorten.anonymous(longUrl) });
  const result = shorten.data;
  const isLoading = shorten.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitted(true);
    shorten.mutate(url.trim());
  };

  return (
    <div className="min-h-screen bg-white dark:bg-surface-950">
      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="border-b border-surface-200 dark:border-surface-800"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-surface-900 dark:text-white">Linkly</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn-primary text-sm">
                Dashboard <ChevronRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-purple-50 dark:from-primary-950/20 dark:via-surface-950 dark:to-purple-950/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--color-primary-200)_0%,_transparent_50%)] opacity-30 dark:opacity-10" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mx-auto max-w-3xl text-center"
          >
            <motion.div
              variants={itemVariants}
              className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
            >
              <Star size={14} className="fill-current" />
              Trusted by 50,000+ users worldwide
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="text-4xl font-extrabold tracking-tight text-surface-900 sm:text-5xl lg:text-6xl dark:text-white"
            >
              Shorten links.{" "}
              <span className="bg-gradient-to-r from-primary-600 via-purple-600 to-primary-600 bg-clip-text text-transparent">
                Track everything.
              </span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg text-surface-600 dark:text-surface-400 sm:text-xl"
            >
              Create short, memorable links and get detailed analytics on every click. Track
              countries, devices, referrers, and more — all in real-time.
            </motion.p>

            {/* URL Input */}
            <motion.form variants={itemVariants} onSubmit={handleSubmit} className="mt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-0">
                <div className="relative flex-1">
                  <Link2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-surface-400" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setSubmitted(false);
                    }}
                    placeholder="Paste your long URL here..."
                    className="input-field h-14 !pl-12 !pr-4 !text-base sm:rounded-r-none sm:border-r-0"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary h-14 rounded-lg px-8 text-base font-semibold sm:rounded-l-none"
                >
                  {isLoading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      Shorten <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-sm text-surface-500 dark:text-surface-500">
                Free forever • No account required • Links expire after 7 days
              </p>
            </motion.form>

            {submitted && shorten.isError && (
              <p className="mt-6 text-sm font-medium text-red-600 dark:text-red-400">
                {errorMessage(shorten.error, "Could not shorten this URL")}
              </p>
            )}

            {/* Result */}
            {submitted && result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="mt-6 card mx-auto max-w-lg text-left"
              >
                <p className="text-sm text-surface-500 dark:text-surface-400">
                  Your shortened URL:
                </p>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <p className="text-lg font-semibold text-primary-600 dark:text-primary-400 truncate">
                    {displayUrl(result.shortUrl)}
                  </p>
                  <CopyButton text={result.shortUrl} />
                </div>
                <p className="mt-3 text-sm text-surface-500 dark:text-surface-400">
                  Anonymous links expire after 7 days.{" "}
                  <Link
                    to="/register"
                    className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    Sign up free
                  </Link>{" "}
                  for permanent links & full analytics.
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="text-3xl font-bold text-surface-900 dark:text-white sm:text-4xl">
              Everything you need to manage links
            </h2>
            <p className="mt-4 text-lg text-surface-600 dark:text-surface-400">
              From simple shortening to advanced analytics, Linkly has you covered.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[
              {
                icon: BarChart3,
                title: "Detailed Analytics",
                desc: "Track clicks by country, device, browser, referrer, and UTM parameters. See trends over time with interactive charts.",
                color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
              },
              {
                icon: QrCode,
                title: "QR Code Generator",
                desc: "Generate custom QR codes for every link. Download as PNG or SVG with custom colors and sizes.",
                color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
              },
              {
                icon: Shield,
                title: "Password Protection",
                desc: "Lock sensitive links behind a password. Only authorized visitors can access the destination URL.",
                color:
                  "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
              },
              {
                icon: Globe,
                title: "Custom Aliases",
                desc: "Create memorable branded short links like lnk.ly/your-brand instead of random codes.",
                color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
              },
              {
                icon: Clock,
                title: "Link Expiration",
                desc: "Set links to auto-expire after a date or number of clicks. Perfect for time-limited campaigns.",
                color: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
              },
              {
                icon: MousePointerClick,
                title: "Real-time Clicks",
                desc: "See clicks as they happen with a live counter that updates every 10 seconds on your analytics page.",
                color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={itemVariants}
                  className="card group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                >
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.color} group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-surface-600 dark:text-surface-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-surface-200 bg-gradient-to-b from-surface-50 to-white dark:border-surface-800 dark:from-surface-900 dark:to-surface-950">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { value: "10M+", label: "Links shortened", icon: Link2 },
              { value: "500M+", label: "Clicks tracked", icon: MousePointerClick },
              { value: "99.9%", label: "Uptime SLA", icon: TrendingUp },
              { value: "<50ms", label: "Redirect latency", icon: Zap },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="group"
                >
                  <Icon
                    size={24}
                    className="mx-auto mb-3 text-primary-500 dark:text-primary-400 group-hover:scale-110 transition-transform"
                  />
                  <p className="text-3xl font-extrabold text-surface-900 dark:text-white sm:text-4xl">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm font-medium text-surface-600 dark:text-surface-400">
                    {stat.label}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-surface-900 dark:text-white">How it works</h2>
            <p className="mt-4 text-lg text-surface-600 dark:text-surface-400">
              Three simple steps to start tracking your links
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Paste your URL",
                desc: "Enter any long URL and optionally customize the short code.",
              },
              {
                step: "2",
                title: "Share your link",
                desc: "Copy your shortened URL and share it anywhere — social media, emails, print.",
              },
              {
                step: "3",
                title: "Track analytics",
                desc: "Monitor clicks in real-time. See who's clicking, from where, and when.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-xl font-bold text-white shadow-lg shadow-primary-600/20">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-surface-600 dark:text-surface-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-br from-primary-600 to-purple-700 p-10 text-center shadow-xl"
          >
            <h2 className="text-3xl font-bold text-white">Ready to take control of your links?</h2>
            <p className="mt-4 text-lg text-primary-100">
              Join thousands of marketers, developers, and creators who trust Linkly.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-3 text-base font-semibold text-primary-700 shadow-sm transition-all hover:bg-primary-50"
              >
                Get started free <ArrowRight size={18} />
              </Link>
              <Link
                to="/links"
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-8 py-3 text-base font-semibold text-white transition-all hover:bg-white/10"
              >
                View demo links
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-200 dark:border-surface-800">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary-600">
                <Zap size={12} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-surface-900 dark:text-white">Linkly</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-surface-500 dark:text-surface-400">
              <Link
                to="/dashboard"
                className="hover:text-surface-900 dark:hover:text-white transition-colors"
              >
                Dashboard
              </Link>
              <Link
                to="/links"
                className="hover:text-surface-900 dark:hover:text-white transition-colors"
              >
                Links
              </Link>
              <Link
                to="/settings"
                className="hover:text-surface-900 dark:hover:text-white transition-colors"
              >
                Settings
              </Link>
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              © 2026 Linkly. Open source.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
