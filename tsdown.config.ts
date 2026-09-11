/**
 * Client factory build: the browser half must be the loader's lazy-CJS
 * factory artifact (`window.__ModuleLoader__.load`), not the tsc ESM output
 * (a bare `import` in the served combo kills the whole page script).
 * tsc still owns `dist/` for the Node half; this only replaces
 * `dist/client/index.js` (+map) with the factory bundle.
 */
import type { UserConfig } from 'tsdown'

const ID = 'deep-tariff'

const PLATFORM = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
])

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist/client',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  deps: {
    neverBundle: (specifier: string) => PLATFORM.has(specifier),
    alwaysBundle: (specifier: string) => !PLATFORM.has(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'index.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [client]
