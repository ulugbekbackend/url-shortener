import httpx
import pytest

from app.core.config import settings
from tests.conftest import create_link

API = "/api/v1"


async def test_login_attempts_are_limited(
    client: httpx.AsyncClient, user: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The `user` fixture already signed in once, which counts as the first attempt
    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN", 3)
    creds = {"email": user["email"], "password": "wrong-pass"}
    codes = [(await client.post(f"{API}/auth/login", json=creds)).status_code for _ in range(3)]
    assert codes == [401, 401, 429]

    res = await client.post(f"{API}/auth/login", json=creds)
    assert res.json()["error"]["code"] == "RATE_LIMITED"
    assert int(res.headers["retry-after"]) > 0


async def test_anonymous_requests_share_an_ip_limit(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", 3)
    responses = [await client.get(f"{API}/tags") for _ in range(4)]
    assert [r.status_code for r in responses] == [401, 401, 401, 429]
    assert responses[0].headers["x-ratelimit-limit"] == "3"
    assert responses[2].headers["x-ratelimit-remaining"] == "0"

    # A made-up API key does not earn its own, bigger bucket
    res = await client.get(f"{API}/links", headers={"X-API-Key": "lnk_made_up"})
    assert res.status_code == 429


async def test_signed_in_users_have_their_own_bucket(
    client: httpx.AsyncClient, user: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", 1)
    res = await client.get(f"{API}/links", headers=user["headers"])
    assert res.status_code == 200
    assert res.headers["x-ratelimit-limit"] == str(settings.RATE_LIMIT_USER)


async def test_revoked_api_key_loses_its_bucket_at_once(
    client: httpx.AsyncClient, user: dict
) -> None:
    created = await client.post(f"{API}/api-keys", json={"name": "ci"}, headers=user["headers"])
    key = created.json()
    key_headers = {"X-API-Key": key["full_key"]}
    res = await client.get(f"{API}/links", headers=key_headers)
    assert res.headers["x-ratelimit-limit"] == str(settings.RATE_LIMIT_API_KEY)

    # The key's validity is cached; revoking must not wait for the cache to expire
    await client.delete(f"{API}/api-keys/{key['key']['id']}", headers=user["headers"])
    res = await client.get(f"{API}/links", headers=key_headers)
    assert res.status_code == 401
    assert res.headers["x-ratelimit-limit"] == str(settings.RATE_LIMIT_ANONYMOUS)


async def test_password_guessing_on_a_link_is_limited(
    client: httpx.AsyncClient, user: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_UNLOCK", 2)
    link = await create_link(client, user["headers"], password="open-sesame")
    unlock = f"/{link['code']}/unlock"
    codes = [(await client.post(unlock, data={"password": "x"})).status_code for _ in range(3)]
    assert codes == [401, 401, 429]


async def test_redirects_and_health_are_not_limited(
    client: httpx.AsyncClient, user: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    link = await create_link(client, user["headers"])
    monkeypatch.setattr(settings, "RATE_LIMIT_ANONYMOUS", 1)
    assert {(await client.get(f"/{link['code']}")).status_code for _ in range(3)} == {302}
    assert {(await client.get("/health/live")).status_code for _ in range(3)} == {200}
