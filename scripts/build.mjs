// Bundles the React UI into dist/ with esbuild. Tauri loads dist/ in release builds.
// `node scripts/build.mjs` builds once; `--serve` watches and serves on the devUrl in tauri.conf.json.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const serve = process.argv.includes('--serve');
const production = process.env.NODE_ENV === 'production' || !serve;

const options = {
  entryPoints: ['ui/src/main.tsx'],
  outfile: 'dist/renderer.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  // WKWebView on macOS 13 and later.
  target: 'safari16',
  jsx: 'automatic',
  sourcemap: !production,
  minify: production,
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
  logLevel: 'info',
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('ui/index.html', 'dist/index.html');

if (serve) {
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: 'dist', host: 'localhost', port: 1420 });
} else {
  await esbuild.build(options);
}
