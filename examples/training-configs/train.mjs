import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const configPath = resolve(process.argv[2]);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const out = resolve(dirname(configPath), config.output_dir);
mkdirSync(out, { recursive: true });
let weight = 0, bias = 0;
for (let step = 1; step <= config.steps; step++) {
  let loss = 0, dw = 0, db = 0;
  for (let i = 0; i < config.batch_size; i++) {
    const x = 10 * i / config.batch_size - 5;
    const target = 2 * x + 1;
    const error = weight * x + bias - target;
    loss += error * error / config.batch_size;
    dw += 2 * error * x / config.batch_size;
    db += 2 * error / config.batch_size;
  }
  weight -= config.learning_rate * dw;
  bias -= config.learning_rate * db;
  console.log(JSON.stringify({ run: config.name, step, steps: config.steps, loss: String(loss), gradient: String(Math.hypot(dw, db)), learning_rate: config.learning_rate }));
  if (step % config.checkpoint_every === 0) {
    if ([weight, bias, loss].every(Number.isFinite)) {
      writeFileSync(resolve(out, 'checkpoint.json'), JSON.stringify({ step, loss, weight, bias }));
      console.log('checkpoint saved');
    } else console.log('checkpoint skipped: nonfinite parameters');
  }
  await delay(500);
}
console.log('training complete');
