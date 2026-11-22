import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';

/** Languages for fenced code blocks, picked by the label after the opening fence (E-2). */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'javascript', 'node', 'mjs', 'cjs', 'jsx'], support: javascript({ jsx: true }) }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'typescript', 'tsx'], support: javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'Python', alias: ['py', 'python', 'python3'], support: python() }),
  LanguageDescription.of({ name: 'JSON', alias: ['json'], support: json() }),
  LanguageDescription.of({ name: 'CSS', alias: ['css'], support: css() }),
  LanguageDescription.of({ name: 'HTML', alias: ['html', 'xml'], support: html() }),
  LanguageDescription.of({ name: 'Rust', alias: ['rs', 'rust'], support: rust() }),
  LanguageDescription.of({ name: 'Shell', alias: ['sh', 'bash', 'zsh', 'shell'], support: new LanguageSupport(StreamLanguage.define(shell)) }),
];
