/**
 * Key bindings use the settings-file format from S-7, for example `Mod-p` or `Mod-Shift-n`.
 * `Mod` is Command on macOS.
 */
interface ParsedShortcut {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

export interface KeyPress {
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
}

function parse(shortcut: string): ParsedShortcut {
  const parts = shortcut.split('-');
  const key = parts.at(-1) ?? '';
  const modifiers = new Set(parts.slice(0, -1));
  return {
    key: key.toLowerCase(),
    mod: modifiers.has('Mod'),
    shift: modifiers.has('Shift'),
    alt: modifiers.has('Alt'),
    ctrl: modifiers.has('Ctrl'),
  };
}

export function matchesShortcut(event: KeyPress, shortcut: string): boolean {
  const wanted = parse(shortcut);
  return (
    event.key.toLowerCase() === wanted.key &&
    event.metaKey === wanted.mod &&
    event.shiftKey === wanted.shift &&
    event.altKey === wanted.alt &&
    event.ctrlKey === wanted.ctrl
  );
}

// Keys that edit text when held with ⌘ or ⌥, such as ⌘⌫ (delete to line start).
const TEXT_EDITING_KEYS = new Set(['backspace', 'delete', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);

/** True when a shortcut would steal a text-editing key from a focused text field. */
export function isTextEditingKey(key: string): boolean {
  return TEXT_EDITING_KEYS.has(key.toLowerCase());
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ',': ',',
  '\\': '\\',
  enter: '↩',
  escape: '⎋',
  backspace: '⌫',
};

/** Formats a binding the way macOS menus show it, for example `⌘P`. */
export function formatShortcut(shortcut: string): string {
  const parsed = parse(shortcut);
  const key = KEY_LABELS[parsed.key] ?? parsed.key.toUpperCase();
  return `${parsed.ctrl ? '⌃' : ''}${parsed.alt ? '⌥' : ''}${parsed.shift ? '⇧' : ''}${parsed.mod ? '⌘' : ''}${key}`;
}
