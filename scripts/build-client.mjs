import { build } from 'esbuild';
await build({
  entryPoints: ['src/client.tsx'], outfile: 'dist/client.js', bundle: true, format: 'cjs',
  platform: 'browser', jsx: 'automatic', external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-run-watchdog",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
});
