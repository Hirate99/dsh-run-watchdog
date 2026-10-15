"""Generate reproducible energy-regression fixtures; keep this harness outside the Agent workspace."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
parser.add_argument('--unit-mismatch', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
args.destination.mkdir(parents=True, exist_ok=True)
data_dir = args.destination / 'data'
data_dir.mkdir(exist_ok=True)
for name in ('train.py', 'config.json'):
    shutil.copyfile(root / 'examples' / 'energy-training' / name, args.destination / name)
rng = np.random.default_rng(20261015)
manifest = []
for index in range(25):
    x = rng.normal(0, 1, (8192 if index < 24 else 1024, 16)).astype('float32')
    y = (0.8 * x[:, 0] + 0.4 * x[:, 1] ** 2 + 0.2 * x[:, 2] * x[:, 3]
         + rng.normal(0, 0.05, len(x))).astype('float32')[:, None]
    # Simulate a sensor exporter using milli-units instead of base units.
    if args.unit_mismatch and index == 12:
        x[:, :4] *= 1000
    name = f'train-{index:03}.npz' if index < 24 else 'validation.npz'
    path = data_dir / name
    np.savez(path, x=x, y=y)
    manifest.append({'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
print(json.dumps({'seed': 20261015, 'unitMismatchShard': 12 if args.unit_mismatch else None,
                  'destination': str(args.destination), 'files': manifest}, indent=2))
