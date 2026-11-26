import { useEffect, useRef } from 'react';
import { onBeforeQuit } from '../../shared/lifecycle.ts';
import { saveReadingPosition } from '../api/readerApi.ts';
import type { ReadingSpot } from '../logic/readerLayout.ts';

/** A page change is saved this long after reading settles, so quitting loses only seconds (R-4). */
const SAVE_DELAY_MS = 1500;

/** Saves where reading stopped: after a pause, when the book closes and before quitting. */
export function useReadingPosition(bookId: string, spot: ReadingSpot | null) {
  const latest = useRef(spot);
  const lastSaved = useRef<string | null>(null);

  const save = useRef(async () => {
    const current = latest.current;
    if (current === null) return;
    const fingerprint = `${String(current.page)}:${String(current.position)}`;
    if (fingerprint === lastSaved.current) return;
    lastSaved.current = fingerprint;
    await saveReadingPosition(bookId, current).catch(() => {
      // Try again with the next change; reading goes on either way.
      lastSaved.current = null;
    });
  });

  useEffect(() => {
    latest.current = spot;
    const timer = setTimeout(() => {
      void save.current();
    }, SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [spot]);

  useEffect(() => {
    const saveNow = save.current;
    const stopWaiting = onBeforeQuit(saveNow);
    return () => {
      stopWaiting();
      void saveNow();
    };
  }, []);
}
