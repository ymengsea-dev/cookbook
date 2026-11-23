import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from './pdf.ts';

interface PdfPageProps {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly scale: number;
}

/** One page drawn on a canvas, sharp on Retina screens. Drawing stops if it scrolls away. */
export function PdfPage({ doc, pageNumber, scale }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const drawing: { task: RenderTask | null } = { task: null };
    void doc.getPage(pageNumber).then((page) => {
      const element = canvas.current;
      if (cancelled || element === null) return;
      const ratio = window.devicePixelRatio;
      const viewport = page.getViewport({ scale: scale * ratio });
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      setSize({ width: viewport.width / ratio, height: viewport.height / ratio });
      drawing.task = page.render({ canvas: element, viewport });
      // A cancelled render rejects; that is expected when the page scrolls away.
      drawing.task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      drawing.task?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <canvas
      ref={canvas}
      className="block max-w-full max-h-full mx-auto bg-surface shadow-[0_1px_0_var(--rule)]"
      // Sizes come from the PDF, so they can't be tokens.
      style={size === null ? undefined : { width: size.width, height: size.height }}
      aria-label={`Page ${String(pageNumber)}`}
    />
  );
}
