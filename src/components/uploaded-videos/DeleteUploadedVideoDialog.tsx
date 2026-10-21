import React from 'react';
import { RotateCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';
import { TelegramUploadedVideo } from './types';

interface DeleteUploadedVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoToDelete: TelegramUploadedVideo | null;
  onConfirm: () => void;
  isDeleting: boolean;
}

export default function DeleteUploadedVideoDialog({
  open,
  onOpenChange,
  videoToDelete,
  onConfirm,
  isDeleting,
}: DeleteUploadedVideoDialogProps) {
  if (!videoToDelete) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-base text-black dark:text-white">Delete Video</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Are you sure you want to delete <span className="font-semibold text-black dark:text-white">&ldquo;{videoToDelete.title}&rdquo;</span>? This will permanently remove the record from MongoDB.
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
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isDeleting && <RotateCw className="h-3.5 w-3.5 animate-spin" />}
            <span>Delete Permanently</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
