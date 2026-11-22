import { Icon } from './Icon.tsx';
import './controls.css';

/** A one-line message above the page, for errors the user should see. */
export function Banner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="banner" role="alert">
      <p className="banner__text">{message}</p>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
}
