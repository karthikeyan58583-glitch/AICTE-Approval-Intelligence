r"""Standalone CLI runner for the AICTE Durable Storage Deletion Queue Worker.

Usage from PowerShell:
    Set-Location "D:\AICTE-Approval-Intelligence\backend"
    uv run python -m app.worker --help
    uv run python -m app.worker --once
    uv run python -m app.worker --interval 30 --batch-size 50
"""

import argparse
from app.services.document_cleanup_worker import run_worker_loop

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AICTE Storage Deletion Queue Durable Worker")
    parser.add_argument("--batch-size", type=int, default=50, help="Max number of items to claim per batch (default: 50)")
    parser.add_argument("--interval", type=int, default=30, help="Polling interval in seconds (default: 30)")
    parser.add_argument("--lease-seconds", type=int, default=300, help="Worker lease claim duration in seconds (default: 300)")
    parser.add_argument("--once", action="store_true", help="Process currently pending items once and exit")

    args = parser.parse_args()
    run_worker_loop(
        batch_size=args.batch_size,
        interval_seconds=args.interval,
        lease_seconds=args.lease_seconds,
        run_once=args.once,
    )
