// Bundles the main process, the preload script and the renderer with esbuild.
// `node scripts/build.mjs` builds once; scripts/dev.mjs imports `createContexts` to watch.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const production = process.env.NODE_ENV === 'production';

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @param {(name: string) => void} [onRebuild] */
function targets(onRebuild) {
  /** @param {string} name */
  const notify = (name) => ({
    name: 'notify',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) onRebuild?.(name);
      });
    },
  });

  return [
    {
      ...common,
      entryPoints: ['packages/app/src/main.ts'],
      outfile: 'dist/main.cjs',
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      external: ['electron'],
      plugins: [notify('main')],
    },
    {
      ...common,
      entryPoints: ['packages/app/src/preload.ts'],
      outfile: 'dist/preload.cjs',
      // Sandboxed preload scripts must be CommonJS and may only require 'electron'.
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      external: ['electron'],
      plugins: [notify('preload')],
    },
    {
      ...common,
      entryPoints: ['packages/ui/src/main.tsx'],
      outfile: 'dist/renderer/renderer.js',
      platform: 'browser',
      format: 'iife',
      target: 'chrome140',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
      plugins: [notify('renderer')],
    },
  ];
}

async function prepareDist() {
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist/renderer', { recursive: true });
  await copyFile('packages/ui/src/index.html', 'dist/renderer/index.html');
}

/** @param {(name: string) => void} onRebuild */
export async function createContexts(onRebuild) {
  await prepareDist();
  return Promise.all(targets(onRebuild).map((options) => esbuild.context(options)));
}

async function buildOnce() {
  await prepareDist();
  await Promise.all(targets().map((options) => esbuild.build(options)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await buildOnce();
}
