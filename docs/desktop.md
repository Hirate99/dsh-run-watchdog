# Desktop 接入与 API key

## 本机兼容性

2026-10-14 检查到官方 Desktop 0.2.0-rc.2（构建 04f392c9ddd144fa426da2045178797da6db6c11），Cordis 4.0.4，Electron Node 24.18.1。

`scripts/check-desktop.cjs` 将插件测试的 DSH 导入指向安装包内的真实依赖，并用安装版 Electron 的 Node 模式执行。bash/pwsh 两项测试通过，覆盖注册、权限拒绝、完成返回，以及通过本地 credentials 服务保存并读取 key。shell 在这些测试中是测试替身；这不是完整 Desktop 聊天验收。

现有 Web 测试环境为 DSH 0.2.1-alpha.3。兼容范围仅列出实际测试的两个版本，不泛化到所有预发布版本。无需 Electron 前端或独立后台服务。

## 安装方式

先在仓库运行 `npm ci`、`npm run check`、`npm pack`，生成包含 dist 和 bundle patch 的 `.tgz`。优先在 Desktop 的 **插件** 页面安装该本地包并启用。此仓库尚未发布 npm 包，不能直接把包名当作已发布包安装。

也可用 Desktop 自带的命令：先启动 Desktop 初始化配置，随后完全退出应用（关闭窗口可能只是隐藏），再执行：

```powershell
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add "C:/Users/Haonan/Documents/Projects/dsh-run-watchdog/dsh-run-watchdog-0.1.0.tgz"
```

重新打开 Desktop，在插件页确认组件运行。不要用仓库的 `npx dsh` 改写 Desktop profile；不要把 Web 测试 profile 的依赖目录复制过去。此次没有修改正在使用的 Desktop profile，也没有关闭其会话。

插件默认 shadow，使用 `watch_run` 的命令才受监控。启用后用 standard preset 开一个测试会话，明确要求使用 watch_run 运行一个耗时测试，并填写 purpose；确认工具调用和 job 输出后，再测试 Agent 自主选择工具的行为。minimal preset 的 persistent shell 不提供本插件所需后台 job 接口。

## 用 UI 配置密钥

**设置 → 模型 → DeepSeek → API key → 应用**。

这一入口已通过本机安装包的 Models 页面实现及文档核对；保存使用 `credentials.set`，插件通过 `credentials.resolve` 读取同一引用。默认名称为 `DEEPSEEK_API_KEY`，无需在插件 YAML 中写 key。下次 watch_run 读取保存值，无需重装插件。

- 选择 **DeepSeek**，不是 **DeepSeek Account**。账户登录不是公共 API key。
- 输入框不回显已保存的密钥是正常行为；页面用配置状态指示是否已保存。
- 当前读取其他项目 `.env` 的方式只用于验证，不会自动迁移到 Desktop 存储。
- 如果 DeepSeek provider 被配置为自定义凭据引用，插件的 `apiKeyEnv` 应使用相同名称。
- 插件复用密钥，不复用聊天 provider 的协议或 baseURL。监控请求仍使用 Chat Completions；不要把聊天卡片的 `/anthropic` 地址复制给插件。
- Jev 不是普通聊天 provider，不为保存密钥创建假的聊天 provider。第一版 DeepSeek 直接用上述 UI；Jev 目前用 `TYPESAFE_API_KEY` 环境变量。需要 Jev UI 时再给插件增加写入同一凭据存储的小配置页。

## 重跑 Desktop 运行时测试

在仓库目录执行（不启动或修改用户 profile）：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/DeepSeek Harness.exe" scripts/check-desktop.cjs
& "$env:LOCALAPPDATA/Programs/DeepSeek Harness/DeepSeek Harness.exe" --test .integration/desktop-plugin-test.mjs
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

官方说明：[Desktop 插件安装与配置所有权](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#bundled-command-runtime)。这里的本机结果以安装包为准，主分支文档可能更新。
