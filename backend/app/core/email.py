"""Outgoing email over SMTP (e.g. Gmail with an app password).

smtplib is blocking, so messages are sent from a worker thread. When SMTP_HOST is empty,
sending is disabled and only a warning is logged.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings

log = logging.getLogger(__name__)


def email_enabled() -> bool:
    return bool(settings.SMTP_HOST)


def build_message(to: str, subject: str, text: str, html: str | None = None) -> EmailMessage:
    """A plain-text email, with an HTML alternative when given."""
    msg = EmailMessage()
    msg["From"] = formataddr((settings.APP_NAME, settings.SMTP_FROM or settings.SMTP_USERNAME))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    return msg


def _send_sync(msg: EmailMessage) -> None:
    with smtplib.SMTP(
        settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT
    ) as smtp:
        if settings.SMTP_STARTTLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Send one email; raises on SMTP errors so callers can decide how to report them."""
    if not email_enabled():
        log.warning("SMTP_HOST is not set, email %r to %s was not sent", subject, to)
        return
    await asyncio.to_thread(_send_sync, build_message(to, subject, text, html))
