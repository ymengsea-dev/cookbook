// Keeps build.rs and the capability file in step with the commands registered in main.rs.
// Run after adding a command: `pnpm sync:commands`.
import { readFile, writeFile } from 'node:fs/promises';

const MAIN = 'backend/app/src/main.rs';
const BUILD = 'backend/app/build.rs';
const CAPABILITY = 'backend/app/capabilities/default.json';
// Permissions that are not app commands: window dragging and listening to Rust events.
const EXTRA_PERMISSIONS = [
  'core:window:allow-start-dragging',
  'core:window:allow-internal-toggle-maximize',
  'core:event:allow-listen',
  'core:event:allow-unlisten',
];

const main = await readFile(MAIN, 'utf8');
const handlerBlock = main.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? '';
// Handlers look like `commands::notes::note_read` or `lifecycle::app_quit`; keep the last part.
const commands = [...handlerBlock.matchAll(/(?:\w+::)+(\w+)/g)].map((match) => match[1]);
if (commands.length === 0) throw new Error(`No commands found in ${MAIN}`);

const build = await readFile(BUILD, 'utf8');
const commandList = commands.map((name) => `        "${name}",`).join('\n');
await writeFile(BUILD, build.replace(/commands\(&\[[\s\S]*?\]\)/, `commands(&[\n${commandList}\n    ])`));

const capability = JSON.parse(await readFile(CAPABILITY, 'utf8'));
capability.permissions = [...commands.map((name) => `allow-${name.replaceAll('_', '-')}`), ...EXTRA_PERMISSIONS];
await writeFile(CAPABILITY, `${JSON.stringify(capability, null, 2)}\n`);

console.log(`Synced ${commands.length} commands: ${commands.join(', ')}`);
