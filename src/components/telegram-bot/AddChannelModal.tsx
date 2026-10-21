import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

interface AddChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newChatId: string;
  setNewChatId: (val: string) => void;
  newChatName: string;
  setNewChatName: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function AddChannelModal({
  open,
  onOpenChange,
  newChatId,
  setNewChatId,
  newChatName,
  setNewChatName,
  onSubmit,
}: AddChannelModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Add Telegram Channel</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Provide the Telegram Channel ID. The bot must be an administrator in the channel with &ldquo;Post Messages&rdquo; permission.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-2 text-xs">
          <div className="space-y-1.5">
            <label className="font-medium text-zinc-700 dark:text-zinc-300">
              Channel ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. -1001234567890"
              value={newChatId}
              onChange={(e) => setNewChatId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white font-mono focus:outline-none"
            />
            <p className="text-[11px] text-zinc-400">
              You can forward any message from your channel to @userinfobot or your poster bot to get the channel ID.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-zinc-700 dark:text-zinc-300">
              Channel Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Movie Updates Channel"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none"
            />
          </div>

          <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 text-[11px] text-zinc-500 space-y-1">
            <div className="font-semibold text-black dark:text-white">Notice:</div>
            <div>Once added, the bot will immediately post an initial burst of 10 videos (with a 10s gap).</div>
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
              type="submit"
              className="h-8 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Add Channel
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
