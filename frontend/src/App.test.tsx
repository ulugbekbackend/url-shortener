import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { useAuthStore } from "./stores/authStore";

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
  useAuthStore
    .getState()
    .login(
      { id: "usr_test", name: "Test User", email: "test@example.com", plan: "free" },
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
});

describe("protected routes", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/links", "Links"],
    ["/links/bulk", "Bulk Upload"],
    ["/settings", "Settings"],
  ])("renders %s", async (path, heading) => {
    signIn();
    renderAt(path);
    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it("renders link analytics for an unknown link", async () => {
    signIn();
    renderAt("/links/does-not-exist");
    expect(await screen.findByText(/link not found/i)).toBeInTheDocument();
  });
});
