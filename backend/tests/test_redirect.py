import httpx
import pytest

from app.core.redis import get_redis
from app.services.link_service import CLICK_STREAM
from tests.conftest import create_link

API = "/api/v1"
CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"


async def test_redirects_temporarily_by_default(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], url="https://example.com/target")
    res = await client.get(f"/{link['code']}")
    assert res.status_code == 302
    assert res.headers["location"] == "https://example.com/target"


async def test_permanent_links_use_301(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], is_permanent=True)
    assert (await client.get(f"/{link['code']}")).status_code == 301


@pytest.mark.parametrize("path", ["/favicon.ico", "/dashboard", "/api", "/no-such-code"])
async def test_unknown_and_reserved_paths_are_404(client: httpx.AsyncClient, path: str) -> None:
    res = await client.get(path)
    assert res.status_code == 404


async def test_cache_follows_disable_enable_and_delete(
    client: httpx.AsyncClient, user: dict
) -> None:
    h = user["headers"]
    link = await create_link(client, h)
    code, url = link["code"], f"{API}/links/{link['id']}"
    assert (await client.get(f"/{code}")).status_code == 302  # now cached

    await client.patch(url, json={"is_active": False}, headers=h)
    res = await client.get(f"/{code}")
    assert res.status_code == 410 and res.json()["error"]["code"] == "LINK_DISABLED"

    await client.patch(url, json={"is_active": True}, headers=h)
    assert (await client.get(f"/{code}")).status_code == 302

    await client.delete(url, headers=h)
    assert (await client.get(f"/{code}")).status_code == 404


async def test_new_custom_code_overrides_cached_not_found(
    client: httpx.AsyncClient, user: dict
) -> None:
    assert (await client.get("/fresh-code")).status_code == 404  # caches "not found"
    await create_link(client, user["headers"], custom_code="fresh-code")
    assert (await client.get("/fresh-code")).status_code == 302


async def test_expired_links_are_gone(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], expires_at="2020-01-01T00:00:00Z")
    res = await client.get(f"/{link['code']}")
    assert res.status_code == 410 and res.json()["error"]["code"] == "LINK_EXPIRED"


async def test_click_limit(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], max_clicks=2)
    codes = [(await client.get(f"/{link['code']}")).status_code for _ in range(4)]
    assert codes == [302, 302, 410, 410]


async def test_password_protected_link(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"], password="open-sesame")
    code = link["code"]
    assert link["has_password"] is True

    page = await client.get(f"/{code}")
    assert page.status_code == 200 and f'action="/{code}/unlock"' in page.text

    wrong = await client.post(f"/{code}/unlock", data={"password": "nope"})
    assert wrong.status_code == 401 and "Wrong password" in wrong.text

    right = await client.post(f"/{code}/unlock", data={"password": "open-sesame"})
    assert right.status_code == 303
    assert right.headers["location"] == "https://example.com/page"


async def test_redirect_queues_a_click_event(client: httpx.AsyncClient, user: dict) -> None:
    link = await create_link(client, user["headers"])
    await client.get(
        f"/{link['code']}?utm_source=tg&utm_campaign=fall",
        headers={"User-Agent": CHROME, "Referer": "https://t.me/channel"},
    )
    redis = await get_redis()
    [(_, fields)] = await redis.xrange(CLICK_STREAM)
    assert fields["link_id"] == link["id"]
    assert fields["user_agent"] == CHROME
    assert fields["referer"] == "https://t.me/channel"
    assert fields["query"] == "utm_source=tg&utm_campaign=fall"
