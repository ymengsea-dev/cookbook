/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VaultSettings } from '../../../src/shared/ipc/index.ts';
import { lookVariables, paletteFor, resolveScheme, withAccent, type ThemeChoice } from '../../../src/shared/appearance/look.ts';
import { DEFAULT_THEME } from '../../../src/shared/appearance/themes.ts';

const DEFAULTS: VaultSettings = {
  editor: { autosaveMs: 800, lineNumbers: false },
  appearance: { theme: 'system', colors: 'paper', accent: null, density: 'comfortable' },
  fonts: { family: null, size: 15, lineHeight: 1.5 },
  layout: { contentWidth: 1040, sidebarSide: 'left', sidebarWidth: 232, showSidebar: true, showStatusBar: true },
};

const NIGHT: ThemeChoice = { id: 'night', name: 'Night', light: {}, dark: { paper: '#101418' }, builtIn: false };

test('light, dark or follow macOS (U-1)', () => {
  assert.equal(resolveScheme('system', true), 'dark');
  assert.equal(resolveScheme('system', false), 'light');
  assert.equal(resolveScheme('light', true), 'light');
});

test('a theme file sets only what it names; the rest stays Paper (U-4)', () => {
  const dark = paletteFor(NIGHT, 'dark');
  assert.equal(dark.paper, '#101418');
  assert.equal(dark.ink, DEFAULT_THEME.dark.ink);
  assert.deepEqual(paletteFor(undefined, 'light'), DEFAULT_THEME.light);
});

test('a custom accent gets text that reads on it', () => {
  assert.equal(withAccent(DEFAULT_THEME.light, '#f0e060').onAccent, DEFAULT_THEME.light.ink);
  assert.equal(withAccent(DEFAULT_THEME.light, '#203040').onAccent, DEFAULT_THEME.light.onAccent);
});

test('settings become CSS variables', () => {
  const settings: VaultSettings = {
    ...DEFAULTS,
    appearance: { ...DEFAULTS.appearance, theme: 'dark', density: 'compact' },
    fonts: { family: 'Iowan Old Style', size: 18, lineHeight: 1.7 },
    layout: { ...DEFAULTS.layout, sidebarWidth: 300, contentWidth: 720 },
  };

  const variables = lookVariables(settings, NIGHT, 'dark');

  assert.equal(variables['color-scheme'], 'dark');
  assert.equal(variables['--paper'], '#101418');
  assert.match(variables['--font'] ?? '', /^"Iowan Old Style", system-ui/);
  assert.equal(variables['--editor-text-size'], '18px');
  assert.equal(variables['--editor-line-height'], '1.7');
  assert.equal(variables['--sidebar-width'], '300px');
  assert.equal(variables['--content-width'], '720px');
  assert.equal(variables['--control-height'], '24px');
  assert.match(lookVariables(DEFAULTS, undefined, 'light')['--font'] ?? '', /^system-ui/);
});
