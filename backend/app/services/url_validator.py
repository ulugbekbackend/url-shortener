"""Validation of target URLs before they are shortened."""
import ipaddress
import re
from urllib.parse import urlsplit

from app.core.config import settings

_LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain"}
_LOCAL_SUFFIXES = (".localhost", ".local", ".internal")
_HOSTNAME_RE = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")


def _parse_ip(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Parse an IP literal, including the decimal form browsers accept (http://2130706433)."""
    try:
        return ipaddress.ip_address(int(host) if host.isdigit() else host)
    except ValueError:
        return None


def _own_hosts() -> set[str]:
    hosts = {urlsplit(settings.BASE_URL).hostname, urlsplit(f"//{settings.SHORT_DOMAIN}").hostname}
    return {h.lower() for h in hosts if h}


def validate_target_url(url: str) -> None:
    """Raise ValueError if the URL must not be shortened."""
    try:
        parts = urlsplit(url)
        _ = parts.port  # raises ValueError on an invalid port
    except ValueError:
        raise ValueError("URL is malformed") from None

    if parts.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")

    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError("URL must contain a host")

    if host in _LOCAL_HOSTNAMES or host.endswith(_LOCAL_SUFFIXES):
        raise ValueError("Local addresses are not allowed")

    ip = _parse_ip(host)
    if ip is not None and not ip.is_global:
        raise ValueError("Private or reserved IP addresses are not allowed")

    if ip is None:
        try:
            ascii_host = host.encode("idna").decode("ascii")
        except UnicodeError:
            raise ValueError("URL host is invalid") from None
        if not _HOSTNAME_RE.match(ascii_host):
            raise ValueError("URL host is invalid")

    if host in _own_hosts():
        raise ValueError("Links to the shortener itself are not allowed")

    for blocked in settings.BLOCKED_DOMAINS:
        blocked = blocked.lower().strip(".")
        if blocked and (host == blocked or host.endswith(f".{blocked}")):
            raise ValueError(f"Domain '{host}' is blocked")
