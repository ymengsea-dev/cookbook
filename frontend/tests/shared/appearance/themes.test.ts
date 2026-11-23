/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contrastProblems, contrastRatio } from '../../../src/shared/appearance/contrast.ts';
import { BUILT_IN_THEMES, COLOR_VARIABLES, DEFAULT_THEME } from '../../../src/shared/appearance/themes.ts';

test('every built-in theme passes WCAG AA in light and dark (U-6)', () => {
  for (const theme of BUILT_IN_THEMES) {
    assert.deepEqual(contrastProblems(theme.light), [], `${theme.name} light`);
    assert.deepEqual(contrastProblems(theme.dark), [], `${theme.name} dark`);
  }
});

test('the contrast ratio matches the WCAG formula', () => {
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrastRatio('#777777', '#ffffff').toFixed(2), '4.48');
});

/** The `--name: #hex;` values in one CSS block. */
function cssColors(block: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) colors[name] = value;
  }
  return colors;
}

test('app.css starts with the Paper theme, so the first frame matches the settings', () => {
  const css = readFileSync(new URL('../../../src/app.css', import.meta.url), 'utf8');
  const light = cssColors(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
  const dark = cssColors(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('@theme')));
  for (const [key, variable] of Object.entries(COLOR_VARIABLES)) {
    const name = key as keyof typeof COLOR_VARIABLES;
    assert.equal(light[variable], DEFAULT_THEME.light[name], `light ${variable}`);
    assert.equal(dark[variable], DEFAULT_THEME.dark[name], `dark ${variable}`);
  }
});
