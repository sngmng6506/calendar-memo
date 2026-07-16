from __future__ import annotations

import contextlib
import io
import unittest

from daymark.main import build_parser


class MainCliTest(unittest.TestCase):
    def test_window_and_desktop_are_mutually_exclusive(self) -> None:
        parser = build_parser()
        self.assertTrue(parser.parse_args(["--window"]).window)
        self.assertTrue(parser.parse_args(["--desktop"]).desktop)
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args(["--window", "--desktop"])


if __name__ == "__main__":
    unittest.main()
