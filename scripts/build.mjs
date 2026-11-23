// Bundles the React UI into dist/: esbuild for the scripts, the Tailwind CLI for the styles.
// Tauri loads dist/ in release builds.
// `node scripts/build.mjs` builds once; `--serve` watches and serves on the devUrl in tauri.conf.json.
import { spawn } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const serve = process.argv.includes('--serve');
const production = process.env.NODE_ENV === 'production' || !serve;

const options = {
  entryPoints: ['frontend/src/main.tsx'],
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

/** Runs the Tailwind CLI. With `watch` it keeps running and rebuilds when a source file changes. */
function buildStyles({ watch }) {
  const args = ['-i', 'frontend/src/app.css', '-o', 'dist/renderer.css'];
  if (watch) {
    args.push('--watch');
  }
  if (production) {
    args.push('--minify');
  }
  const tailwind = spawn('node_modules/.bin/tailwindcss', args, { stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    tailwind.on('error', reject);
    tailwind.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tailwindcss exited with code ${code}`));
      }
    });
  });
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('frontend/index.html', 'dist/index.html');

if (serve) {
  buildStyles({ watch: true }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
  const context = await esbuild.context(options);
  await context.watch();
  await context.serve({ servedir: 'dist', host: 'localhost', port: 1420 });
} else {
  await Promise.all([esbuild.build(options), buildStyles({ watch: false })]);
}
