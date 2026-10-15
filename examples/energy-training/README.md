# Energy regression fixture

A NumPy MLP trains on 24 synthetic sensor-data shards, with a held-out validation set. The network uses normal SGD settings and performs actual CPU work; there are no sleeps or deliberate NaN branches in the trainer.

Generate two isolated workspaces from the repository root:

```sh
python scripts/prepare-energy-fixture.py /path/to/control
python scripts/prepare-energy-fixture.py /path/to/energy-forecast --unit-mismatch
```

Both use the same seed, labels, validation data, code and configuration. The second has four feature columns in shard 012 multiplied by 1000, simulating an upstream unit-conversion error. All input values remain finite. The generator and this explanation belong to the evaluator, not the Desktop task workspace.

Install/use NumPy in the Python environment, then run `python train.py` in either generated workspace. A control run should finish with finite losses. The mismatched shard causes numerical overflow after earlier shards train normally. Time depends on CPU and NumPy's BLAS implementation; the measured run here was about 48 seconds.

For Desktop, open only the generated project in a fresh session and ask:

> 帮我训练一下这个设备能耗预测模型，看看验证集效果。

Do not include tool names, alert conditions, or the fault description. Capture autonomous tool selection, the judge decision, delivery time, and the user-visible reply separately. A notification decision alone does not establish a timely user-visible alert.
