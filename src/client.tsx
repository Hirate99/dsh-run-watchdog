import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Config } from './index.js';

type Values = Pick<Config, 'provider' | 'model' | 'mode' | 'firstCheckMs' | 'judgeTimeoutMs' | 'stopThreshold'>;
const defaults: Values = { provider: 'deepseek', model: 'deepseek-flash', mode: 'shadow', firstCheckMs: 10000, judgeTimeoutMs: 8000, stopThreshold: 0.8 };
const endpoint = '/api/run-watchdog/test';

export function WatchdogForm({ ctx, form }: { ctx: Context; form: ConfigForm<Values> }) {
  const saved = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot());
  const [draft, setDraft] = useState<Values | null>(null);
  const [revision, setRevision] = useState<number>();
  const [key, setKey] = useState('');
  const [credentials, setCredentials] = useState({ deepseek: false, jev: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const value = draft ?? saved.value ?? defaults;
  const dirty = draft !== null || key !== '';
  const refresh = async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) throw new Error('无法读取密钥状态');
    const result = await response.json();
    setCredentials({ deepseek: result.deepseek.configured, jev: result.jev.configured });
  };
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setMessage(String(error.message)); });
    return () => controller.abort();
  }, []);
  function edit(next: Partial<Values>) {
    if (!draft) setRevision(saved.revision);
    setDraft({ ...value, ...next });
    setMessage('');
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      // Save the secret first; report partial success if the settings revision conflicts.
      if (key && value.provider === 'jev') {
        const result = await ctx.remote.credentials.set('TYPESAFE_API_KEY', key);
        if (!result.ok) throw new Error('Jev 密钥保存失败');
        setKey('');
        await refresh();
      }
      if (draft && !await form.mutate(Object.entries(draft).map(([field, val]) => ({ op: 'set' as const, path: [field], value: val })), revision)) {
        throw new Error('设置保存失败，请刷新重试。');
      }
      setDraft(null); setMessage('已保存');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage('连接中…');
    try {
      const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(value.judgeTimeoutMs + 5000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(`连接成功 · ${result.latencyMs} ms`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '连接失败'); }
    finally { setBusy(false); }
  }
  if (saved.status !== 'ready') return <p>加载中…</p>;
  const fieldStyle = { display: 'grid', gap: 6, marginBottom: 16 };
  return <section className="watchdog-config" style={{ maxWidth: 560, padding: '12px 0', lineHeight: 1.6 }}>
    <style>{`.watchdog-config input,.watchdog-config select{box-sizing:border-box;width:100%;padding:8px 12px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit}.watchdog-config button{padding:7px 14px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;cursor:pointer}.watchdog-config button:disabled{opacity:.45;cursor:default}.watchdog-config summary{cursor:pointer;margin:12px 0}.watchdog-config [role=status]{min-height:24px}`}</style>
    <fieldset disabled={busy || !saved.writable} style={{ border: 0, padding: 0, margin: 0 }}>
      <label style={fieldStyle}>服务
        <select value={value.provider} onChange={e => { const provider = e.target.value as Values['provider']; edit({ provider, model: provider === 'jev' ? 'jev-latest' : 'deepseek-flash' }); setKey(''); }}>
          <option value="deepseek">DeepSeek</option><option value="jev">Jev</option>
        </select>
      </label>
      {value.provider === 'deepseek'
        ? (!credentials.deepseek && <p>请在 DSH 模型设置中配置 DeepSeek 密钥。</p>)
        : <label style={fieldStyle}>Jev API Key {credentials.jev ? '（已保存）' : '（未配置）'}
          <input type="password" autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} placeholder={credentials.jev ? "留空保持不变" : "输入 API Key"} />
        </label>}
      <label style={fieldStyle}>模型<input value={value.model} onChange={e => edit({ model: e.target.value })} /></label>
      <label style={fieldStyle}>模式<select value={value.mode} onChange={e => edit({ mode: e.target.value as Values['mode'] })}>
        <option value="shadow">观察</option><option value="enforce">执行</option>
      </select></label>
      <details><summary>高级设置</summary>
        <label style={fieldStyle}>首次检查（秒）<input type="number" min="0.001" step="any" value={value.firstCheckMs / 1000} onChange={e => edit({ firstCheckMs: Number(e.target.value) * 1000 })} /></label>
        <label style={fieldStyle}>请求超时（秒）<input type="number" min="0.001" step="any" value={value.judgeTimeoutMs / 1000} onChange={e => edit({ judgeTimeoutMs: Number(e.target.value) * 1000 })} /></label>
        {value.provider === 'jev' && <label style={fieldStyle}>停止阈值<input type="number" min="0.5" max="1" step="0.01" value={value.stopThreshold} onChange={e => edit({ stopThreshold: Number(e.target.value) })} /></label>}
      </details>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button disabled={!dirty || !value.model.trim()} onClick={() => void save()}>保存</button>
        <button disabled={!dirty} onClick={() => { setDraft(null); setKey(''); setMessage(''); }}>放弃修改</button>
        <button disabled={dirty} onClick={() => void test()}>测试连接</button>
      </div>
    </fieldset>
    {!saved.writable && <p>配置只读</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}

export const inject = ['slots', 'configForms', 'remote.credentials'];
export function apply(ctx: Context) {
  const form = ctx.configForms.get<Values>('run-watchdog');
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-run-watchdog',
  }, () => <WatchdogForm ctx={ctx} form={form} />));
}
