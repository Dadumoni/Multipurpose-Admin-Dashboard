export interface ScrapedVideo {
  _id?: string;
  id: number | string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  views: number;
  video_url1?: string | null;
  video_url2?: string | null;
  // New document structure fields
  post_url?: string | null;
  video_id?: string | null;
  scraped_at?: number | string | null;
  '480p_link'?: string | null;
  '720p_link'?: string | null;
  all_links?: string[];
  domain?: string | null;
  duration?: string | null;
  is_expired?: boolean;
  expired_checked_at?: string | null;
}

export interface UploadedVideo {
  id: string;
  title: string;
  description?: string;
  video_url: string;
  thumbnail_url: string;
  views: number;
  file_size: string;
  duration: string;
  upload_type: 'upload' | 'link';
  created_at: string;
}
