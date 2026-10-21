import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/src/components/ui/dialog';
import { R2Video } from './types';

interface R2RenameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoToRename: R2Video | null;
  newTitleInput: string;
  setNewTitleInput: (val: string) => void;
  onSave: () => void;
}

export default function R2RenameModal({
  open,
  onOpenChange,
  videoToRename,
  newTitleInput,
  setNewTitleInput,
  onSave,
}: R2RenameModalProps) {
  if (!videoToRename) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base text-black dark:text-white">Rename Video Title</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="text-xs text-zinc-500">
            Video Title for ID #{videoToRename.id} ({videoToRename.slug})
          </label>
          <input
            type="text"
            value={newTitleInput}
            onChange={(e) => setNewTitleInput(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            placeholder="Enter new video title..."
            autoFocus
          />
        </div>

        <DialogFooter className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!newTitleInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            Update Title
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
