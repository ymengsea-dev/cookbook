import { WidgetType, type EditorView } from '@codemirror/view';

/** A round bullet in place of `-`, `*` or `+`. */
export class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'cm-lp-bullet';
    bullet.textContent = '•';
    return bullet;
  }
}

/** A checkbox in place of `[ ]` or `[x]`. Clicking it edits the text. */
export class CheckboxWidget extends WidgetType {
  readonly checked: boolean;
  /** Where the `[ ]` marker starts in the document. */
  readonly position: number;

  constructor(checked: boolean, position: number) {
    super();
    this.checked = checked;
    this.position = position;
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.position === this.position;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-checkbox';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Mark task as not done' : 'Mark task as done');
    box.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    box.addEventListener('click', (event) => {
      event.preventDefault();
      const marker = this.checked ? '[ ]' : '[x]';
      view.dispatch({ changes: { from: this.position, to: this.position + 3, insert: marker } });
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** An image from the vault, shown in place of its `![alt](path)` text. */
export class ImageWidget extends WidgetType {
  readonly url: string;
  readonly alt: string;

  constructor(url: string, alt: string) {
    super();
    this.url = url;
    this.alt = alt;
  }

  override eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const image = document.createElement('img');
    image.className = 'cm-lp-image';
    image.src = this.url;
    image.alt = this.alt;
    return image;
  }
}
