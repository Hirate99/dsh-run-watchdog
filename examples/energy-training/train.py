import json
import os
from pathlib import Path
import time

os.environ['OPENBLAS_NUM_THREADS'] = '1'
import numpy as np

root = Path(__file__).resolve().parent
config = json.loads((root / 'config.json').read_text())
rng = np.random.default_rng(config['seed'])
width = config['hidden_size']
w1 = rng.normal(0, 0.1, (16, width)).astype('float32')
w2 = rng.normal(0, 1 / np.sqrt(width), (width, width)).astype('float32')
w3 = rng.normal(0, 1 / np.sqrt(width), (width, 1)).astype('float32')
valid = np.load(root / 'data' / 'validation.npz')
out = root / 'results'
out.mkdir(exist_ok=True)
start = time.monotonic()
step = 0

def predict(x):
    h1 = np.maximum(x @ w1, 0)
    h2 = np.maximum(h1 @ w2, 0)
    return h1, h2, h2 @ w3

for epoch in range(config['epochs']):
    for shard in sorted((root / 'data').glob('train-*.npz')):
        data = np.load(shard)
        x, y = data['x'], data['y']
        for offset in range(0, len(x), config['batch_size']):
            xb, yb = x[offset:offset + config['batch_size']], y[offset:offset + config['batch_size']]
            h1, h2, pred = predict(xb)
            error = pred - yb
            d3 = 2 * error / len(xb)
            g3 = h2.T @ d3
            d2 = (d3 @ w3.T) * (h2 > 0)
            g2 = h1.T @ d2
            d1 = (d2 @ w2.T) * (h1 > 0)
            g1 = xb.T @ d1
            w1 -= config['learning_rate'] * g1
            w2 -= config['learning_rate'] * g2
            w3 -= config['learning_rate'] * g3
            step += 1
            if step % 32 == 0:
                print(json.dumps({'epoch': epoch + 1, 'shard': shard.name, 'step': step,
                    'train_loss': float(np.mean(error ** 2)), 'elapsed_s': round(time.monotonic() - start, 2)}), flush=True)
        val_loss = float(np.mean((predict(valid['x'])[2] - valid['y']) ** 2))
        print(json.dumps({'epoch': epoch + 1, 'shard': shard.name, 'validation_loss': val_loss}), flush=True)
        if all(np.isfinite(w).all() for w in (w1, w2, w3)):
            np.savez(out / 'checkpoint.npz', w1=w1, w2=w2, w3=w3)
        else:
            print('Checkpoint not saved: non-finite model parameters', flush=True)
print(json.dumps({'status': 'finished', 'steps': step, 'validation_loss': val_loss}), flush=True)
