import { useState, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import {
  Button, SegmentedControl, SettingsForm, SettingsFormModel, SettingsSecretField, SettingsValueField, StateDot,
  settingsTextField, type SettingsFieldSpec, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { en, zh, type Key } from './client-locales';
import type { Config } from './index';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    runWatchdog: Key;
  }
}

const NS = 'runWatchdog';
const jevKeyRef = 'TYPESAFE_API_KEY';
type T = (key: Key, params?: Record<string, unknown>) => string;
type NumberField = 'firstCheckMs' | 'judgeTimeoutMs' | 'stopThreshold';

/** A number shown in display units (seconds for the *Ms fields) and stored in config units. */
function numberField(field: NumberField, scale: number, valid: (n: number) => boolean): SettingsFieldSpec {
  return {
    field,
    format: value => typeof value === 'number' ? String(value / scale) : '',
    parse: draft => {
      if (!draft.trim()) return { kind: 'clear' };
      const n = Number(draft);
      return Number.isFinite(n) && valid(n) ? { kind: 'set', value: Math.round(n * scale * 1000) / 1000 } : undefined;
    },
  };
}

/** Staged form over the plugin's config entry, plus the two credential states the page reports. */
function createPage(ctx: Context) {
  const scope = ctx.configForms.get<Partial<Config>>('run-watchdog');
  let keys = { deepseek: false, jev: false, account: false };
  let models: readonly { id: string; name: string }[] = [];
  const form = new SettingsFormModel(scope, [
    settingsTextField('provider'), settingsTextField('model'), settingsTextField('mode'),
    numberField('firstCheckMs', 1000, n => n > 0),
    numberField('judgeTimeoutMs', 1000, n => n > 0),
    numberField('stopThreshold', 1, n => n >= 0.5 && n <= 1),
  ], [{
    field: 'jevKey',
    write: async value => (await ctx.remote.credentials.set(jevKeyRef, value)).ok && (await readKeys(), keys.jev),
  }]);
  const project = () => ({
    ...form.shell(),
    provider: (form.field('provider').text || 'deepseek') as Config['provider'],
    mode: (form.field('mode').text || 'shadow') as Config['mode'],
    model: form.field('model'),
    firstCheckMs: form.field('firstCheckMs'),
    judgeTimeoutMs: form.field('judgeTimeoutMs'),
    stopThreshold: form.field('stopThreshold'),
    jevKey: form.field('jevKey'),
    keys, models,
  });
  const store = form.bind(project);

  async function readKeys() {
    const deepseekRef = scope.getSnapshot().value?.apiKeyEnv || 'DEEPSEEK_API_KEY';
    const response = await ctx.remote.credentials.describe([deepseekRef, jevKeyRef]);
    if (!response.ok) return;
    const account = await fetch('/api/run-watchdog/account').then(async response =>
      response.ok && (await response.json()).available === true).catch(() => false);
    keys = { deepseek: !!response.value[deepseekRef]?.configured, jev: !!response.value[jevKeyRef]?.configured, account };
    const catalog = await ctx.remote.session.modelCatalog();
    if (catalog.ok) {
      models = catalog.value.groups.find(group => group.id === (account ? 'deepseek-account' : 'deepseek-official'))?.models ?? [];
    }
    store.set(project());
  }
  void readKeys();
  return { store, actions: form.actions(), readKeys, dispose: () => form.dispose() };
}
type Page = ReturnType<typeof createPage>;

