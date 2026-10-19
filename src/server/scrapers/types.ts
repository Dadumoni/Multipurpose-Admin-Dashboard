export interface ScrapedPostResult {
  site: string;
  domain: string;
  post_url: string;
  video_id: string;
  title: string;
  duration: string;
  '720p_link'?: string | null;
  '480p_link'?: string | null;
  all_links: string[];
  thumbnail_url?: string | null;
  views: number;
  scraped_at: number;
}

export interface ScraperSiteInfo {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  cron_schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  total_scraped: number;
  failed_count: number;
  last_new_posts?: number;
  last_run_at: string | null;
  last_run_type?: 'manual' | 'scheduled' | 'full_scan';
  next_run_at: string | null;
  last_error: string | null;
}

export interface SiteScraperModule {
  id: string;
  name: string;
  domain: string;
  baseUrl: string;
  defaultSchedule: string;
  scheduleHour: number;
  runIncremental(signal?: AbortSignal): Promise<{ newPosts: number; failed: number }>;
  runFullScan?(signal?: AbortSignal): Promise<{ newPosts: number; failed: number }>;
}
