"""Compatibility entry point for the canonical local training pipeline."""
import subprocess
import sys
from pathlib import Path
if __name__ == '__main__':
    raise SystemExit(subprocess.call(['node', str(Path(__file__).with_name('run-phase2.cjs')), *sys.argv[1:]]))
