import { Icon } from './Icon.tsx';
import { iconButton } from './styles.ts';

/** A one-line message above the page, for errors the user should see. */
export function Banner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center gap-3 mx-10 mt-0 mb-4 py-2 pr-2 pl-4 border border-[color-mix(in_srgb,var(--rust)_40%,var(--rule))] rounded-lg bg-[color-mix(in_srgb,var(--rust)_12%,var(--paper))]"
      role="alert"
    >
      <p className="flex-1 m-0 text-[color-mix(in_srgb,var(--rust),var(--ink)_40%)]">{message}</p>
      <button type="button" className={iconButton} aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
}
