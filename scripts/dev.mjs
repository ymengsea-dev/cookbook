// Watches all three bundles and restarts Electron after every successful rebuild.
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createContexts } from './build.mjs';

/** @type {import('node:child_process').ChildProcess | undefined} */
let child;
let restartTimer;
let stopping = false;

// Tools built on Electron (such as VS Code extensions) export ELECTRON_RUN_AS_NODE=1,
// which would start Electron as plain Node.js instead of as the app.
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;

function startElectron() {
  child = spawn(String(electronPath), ['.'], { stdio: 'inherit', env: electronEnv });
  child.on('exit', (code, signal) => {
    // A restart kills the old process with SIGTERM; any other exit ends the dev session.
    if (signal !== 'SIGTERM' && !stopping) {
      stopping = true;
      process.exit(code ?? 0);
    }
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    startElectron();
  }, 150);
}

const contexts = await createContexts(scheduleRestart);
await Promise.all(contexts.map((context) => context.watch()));

process.on('SIGINT', () => {
  stopping = true;
  child?.kill('SIGTERM');
  void Promise.all(contexts.map((context) => context.dispose())).then(() => process.exit(0));
});
