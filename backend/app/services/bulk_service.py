"""CSV import and export of links."""
import csv
import io
from uuid import UUID

from pydantic import ValidationError

from app.core.errors import AppError
from app.models.models import Link
from app.schemas.schemas import BulkRowResult, LinkCreate
from app.services.link_service import LinkService, short_url


MAX_ROWS = 500
MAX_FILE_BYTES = 1024 * 1024
EXPORT_COLUMNS = [
    "code", "short_url", "original_url", "title", "tags",
    "total_clicks", "is_active", "expires_at", "created_at",
]
# Cells starting with these are run as formulas by spreadsheet apps
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

CsvRow = tuple[int, dict[str, str]]


def parse_csv(raw: bytes) -> list[CsvRow]:
    """Parse an uploaded CSV into (line number, row) pairs with lower-cased headers."""
    if len(raw) > MAX_FILE_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", "CSV file must be at most 1 MB")
    try:
        text = raw.decode("utf-8-sig")  # tolerate the BOM Excel adds
    except UnicodeDecodeError:
        raise AppError(400, "INVALID_CSV", "CSV file must be UTF-8 encoded") from None

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "url" not in {h.strip().lower() for h in reader.fieldnames}:
        raise AppError(400, "INVALID_CSV", "CSV must have a header row with a 'url' column")
    reader.fieldnames = [h.strip().lower() for h in reader.fieldnames]

    rows: list[CsvRow] = []
    for row in reader:
        # Extra cells land under the None key as a list; keep only named columns
        cells = {k: (v or "").strip() for k, v in row.items() if isinstance(k, str)}
        if any(cells.values()):
            rows.append((reader.line_num, cells))
        if len(rows) > MAX_ROWS:
            raise AppError(400, "TOO_MANY_ROWS", f"CSV may contain at most {MAX_ROWS} rows")
    if not rows:
        raise AppError(400, "INVALID_CSV", "CSV contains no rows")
    return rows


async def import_links(service: LinkService, user_id: UUID, rows: list[CsvRow]) -> list[BulkRowResult]:
    """Create a link per row; a bad row is reported and skipped, never aborting the batch."""
    results = []
    for line, cells in rows:
        url = cells.get("url", "")
        try:
            data = LinkCreate(
                url=url,
                title=cells.get("title") or None,
                custom_code=cells.get("custom_code") or None,
                tags=[t.strip() for t in cells.get("tags", "").split(",") if t.strip()] or None,
            )
            link = await service.create_link(
                url=data.url,
                user_id=user_id,
                custom_code=data.custom_code,
                title=data.title,
                tags=data.tags,
            )
        except ValidationError as exc:  # before ValueError: it is a subclass
            message = exc.errors()[0]["msg"].removeprefix("Value error, ")
            results.append(BulkRowResult(row=line, url=url, status="error", error=message))
        except AppError as exc:
            results.append(BulkRowResult(row=line, url=url, status="error", error=exc.message))
        except ValueError as exc:
            results.append(BulkRowResult(row=line, url=url, status="error", error=str(exc)))
        else:
            results.append(
                BulkRowResult(
                    row=line, url=url, status="success", code=link.code, short_url=short_url(link.code)
                )
            )
    return results


def _cell(value: object) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_FORMULA_PREFIXES) else text


def export_csv(links: list[Link]) -> str:
    """Render links as CSV (with a BOM so Excel detects UTF-8)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_COLUMNS)
    for link in links:
        writer.writerow(
            _cell(value)
            for value in (
                link.code,
                short_url(link.code),
                link.original_url,
                link.title,
                ",".join(tag.name for tag in link.tags),
                link.total_clicks,
                link.is_active,
                link.expires_at.isoformat() if link.expires_at else None,
                link.created_at.isoformat(),
            )
        )
    return "﻿" + buffer.getvalue()
