import asyncio

import httpx
import pytest

from tests.conftest import create_link, register

API = "/api/v1"


async def test_create_link_returns_full_short_url(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], title="Docs", tags=["a", "a ", "b"])
    assert link["short_url"] == f"http://short.test/{link['code']}"
    assert len(link["code"]) == 7
    assert link["tags"] == ["a", "b"]  # stripped and de-duplicated
    assert link["total_clicks"] == 0


@pytest.mark.parametrize(
    ("url", "message"),
    [
        ("ftp://example.com", "URL must start with http:// or https://"),
        ("http://localhost:3000", "Local addresses are not allowed"),
        ("http://192.168.1.10/admin", "Private or reserved IP addresses are not allowed"),
        ("http://2130706433/", "Private or reserved IP addresses are not allowed"),
        ("http://intranet", "URL host is invalid"),
        ("http://short.test/abc", "Links to the shortener itself are not allowed"),
    ],
)
async def test_create_link_rejects_unsafe_urls(
    client: httpx.AsyncClient, user: dict, url: str, message: str
) -> None:
    res = await client.post(f"{API}/links", json={"url": url}, headers=user["headers"])
    assert res.status_code in (400, 422)
    assert message in res.json()["error"]["message"]


async def test_custom_code_rules(client: httpx.AsyncClient, user: dict) -> None:
    await create_link(client, user["headers"], custom_code="promo")

    res = await client.post(
        f"{API}/links",
        json={"url": "https://a.com", "custom_code": "promo"},
        headers=user["headers"],
    )
    assert res.status_code == 409 and res.json()["error"]["code"] == "CODE_TAKEN"

    res = await client.post(
        f"{API}/links",
        json={"url": "https://a.com", "custom_code": "dashboard"},
        headers=user["headers"],
    )
    assert res.status_code == 400 and "reserved" in res.json()["error"]["message"]


async def test_concurrent_custom_code_race_yields_one_winner(
    client: httpx.AsyncClient, user: dict
) -> None:
    body = {"url": "https://a.com", "custom_code": "raced"}
    results = await asyncio.gather(
        *(client.post(f"{API}/links", json=body, headers=user["headers"]) for _ in range(3))
    )
    assert sorted(r.status_code for r in results) == [201, 409, 409]


async def test_tag_limits(client: httpx.AsyncClient, user: dict) -> None:
    res = await client.post(
        f"{API}/links", json={"url": "https://a.com", "tags": ["t" * 51]}, headers=user["headers"]
    )
    assert res.status_code == 422


