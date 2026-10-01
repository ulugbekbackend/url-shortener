import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "../test/api";
import { ForgotPasswordPage, ResetPasswordPage } from "./PasswordResetPages";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  it("sends the email address and tells the user to check their inbox", async () => {
    const bodies: unknown[] = [];
    mockApi({
      "POST /auth/forgot-password": ({ body }) => {
        bodies.push(body);
        return Response.json({ message: "ok" }, { status: 202 });
      },
    });
    renderAt("/forgot-password");
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/we've sent a link/i)).toBeInTheDocument();
    expect(screen.getByText("ann@example.com")).toBeInTheDocument();
    expect(bodies).toEqual([{ email: "ann@example.com" }]);
  });

  it("shows the server's reason when email is not available", async () => {
    mockApi({
      "POST /auth/forgot-password": apiError(503, "EMAIL_DISABLED", "Email is not available"),
    });
    renderAt("/forgot-password");
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email is not available");
  });
});

describe("ResetPasswordPage", () => {
  async function fillPasswords(password: string, confirm = password) {
    await userEvent.type(screen.getByLabelText("New password"), password);
    await userEvent.type(screen.getByLabelText("Confirm new password"), confirm);
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));
  }

  it("sets the new password with the token from the link", async () => {
    const bodies: unknown[] = [];
    mockApi({
      "POST /auth/reset-password": ({ body }) => {
        bodies.push(body);
        return { message: "ok" };
      },
    });
    renderAt("/reset-password?token=tok_123");
    await fillPasswords("brand-new-pass");

    expect(await screen.findByText(/your password has been changed/i)).toBeInTheDocument();
    expect(bodies).toEqual([{ token: "tok_123", new_password: "brand-new-pass" }]);
    await userEvent.click(screen.getByRole("link", { name: /sign in/i }));
    expect(screen.getByText("Sign-in page")).toBeInTheDocument();
  });

  it("checks that both passwords match before asking the server", async () => {
    const bodies: unknown[] = [];
    mockApi({ "POST /auth/reset-password": ({ body }) => (bodies.push(body), { message: "ok" }) });
    renderAt("/reset-password?token=tok_123");
    await fillPasswords("brand-new-pass", "brand-new-pas");

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords don't match");
    expect(bodies).toEqual([]);
  });

  it("offers a new link when the token is expired or used", async () => {
    mockApi({
      "POST /auth/reset-password": apiError(
        400,
        "INVALID_RESET_TOKEN",
        "This reset link is invalid or has expired",
      ),
    });
    renderAt("/reset-password?token=old");
    await fillPasswords("brand-new-pass");

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
    expect(screen.getByRole("link", { name: /request a new link/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("explains a link without a token", () => {
    renderAt("/reset-password");
    expect(screen.getByRole("alert")).toHaveTextContent(/incomplete/i);
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
