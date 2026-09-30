/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin; empty means same origin (the dev server proxies /api). */
  readonly VITE_API_URL?: string;
  /** Public base of short links, e.g. https://lnk.ly — shown in the UI. */
  readonly VITE_SHORT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
