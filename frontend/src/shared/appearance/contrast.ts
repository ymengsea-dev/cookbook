// WCAG 2.1 contrast (U-6). Text must reach 4.5:1 against what it sits on.

import type { Palette } from './themes.ts';

export const AA_TEXT = 4.5;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of `#rrggbb`, from 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Of `choices`, the text colour that reads best on `background`. */
export function bestTextOn(background: string, choices: readonly string[]): string {
  let best = choices[0] ?? '#000000';
  for (const choice of choices) {
    if (contrastRatio(choice, background) > contrastRatio(best, background)) best = choice;
  }
  return best;
}

/** The text and background pairs the app uses, named for messages. */
const PAIRS: readonly (readonly [keyof Palette, keyof Palette])[] = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink', 'sidebar'],
  ['inkSecondary', 'paper'],
  ['inkSecondary', 'surface'],
  ['inkSecondary', 'sidebar'],
  ['accent', 'paper'],
  ['onAccent', 'accent'],
];

/** Every pair below AA, such as `inkSecondary on sidebar: 4.1`. Empty when all pass. */
export function contrastProblems(palette: Palette): string[] {
  const problems: string[] = [];
  for (const [text, background] of PAIRS) {
    const ratio = contrastRatio(palette[text], palette[background]);
    if (ratio < AA_TEXT) problems.push(`${text} on ${background}: ${ratio.toFixed(2)}`);
  }
  return problems;
}
