import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
});
