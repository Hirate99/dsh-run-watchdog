# dsh-run-watchdog

English | [简体中文](README.zh-CN.md)

Monitor long-running DeepSeek Harness jobs using their purpose and live output. Alert the main agent when training, builds, tests, or data processing need attention.

Supports **DeepSeek and Jev**. Version **0.1.3**.

## Demo

![Training alert in DSH Desktop](assets/training-alert.gif)

The watchdog catches NaN during training and alerts the agent.

## Installation

### Desktop: install from npm

Open **Plugins → Add plugin**, enter the package name, then select **Install → Enable now**:

```text
@mskyurina/dsh-run-watchdog
```

Use `@mskyurina/dsh-run-watchdog@<version>` to pin a version. Configure it under **Plugins → dsh-run-watchdog**.

Alternatively, install the [v0.1.3 release package](https://github.com/Hirate99/dsh-run-watchdog/releases/download/v0.1.3/mskyurina-dsh-run-watchdog-0.1.3.tgz), or build a package below. The repository no longer tracks dist; install a release package.

### Build from source

Requires Node.js ≥ 22.19 and DSH native `bash` / `pwsh` tools with background job support.

```sh
npm ci
npm run check
npm pack
```

Install the generated `mskyurina-dsh-run-watchdog-0.1.3.tgz` through Desktop's plugin page. Alternatively, fully quit Desktop and use its bundled CLI on Windows:

```powershell
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add "<absolute-package-path>/mskyurina-dsh-run-watchdog-0.1.3.tgz"
```

Reopen Desktop and configure the plugin.

Development dependencies are pinned to DSH `0.2.1-alpha.3` and Cordis `4.0.5-alpha.2`. Desktop `0.2.0-rc.2`'s bundled runtime was also tested previously. Rerun integration tests when upgrading the host.

## Configuration

- **DeepSeek** reuses your signed-in DSH account by default, or the API key in DSH model settings when signed out. Select the monitoring model on the plugin page. Custom endpoints or credential references continue to use API keys.
- **Jev** shows a dedicated API key field. The key is saved in DSH's credential store.
- **Shadow mode** is the default: task decisions are available through `watch_status`, without task alerts or stops. Monitoring failures still notify the agent. Set `recordPath` to save decisions.
- **Enforce mode** delivers alerts to the original conversation and wakes an idle agent.

Save changes before selecting **Test connection**. Changes apply to newly attached monitors.

| Setting          | Default | Description                                         |
| ---------------- | ------- | --------------------------------------------------- |
| `firstCheckMs`   | 10000   | Delay before the first check                        |
| `judgeTimeoutMs` | 8000    | Model request timeout                               |
| `stopThreshold`  | 0.8     | Jev probability threshold for automatic stopping    |
| `allowAutoStop`  | false   | Allow individual jobs to request automatic stopping |
| `recordPath`     | Unset   | Local JSONL decision log                            |

Requests include the task purpose, command, and up to 16000 characters of recent output. Local records contain the same evidence. Credentials are resolved from DSH first, then from the environment variable named by `apiKeyEnv`.

## How it works

The plugin supplies instructions to the main agent. The agent starts a native background job and attaches `watch_job`; users do not need to name tools or provide tool parameters.

Attachment returns immediately. Jobs are monitored concurrently with independent log cursors. Monitoring does not consume the agent's output, start commands, or restart jobs. The agent can read further output with `job_output`.

Each check selects an **action** (continue, notify, recommend stopping, or uncertain) and a separate **next check interval** (10, 30, 60, 120, 300, or 600 seconds). Alerts do not end monitoring. The judge continues to choose the interval after an alert. Repeated attention decisions are suppressed until a successful continue decision re-arms notifications.

- Jev can stop only when it selects stop, its stop score reaches `stopThreshold`, and both deployment settings and the job authorize stopping. Missing output or unreadable sources prevent automatic stopping. This score is not a calibrated accuracy estimate.
- DeepSeek stop recommendations only notify.
- Stop and notify probabilities are no longer added together; continue is a single action.

Output redirection is supported. Pass up to eight absolute file paths in `log_paths` when attaching. The monitor reads these files incrementally alongside job output and reports missing files, read failures, truncation and rotation. Quiet output is not a task failure; missing evidence is not proof of health.

`watch_job` returns output sources, mode, health and first check time. `watch_status(jobId)` exposes the latest judgment and input evidence, consecutive failures and next check time. Two consecutive judge failures notify the agent; recovery sends another notification. Unexpected observation-loop failures are also reported. Jev supplies choices and scores without an explanation; DeepSeek can supply a short explanation. The main agent should explain monitoring startup, task problems and lost visibility to the user.

Normal completion uses native DSH notifications. An alert cancels `job_output(wait=true)` waits in the same session, including waits started while an alert is pending. This does not cancel the agent or stop jobs. Other blocking tools are not interrupted.

Monitoring ends when the job finishes or the plugin unloads. Unloading does not stop jobs; restarting the plugin does not restore monitors. The last 100 ended monitors remain queryable in memory. Failed model requests retry with bounded backoff.

## Development

```sh
npm run check
```

Runs the build, type checks, and offline regression tests without API keys. Coverage includes decision thresholds, chunked and truncated logs, immutable state, scheduling boundaries, continued checks after alerts, monitoring failure and recovery, log rotation, concurrent jobs, wait interruption races, DSH tools, and real child processes.

Online connection tests call the selected provider:

```sh
npm run smoke -- jev
npm run smoke -- deepseek
```

Set `WATCHDOG_MODEL` to override the test model. Offline tests do not establish model quality across real tasks, and the demo does not guarantee consistent autonomous tool selection.

| File                                | Responsibility                                          |
| ----------------------------------- | ------------------------------------------------------- |
| `src/output.ts`                     | Pure log accumulation and evidence statistics           |
| `src/decision.ts`                   | Model input, action selection, and comparison rules     |
| `src/monitor-state.ts`              | Pure check snapshots and scheduling                     |
| `src/monitor.ts`                    | Log reads, model requests, and the monitoring loop      |
| `src/jobs.ts`                       | DSH job access and independent cursors                  |
| `src/interrupt-wait.ts`             | Release output waits when alerts arrive                 |
| `src/index.ts`                      | Tool registration, alert delivery, and Cordis lifecycle |
| `src/providers.ts`                  | DeepSeek / Jev request adapters                         |
| `src/settings.ts`, `src/client.tsx` | Credentials, connection tests, and settings UI          |

`docs/` and `.integration/` contain local verification artifacts and are excluded from version control. README demo assets live in `assets/`.

Reusable online evaluations live in `test/evaluation/` and require explicitly configured judge credentials. Temporary host probes, diagnostic scripts and raw evaluation records stay in the ignored `.integration/` directory.

## CI and releases

Pushes to main and pull requests run the full checks and pack on Windows and Linux. The prepack hook builds dist for `npm pack` and `npm publish`. Git keeps source; the npm package contains the runtime artifacts and needs no install-time build.

For a new release, run `npm version patch --no-git-tag-version` (or specify a version), commit, and push main. After both platforms pass, the workflow creates `v<version>`, publishes to npm, and creates a GitHub Release. Later commits with the same version do not publish again. Rerun the original workflow to resume missing publication steps; existing tags are never moved.

Like agent-workspace, publishing uses npm Trusted Publishing. Authorize GitHub owner `Hirate99`, repository `dsh-run-watchdog`, workflow `ci.yml`, and environment `npm` in this package's npm settings, with direct publishing enabled. Trust is package-specific; another package's authorization does not transfer. No npm token is required. After the initial publication, configure this trust on npm to enable subsequent workflow releases.