function WatchdogPage({ t, page }: { t: T; page: Page }) {
  const s = useSyncExternalStore(page.store.subscribe, page.store.getSnapshot);
  const { edit, resetField, save, discard } = page.actions;
  const disabled = !s.writable;
  const number = (field: NumberField, label: Key, hint: Key, invalid: Key = 'invalid') => (
    <SettingsValueField
      id={`run-watchdog-${field}`} label={t(label)} hint={t(hint)} numeric disabled={disabled}
      overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t(invalid)}
      {...s[field]} onEdit={text => edit(field, text)} onReset={() => resetField(field)}
    />
  );
  const chooseProvider = (provider: Config['provider']) => {
    edit('provider', provider);
    edit('model', provider === 'jev' ? 'jev-latest' : (s.models.find(m => m.id === 'deepseek-flash') ?? s.models[0])?.id ?? 'deepseek-flash');
  };

  return (
    <SettingsForm
      labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
      state={s} onSave={save} onDiscard={discard}
    >
      <div className="rw-field">
        <span className="rw-label">{t('provider')}</span>
        <SegmentedControl
          id="run-watchdog-provider" label={t('provider')} value={s.provider} disabled={disabled} onChange={chooseProvider}
          options={[{ value: 'deepseek', label: 'DeepSeek' }, { value: 'jev', label: 'Jev' }]}
        />
        <div id={`run-watchdog-provider-${s.provider}-panel`} role="tabpanel" aria-labelledby={`run-watchdog-provider-${s.provider}`}>
          <p className="rw-hint">{t('providerHint')}</p>
          {s.provider === 'deepseek' && (
            <p className="rw-hint rw-inline">
              <StateDot state={s.keys.deepseek || s.keys.account ? 'done' : 'warning'} />
              {t(s.keys.account ? 'deepseekAccount' : s.keys.deepseek ? 'deepseekKeySet' : 'deepseekKeyUnset')}
            </p>
          )}
        </div>
      </div>
      {s.provider === 'jev' && (
        <SettingsSecretField
          id="run-watchdog-jev-key" label={t('jevKey')} hint={t('jevKeyHint')} disabled={disabled}
          text={s.jevKey.text} configured={s.keys.jev} stateLabel={t(s.keys.jev ? 'jevKeySet' : 'jevKeyUnset')}
          onEdit={text => edit('jevKey', text)}
        />
      )}
      {s.provider === 'deepseek' && s.models.length > 0 ? (
        <label className="rw-field">
          <span className="rw-label">{t('model')}</span>
          <select className="rw-input" value={s.model.text} disabled={disabled} onChange={e => edit('model', e.target.value)}>
            {!s.models.some(m => m.id === s.model.text) && <option value={s.model.text}>{s.model.text} {t('modelUnlisted')}</option>}
            {s.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      ) : (
        <SettingsValueField
          id="run-watchdog-model" label={t('model')} disabled={disabled}
          overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('invalid')}
          {...s.model} onEdit={text => edit('model', text)} onReset={() => resetField('model')}
        />
      )}
      <div className="rw-field">
        <span className="rw-label">{t('mode')}</span>
        <SegmentedControl
          id="run-watchdog-mode" label={t('mode')} value={s.mode} disabled={disabled} onChange={mode => edit('mode', mode)}
          options={[{ value: 'shadow', label: t('shadow') }, { value: 'enforce', label: t('enforce') }]}
        />
        <p className="rw-hint" id={`run-watchdog-mode-${s.mode}-panel`} role="tabpanel" aria-labelledby={`run-watchdog-mode-${s.mode}`}>
          {t(s.mode === 'enforce' ? 'enforceHint' : 'shadowHint')}
        </p>
      </div>
      <details className="rw-field rw-advanced">
        <summary className="rw-label">{t('advanced')}</summary>
        {number('firstCheckMs', 'firstCheck', 'firstCheckHint')}
        {number('judgeTimeoutMs', 'judgeTimeout', 'judgeTimeoutHint')}
        {s.provider === 'jev' && number('stopThreshold', 'stopThreshold', 'stopThresholdHint', 'invalidRatio')}
      </details>
      <ConnectionTest t={t} dirty={s.dirty} />
    </SettingsForm>
  );
}

/** Sends the saved judge one synthetic prompt; a working judge answers notify_agent. */
function ConnectionTest({ t, dirty }: { t: T; dirty: boolean }) {
  const [result, setResult] = useState<{ state: StateDotState; text: string }>();
  async function run() {
    setResult({ state: 'ongoing', text: t('testing') });
    try {
      const response = await fetch('/api/run-watchdog/test', { method: 'POST' });
      const body = await response.json() as { choice?: string; latencyMs?: number; error?: string };
      const params = { choice: body.choice, ms: body.latencyMs, reason: body.error };
      setResult(response.ok
        ? body.choice === 'notify_agent' ? { state: 'done', text: t('testOk', params) } : { state: 'warning', text: t('testOdd', params) }
        : { state: 'error', text: t(body.error === 'timeout' ? 'testTimeout' : body.error === 'no-key' ? 'testNoKey' : 'testFailed', params) });
    } catch {
      setResult({ state: 'error', text: t('testFailed', { reason: 'network' }) });
    }
  }
  return (
    <div className="rw-field">
      <div className="rw-inline">
        <Button variant="outline" size="sm" disabled={dirty || result?.state === 'ongoing'} onClick={() => void run()}>{t('test')}</Button>
        {result && <span className="rw-status" role="status"><StateDot state={result.state} />{result.text}</span>}
      </div>
      <p className="rw-hint">{t(dirty ? 'testSaveFirst' : 'testHint')}</p>
    </div>
  );
}

// Mirrors the shared settings field styles so custom rows sit flush with the primitives.
const css = `
.rw-field{display:flex;flex-direction:column;gap:6px;padding:12px 0;margin:0}
.rw-field + *, * + .rw-field{border-top:0.5px solid var(--dsw-alias-border-l2)}
.rw-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.rw-hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.rw-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rw-input{height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}
.rw-input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.rw-advanced > summary{cursor:pointer;width:fit-content}
.rw-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
`;

export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.credentials', 'remote.session'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }));
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const page = createPage(ctx);
  ctx.effect(() => page.dispose);
  ctx.effect(() => ctx.remote.$on('credentials/reference-updated', () => void page.readKeys()));
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-run-watchdog', locale: NS,
  }, ({ t }) => <WatchdogPage t={t as T} page={page} />));
}
