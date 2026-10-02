import re
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from typing import Any

import httpx
import pytest
from sqlalchemy import update

from app.core import email as email_module
from app.core.config import settings
from app.models.models import PasswordResetToken
from app.services import auth_service
from tests.conftest import register

API = "/api/v1"
TOKEN_IN_LINK = re.compile(r"/reset-password\?token=([\w-]+)")


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Enable email and capture what would be sent instead of talking to SMTP."""
    sent: list[dict[str, Any]] = []

    async def fake_send(to: str, subject: str, text: str, html: str | None = None) -> None:
        sent.append({"to": to, "subject": subject, "text": text, "html": html})

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(auth_service, "send_email", fake_send)
    return sent


async def forgot(client: httpx.AsyncClient, email: str) -> httpx.Response:
    return await client.post(f"{API}/auth/forgot-password", json={"email": email})


async def reset(client: httpx.AsyncClient, token: str, password: str) -> httpx.Response:
    return await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": password}
    )


def token_from(mail: dict[str, Any]) -> str:
    match = TOKEN_IN_LINK.search(mail["text"])
    assert match, mail["text"]
    return match.group(1)


async def test_reset_flow_changes_password_and_ends_sessions(
    client: httpx.AsyncClient, user: dict, outbox: list
) -> None:
    res = await forgot(client, user["email"])
    assert res.status_code == 202
    assert [m["to"] for m in outbox] == [user["email"]]
    assert outbox[0]["text"].startswith("Hi Tester")
    assert f"{settings.FRONTEND_URL}/reset-password?token=" in outbox[0]["text"]

    res = await reset(client, token_from(outbox[0]), "brand-new-pass")
    assert res.status_code == 200

    old = {"email": user["email"], "password": user["password"]}
    assert (await client.post(f"{API}/auth/login", json=old)).status_code == 401
    # The session from before the reset is gone
    assert (await client.post(f"{API}/auth/refresh")).status_code == 401
    new = {"email": user["email"], "password": "brand-new-pass"}
    assert (await client.post(f"{API}/auth/login", json=new)).status_code == 200


async def test_unknown_email_gets_the_same_answer_and_no_mail(
    client: httpx.AsyncClient, user: dict, outbox: list
) -> None:
    known = await forgot(client, user["email"])
    unknown = await forgot(client, "nobody@example.com")
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert [m["to"] for m in outbox] == [user["email"]]


async def test_reset_link_works_only_once(
    client: httpx.AsyncClient, user: dict, outbox: list
) -> None:
    await forgot(client, user["email"])
    token = token_from(outbox[0])
    assert (await reset(client, token, "first-new-pass")).status_code == 200

    res = await reset(client, token, "second-new-pass")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_RESET_TOKEN"


async def test_a_new_request_replaces_the_old_link(
    client: httpx.AsyncClient, user: dict, outbox: list
) -> None:
    await forgot(client, user["email"])
    await forgot(client, user["email"])
    old, new = token_from(outbox[0]), token_from(outbox[1])
    assert (await reset(client, old, "brand-new-pass")).status_code == 400
    assert (await reset(client, new, "brand-new-pass")).status_code == 200


async def test_expired_or_made_up_tokens_are_rejected(
    client: httpx.AsyncClient, user: dict, outbox: list, db: Any
) -> None:
    await forgot(client, user["email"])
    await db.execute(
        update(PasswordResetToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    await db.commit()
    assert (await reset(client, token_from(outbox[0]), "brand-new-pass")).status_code == 400
    assert (await reset(client, "made-up-token", "brand-new-pass")).status_code == 400


async def test_new_password_is_validated(
    client: httpx.AsyncClient, user: dict, outbox: list
) -> None:
    await forgot(client, user["email"])
    assert (await reset(client, token_from(outbox[0]), "short")).status_code == 422
    assert (await forgot(client, "not-an-email")).status_code == 422


async def test_one_address_gets_only_a_few_mails(
    client: httpx.AsyncClient, user: dict, outbox: list, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "PASSWORD_RESET_EMAILS_PER_HOUR", 2)
    codes = [(await forgot(client, user["email"])).status_code for _ in range(3)]
    # Still 202, so the limit does not reveal that the account exists
    assert codes == [202, 202, 202]
    assert len(outbox) == 2


async def test_requests_per_ip_are_limited(
    client: httpx.AsyncClient, outbox: list, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_PASSWORD_RESET", 2)
    codes = [(await forgot(client, f"u{i}@example.com")).status_code for i in range(3)]
    assert codes == [202, 202, 429]
    codes = [(await reset(client, "made-up", "brand-new-pass")).status_code for _ in range(3)]
    assert codes == [400, 400, 429]


async def test_forgot_password_needs_email_configured(
    client: httpx.AsyncClient, user: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    res = await forgot(client, user["email"])
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "EMAIL_DISABLED"


async def test_smtp_failure_is_logged_not_shown(
    client: httpx.AsyncClient,
    user: dict,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def broken_send(*args: Any, **kwargs: Any) -> None:
        raise OSError("SMTP down")

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(auth_service, "send_email", broken_send)
    assert (await forgot(client, user["email"])).status_code == 202
    assert "Could not send the password reset email" in caplog.text


async def test_deleting_the_account_removes_its_reset_tokens(
    client: httpx.AsyncClient, outbox: list
) -> None:
    account = await register(client)
    await forgot(client, account["email"])
    res = await client.request(
        "DELETE",
        f"{API}/auth/me",
        json={"password": account["password"]},
        headers=account["headers"],
    )
    assert res.status_code == 204
    assert (await reset(client, token_from(outbox[0]), "brand-new-pass")).status_code == 400


async def test_smtp_sender_uses_starttls_and_login(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[Any] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: int) -> None:
            calls.append(("connect", host, port, timeout))

        def __enter__(self) -> "FakeSMTP":
            return self

        def __exit__(self, *exc: object) -> None:
            calls.append("quit")

        def starttls(self) -> None:
            calls.append("starttls")

        def login(self, user: str, password: str) -> None:
            calls.append(("login", user, password))

        def send_message(self, msg: EmailMessage) -> None:
            calls.append(("send", msg["From"], msg["To"], msg["Subject"]))

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(settings, "SMTP_USERNAME", "sender@gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(settings, "SMTP_FROM", "")

    await email_module.send_email("to@example.com", "Hello", "Body", "<p>Body</p>")
    assert calls == [
        ("connect", "smtp.gmail.com", settings.SMTP_PORT, settings.SMTP_TIMEOUT),
        "starttls",
        ("login", "sender@gmail.com", "app-password"),
        ("send", "Linkly <sender@gmail.com>", "to@example.com", "Hello"),
        "quit",
    ]
