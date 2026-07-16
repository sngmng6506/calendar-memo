"""Operating-system integration for Daymark."""

from daymark.platform_integration.desktop_host import (
    DesktopAttachResult,
    DesktopHost,
    UnsupportedDesktopHost,
    create_desktop_host,
)

__all__ = [
    "DesktopAttachResult",
    "DesktopHost",
    "UnsupportedDesktopHost",
    "create_desktop_host",
]
