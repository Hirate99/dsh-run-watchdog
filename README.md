# dsh-run-watchdog

给 DSH 长命令增加一个带着任务目的读日志的判断层。默认仅观察；支持 DeepSeek 和 Jev。

## 第一版范围

提供 `watch_run`，主 Agent 必须填写 `purpose` 和 `command`。工具通过 **原有 bash/pwsh 工具的完整权限链** 启动后台 job，再用独立游标观察输出。不会替换所有 shell 调用，不自行启动另一套 shell，也不自动修复或重试命令。

默认 10 秒首次检查。后续选项是 `check_10s / check_30s / check_60s / check_120s / check_300s / check_600s / notify_agent / stop / uncertain`。只有 `service: true` 且日志已匹配 `ready_pattern` 时，才提供 `no_more_checks`。

- `notify_agent`：结束 `watch_run` 的等待，返回 job ID、判断和日志；进程继续，主 Agent 接手。该任务不再由此调用监控，因此不会重复提醒。
- `no_more_checks`：结束模型监控并返回常驻服务 job ID，服务继续。
- `stop`：Jev 的 `P(stop) >= stopThreshold`（默认 0.8），且部署配置 `allowAutoStop` 和本次调用 `auto_stop` 都开启，才请求取消。等待最多 5 秒确认，报告真实 `jobStatus`，不会把“已请求”说成“已停止”。
- Jev 中间停止概率（>= 0.4）或仅 argmax 选中 stop：通知。其他低置信度判断（< 0.5）：使用默认间隔。阈值是待校准初值。
- DeepSeek 的 stop 一律通知，不制造概率。
- `shadow` 模式只记录拟采取的动作，不提醒、不取消、不退出监控。
- 请求失败或 `uncertain`：默认间隔依次增加到 30、60、120、300、600 秒。
- 任务结束会取消检查定时器及正在进行的 HTTP 请求。用户取消 `watch_run` 会请求取消它创建的 job。

服务匹配使用普通字符串，不是正则。`success_signal` 只提供任务语境，不作为代码里的成功证明。

## 固定兼容版本

本项目针对 **DSH 0.2.1-alpha.3**、Cordis **4.0.5-alpha.2**。peer dependencies 与锁文件记录实际接口版本。DSH 的 npm `latest` 当前指向更老版本，不要通过 `--force` 绕过版本冲突。

已验证接口：`tools.execute` 嵌套调用、`jobs.readAt` 独立游标、`jobs.events.subscribe`、`jobs.kill/wait`。主分支与早期 npm 版本存在差异；升级要重跑集成测试。

## 构建与接入

需要 Node.js >= 22.19。

```sh
npm ci
npm run check
npx dsh plugin --profile <你的配置名> add <此仓库的绝对路径>
npx dsh --profile <你的配置名> --patch ./examples/deepseek.patch.yml
```

包内 `dsh.bundle.patch` 会自动注册插件，不需要手动添加组件。插件还向主 Agent 注入使用 `watch_run` 的说明。

如果宿主直接通过 Cordis 配置加载包，插件条目示例如下（应放入已有的工具组合层，保留该配置原来的其他插件）：

```yaml
- name: dsh-run-watchdog
  config:
    provider: deepseek
    model: deepseek-flash
    apiKeyEnv: DEEPSEEK_API_KEY
    mode: shadow
    recordPath: ./watchdog-checks.jsonl
```

宿主需已有 `tools`、`jobs`、`systemPrompt`、支持 `run_in_background` 的原生 `bash` 或 `pwsh`，以及 job 控制工具。`shellTool: auto` 在 Windows 优先选择 pwsh，其他平台优先 bash；也可明确指定。标准 DSH web 的 standard / ptc / cordis preset 提供所需工具；minimal 的 persistent shell 不支持这条后台 job 接口。插件按调用 Agent 查找原生工具，不绕过其权限规则。

Jev 配置将上面的三个字段替换为：

```yaml
provider: jev
model: jev-latest
apiKeyEnv: TYPESAFE_API_KEY
```

确认观察记录后将 `mode` 改为 `enforce`。只有希望允许 Jev 自动停止可重跑任务时，才设置 `allowAutoStop: true`。主 Agent 示例参数：

```json
{
  "purpose": "运行整个测试集，收集全部失败；单项失败不是停止理由",
  "command": "npm test",
  "success_signal": "测试运行器报告最终汇总",
  "auto_stop": true
}
```

