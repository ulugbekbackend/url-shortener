import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { linkFixture, mockApi } from "../../test/api";
import { QRModal } from "./QRModal";

const link = { id: linkFixture.id, code: linkFixture.code, shortUrl: linkFixture.short_url };

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QRModal link={link} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("QRModal", () => {
  it("previews the QR code rendered by the server", async () => {
    mockApi({
      [`GET /links/${link.id}/qr`]: new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { "Content-Type": "image/svg+xml" },
      }),
    });
    renderModal();
    const img = await screen.findByAltText(`QR code for ${link.shortUrl}`);
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("disables downloads while a color is not a valid hex value", async () => {
    mockApi({});
    renderModal();
    const [foregroundText] = screen.getAllByRole("textbox");
    await userEvent.clear(foregroundText);
    await userEvent.type(foregroundText, "blue");
    expect(screen.getByText(/colors must be hex values/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /png/i })).toBeDisabled();
  });
});
