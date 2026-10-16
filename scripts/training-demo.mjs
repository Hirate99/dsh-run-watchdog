// Real CPU gradient descent, intentionally tiny. No GPU or training framework required.
// 'diverge' switches to an unstable learning rate after 5 seconds to exercise detection.
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const mode = process.argv[2] ?? 'stable';
if (!['stable', 'diverge'].includes(mode)) throw new Error('Use stable or diverge');
mkdirSync('.integration', { recursive: true });
let w = 0,
  b = 0;
for (let step = 1; step <= 100; step++) {
  const lr = mode === 'diverge' && step > 20 ? 1e100 : 0.05;
  let loss = 0,
    dw = 0,
    db = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 128 - 1,
      target = 2 * x + 1;
    const error = w * x + b - target;
    loss += (error * error) / 256;
    dw += (2 * error * x) / 256;
    db += (2 * error) / 256;
  }
  w -= lr * dw;
  b -= lr * db;
  if (step % 2 === 0)
    console.log(
      `step=${step}/100 loss=${loss.toExponential(5)} grad_norm=${Math.hypot(dw, db).toExponential(3)} lr=${lr}`,
    );
  if (step % 20 === 0) {
    if (Number.isFinite(w) && Number.isFinite(b)) {
      writeFileSync(
        `.integration/training-${mode}.json`,
        JSON.stringify({ step, loss, w, b }),
      );
      console.log(`checkpoint saved at step=${step}`);
    } else console.log('checkpoint rejected: nonfinite weights');
  }
  await delay(250);
}
console.log('training finished');
