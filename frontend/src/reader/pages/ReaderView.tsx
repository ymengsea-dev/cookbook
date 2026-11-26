import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../../shared/ipc/index.ts';
import { EmptyState } from '../../shared/ui/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { Contents } from '../components/Contents.tsx';
import { PageStack } from '../components/PageStack.tsx';
import { closePdf, openPdf, type PDFDocumentProxy } from '../pdf/pdf.ts';
import { clampPage, type Layout, type PageSize, type ReadingSpot, type Zoom } from '../logic/readerLayout.ts';
import { ReaderToolbar, type SidePanel } from '../components/ReaderToolbar.tsx';
import { Thumbnails } from '../components/Thumbnails.tsx';
import { useReadingPosition } from '../hooks/useReadingPosition.ts';

interface OpenBook {
  readonly doc: PDFDocumentProxy;
  readonly pageSize: PageSize;
}

interface ReaderViewProps {
  readonly book: Book;
  readonly onClose: () => void;
}

/** A calm reading screen that opens where you stopped (R-3 to R-5). Remount it for another book. */
export function ReaderView({ book, onClose }: ReaderViewProps) {
  const { showError } = useVault();
  const [open, setOpen] = useState<OpenBook | null>(null);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState<Layout>('scroll');
  const [zoom, setZoom] = useState<Zoom>({ kind: 'fitWidth' });
  const [scale, setScale] = useState(1);
  const [panel, setPanel] = useState<SidePanel>('none');
  const [spot, setSpot] = useState<ReadingSpot>({ page: book.page, position: book.position });
  const [jumpId, setJumpId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    const opening = openPdf(book.path).then(async (doc) => {
      loaded = doc;
      const first = await doc.getPage(1);
      const { width, height } = first.getViewport({ scale: 1 });
      if (cancelled) return;
      // Older saves may point past the end if the file was replaced.
      setSpot((current) => ({ page: clampPage(current.page, doc.numPages), position: current.position }));
      setOpen({ doc, pageSize: { width, height } });
    });
    opening.catch((cause: unknown) => {
      if (cancelled) return;
      setFailed(true);
      showError(cause);
    });
    return () => {
      cancelled = true;
      void opening.finally(() => {
        if (loaded !== null) closePdf(loaded);
      });
    };
  }, [book.path, showError]);

  useReadingPosition(book.id, open === null ? null : spot);

  const goTo = useCallback((page: number) => {
    setSpot({ page, position: 0 });
    setJumpId((id) => id + 1);
  }, []);

  if (failed) {
    return (
      <EmptyState title="This book can't be opened">
        The file may be damaged or not a PDF. Other apps may still open it.
      </EmptyState>
    );
  }

  const pageCount = open?.doc.numPages ?? book.pages ?? 1;
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <ReaderToolbar
        title={book.title}
        page={spot.page}
        pageCount={pageCount}
        scale={scale}
        zoom={zoom}
        layout={layout}
        panel={panel}
        onClose={onClose}
        onGoTo={goTo}
        onZoom={setZoom}
        onLayout={setLayout}
        onPanel={setPanel}
      />
      <div className="flex flex-1 min-h-0">
        {open !== null && panel !== 'none' && (
          <aside className="flex-none w-(--reader-panel-width) min-h-0 overflow-y-auto border-r border-rule bg-sidebar">
            {panel === 'contents' && <Contents doc={open.doc} onPick={goTo} />}
            {panel === 'pages' && (
              <Thumbnails doc={open.doc} pageCount={pageCount} pageSize={open.pageSize} current={spot.page} onPick={goTo} />
            )}
          </aside>
        )}
        {open !== null && (
          <PageStack
            doc={open.doc}
            pageCount={pageCount}
            pageSize={open.pageSize}
            layout={layout}
            zoom={zoom}
            spot={spot}
            jumpId={jumpId}
            onSpotChange={setSpot}
            onScaleChange={setScale}
          />
        )}
      </div>
    </div>
  );
}
