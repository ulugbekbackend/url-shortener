"""Turn raw click events from the Redis stream into `clicks` rows."""
import hashlib
import hmac
import logging
import os
import re
import uuid
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import parse_qs, urlsplit

import geoip2.database
import geoip2.errors
from user_agents import parse as parse_user_agent

from app.core.config import settings

log = logging.getLogger(__name__)

# user-agents misses many link-preview fetchers and HTTP clients
_BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|preview|curl|wget|python-requests|python-httpx|aiohttp"
    r"|go-http-client|okhttp|java/|headless|facebookexternalhit|whatsapp|telegram",
    re.IGNORECASE,
)


class GeoLookup:
    """Country/city lookup from a local GeoLite2 City database; a no-op if the file is missing."""

    def __init__(self, path: str):
        self._reader: geoip2.database.Reader | None = None
        if path and os.path.exists(path):
            self._reader = geoip2.database.Reader(path)
        else:
            log.warning("GeoLite2 database not found at %r, geolocation disabled", path)

    def lookup(self, ip: str | None) -> tuple[str | None, str | None]:
        if self._reader is None or not ip:
            return None, None
        try:
            city = self._reader.city(ip)
        except (geoip2.errors.AddressNotFoundError, ValueError):
            return None, None
        return city.country.iso_code, city.city.name

    def close(self) -> None:
        if self._reader is not None:
            self._reader.close()


def visitor_hash(ip: str, user_agent: str, day: date) -> str:
    """Anonymous per-day visitor id; the salt rotates daily so IPs can't be recovered."""
    salt = hmac.new(settings.SECRET_KEY.encode(), day.isoformat().encode(), hashlib.sha256).digest()
    return hashlib.sha256(salt + f"{ip}|{user_agent}".encode()).hexdigest()


def referrer_domain(referer: str) -> str | None:
    try:
        host = urlsplit(referer).hostname if referer else None
    except ValueError:
        return None
    if not host:
        return None
    host = host.lower()
    return host[4:] if host.startswith("www.") else host


def _cut(value: str | None, length: int) -> str | None:
    return value[:length] if value else None


def _known(family: str) -> str | None:
    return None if family == "Other" else family


def build_click(stream_id: str, fields: dict[str, str], geo: GeoLookup) -> dict[str, Any] | None:
    """Build a `clicks` row from a stream event, or None if the event is malformed."""
    try:
        link_id = uuid.UUID(fields["link_id"])
        clicked_at = datetime.fromtimestamp(float(fields["timestamp"]), tz=UTC)
    except (KeyError, ValueError):
        return None

    ua_string = fields.get("user_agent", "")
    ua = parse_user_agent(ua_string)
    is_bot = not ua_string or ua.is_bot or bool(_BOT_RE.search(ua_string))
    if is_bot:
        device = None
    elif ua.is_tablet:
        device = "tablet"
    elif ua.is_mobile:
        device = "mobile"
    elif ua.is_pc:
        device = "desktop"
    else:
        device = None

    query = parse_qs(fields.get("query", ""))

    def utm(name: str) -> str | None:
        return _cut(query.get(name, [None])[0], 100)

    ip = fields.get("ip") or None
    country, city = geo.lookup(ip)

    return {
        "stream_id": stream_id,
        "link_id": link_id,
        "clicked_at": clicked_at,
        "visitor_hash": visitor_hash(ip or "", ua_string, clicked_at.date()),
        "country_code": country,
        "city": _cut(city, 100),
        "device_type": device,
        "os": _cut(_known(ua.os.family), 50),
        "browser": _cut(_known(ua.browser.family), 50),
        "referrer_domain": _cut(referrer_domain(fields.get("referer", "")), 200),
        "utm_source": utm("utm_source"),
        "utm_medium": utm("utm_medium"),
        "utm_campaign": utm("utm_campaign"),
        "is_bot": is_bot,
    }
