import { vi } from "vitest";

type Handler = (request: { method: string; url: URL; body: unknown }) => Response | undefined;

/** Answer API calls by "METHOD /path" (path relative to /api/v1); unknown routes get 404. */
export function mockApi(routes: Record<string, Handler | object>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      const route = routes[`${method} ${path}`];
      const response =
        typeof route === "function" ? (route as Handler)({ method, url, body }) : route;
      // A Response body can be read once; hand out copies so a route can be hit repeatedly
      if (response instanceof Response) return response.clone();
      if (response !== undefined) return Response.json(response);
      return Response.json({ error: { code: "NOT_FOUND", message: "Not Found" } }, { status: 404 });
    }),
  );
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export const linkFixture = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  code: "abc1234",
  original_url: "https://example.com/some/long/page",
  short_url: "http://localhost:8000/abc1234",
  title: "Example page",
  favicon_url: null,
  tags: ["docs"],
  total_clicks: 42,
  is_active: true,
  is_permanent: false,
  is_custom: false,
  expires_at: null,
  max_clicks: null,
  has_password: false,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
};

export const linkPage = (items = [linkFixture]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
});
