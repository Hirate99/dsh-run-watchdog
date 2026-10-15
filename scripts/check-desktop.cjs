// Run with the installed Desktop executable in ELECTRON_RUN_AS_NODE mode.
// Only reads the installation; builds the test bundle inside this repository.
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { build } = require('esbuild');
const runtime = createRequire(join(process.resourcesPath, 'app.asar/dsh/package.json'));
const outfile = resolve('.integration/desktop-plugin-test.mjs');
build({
  entryPoints: ['test/plugin.test.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'installed-desktop', setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\// }, args => ({
      path: pathToFileURL(runtime.resolve(args.path)).href, external: true,
    }));
  } }],
}).then(() => console.log('Built .integration/desktop-plugin-test.mjs; run it with Desktop --test.')).catch(error => {
  console.error(error.message); process.exitCode = 1;
});
