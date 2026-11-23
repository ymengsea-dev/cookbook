import { useState } from 'react';
import type { FontSettings, LayoutSettings } from '../shared/ipc/index.ts';
import { styles } from '../shared/ui/index.ts';
import { GroupHeading, SettingRow, Slider, checkbox, select } from './SettingRow.tsx';
import { isFontName, sameValues } from './settingsValues.ts';

const pixels = (value: number) => `${String(value)} px`;

interface GroupProps<T> {
  readonly value: T;
  readonly defaults: T;
  readonly locked: boolean;
  readonly onChange: (value: T) => void;
}

/** One font, its size and line height, and how wide a note gets (U-2). */
export function TextSettings({ value, defaults, locked, onChange }: GroupProps<FontSettings>) {
  return (
    <>
      <GroupHeading title="Text" canReset={!locked && !sameValues(value, defaults)} onReset={() => { onChange(defaults); }} />
      <div className={styles.rows}>
        <SettingRow label="Font" detail="One font for the whole app. Leave empty for the system font.">
          <FontField key={value.family ?? ''} family={value.family} locked={locked} onChange={(family) => { onChange({ ...value, family }); }} />
        </SettingRow>
        <SettingRow label="Text size" detail="The size of note text.">
          <Slider value={value.size} min={12} max={24} step={1} disabled={locked} format={pixels} onChange={(size) => { onChange({ ...value, size }); }} />
        </SettingRow>
        <SettingRow label="Line height" detail="Space between lines of a note.">
          <Slider value={value.lineHeight} min={1.2} max={2} step={0.1} disabled={locked} format={(height) => height.toFixed(1)} onChange={(lineHeight) => { onChange({ ...value, lineHeight }); }} />
        </SettingRow>
      </div>
    </>
  );
}

/** Saves the font once it is a name the app accepts, so typing never shows an error. */
function FontField({ family, locked, onChange }: { family: string | null; locked: boolean; onChange: (family: string | null) => void }) {
  const [text, setText] = useState(family ?? '');
  const valid = text.trim() === '' || isFontName(text);
  return (
    <span className="flex flex-col items-end gap-1">
      <input
        className="w-40 h-(--control-height) px-2 border border-rule rounded-sm bg-surface"
        placeholder="System font"
        disabled={locked}
        value={text}
        aria-invalid={!valid}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === '') onChange(null);
          else if (isFontName(next)) onChange(next.trim());
        }}
      />
      {!valid && <span className="text-ink-secondary text-xs">Use letters, digits, spaces and hyphens.</span>}
    </span>
  );
}

/** Content width, the sidebar's side, width and parts, and the status bar (U-2, U-3). */
export function LayoutGroup({ value, defaults, locked, onChange }: GroupProps<LayoutSettings>) {
  return (
    <>
      <GroupHeading title="Layout" canReset={!locked && !sameValues(value, defaults)} onReset={() => { onChange(defaults); }} />
      <div className={styles.rows}>
        <SettingRow label="Content width" detail="The widest a note gets.">
          <Slider value={value.contentWidth} min={560} max={1400} step={20} disabled={locked} format={pixels} onChange={(contentWidth) => { onChange({ ...value, contentWidth }); }} />
        </SettingRow>
        <SettingRow label="Sidebar side" detail="Which side of the window the sidebar sits on.">
          <select className={select} disabled={locked} value={value.sidebarSide} onChange={(event) => { onChange({ ...value, sidebarSide: event.target.value === 'right' ? 'right' : 'left' }); }}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </SettingRow>
        <SettingRow label="Sidebar width" detail="How wide the sidebar is.">
          <Slider value={value.sidebarWidth} min={180} max={400} step={4} disabled={locked} format={pixels} onChange={(sidebarWidth) => { onChange({ ...value, sidebarWidth }); }} />
        </SettingRow>
        <SettingRow label="Show sidebar" detail="Also ⌘\ from anywhere.">
          <input type="checkbox" className={checkbox} disabled={locked} checked={value.showSidebar} onChange={(event) => { onChange({ ...value, showSidebar: event.target.checked }); }} />
        </SettingRow>
        <SettingRow label="Show status bar" detail="Index progress and sync state at the foot of the sidebar.">
          <input type="checkbox" className={checkbox} disabled={locked} checked={value.showStatusBar} onChange={(event) => { onChange({ ...value, showStatusBar: event.target.checked }); }} />
        </SettingRow>
      </div>
    </>
  );
}
