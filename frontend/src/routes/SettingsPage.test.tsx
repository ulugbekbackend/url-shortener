import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";
import { useAuthStore } from "../stores/authStore";
import { apiError, mockApi } from "../test/api";

const user = {
  id: "u1",
  name: "Ann",
  email: "ann@example.com",
  plan: "free",
  createdAt: "2026-01-01T00:00:00Z",
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openProfileTab() {
  await userEvent.click(await screen.findByRole("button", { name: /profile/i }));
}

beforeEach(() => {
  useAuthStore.getState().login(user, "tok");
});

describe("Settings", () => {
  it("lists API keys and shows a new key once", async () => {
    const key = {
      id: "k1",
      name: "CI",
      prefix: "lnk_abcdefgh_",
      last_used_at: null,
      created_at: "2026-09-01T00:00:00Z",
      revoked_at: null,
    };
    mockApi({
      "GET /api-keys": [key],
      "POST /api-keys": { key: { ...key, id: "k2", name: "Deploy" }, full_key: "lnk_full_secret" },
    });
    renderSettings();
    expect(await screen.findByText("CI")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create api key/i }));
    await userEvent.type(screen.getByPlaceholderText(/production app/i), "Deploy");
    await userEvent.click(screen.getByRole("button", { name: /create key/i }));
    expect(await screen.findByText("lnk_full_secret")).toBeInTheDocument();
  });

  it("saves the profile through the API", async () => {
    mockApi({
      "GET /api-keys": [],
      "PATCH /auth/me": ({ body }) =>
        Response.json({ ...user, ...(body as object), created_at: user.createdAt }),
    });
    renderSettings();
    await openProfileTab();
    const nameInput = screen.getByDisplayValue("Ann");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Annie");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
    expect(useAuthStore.getState().user?.name).toBe("Annie");
  });

  it("shows the server error when the email is taken", async () => {
    mockApi({
      "GET /api-keys": [],
      "PATCH /auth/me": apiError(409, "EMAIL_TAKEN", "User with this email already exists"),
    });
    renderSettings();
    await openProfileTab();
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("User with this email already exists")).toBeInTheDocument();
  });

  it("refuses to change the password when the confirmation differs", async () => {
    mockApi({ "GET /api-keys": [] });
    renderSettings();
    await openProfileTab();
    const [, newPassword, confirmPassword] =
      document.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await userEvent.type(newPassword, "secret123");
    await userEvent.type(confirmPassword, "secret124");
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  it("deletes the account after the password is confirmed", async () => {
    let deletedWith: unknown;
    mockApi({
      "GET /api-keys": [],
      "DELETE /auth/me": ({ body }) => {
        deletedWith = body;
        return new Response(null, { status: 204 });
      },
    });
    renderSettings();
    await openProfileTab();
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.type(screen.getByLabelText(/enter your password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(await screen.findByPlaceholderText(/paste your long url/i)).toBeInTheDocument();
    expect(deletedWith).toEqual({ password: "secret123" });
    expect(useAuthStore.getState().status).toBe("guest");
  });
});
