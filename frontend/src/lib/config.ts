/** Public base URL of short links (e.g. https://lnk.ly); must match the backend BASE_URL. */
export const SHORT_BASE_URL = (
  import.meta.env.VITE_SHORT_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

/** Host part shown in front of custom aliases, e.g. "lnk.ly" */
export const SHORT_HOST = new URL(SHORT_BASE_URL).host;
