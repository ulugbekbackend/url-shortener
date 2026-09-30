import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('url,tags\nhttps://a.com,"t1,t2"\n')).toEqual([
      ["url", "tags"],
      ["https://a.com", "t1,t2"],
    ]);
  });

  it("handles escaped quotes, CRLF, multi-line fields and a BOM", () => {
    expect(parseCsv('﻿url,title\r\nhttps://a.com,"say ""hi""\nthere"\r\n')).toEqual([
      ["url", "title"],
      ["https://a.com", 'say "hi"\nthere'],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("url\n\nhttps://a.com\n\n")).toEqual([["url"], ["https://a.com"]]);
  });
});
