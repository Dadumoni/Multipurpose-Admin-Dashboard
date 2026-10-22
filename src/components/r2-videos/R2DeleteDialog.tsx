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
import { Trash2 } from 'lucide-react';

interface R2DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoToDelete: R2Video | null;
  selectedCount?: number;
  onConfirm: () => void;
  isDeleting: boolean;
}

export default function R2DeleteDialog({
  open,
  onOpenChange,
  videoToDelete,
  selectedCount = 0,
  onConfirm,
  isDeleting,
}: R2DeleteDialogProps) {
  if (!videoToDelete && selectedCount === 0) return null;

  const isMultiple = selectedCount > 0 && !videoToDelete;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base text-black dark:text-white flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span>{isMultiple ? `Delete ${selectedCount} Videos` : 'Delete Video'}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed pt-1">
            {isMultiple ? (
              <>
                Are you sure you want to delete <span className="font-semibold text-black dark:text-white">{selectedCount} selected videos</span>?
                <br />
                This will permanently delete the rows from Supabase <code>all_videos_db</code> and also remove the corresponding files from <strong>ZeroStorage</strong> and <strong>Abyss</strong>.
              </>
            ) : (
              <>
                Are you sure you want to delete <span className="font-semibold text-black dark:text-white">&ldquo;{videoToDelete?.title}&rdquo;</span> (ID: #{videoToDelete?.id})?
                <br />
                This will permanently delete the row from Supabase <code>all_videos_db</code> and remove the file from <strong>ZeroStorage</strong> and <strong>Abyss</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5 transition-colors"
          >
            {isDeleting ? 'Deleting...' : isMultiple ? `Delete ${selectedCount} Videos` : 'Delete Permanently'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
