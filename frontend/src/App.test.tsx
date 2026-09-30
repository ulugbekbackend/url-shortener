import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { useAuthStore } from "./stores/authStore";
import { apiError, linkFixture, linkPage, mockApi } from "./test/api";

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn() {
  useAuthStore.getState().login(
    {
      id: "usr_test",
      name: "Test User",
      email: "test@example.com",
      plan: "free",
      createdAt: "2026-01-01T00:00:00Z",
    },
    "tok_test",
  );
}

afterEach(() => {
  useAuthStore.getState().logout();
});

describe("public routes", () => {
  it("renders the landing page", async () => {
    renderAt("/");
    expect(await screen.findByPlaceholderText(/paste your long url/i)).toBeInTheDocument();
  });

  it("renders the login page", async () => {
    renderAt("/login");
    expect(await screen.findByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it("renders the register page", async () => {
    renderAt("/register");
    expect(await screen.findByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("renders 404 for unknown paths", async () => {
    renderAt("/no-such-page");
    expect(await screen.findByText("404")).toBeInTheDocument();
  });

  it("redirects guests from protected pages to login", async () => {
    renderAt("/dashboard");
    expect(await screen.findByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it("shows the server's message when sign in fails", async () => {
    mockApi({
      "POST /auth/login": apiError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
    });
    renderAt("/login");
    await userEvent.type(await screen.findByPlaceholderText("you@example.com"), "a@b.co");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "wrong-pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("signs in and opens the dashboard", async () => {
    mockApi({
      "POST /auth/login": {
        access_token: "tok_new",
        token_type: "bearer",
        user: { id: "u1", name: "Ann", email: "a@b.co", plan: "free", created_at: "2026-01-01" },
      },
      "GET /links": linkPage(),
      "GET /tags": [],
    });
    renderAt("/login");
    await userEvent.type(await screen.findByPlaceholderText("you@example.com"), "a@b.co");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe("tok_new");
  });

  it("shortens a URL anonymously", async () => {
    mockApi({ "POST /links/anonymous": linkFixture });
    renderAt("/");
    await userEvent.type(
      await screen.findByPlaceholderText(/paste your long url/i),
      "https://example.com/some/long/page",
    );
    await userEvent.click(screen.getByRole("button", { name: /shorten/i }));
    expect(await screen.findByText("localhost:8000/abc1234")).toBeInTheDocument();
  });

  it("shows why a URL could not be shortened", async () => {
    mockApi({
      "POST /links/anonymous": apiError(400, "INVALID_INPUT", "Local addresses are not allowed"),
    });
    renderAt("/");
    await userEvent.type(
      await screen.findByPlaceholderText(/paste your long url/i),
      "http://localhost/x",
    );
    await userEvent.click(screen.getByRole("button", { name: /shorten/i }));
    expect(await screen.findByText("Local addresses are not allowed")).toBeInTheDocument();
  });
});

describe("protected routes", () => {
  beforeEach(() => {
    signIn();
    mockApi({ "GET /links": linkPage(), "GET /tags": [] });
  });

  it("signing out lands on the home page", async () => {
    mockApi({ "GET /links": linkPage(), "GET /tags": [], "POST /auth/logout": {} });
    renderAt("/links");
    await userEvent.click(await screen.findByRole("button", { name: /logout/i }));
    expect(await screen.findByPlaceholderText(/paste your long url/i)).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("guest");
  });

  it("an expired session sends the user to sign in", async () => {
    mockApi({
      "GET /links": apiError(401, "INVALID_TOKEN", "Invalid or expired token"),
      "GET /tags": [],
      "POST /auth/refresh": apiError(401, "INVALID_REFRESH_TOKEN", "Refresh token not found"),
    });
    renderAt("/links");
    expect(await screen.findByText(/sign in to your account/i)).toBeInTheDocument();
  });

  it("lists the user's links from the API", async () => {
    renderAt("/links");
    expect(await screen.findByText("Example page")).toBeInTheDocument();
    expect(screen.getByText("1 links total")).toBeInTheDocument();
    expect(screen.getByText("localhost:8000/abc1234")).toBeInTheDocument();
  });

  it.each([
    ["/dashboard", "Dashboard"],
    ["/links", "Links"],
    ["/links/bulk", "Bulk Upload"],
    ["/settings", "Settings"],
  ])("renders %s", async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("renders link analytics for an unknown link", async () => {
    renderAt("/links/does-not-exist");
    expect(await screen.findByText(/link not found/i)).toBeInTheDocument();
  });

  it("shows account totals on the dashboard", async () => {
    mockApi({
      "GET /links": linkPage(),
      "GET /stats/overview": {
        total_links: 7,
        total_clicks: 1234,
        clicks_today: 56,
        unique_visitors: 890,
      },
      "GET /stats/timeseries": [],
      "GET /stats/breakdown": [],
    });
    renderAt("/dashboard");
    expect(await screen.findByText("1.2K")).toBeInTheDocument();
    expect(screen.getByText("890")).toBeInTheDocument();
    expect(await screen.findAllByText("No clicks in this period yet")).toHaveLength(2);
  });

  it("shows link stats and re-queries with bots when asked", async () => {
    const breakdownQueries: URLSearchParams[] = [];
    const statsBase = `/stats/links/${linkFixture.id}`;
    mockApi({
      [`GET /links/${linkFixture.id}`]: linkFixture,
      [`GET ${statsBase}/summary`]: {
        total_clicks: 42,
        unique_visitors: 30,
        bot_clicks: 5,
        avg_clicks_per_day: 1.4,
      },
      [`GET ${statsBase}/timeseries`]: [],
      [`GET ${statsBase}/breakdown`]: ({ url }) => {
        breakdownQueries.push(url.searchParams);
        return url.searchParams.get("dimension") === "device"
          ? Response.json([{ name: "mobile", count: 30, percentage: 100 }])
          : Response.json([]);
      },
    });
    renderAt(`/links/${linkFixture.id}`);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Example page" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("30")).toBeInTheDocument(); // unique visitors
    expect(await screen.findByText("100%")).toBeInTheDocument(); // mobile, matched case-insensitively
    expect(breakdownQueries.every((q) => q.get("include_bots") === "false")).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: /bots excluded/i }));
    await screen.findByRole("button", { name: /bots included/i });
    await waitFor(() =>
      expect(breakdownQueries.some((q) => q.get("include_bots") === "true")).toBe(true),
    );
  });
});
