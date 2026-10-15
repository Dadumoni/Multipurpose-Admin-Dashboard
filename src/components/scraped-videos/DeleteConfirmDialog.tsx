import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoToDelete: string | number | null;
  selectedCount: number;
  activeTable: string;
  isDeleting: boolean;
  onConfirm: () => void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  videoToDelete,
  selectedCount,
  activeTable,
  isDeleting,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-white dark:bg-black text-black dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-black dark:text-white">Are you sure?</DialogTitle>
          <DialogDescription className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            {videoToDelete ? (
              <>
                This will permanently delete post #{videoToDelete} from <code>public.{activeTable}</code>.
              </>
            ) : (
              <>
                This will permanently delete {selectedCount} selected posts from <code>public.{activeTable}</code>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow-sm cursor-pointer"
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
