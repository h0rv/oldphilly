from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from oldphilly.config import Settings  # noqa: E402
from oldphilly.export import export_jsonl  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Export stored PhillyHistory records to JSONL.")
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    path, count = export_jsonl(Settings(data_dir=args.data_dir), args.output)
    print(f"Exported {count} records to {path}")


if __name__ == "__main__":
    main()
