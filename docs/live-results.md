# 真实进程样例：2026-10-14

运行 `scripts/live-cases.ts`，三种可控真实本地进程各两轮，共六次 DeepSeek 判断请求。密钥通过已有项目的环境文件传入，没有写入测试结果。

| 场景 | 实际执行 | 期望动作 | 两轮结果 |
| --- | --- | --- | --- |
| 测试持续进展 | Node test runner 执行测试，其中一项失败，后续继续 | 继续检查 | 均在约 20 秒超时 |
| 无效重试 | 本地 HTTP 服务返回 401，客户端重复真实请求 | 提醒 Agent | 均在约 20 秒超时 |
| 等待输入 | readline 等待 `Continue? [y/N]` | 提醒 Agent | 均在约 20 秒超时 |

每次在进程启动 2 秒后采集真实输出，并发送一次判断请求；这是加速的在线分类验证，不是生产 10 秒默认检查周期的端到端测试。进程由测试脚本清理，不由模型杀掉。两轮总共 6 次请求，0 次获得判断；不能计算准确率。

## 超时诊断

随后用 `diagnose-api.mjs` 去掉监控提示词和 JSON 输出要求，仅请求 `Reply only OK`：

- `/models` 返回 200，405 ms；`/user/balance` 返回 200，272 ms，`is_available: true`，不记录余额数值。
- flash、旧 flash 别名、pro 三个名称均在 286～336 ms 收到生成接口的 200 响应头，之后每约 12 秒只有 `: keep-alive`，60 秒截止仍没有 token。旧别名不代表独立后端。
- 独立 Python urllib 客户端也在 360 ms 收到 200，此后 36 秒内只有保活，复现了现象。无代理环境变量，Windows 系统代理未启用，hosts 没有 DeepSeek 覆盖。
- 官方状态页同时报告 Flash API 部分中断，[事件 7116348214287](https://status.deepseek.com/incidents/7116348214287)，起始时间 2026-10-15 00:11 UTC（洛杉矶 10-14 17:11），查看时仍在调查。

证据强烈指向服务端故障导致推理迟迟没有开始，而非密钥无效或监控提示词错误；供应商内部根因仍未知。官方[保活文档](https://api-docs.deepseek.com/quick_start/rate_limit/)也说明 SSE 保活不代表已经开始推理。没有通过增加生产超时掩盖问题；待服务恢复后重跑样例。

上轮 `/models` 请求成功只能证明鉴权和模型列表可访问，不能证明生成接口可用。当前维持观察模式。模型失败回退、任务结束取消请求等由离线测试覆盖。

重跑（可能产生 API 费用）：

```powershell
node --env-file=../deepseek-harness-on-vue/.env --import tsx scripts/live-cases.ts
```

结果写到被 Git 忽略的 `.integration/live-cases.json`，包含真实日志、延迟、选择或错误。`WATCHDOG_MODEL` 可指定另一个 DeepSeek 模型。该脚本属于可控故障样例，尚不能替代真实项目长任务的观察评估。
