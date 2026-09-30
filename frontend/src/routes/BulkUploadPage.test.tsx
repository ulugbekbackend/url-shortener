import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi } from "../test/api";
import { BulkUploadPage } from "./BulkUploadPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BulkUploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const csv = 'url,title,tags\nhttps://example.com/a,A page,"t1,t2"\nftp://bad,Bad,\n';

describe("BulkUploadPage", () => {
  let uploaded: FormData | undefined;

  beforeEach(() => {
    uploaded = undefined;
    mockApi({
      "POST /links/bulk": ({ body }) => {
        uploaded = body as FormData;
        return Response.json({
          created: 1,
          failed: 1,
          results: [
            {
              row: 2,
              url: "https://example.com/a",
              status: "success",
              code: "Xy12Ab3",
              short_url: "http://localhost:8000/Xy12Ab3",
              error: null,
            },
            {
              row: 3,
              url: "ftp://bad",
              status: "error",
              code: null,
              short_url: null,
              error: "URL must start with http:// or https://",
            },
          ],
        });
      },
    });
  });

  it("previews the file and shows the server's per-row results", async () => {
    renderPage();
    await userEvent.upload(
      screen.getByTestId("csv-input"),
      new File([csv], "links.csv", { type: "text/csv" }),
    );

    expect(await screen.findByText("t1,t2")).toBeInTheDocument(); // quoted cell kept whole
    expect(screen.getByText("2 links will be created")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /process & create/i }));
    expect(await screen.findByText("localhost:8000/Xy12Ab3")).toBeInTheDocument();
    expect(screen.getByText("URL must start with http:// or https://")).toBeInTheDocument();
    expect((uploaded?.get("file") as File).name).toBe("links.csv");
  });

  it("rejects files that are not CSV", async () => {
    renderPage();
    await userEvent.upload(
      screen.getByTestId("csv-input"),
      new File(["x"], "links.xlsx", { type: "application/vnd.ms-excel" }),
      { applyAccept: false },
    );
    expect(screen.getByText("Please choose a .csv file.")).toBeInTheDocument();
  });
});
