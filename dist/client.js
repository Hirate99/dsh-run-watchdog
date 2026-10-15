window.__ModuleLoader__.load({id:"dsh-run-watchdog",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client-locales.ts
var en = {
  provider: "Judge",
  providerHint: "A small model that reads the command purpose and recent output at each check.",
  deepseekKeySet: "Uses the DeepSeek API key from Settings \u2192 Models.",
  deepseekAccount: "Uses your DSH DeepSeek account.",
  deepseekKeyUnset: "Sign in to DeepSeek in DSH, or add an API key in Settings \u2192 Models.",
  jevKey: "Jev API key",
  jevKeyHint: "Stored in DSH credentials, never in the settings file. Leave blank to keep the current key.",
  jevKeySet: "A key is configured.",
  jevKeyUnset: "No key is configured.",
  model: "Model",
  modelUnlisted: "(not in catalog)",
  mode: "Mode",
  shadow: "Observe",
  enforce: "Act",
  shadowHint: "Records decisions without sending alerts.",
  enforceHint: "Alerts the agent when attention is needed. Automatic stopping is off by default.",
  advanced: "Advanced",
  firstCheck: "First check (seconds)",
  firstCheckHint: "Delay before the first judgement.",
  judgeTimeout: "Judge timeout (seconds)",
  judgeTimeoutHint: "A slower answer counts as a failed check and the command keeps running.",
  stopThreshold: "Jev stop threshold",
  stopThresholdHint: 'Probability of "stop" required before an auto-stoppable job is cancelled (0.5\u20131).',
  test: "Test connection",
  testHint: 'Sends one synthetic "Continue? [y/N]" log to the saved judge. Runs no command.',
  testSaveFirst: "Save your changes before testing.",
  testing: "Waiting for the judge\u2026",
  testOk: "Connected \xB7 {choice} \xB7 {ms} ms",
  testOdd: "Connected in {ms} ms, but the judge chose {choice}; a working judge should choose notify_agent.",
  testTimeout: "No answer before the judge timeout. The key may still be valid; the service may be slow.",
  testNoKey: "No API key is configured for this judge.",
  testFailed: "Connection failed ({reason}).",
  overridden: "Overridden",
  reset: "Reset to default",
  invalid: "Enter a positive number.",
  invalidRatio: "Enter a number from 0.5 to 1.",
  readOnly: "This deployment stores settings read-only.",
  unavailable: "The watchdog is not running, so it cannot be configured right now.",
  save: "Save",
  saving: "Saving\u2026",
  saveFailed: "The deployment did not accept these values; they were left for you to correct."
};
var zh = {
  provider: "\u5224\u65AD\u670D\u52A1",
  providerHint: "\u6BCF\u6B21\u68C0\u67E5\u65F6\uFF0C\u7531\u4E00\u4E2A\u5C0F\u6A21\u578B\u7ED3\u5408\u547D\u4EE4\u76EE\u7684\u548C\u8FD1\u671F\u8F93\u51FA\u505A\u5224\u65AD\u3002",
  deepseekKeySet: "\u590D\u7528 \u8BBE\u7F6E \u2192 \u6A21\u578B \u4E2D\u7684 DeepSeek API Key\u3002",
  deepseekAccount: "\u590D\u7528 DSH \u7684 DeepSeek \u767B\u5F55\u3002",
  deepseekKeyUnset: "\u8BF7\u767B\u5F55 DSH \u7684 DeepSeek \u8D26\u53F7\uFF0C\u6216\u5728 \u8BBE\u7F6E \u2192 \u6A21\u578B \u4E2D\u6DFB\u52A0 API Key\u3002",
  jevKey: "Jev API Key",
  jevKeyHint: "\u4FDD\u5B58\u5728 DSH \u51ED\u636E\u4E2D\uFF0C\u4E0D\u5199\u5165\u8BBE\u7F6E\u6587\u4EF6\u3002\u7559\u7A7A\u8868\u793A\u4FDD\u6301\u5F53\u524D\u5BC6\u94A5\u3002",
  jevKeySet: "\u5DF2\u914D\u7F6E\u5BC6\u94A5\u3002",
  jevKeyUnset: "\u672A\u914D\u7F6E\u5BC6\u94A5\u3002",
  model: "\u6A21\u578B",
  modelUnlisted: "\uFF08\u4E0D\u5728\u6A21\u578B\u5217\u8868\u4E2D\uFF09",
  mode: "\u8FD0\u884C\u6A21\u5F0F",
  shadow: "\u89C2\u5BDF",
  enforce: "\u6267\u884C",
  shadowHint: "\u540E\u53F0\u89C2\u5BDF\uFF0C\u53EA\u8BB0\u5F55\u5224\u65AD\u3002",
  enforceHint: "\u53D1\u73B0\u5F02\u5E38\u65F6\u63D0\u9192 Agent\uFF1B\u9ED8\u8BA4\u4E0D\u81EA\u52A8\u505C\u6B62\u4EFB\u52A1\u3002",
  advanced: "\u9AD8\u7EA7",
  firstCheck: "\u9996\u6B21\u68C0\u67E5\uFF08\u79D2\uFF09",
  firstCheckHint: "\u542F\u52A8\u540E\u591A\u4E45\u505A\u7B2C\u4E00\u6B21\u5224\u65AD\u3002",
  judgeTimeout: "\u5224\u65AD\u8D85\u65F6\uFF08\u79D2\uFF09",
  judgeTimeoutHint: "\u8D85\u8FC7\u5373\u89C6\u4E3A\u672C\u6B21\u68C0\u67E5\u5931\u8D25\uFF0C\u547D\u4EE4\u7167\u5E38\u8FD0\u884C\u3002",
  stopThreshold: "Jev \u505C\u6B62\u9608\u503C",
  stopThresholdHint: '"\u505C\u6B62"\u7684\u6982\u7387\u8FBE\u5230\u8BE5\u503C\uFF0C\u624D\u4F1A\u53D6\u6D88\u5141\u8BB8\u81EA\u52A8\u505C\u6B62\u7684\u4EFB\u52A1\uFF080.5\u20131\uFF09\u3002',
  test: "\u6D4B\u8BD5\u8FDE\u63A5",
  testHint: '\u5411\u5DF2\u4FDD\u5B58\u7684\u5224\u65AD\u670D\u52A1\u53D1\u9001\u4E00\u6BB5\u5408\u6210\u7684 "Continue? [y/N]" \u65E5\u5FD7\uFF0C\u4E0D\u6267\u884C\u4EFB\u4F55\u547D\u4EE4\u3002',
  testSaveFirst: "\u8BF7\u5148\u4FDD\u5B58\u4FEE\u6539\u518D\u6D4B\u8BD5\u3002",
  testing: "\u7B49\u5F85\u5224\u65AD\u7ED3\u679C\u2026",
  testOk: "\u8FDE\u63A5\u6B63\u5E38 \xB7 {choice} \xB7 {ms} ms",
  testOdd: "\u5DF2\u8FDE\u901A\uFF08{ms} ms\uFF09\uFF0C\u4F46\u5224\u65AD\u4E3A {choice}\uFF1B\u6B63\u5E38\u5E94\u4E3A notify_agent\u3002",
  testTimeout: "\u5728\u5224\u65AD\u8D85\u65F6\u5185\u6CA1\u6709\u6536\u5230\u56DE\u590D\u3002\u5BC6\u94A5\u4E0D\u4E00\u5B9A\u6709\u95EE\u9898\uFF0C\u53EF\u80FD\u662F\u670D\u52A1\u8F83\u6162\u3002",
  testNoKey: "\u8BE5\u5224\u65AD\u670D\u52A1\u5C1A\u672A\u914D\u7F6E API Key\u3002",
  testFailed: "\u8FDE\u63A5\u5931\u8D25\uFF08{reason}\uFF09\u3002",
  overridden: "\u5DF2\u4FEE\u6539",
  reset: "\u6062\u590D\u9ED8\u8BA4",
  invalid: "\u8BF7\u8F93\u5165\u6B63\u6570\u3002",
  invalidRatio: "\u8BF7\u8F93\u5165 0.5 \u5230 1 \u4E4B\u95F4\u7684\u6570\u3002",
  readOnly: "\u672C\u90E8\u7F72\u7684\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
  unavailable: "\u76D1\u63A7\u63D2\u4EF6\u672A\u8FD0\u884C\uFF0C\u6682\u65F6\u65E0\u6CD5\u914D\u7F6E\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saveFailed: "\u672C\u90E8\u7F72\u6CA1\u6709\u63A5\u53D7\u8FD9\u4E9B\u503C\uFF0C\u5DF2\u4FDD\u7559\u4F9B\u4F60\u4FEE\u6539\u3002"
};

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "runWatchdog";
var jevKeyRef = "TYPESAFE_API_KEY";
function numberField(field, scale, valid) {
  return {
    field,
    format: (value) => typeof value === "number" ? String(value / scale) : "",
    parse: (draft) => {
      if (!draft.trim()) return { kind: "clear" };
      const n = Number(draft);
      return Number.isFinite(n) && valid(n) ? { kind: "set", value: Math.round(n * scale * 1e3) / 1e3 } : void 0;
    }
  };
}
function createPage(ctx) {
  const scope = ctx.configForms.get("run-watchdog");
  let keys = { deepseek: false, jev: false, account: false };
  let models = [];
  const form = new import_dsh_client_ui_primitives.SettingsFormModel(scope, [
    (0, import_dsh_client_ui_primitives.settingsTextField)("provider"),
    (0, import_dsh_client_ui_primitives.settingsTextField)("model"),
    (0, import_dsh_client_ui_primitives.settingsTextField)("mode"),
    numberField("firstCheckMs", 1e3, (n) => n > 0),
    numberField("judgeTimeoutMs", 1e3, (n) => n > 0),
    numberField("stopThreshold", 1, (n) => n >= 0.5 && n <= 1)
  ], [{
    field: "jevKey",
    write: async (value) => (await ctx.remote.credentials.set(jevKeyRef, value)).ok && (await readKeys(), keys.jev)
  }]);
  const project = () => ({
    ...form.shell(),
    provider: form.field("provider").text || "deepseek",
    mode: form.field("mode").text || "shadow",
    model: form.field("model"),
    firstCheckMs: form.field("firstCheckMs"),
    judgeTimeoutMs: form.field("judgeTimeoutMs"),
    stopThreshold: form.field("stopThreshold"),
    jevKey: form.field("jevKey"),
    keys,
    models
  });
  const store = form.bind(project);
  async function readKeys() {
    const deepseekRef = scope.getSnapshot().value?.apiKeyEnv || "DEEPSEEK_API_KEY";
    const response = await ctx.remote.credentials.describe([deepseekRef, jevKeyRef]);
    if (!response.ok) return;
    const account = await fetch("/api/run-watchdog/account").then(async (response2) => response2.ok && (await response2.json()).available === true).catch(() => false);
    keys = { deepseek: !!response.value[deepseekRef]?.configured, jev: !!response.value[jevKeyRef]?.configured, account };
    const catalog = await ctx.remote.session.modelCatalog();
    if (catalog.ok) {
      models = catalog.value.groups.find((group) => group.id === (account ? "deepseek-account" : "deepseek-official"))?.models ?? [];
    }
    store.set(project());
  }
  void readKeys();
  return { store, actions: form.actions(), readKeys, dispose: () => form.dispose() };
}
function WatchdogPage({ t, page }) {
  const s = (0, import_react.useSyncExternalStore)(page.store.subscribe, page.store.getSnapshot);
  const { edit, resetField, save, discard } = page.actions;
  const disabled = !s.writable;
  const number = (field, label, hint, invalid = "invalid") => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_dsh_client_ui_primitives.SettingsValueField,
    {
      id: `run-watchdog-${field}`,
      label: t(label),
      hint: t(hint),
      numeric: true,
      disabled,
      overriddenLabel: t("overridden"),
      resetLabel: t("reset"),
      invalidLabel: t(invalid),
      ...s[field],
      onEdit: (text) => edit(field, text),
      onReset: () => resetField(field)
    }
  );
  const chooseProvider = (provider) => {
    edit("provider", provider);
    edit("model", provider === "jev" ? "jev-latest" : (s.models.find((m) => m.id === "deepseek-flash") ?? s.models[0])?.id ?? "deepseek-flash");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    import_dsh_client_ui_primitives.SettingsForm,
    {
      labels: { unavailable: t("unavailable"), readOnly: t("readOnly"), saveFailed: t("saveFailed"), save: t("save"), saving: t("saving") },
      state: s,
      onSave: save,
      onDiscard: discard,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rw-label", children: t("provider") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.SegmentedControl,
            {
              id: "run-watchdog-provider",
              label: t("provider"),
              value: s.provider,
              disabled,
              onChange: chooseProvider,
              options: [{ value: "deepseek", label: "DeepSeek" }, { value: "jev", label: "Jev" }]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { id: `run-watchdog-provider-${s.provider}-panel`, role: "tabpanel", "aria-labelledby": `run-watchdog-provider-${s.provider}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "rw-hint", children: t("providerHint") }),
            s.provider === "deepseek" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "rw-hint rw-inline", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: s.keys.deepseek || s.keys.account ? "done" : "warning" }),
              t(s.keys.account ? "deepseekAccount" : s.keys.deepseek ? "deepseekKeySet" : "deepseekKeyUnset")
            ] })
          ] })
        ] }),
        s.provider === "jev" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.SettingsSecretField,
          {
            id: "run-watchdog-jev-key",
            label: t("jevKey"),
            hint: t("jevKeyHint"),
            disabled,
            text: s.jevKey.text,
            configured: s.keys.jev,
            stateLabel: t(s.keys.jev ? "jevKeySet" : "jevKeyUnset"),
            onEdit: (text) => edit("jevKey", text)
          }
        ),
        s.provider === "deepseek" && s.models.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "rw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rw-label", children: t("model") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { className: "rw-input", value: s.model.text, disabled, onChange: (e) => edit("model", e.target.value), children: [
            !s.models.some((m) => m.id === s.model.text) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: s.model.text, children: [
              s.model.text,
              " ",
              t("modelUnlisted")
            ] }),
            s.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: m.id, children: m.name }, m.id))
          ] })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_client_ui_primitives.SettingsValueField,
          {
            id: "run-watchdog-model",
            label: t("model"),
            disabled,
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalidLabel: t("invalid"),
            ...s.model,
            onEdit: (text) => edit("model", text),
            onReset: () => resetField("model")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rw-label", children: t("mode") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_dsh_client_ui_primitives.SegmentedControl,
            {
              id: "run-watchdog-mode",
              label: t("mode"),
              value: s.mode,
              disabled,
              onChange: (mode) => edit("mode", mode),
              options: [{ value: "shadow", label: t("shadow") }, { value: "enforce", label: t("enforce") }]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "rw-hint", id: `run-watchdog-mode-${s.mode}-panel`, role: "tabpanel", "aria-labelledby": `run-watchdog-mode-${s.mode}`, children: t(s.mode === "enforce" ? "enforceHint" : "shadowHint") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "rw-field rw-advanced", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: "rw-label", children: t("advanced") }),
          number("firstCheckMs", "firstCheck", "firstCheckHint"),
          number("judgeTimeoutMs", "judgeTimeout", "judgeTimeoutHint"),
          s.provider === "jev" && number("stopThreshold", "stopThreshold", "stopThresholdHint", "invalidRatio")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConnectionTest, { t, dirty: s.dirty })
      ]
    }
  );
}
function ConnectionTest({ t, dirty }) {
  const [result, setResult] = (0, import_react.useState)();
  async function run() {
    setResult({ state: "ongoing", text: t("testing") });
    try {
      const response = await fetch("/api/run-watchdog/test", { method: "POST" });
      const body = await response.json();
      const params = { choice: body.choice, ms: body.latencyMs, reason: body.error };
      setResult(response.ok ? body.choice === "notify_agent" ? { state: "done", text: t("testOk", params) } : { state: "warning", text: t("testOdd", params) } : { state: "error", text: t(body.error === "timeout" ? "testTimeout" : body.error === "no-key" ? "testNoKey" : "testFailed", params) });
    } catch {
      setResult({ state: "error", text: t("testFailed", { reason: "network" }) });
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rw-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rw-inline", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", disabled: dirty || result?.state === "ongoing", onClick: () => void run(), children: t("test") }),
      result && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "rw-status", role: "status", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.StateDot, { state: result.state }),
        result.text
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "rw-hint", children: t(dirty ? "testSaveFirst" : "testHint") })
  ] });
}
var css = `
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
var inject = ["slots", "locale", "configForms", "remote", "remote.credentials", "remote.session"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }));
  ctx.effect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const page = createPage(ctx);
  ctx.effect(() => page.dispose);
  ctx.effect(() => ctx.remote.$on("credentials/reference-updated", () => void page.readKeys()));
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: "dsh-run-watchdog",
    locale: NS
  }, ({ t }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WatchdogPage, { t, page })));
}
return module.exports;}});