配置项另包括 `firstCheckMs`（10000）、`judgeTimeoutMs`（8000）、`stopThreshold`（0.8）和 `baseURL`。baseURL 是 API 根路径：Jev 为 `https://api.typesafe.ai/v1`，DeepSeek 为 `https://api.deepseek.com`。密钥优先从 DSH credentials 服务读取，其次读取指定环境变量。缺少密钥时插件仍可加载，但 watch_run 在启动命令前报错。也可用 Node 的 `--env-file=<已有环境文件>` 启动 DSH 或 smoke，无需复制密钥。

命令、目的和最多 16000 字符的近期日志会发送给所选模型供应商。启用 recordPath 后，本地 JSONL 也记录这些内容；这是原始运行证据，不承诺自动脱敏。不要对包含秘密的输出启用远程判断。原始日志仍由 DSH 保存；监控不移动主 Agent 的读取游标。

后台启动继承 DSH 的后台任务语义，没有前台命令硬超时；检查间隔并非执行超时。部署/迁移等不可安全中止的任务应关闭 auto_stop。交互提示会交还主 Agent，但本工具不提供 stdin/PTY 交互接口。

## 测试

`npm run check` 执行类型检查、构建与离线测试，不需要密钥或付费请求。

| 层次 | 验证内容 |
| --- | --- |
| 决策单元测试 | argmax 停止陷阱、独立阈值、DeepSeek 只提醒、常驻服务限制 |
| 观察循环 | 重复日志、提醒不杀任务、完成取消模型请求、shadow 不执行、失败回退、用户取消 |
| HTTP 契约 | 本地 HTTP 服务验证两类请求格式、Jev 概率分布校验、DeepSeek JSON 与非思考模式 |
| DSH 集成 | 真实 Cordis/工具运行时挂载、必填目的、原有 bash/pwsh 权限拒绝仍生效 |
| 进程集成 | 真实 Job Registry 管理真实 Node 子进程，取消及输出游标互不影响 |

在线 smoke 只发送合成故障数据，不运行命令：

```sh
# 先在当前终端设置对应 API key；不要写入仓库
npm run smoke -- jev
npm run smoke -- deepseek
```

`WATCHDOG_MODEL` 可覆盖 smoke 的模型名称。未提供密钥时明确失败。离线契约测试不证明线上模型可用性或判断质量。

观察记录同时保存 `baseline` 与模型判断。规则目前只标记无新增输出、同一窗口重复行 >= 5、疑似输入提示，不直接停止。新增行统计为本次读取中的非空行片段数；没有处理跨窗口半行拼接。`lossy` 标记 DSH 输出环丢失的历史，不能把有缺口的日志当作完整证据。

先按实际任务复核误停建议、提醒是否有用、净节省时间和判断调用次数，再调整阈值。本仓库尚未证明模型比规则基线更有效。

## 结构

- `decision.ts`：判别联合类型与纯决策函数。
- `monitor.ts`：单任务观察循环与生命周期。
- `providers.ts`：两个小型 HTTP 适配器。
- `index.ts`：DSH 注册、后台 job 观察与结果交接。

采用类似 Rust enum 的可区分联合表示结果，避免一组相互矛盾的布尔开关；不为此引入 Rust 进程或额外守护服务。

## 验证依据

- [DSH 源码](https://github.com/deepseek-ai/deepseek-harness)，本地类型/运行测试以锁定的 npm 包为准。
- [Jev Choice](https://docs.typesafe.ai/primitives/choice)：state + questions → choice/probabilities/confidence；不生成解释文字。
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)：默认使用 deepseek-flash、JSON 输出和关闭思考模式。

2026-10-14 本地验证：

- 隔离 DSH profile 通过官方 plugin add 安装本仓库；组合配置包含插件，Web 插件详情显示组件运行中（截图见 `docs/dsh-plugin-running.jpg`）。
- 使用 `examples/probe.patch.yml` 在真实 DSH 宿主执行原生 pwsh，watch_run 返回 `finished`、`completed`、退出码 0 和 `watchdog-native-ok`。探针只跑短命令，不调用模型；它额外启用根作用域 shell/jobs，因为没有会话 Agent。仅用于测试 profile。
- 从已有项目环境文件读取 DeepSeek 密钥，`/models` 鉴权成功。实际生成请求在 15～60 秒内未完成；流式请求仅收到保活。未确认在线判断成功，未测 Jev。

尚未完成：主 Agent 在 UI 会话中自动选择 watch_run 的完整流程、真实 shell 执行器的进程树取消测试。当前进程集成测试验证单个真实子进程；DSH 负责其执行器的进程树行为。
