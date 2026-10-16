import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { isValidElement } from 'react';

test('published client exposes configuration on its npm bundle page', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const require = createRequire(import.meta.url);
  const entries = new Map<string, (props: unknown) => unknown>();
  const effects: (() => void)[] = [];
  const scopes: string[] = [];

  // Only the host's form service and browser lifecycle are substituted.
  // Execute the built module and use the package-name lookup performed by Desktop.
  class SettingsFormModel {
    bind() {
      return {};
    }
    actions() {
      return {};
    }
    dispose() {}
  }
  const context = {
    effect(setup: () => (() => void) | void) {
      const cleanup = setup();
      if (cleanup) effects.push(cleanup);
    },
    locale: { register() {} },
    configForms: {
      get(id: string) {
        scopes.push(id);
        return { getSnapshot: () => ({ value: {} }) };
      },
    },
    remote: {
      credentials: { describe: async () => ({ ok: false }) },
      $on() {},
    },
    slots: {
      inject(name: string, register: () => void) {
        assert.equal(name, 'plugins.bundle.config');
        register();
      },
      register(
        entry: { name: string; key: string },
        render: (props: unknown) => unknown,
      ) {
        entries.set(`${entry.name}:${entry.key}`, render);
      },
    },
  };
  const loader = {
    load(module: {
      id: string;
      factory: (resolve: (id: string) => unknown) => { apply: (ctx: unknown) => void };
    }) {
      assert.equal(module.id, manifest.name);
      const client = module.factory((id) =>
        id === '@deepseek-ai/dsh-client-ui-primitives'
          ? { SettingsFormModel, settingsTextField: (field: string) => ({ field }) }
          : require(id),
      );
      client.apply(context);
    },
  };
  try {
    runInNewContext(readFileSync('dist/client.js', 'utf8'), {
      window: {
        __ModuleLoader__: loader,
        addEventListener() {},
        removeEventListener() {},
      },
      document: {
        createElement: () => ({ textContent: '', remove() {} }),
        head: { append() {} },
      },
    });
    const render = entries.get(`plugins.bundle.config:${manifest.name}`);
    assert.ok(
      render,
      'Desktop must find the settings panel by the installed package name',
    );
    assert.ok(isValidElement(render({ t: (key: string) => key })));
    assert.deepEqual(scopes, ['run-watchdog']);
  } finally {
    for (const cleanup of effects.reverse()) cleanup();
  }
});
