# dsh-run-watchdog

[English](README.md) | 简体中文

结合任务目的和运行日志，判断长任务是否值得继续等待，发现异常时提醒主 Agent。

适用于 DeepSeek Harness 的训练、构建、测试和数据处理任务。支持 **DeepSeek / Jev**，版本 **0.1.2**。

## 演示

![Desktop 中的训练异常提醒](assets/training-alert.gif)

训练出现 NaN，watchdog 及时提醒 Agent。

## 安装

### Desktop：通过 npm 安装

打开 **插件 → 添加插件**，填入包名，点击 **安装 → 立即启用**：

```text
@mskyurina/dsh-run-watchdog
```

需要固定版本时使用 `@mskyurina/dsh-run-watchdog@<版本号>`。在 **插件 → dsh-run-watchdog** 中配置。

也可安装 [v0.1.2 安装包](https://github.com/Hirate99/dsh-run-watchdog/releases/download/v0.1.2/mskyurina-dsh-run-watchdog-0.1.2.tgz)，或按下文从源码打包。仓库不再提交 dist，请使用发布包安装。

### 从源码构建

需要 Node.js ≥ 22.19，以及提供后台任务接口的 DSH `bash` / `pwsh` 工具。

```sh
npm ci
npm run check
npm pack
```

在 Desktop 的插件页面安装生成的 `mskyurina-dsh-run-watchdog-0.1.2.tgz` 并启用。也可在完全退出 Desktop 后使用其自带 CLI：

```powershell
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add "<包的绝对路径>/mskyurina-dsh-run-watchdog-0.1.2.tgz"
```

重新打开 Desktop，在 **插件 → dsh-run-watchdog** 中配置。

开发依赖锁定 DSH `0.2.1-alpha.3`、Cordis `4.0.5-alpha.2`。此前验证过 Desktop `0.2.0-rc.2` 的内置运行时；升级宿主后应重跑集成测试。

## 配置

- **DeepSeek**：默认复用 DSH 已登录的账号；未登录时读取模型设置中的 API Key。在插件配置页选择监测模型。自定义服务地址或凭据引用仍使用 API Key。
- **Jev**：选择 Jev 后填写专用 API Key，保存到 DSH 凭据存储。
- **观察模式**：默认模式，不执行任务提醒或停止；判断结果可通过 `watch_status` 查询。监测本身失效仍会通知 Agent。配置 `recordPath` 可保存判断记录。
- **执行模式**：异常投递给原会话，空闲的 Agent 会被唤醒。

保存后可点击“测试连接”。高级设置对新附加的监测生效。

| 配置             | 默认值 | 含义                     |
| ---------------- | ------ | ------------------------ |
| `firstCheckMs`   | 10000  | 首次检查等待时间         |
| `judgeTimeoutMs` | 8000   | 单次模型请求超时         |
| `stopThreshold`  | 0.8    | Jev 自动停止概率阈值     |
| `allowAutoStop`  | false  | 是否允许任务申请自动停止 |
| `recordPath`     | 未设置 | 本地 JSONL 记录路径      |

模型请求包含任务目的、命令和最多 16000 字符的近期日志；本地记录也包含这些内容。密钥优先从 DSH 凭据存储读取，其次读取 `apiKeyEnv` 指定的环境变量。

## 工作方式

插件向主 Agent 提供使用说明。Agent 用原生工具启动后台任务，再调用 `watch_job` 附加监测；用户无需指定工具或填写参数。

`watch_job` 立即返回。多个任务并发监测，各自使用独立日志游标，不消耗 Agent 的输出。Agent 可继续用 `job_output` 读取日志。插件不启动或重启命令。

每轮由小模型分别选择**动作**（继续、提醒、建议停止、不确定）和**下次检查间隔**（10、30、60、120、300、600 秒）。提醒后仍按模型选择的间隔继续检查。同一异常持续出现时不重复提醒；模型判断恢复正常后，再次异常会重新提醒。

- Jev 只有在选择停止、停止分数达到 `stopThreshold`，且部署配置与本次任务都授权时才自动停止；缺少可读输出或日志来源报错时不会自动停止。该分数没有经过准确率校准。
- DeepSeek 的停止建议只会转为提醒。
- 不再将提醒和停止的概率相加，也不把“继续”拆成六种动作。

允许正常重定向输出。Agent 可在 `watch_job` 中传入 `log_paths`（最多八个绝对路径），同时增量读取任务输出和日志文件。文件暂不存在、读取失败、截断或轮转会明确反映在状态与证据中。安静运行不等于异常；没有可读输出也不等于运行正常。

`watch_job` 返回输出来源、监测模式、当前健康状态和首次检查时间。`watch_status(jobId)` 返回最近判断及输入证据、连续失败次数和下次检查时间。判断服务连续失败两次会通知 Agent，恢复时再通知一次；意外退出观察循环也会报告。Jev 返回选项及分数，不生成原因；DeepSeek 可提供简短解释。主 Agent 应结合日志向用户说明启动监测、发现异常或失去可见性。

正常结束使用 DSH 原生通知。提醒会取消同一会话中的 `job_output(wait=true)` 等待，包括提醒尚未送达时新发起的等待；不会因此停止后台任务或取消整个 Agent。其他阻塞工具不在此处理范围内。

任务完成或插件卸载时清理监测，卸载不终止任务。插件重启后不会自动恢复旧监测。最近 100 个结束监测的结果可在本进程内查询；模型请求失败时按退避间隔重试。

## 开发与测试

```sh
npm run check
```

执行构建、类型检查及离线回归，无需 API Key。覆盖决策阈值、日志分块与截断、状态不可变性、调度边界、提醒后持续检查、监测失效与恢复、文件轮转、并发监测、等待中断竞态、DSH 工具与真实子进程集成。

在线连接测试会调用所选服务：

```sh
npm run smoke -- jev
npm run smoke -- deepseek
```

`WATCHDOG_MODEL` 可覆盖测试模型。离线测试通过不代表所有真实任务的判断质量；演示也不代表 Agent 在每个任务中都能稳定选择监测工具。

| 文件                                | 职责                                 |
| ----------------------------------- | ------------------------------------ |
| `src/output.ts`                     | 日志状态与证据统计，纯函数           |
| `src/decision.ts`                   | 模型输入、动作判断和比较规则         |
| `src/monitor-state.ts`              | 检查快照与时间调度，纯函数           |
| `src/monitor.ts`                    | 读取日志、请求模型、执行监测循环     |
| `src/jobs.ts`                       | DSH 任务读取与独立游标               |
| `src/interrupt-wait.ts`             | 提醒到达时释放输出等待               |
| `src/index.ts`                      | 工具注册、提醒投递和 Cordis 生命周期 |
| `src/providers.ts`                  | DeepSeek / Jev 请求适配              |
| `src/settings.ts`、`src/client.tsx` | 凭据、连接测试与配置界面             |

`docs/` 和 `.integration/` 用于本地验证记录，不纳入版本控制；README 演示素材保存在 `assets/`。

可复用的在线评估位于 `test/evaluation/`，需要显式配置判断服务凭据后运行。临时宿主探针、诊断脚本和原始实测记录保存在被忽略的 `.integration/`，不属于正式源码。

## CI 与发布

推送 main 或创建 PR 时，在 Windows 和 Linux 上执行完整检查并打包。`npm pack` 和 `npm publish` 会通过 prepack 构建 dist；Git 只保存源码，npm 包包含运行所需产物，安装时不需要构建。

发布新版本时，运行 `npm version patch --no-git-tag-version`（或指定版本），提交后推送 main。两平台检查通过后，工作流自动创建 `v<版本号>` 标签、发布 npm 包并创建 GitHub Release。同版本的后续提交不重复发布；失败后可重跑原工作流，补齐未完成步骤。已有标签不会移动。

采用与 agent-workspace 相同的 npm Trusted Publishing：在 npm 包的发布设置中授权 GitHub 用户 `Hirate99`、仓库 `dsh-run-watchdog`、工作流 `ci.yml`、Environment `npm`，允许直接发布。此授权按包配置，不能复用另一个包的授权；不需要保存 npm Token。首次发布后需在 npm 网站完成上述授权，后续版本即可由工作流发布。