async def test_links_are_private_to_their_owner(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"])
    other = await register(client)
    for method in ("GET", "PATCH", "DELETE"):
        res = await client.request(
            method, f"{API}/links/{link['id']}", json={"title": "x"}, headers=other["headers"]
        )
        assert res.status_code == 404, method
    listed = await client.get(f"{API}/links", headers=other["headers"])
    assert listed.json()["total"] == 0


async def test_list_search_filter_sort_and_paginate(client: httpx.AsyncClient, user: dict) -> None:
    h = user["headers"]
    for i in range(5):
        await create_link(client, h, url=f"https://example.com/{i}", title=f"Item {i}", tags=["x"])
    special = await create_link(client, h, title="Special report", tags=["y"])
    await client.patch(f"{API}/links/{special['id']}", json={"is_active": False}, headers=h)

    page = (await client.get(f"{API}/links?page=2&page_size=2", headers=h)).json()
    assert page["total"] == 6 and len(page["items"]) == 2 and page["page"] == 2

    found = (await client.get(f"{API}/links?search=special", headers=h)).json()
    assert [i["title"] for i in found["items"]] == ["Special report"]

    disabled = (await client.get(f"{API}/links?status=disabled", headers=h)).json()
    assert disabled["total"] == 1
    active = (await client.get(f"{API}/links?status=active", headers=h)).json()
    assert active["total"] == 5

    tagged = (await client.get(f"{API}/links?tag=y", headers=h)).json()
    assert tagged["total"] == 1

    newest = (await client.get(f"{API}/links?page_size=1", headers=h)).json()
    assert newest["items"][0]["id"] == special["id"]


async def test_partial_update_and_clearing_fields(client: httpx.AsyncClient, user: dict) -> None:
    h = user["headers"]
    link = await create_link(
        client, h, title="T", tags=["a"], max_clicks=5, expires_at="2030-01-01T00:00:00Z"
    )
    url = f"{API}/links/{link['id']}"

    res = (await client.patch(url, json={"title": "New"}, headers=h)).json()
    assert res["title"] == "New" and res["max_clicks"] == 5 and res["tags"] == ["a"]

    res = (await client.patch(url, json={"max_clicks": None, "expires_at": None}, headers=h)).json()
    assert res["max_clicks"] is None and res["expires_at"] is None

    res = (await client.patch(url, json={"tags": []}, headers=h)).json()
    assert res["tags"] == []

    res = (await client.patch(url, json={"is_active": None}, headers=h)).json()
    assert res["is_active"] is True  # non-nullable fields ignore null


async def test_delete_link(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"])
    url = f"{API}/links/{link['id']}"
    assert (await client.delete(url, headers=user["headers"])).status_code == 204
    assert (await client.get(url, headers=user["headers"])).status_code == 404


async def test_anonymous_link_expires_after_a_week(client: httpx.AsyncClient) -> None:
    res = await client.post(f"{API}/links/anonymous", json={"url": "https://example.com"})
    assert res.status_code == 201
    assert res.json()["expires_at"] is not None


async def test_api_key_access_and_revocation(client: httpx.AsyncClient, user: dict) -> None:
    created = await client.post(f"{API}/api-keys", json={"name": "ci"}, headers=user["headers"])
    key = created.json()
    key_headers = {"X-API-Key": key["full_key"]}

    assert (
        await client.post(f"{API}/links", json={"url": "https://a.com"}, headers=key_headers)
    ).status_code == 201
    assert (await client.get(f"{API}/links", headers=key_headers)).json()["total"] == 1
    assert (await client.get(f"{API}/stats/overview", headers=key_headers)).status_code == 200

    # Key management and the profile stay JWT-only
    assert (await client.get(f"{API}/api-keys", headers=key_headers)).status_code == 401
    assert (await client.get(f"{API}/auth/me", headers=key_headers)).status_code == 401

    listed = (await client.get(f"{API}/api-keys", headers=user["headers"])).json()
    assert listed[0]["last_used_at"] is not None

    await client.delete(f"{API}/api-keys/{key['key']['id']}", headers=user["headers"])
    assert (await client.get(f"{API}/links", headers=key_headers)).status_code == 401


async def test_revoking_a_key_twice_keeps_the_first_time(
    client: httpx.AsyncClient, user: dict
) -> None:
    h = user["headers"]
    created = await client.post(f"{API}/api-keys", json={"name": "ci"}, headers=h)
    key_id = created.json()["key"]["id"]
    assert (await client.delete(f"{API}/api-keys/{key_id}", headers=h)).status_code == 204
    first = (await client.get(f"{API}/api-keys", headers=h)).json()[0]["revoked_at"]
    assert first is not None

    assert (await client.delete(f"{API}/api-keys/{key_id}", headers=h)).status_code == 204
    assert (await client.get(f"{API}/api-keys", headers=h)).json()[0]["revoked_at"] == first


async def test_tags_list_with_counts(client: httpx.AsyncClient, user: dict) -> None:
    h = user["headers"]
    await create_link(client, h, tags=["common", "rare"])
    await create_link(client, h, url="https://example.com/2", tags=["common"])
    tags = (await client.get(f"{API}/tags", headers=h)).json()
    assert [(t["name"], t["link_count"]) for t in tags] == [("common", 2), ("rare", 1)]


async def test_bulk_import_reports_each_row(client: httpx.AsyncClient, user: dict) -> None:
    csv = (
        "﻿URL,Title,Tags,custom_code\n"
        'https://example.com/a,A,"t1,t2",bulk-a\n'
        "ftp://bad,Bad,,\n"
        "\n"
        "https://example.com/b,,,bulk-a\n"
    )
    res = await client.post(
        f"{API}/links/bulk", files={"file": ("links.csv", csv.encode())}, headers=user["headers"]
    )
    body = res.json()
    assert res.status_code == 200
    assert (body["created"], body["failed"]) == (1, 2)
    first, bad, taken = body["results"]
    assert first["status"] == "success" and first["short_url"] == "http://short.test/bulk-a"
    assert bad["error"] == "URL must start with http:// or https://"
    assert taken["error"] == "Code 'bulk-a' is already taken"


@pytest.mark.parametrize(
    ("content", "code"),
    [(b"title\nx\n", "INVALID_CSV"), (b"\xff\xfe\x00", "INVALID_CSV"), (b"url\n", "INVALID_CSV")],
)
async def test_bulk_import_rejects_bad_files(
    client: httpx.AsyncClient, user: dict, content: bytes, code: str
) -> None:
    res = await client.post(
        f"{API}/links/bulk", files={"file": ("x.csv", content)}, headers=user["headers"]
    )
    assert res.status_code == 400 and res.json()["error"]["code"] == code


async def test_bulk_import_row_limit(client: httpx.AsyncClient, user: dict) -> None:
    rows = "url\n" + "".join(f"https://example.com/{i}\n" for i in range(501))
    res = await client.post(
        f"{API}/links/bulk", files={"file": ("x.csv", rows.encode())}, headers=user["headers"]
    )
    assert res.status_code == 400 and res.json()["error"]["code"] == "TOO_MANY_ROWS"


async def test_export_escapes_spreadsheet_formulas(client: httpx.AsyncClient, user: dict) -> None:
    await create_link(client, user["headers"], title='=HYPERLINK("x")')
    res = await client.get(f"{API}/links/export", headers=user["headers"])
    assert res.headers["content-type"].startswith("text/csv")
    assert res.text.startswith("﻿code,short_url")
    assert "'=HYPERLINK" in res.text


async def test_qr_code_formats_and_validation(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"])
    url = f"{API}/links/{link['id']}/qr"
    png = await client.get(url, headers=user["headers"])
    assert png.headers["content-type"] == "image/png" and png.content[:4] == b"\x89PNG"
    svg = await client.get(f"{url}?format=svg&dark=%231e40af", headers=user["headers"])
    # segno writes the shortest equivalent color notation
    assert svg.headers["content-type"] == "image/svg+xml" and b'stroke="#1e40af"' in svg.content
    assert (await client.get(f"{url}?dark=red", headers=user["headers"])).status_code == 422
