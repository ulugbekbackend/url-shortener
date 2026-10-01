import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ActionMenu } from "./ActionMenu";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div data-testid="clipped" style={{ overflow: "hidden" }}>
        <ActionMenu open={open} onOpenChange={setOpen}>
          <button role="menuitem">Edit</button>
        </ActionMenu>
      </div>
      <p>Outside</p>
    </div>
  );
}

describe("ActionMenu", () => {
  it("renders outside clipping containers so it is never cut off", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));

    const menu = screen.getByRole("menu");
    expect(screen.getByTestId("clipped")).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({ position: "fixed", visibility: "visible" });
    expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes on an outside click, Escape and the toggle button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Actions" });

    await user.click(toggle);
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    await user.click(toggle);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("stays open while its items are clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    // Items decide themselves whether to close (the harness item does not)
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
