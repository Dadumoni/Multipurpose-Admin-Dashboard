export interface TelegramUploadedVideo {
  id: string;
  title: string;
  file_name: string;
  file_size?: string | number | null;
  mime_type?: string | null;
  source?: string;
  telegram_file_id?: string | null;
  telegram_file_unique_id?: string | null;
  zerostorage_file_id?: string | null;
  zerostorage_download_url?: string | null;
  zerostorage_embed_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
}

export function FileFormatBadge({ name }: { name: string }) {
  const ext = (name.split('.').pop() || 'MP4').toUpperCase().slice(0, 4);
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
      {ext}
    </span>
  );
}
