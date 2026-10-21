import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ChannelItem } from './types';

interface DeleteChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelToDelete: ChannelItem | null;
  onConfirm: () => void;
}

export default function DeleteChannelDialog({
  open,
  onOpenChange,
  channelToDelete,
  onConfirm,
}: DeleteChannelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-red-600 dark:text-red-400">Remove Channel</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Are you sure you want to remove <strong>{channelToDelete?.channel_name}</strong> (<code>{channelToDelete?.chat_id}</code>)? The bot will permanently stop posting to this channel and remove it from MongoDB.
          </DialogDescription>
        </DialogHeader>

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
            onClick={onConfirm}
            className="h-8 px-4 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
          >
            Confirm Remove
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
