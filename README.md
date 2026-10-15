# dsh-run-watchdog

English | [简体中文](README.zh-CN.md)

Monitor long-running DeepSeek Harness jobs using their purpose and live output. Alert the main agent when training, builds, tests, or data processing need attention.

Supports **DeepSeek and Jev**. Version **0.1.1**.

## Demo

![Training alert in DSH Desktop](assets/training-alert.gif)

The watchdog catches NaN during training and alerts the agent.

## Installation

### Desktop: install from GitHub

Open **Plugins → Add plugin**, paste the repository URL, then select **Install → Enable now**:

```text
https://github.com/Hirate99/dsh-run-watchdog
```

Configure it under **Plugins → dsh-run-watchdog**.

The [v0.1.1 release package](https://github.com/Hirate99/dsh-run-watchdog/releases/download/v0.1.1/dsh-run-watchdog-0.1.1.tgz) is also available. Release assets are fixed snapshots; the repository URL follows the default branch.

### Build from source

Requires Node.js ≥ 22.19 and DSH native `bash` / `pwsh` tools with background job support.

```sh
npm ci
npm run check
npm pack
```

Install the generated `dsh-run-watchdog-0.1.1.tgz` through Desktop's plugin page. Alternatively, fully quit Desktop and use its bundled CLI on Windows:

```powershell
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add "<absolute-package-path>/dsh-run-watchdog-0.1.1.tgz"
```

Reopen Desktop and configure the plugin. This package has not been published to npm.

Development dependencies are pinned to DSH `0.2.1-alpha.3` and Cordis `4.0.5-alpha.2`. Desktop `0.2.0-rc.2`'s bundled runtime was also tested previously. Rerun integration tests when upgrading the host.

## Configuration

- **DeepSeek** reuses your signed-in DSH account by default, or the API key in DSH model settings when signed out. Select the monitoring model on the plugin page. Custom endpoints or credential references continue to use API keys.
- **Jev** shows a dedicated API key field. The key is saved in DSH's credential store.
- **Shadow mode** is the default: evaluate without notifying or stopping jobs. Set `recordPath` to save decisions.
- **Enforce mode** delivers alerts to the original conversation and wakes an idle agent.

Save changes before selecting **Test connection**. Changes apply to newly attached monitors.

| Setting | Default | Description |
| --- | --- | --- |
| `firstCheckMs` | 10000 | Delay before the first check |
| `judgeTimeoutMs` | 8000 | Model request timeout |
| `stopThreshold` | 0.8 | Jev probability threshold for automatic stopping |
| `allowAutoStop` | false | Allow individual jobs to request automatic stopping |
| `recordPath` | Unset | Local JSONL decision log |
| `recordAfterMs` | 3600000 | Observation time after an alert, when recording is enabled |

Requests include the task purpose, command, and up to 16000 characters of recent output. Local records contain the same evidence. Credentials are resolved from DSH first, then from the environment variable named by `apiKeyEnv`.

## How it works

The plugin supplies instructions to the main agent. The agent starts a native background job and attaches `watch_job`; users do not need to name tools or provide tool parameters.

Attachment returns immediately. Jobs are monitored concurrently with independent log cursors. Monitoring does not consume the agent's output, start commands, or restart jobs. The agent can read further output with `job_output`.

The judge can choose another check in 10, 30, 60, 120, 300, or 600 seconds, request attention, recommend stopping, or report uncertainty:

- Jev can stop a job only when its stop probability reaches the threshold and both deployment settings and the individual job authorize automatic stopping. Otherwise, the decision becomes an alert.
- A preferred stop/notify choice, or combined stop and notify probability of at least 0.4, triggers an alert.
- Continue probabilities are combined before comparison with uncertainty; the most likely interval is then selected.
- DeepSeek does not return probabilities, so stop recommendations only notify.

Each monitor alerts at most once. Normal completion uses native DSH notifications. An alert cancels `job_output(wait=true)` waits in the same session, including waits started while the alert is pending delivery. This does not cancel the agent or stop background jobs. Other blocking tools are not interrupted.

Monitoring ends when the job finishes or the plugin unloads. Unloading does not stop jobs; restarting the plugin does not restore monitors. Failed model requests retry using fallback intervals.

## Development

```sh
npm run check
```

Runs the build, type checks, and offline regression tests without API keys. Coverage includes decision thresholds, chunked and truncated logs, immutable state, scheduling boundaries, background recording, concurrent jobs, wait interruption races, DSH tools, and real child processes.

Online connection tests call the selected provider:

```sh
npm run smoke -- jev
npm run smoke -- deepseek
```

Set `WATCHDOG_MODEL` to override the test model. Offline tests do not establish model quality across real tasks, and the demo does not guarantee consistent autonomous tool selection.

| File | Responsibility |
| --- | --- |
| `src/output.ts` | Pure log accumulation and evidence statistics |
| `src/decision.ts` | Model input, action selection, and comparison rules |
| `src/monitor-state.ts` | Pure check snapshots and scheduling |
| `src/monitor.ts` | Log reads, model requests, and the monitoring loop |
| `src/jobs.ts` | DSH job access and independent cursors |
| `src/interrupt-wait.ts` | Release output waits when alerts arrive |
| `src/index.ts` | Tool registration, alert delivery, and Cordis lifecycle |
| `src/providers.ts` | DeepSeek / Jev request adapters |
| `src/settings.ts`, `src/client.tsx` | Credentials, connection tests, and settings UI |

`docs/` and `.integration/` contain local verification artifacts and are excluded from version control. README demo assets live in `assets/`.

## CI and releases

GitHub Actions runs the full checks on Windows and Linux with Node.js 24 for pushes to `main` and pull requests. Each job uploads an installable `.tgz` artifact. Tests use local fixtures and do not need API keys.

To publish a release, push a tag matching `package.json` (currently `v0.1.1`). Both platforms must pass before the workflow creates the GitHub Release and uploads the package. Publishing uses the built-in GitHub token; no npm token is needed. Existing releases are not overwritten automatically.
