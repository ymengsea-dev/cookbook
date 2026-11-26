import type { ReactNode } from 'react';
import { styles } from '../../shared/ui/index.ts';

export const groupHeading = 'mt-8 mx-0 mb-3 text-lg font-regular';
export const select = 'py-1 px-2 border border-rule rounded-sm bg-surface text-ink [font:inherit]';
export const checkbox = 'size-4 accent-accent';
export const slider = 'w-40 accent-accent';
export const valueLabel = 'min-w-(--space-14) text-right text-ink-secondary text-sm tabular-nums';

export function SettingRow({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
  return (
    <label className={styles.rowsRow}>
      <span className={styles.rowsMain}>
        <span className={styles.rowsName}>{label}</span>
        <span className={`${styles.rowsDetail} ${styles.selectable}`}>{detail}</span>
      </span>
      {children}
    </label>
  );
}

/** A group's heading with its "Reset to Default" button (U-5). */
export function GroupHeading({ title, canReset, onReset }: { title: string; canReset: boolean; onReset: () => void }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className={groupHeading}>{title}</h2>
      <button type="button" className={styles.quietButton} disabled={!canReset} onClick={onReset}>
        Reset to Default
      </button>
    </div>
  );
}

interface SliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled: boolean;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}

export function Slider({ value, min, max, step, disabled, format, onChange }: SliderProps) {
  return (
    <span className="flex items-center gap-3">
      <input
        type="range"
        className={slider}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => { onChange(Number(event.target.value)); }}
      />
      <span className={valueLabel}>{format(value)}</span>
    </span>
  );
}
