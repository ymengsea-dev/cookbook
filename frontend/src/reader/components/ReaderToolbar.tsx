import { useState } from 'react';
import { classNames, styles } from '../../shared/ui/index.ts';
import { clampPage, percentRead, zoomIn, zoomOut, type Layout, type Zoom } from '../logic/readerLayout.ts';

export type SidePanel = 'none' | 'contents' | 'pages';

interface ReaderToolbarProps {
  readonly title: string;
  readonly page: number;
  readonly pageCount: number;
  readonly scale: number;
  readonly zoom: Zoom;
  readonly layout: Layout;
  readonly panel: SidePanel;
  readonly onClose: () => void;
  readonly onGoTo: (page: number) => void;
  readonly onZoom: (zoom: Zoom) => void;
  readonly onLayout: (layout: Layout) => void;
  readonly onPanel: (panel: SidePanel) => void;
}

const toolButton = classNames(styles.quietButton, 'px-2');

/** The reader's controls: back, contents, pages, go to page, layout and zoom (R-3, R-5). */
export function ReaderToolbar(props: ReaderToolbarProps) {
  const { title, page, pageCount, scale, zoom, layout, panel } = props;

  function togglePanel(wanted: SidePanel) {
    props.onPanel(panel === wanted ? 'none' : wanted);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 px-4 border-b border-rule">
      <button type="button" className={toolButton} onClick={props.onClose}>
        ‹ Books
      </button>
      <h1 className="flex-1 min-w-0 m-0 truncate text-base font-medium">{title}</h1>

      <Toggle pressed={panel === 'contents'} onClick={() => { togglePanel('contents'); }}>
        Contents
      </Toggle>
      <Toggle pressed={panel === 'pages'} onClick={() => { togglePanel('pages'); }}>
        Pages
      </Toggle>
      <span className="w-px h-(--control-height) bg-rule" aria-hidden="true" />

      <PageInput key={page} page={page} pageCount={pageCount} onGoTo={props.onGoTo} />
      <span className="text-ink-secondary text-sm tabular-nums">
        of {pageCount} · {percentRead(page, pageCount)}%
      </span>
      <span className="w-px h-(--control-height) bg-rule" aria-hidden="true" />

      <Toggle pressed={layout === 'scroll'} onClick={() => { props.onLayout('scroll'); }}>
        Scroll
      </Toggle>
      <Toggle pressed={layout === 'single'} onClick={() => { props.onLayout('single'); }}>
        Single Page
      </Toggle>
      <span className="w-px h-(--control-height) bg-rule" aria-hidden="true" />

      <Toggle pressed={zoom.kind === 'fitWidth'} onClick={() => { props.onZoom({ kind: 'fitWidth' }); }}>
        Fit Width
      </Toggle>
      <Toggle pressed={zoom.kind === 'fitPage'} onClick={() => { props.onZoom({ kind: 'fitPage' }); }}>
        Fit Page
      </Toggle>
      <button type="button" className={styles.iconButton} aria-label="Zoom out" onClick={() => { props.onZoom(zoomOut(scale)); }}>
        −
      </button>
      <span className="min-w-(--space-10) text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
      <button type="button" className={styles.iconButton} aria-label="Zoom in" onClick={() => { props.onZoom(zoomIn(scale)); }}>
        +
      </button>
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      className={classNames(toolButton, pressed ? 'bg-selected text-ink' : 'text-ink-secondary')}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Type a page number and press Return to jump there (R-5). */
function PageInput({ page, pageCount, onGoTo }: { page: number; pageCount: number; onGoTo: (page: number) => void }) {
  const [text, setText] = useState(String(page));
  return (
    <input
      className="w-(--space-14) h-(--control-height) px-2 border border-rule rounded-sm bg-surface text-right text-sm tabular-nums"
      inputMode="numeric"
      aria-label="Page"
      value={text}
      onChange={(event) => { setText(event.target.value); }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        onGoTo(clampPage(Number(text), pageCount));
      }}
      onBlur={() => { setText(String(page)); }}
    />
  );
}
