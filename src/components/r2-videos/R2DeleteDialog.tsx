import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';
import { R2Video } from './types';

interface R2DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoToDelete: R2Video | null;
  onConfirm: () => void;
  isDeleting: boolean;
}

export default function R2DeleteDialog({
  open,
  onOpenChange,
  videoToDelete,
  onConfirm,
  isDeleting,
}: R2DeleteDialogProps) {
  if (!videoToDelete) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base text-black dark:text-white">Delete Video</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Are you sure you want to delete <span className="font-semibold text-black dark:text-white">&ldquo;{videoToDelete.title}&rdquo;</span> (ID: #{videoToDelete.id})? This will permanently delete the row from Supabase <code>all_videos_db</code> table.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
