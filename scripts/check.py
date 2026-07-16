from __future__ import annotations

import compileall
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    if not compileall.compile_dir(ROOT / "src", quiet=1):
        raise SystemExit("Python compilation failed")
    run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"])


if __name__ == "__main__":
    main()
