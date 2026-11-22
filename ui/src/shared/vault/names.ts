import type { TreeEntry } from '../ipc/index.ts';

/** The title shown for a note: its file name without the folder or `.md`. */
export function noteTitle(path: string): string {
  const fileName = path.split('/').at(-1) ?? path;
  return fileName.replace(/\.md$/i, '');
}

/** The folder that holds `path`, or null at the vault root. */
export function parentFolder(path: string): string | null {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? null : path.slice(0, slash);
}

/** Every folder in the tree, in tree order, for pickers such as "Move to". */
export function folderPaths(entries: readonly TreeEntry[]): string[] {
  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      folders.push(entry.path);
      folders.push(...folderPaths(entry.children));
    }
  }
  return folders;
}

/** True when a note or folder at `path` is somewhere in the tree. */
export function treeHasPath(entries: readonly TreeEntry[], path: string): boolean {
  return entries.some((entry) => entry.path === path || treeHasPath(entry.children, path));
}
