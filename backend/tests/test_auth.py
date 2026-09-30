import httpx

from tests.conftest import create_link, register

API = "/api/v1"


async def refresh_with(client: httpx.AsyncClient, token: str | None) -> httpx.Response:
    """Call /auth/refresh presenting exactly this refresh token."""
    client.cookies.clear()
    if token:
        client.cookies.set("refresh_token", token)
    return await client.post(f"{API}/auth/refresh")


async def test_register_login_and_me(client: httpx.AsyncClient) -> None:
    account = await register(client, email="ann@example.com")
    res = await client.get(f"{API}/auth/me", headers=account["headers"])
    assert res.status_code == 200
    assert res.json()["email"] == "ann@example.com"


async def test_register_rejects_duplicate_email(client: httpx.AsyncClient) -> None:
    await register(client, email="dup@example.com")
    res = await client.post(
        f"{API}/auth/register",
        json={"email": "dup@example.com", "password": "secret123", "name": "X"},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "REGISTRATION_FAILED"


async def test_register_validates_input(client: httpx.AsyncClient) -> None:
    res = await client.post(
        f"{API}/auth/register", json={"email": "not-an-email", "password": "short", "name": ""}
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_login_with_wrong_password(client: httpx.AsyncClient, user: dict) -> None:
    res = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": "wrong-pass"}
    )
    assert res.status_code == 401
    assert res.json()["error"]["message"] == "Invalid email or password"


async def test_protected_endpoint_needs_a_valid_token(client: httpx.AsyncClient) -> None:
    assert (await client.get(f"{API}/auth/me")).status_code == 401
    res = await client.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage"})
    assert res.status_code == 401


async def test_login_sets_scoped_httponly_refresh_cookie(
    client: httpx.AsyncClient, user: dict
) -> None:
    res = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    cookie = res.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie


async def test_refresh_rotates_and_detects_reuse(client: httpx.AsyncClient, user: dict) -> None:
    await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    first = client.cookies.get("refresh_token")

    res = await client.post(f"{API}/auth/refresh")
    assert res.status_code == 200 and res.json()["access_token"]
    second = client.cookies.get("refresh_token")
    assert second != first

    # Replaying the old token is treated as theft: every session is revoked
    res = await refresh_with(client, first)
    assert res.status_code == 401
    res = await refresh_with(client, second)
    assert res.status_code == 401


async def test_logins_in_the_same_second_get_distinct_tokens(
    client: httpx.AsyncClient, user: dict
) -> None:
    creds = {"email": user["email"], "password": user["password"]}
    first = await client.post(f"{API}/auth/login", json=creds)
    second = await client.post(f"{API}/auth/login", json=creds)
    assert first.status_code == second.status_code == 200


async def test_logout_revokes_the_refresh_token(client: httpx.AsyncClient, user: dict) -> None:
    await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    token = client.cookies.get("refresh_token")
    assert (await client.post(f"{API}/auth/logout")).status_code == 200
    res = await refresh_with(client, token)
    assert res.status_code == 401


async def test_update_profile_and_email_conflict(client: httpx.AsyncClient, user: dict) -> None:
    other = await register(client)
    res = await client.patch(f"{API}/auth/me", json={"name": "Renamed"}, headers=user["headers"])
    assert res.status_code == 200 and res.json()["name"] == "Renamed"

    res = await client.patch(
        f"{API}/auth/me", json={"email": other["email"]}, headers=user["headers"]
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "EMAIL_TAKEN"


async def test_change_password_signs_out_other_sessions(
    client: httpx.AsyncClient, user: dict
) -> None:
    creds = {"email": user["email"], "password": user["password"]}
    await client.post(f"{API}/auth/login", json=creds)
    other_device = client.cookies.get("refresh_token")

    res = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": "wrong", "new_password": "newsecret123"},
        headers=user["headers"],
    )
    assert res.status_code == 400

    res = await client.post(
        f"{API}/auth/change-password",
        json={"current_password": user["password"], "new_password": "newsecret123"},
        headers=user["headers"],
    )
    assert res.status_code == 200 and res.json()["access_token"]
    assert (await refresh_with(client, other_device)).status_code == 401
    assert (await client.post(f"{API}/auth/login", json=creds)).status_code == 401
    creds["password"] = "newsecret123"
    assert (await client.post(f"{API}/auth/login", json=creds)).status_code == 200


async def test_delete_account_removes_links_and_cache(
    client: httpx.AsyncClient, user: dict
) -> None:
    link = await create_link(client, user["headers"])
    code = link["code"]
    assert (await client.get(f"/{code}")).status_code == 302  # also caches the link

    res = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": "nope"}, headers=user["headers"]
    )
    assert res.status_code == 400

    res = await client.request(
        "DELETE", f"{API}/auth/me", json={"password": user["password"]}, headers=user["headers"]
    )
    assert res.status_code == 204
    assert (await client.get(f"{API}/auth/me", headers=user["headers"])).status_code == 401
    assert (await client.get(f"/{code}")).status_code == 404
