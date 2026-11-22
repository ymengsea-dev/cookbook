/** A cell in the list table. Column 0 is the title. */
export interface CellPosition {
  readonly row: number;
  readonly column: number;
}

/** Where an arrow, Home or End key moves the active cell (L-7). `null` for other keys. */
export function moveCell(position: CellPosition, key: string, rowCount: number, columnCount: number): CellPosition | null {
  const lastRow = Math.max(rowCount - 1, 0);
  const lastColumn = Math.max(columnCount - 1, 0);
  switch (key) {
    case 'ArrowDown':
      return { ...position, row: Math.min(position.row + 1, lastRow) };
    case 'ArrowUp':
      return { ...position, row: Math.max(position.row - 1, 0) };
    case 'ArrowRight':
      return { ...position, column: Math.min(position.column + 1, lastColumn) };
    case 'ArrowLeft':
      return { ...position, column: Math.max(position.column - 1, 0) };
    case 'Home':
      return { ...position, column: 0 };
    case 'End':
      return { ...position, column: lastColumn };
    default:
      return null;
  }
}
