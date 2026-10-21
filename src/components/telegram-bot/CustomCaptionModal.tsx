import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

interface CustomCaptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editText: string;
  setEditText: (text: string) => void;
  onSave: () => void;
}

export default function CustomCaptionModal({
  open,
  onOpenChange,
  editText,
  setEditText,
  onSave,
}: CustomCaptionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Custom Caption Text</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            This text, emojis, or promotional link will automatically be appended at the end of every video post caption.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2 text-xs">
          <textarea
            rows={4}
            placeholder="e.g. Join our backup channel @mychannel for daily leaks! 🔥"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none"
          />
        </div>

        <DialogFooter className="pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-8 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Save Text
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
