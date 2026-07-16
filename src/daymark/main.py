from __future__ import annotations

import argparse

from daymark.app import DaymarkApp


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Daymark desktop work calendar")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--window",
        action="store_true",
        help="Windows에서도 WorkerW에 연결하지 않고 일반 창으로 시작하며 설정에도 저장합니다.",
    )
    mode.add_argument(
        "--desktop",
        action="store_true",
        help="Windows에서 바탕화면 WorkerW 모드로 시작하며 설정에도 저장합니다.",
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    has_override = args.window or args.desktop
    app = DaymarkApp(auto_desktop_mode=not has_override)
    if args.window:
        app.settings.desktop_mode = False
        app.settings_store.save(app.settings)
    elif args.desktop:
        app.settings.desktop_mode = True
        app.settings_store.save(app.settings)
        app.after_idle(lambda: app._set_desktop_mode(True, notify=True))
    app.mainloop()


if __name__ == "__main__":
    main()
