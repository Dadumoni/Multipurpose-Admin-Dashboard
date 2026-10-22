export interface R2Video {
  id: number;
  slug: string;
  title: string;
  thumbnail: string | null;
  video_link: string | null;
  zerostorage: string | null;
  abyss: string | null;
  anonmp4: string | null;
  views: number;
  created_at: string;
  file_size?: number | string | null;
  size?: number | string | null;
  duration?: number | string | null;
}

export function formatFileSize(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === '') return '—';
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (isNaN(num) || num <= 0) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(duration: number | string | null | undefined): string {
  if (duration === null || duration === undefined || duration === '') return '—';
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  const sec = typeof duration === 'string' ? parseFloat(duration) : duration;
  if (isNaN(sec) || sec <= 0) return '—';
  const totalSeconds = Math.round(sec);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
