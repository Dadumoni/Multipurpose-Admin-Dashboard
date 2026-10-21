export interface ScraperSiteInfo {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  cron_schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped' | 'postponed' | 'full_scanning';
  total_scraped: number;
  failed_count: number;
  last_new_posts?: number;
  last_run_at: string | null;
  last_run_type?: 'manual' | 'scheduled' | 'full_scan';
  next_run_at: string | null;
  last_error: string | null;
}

export interface EngineStatus {
  online: boolean;
  configured: boolean;
  is_running: boolean;
  active_scrapes: number;
  app_url: string;
  last_checked: string;
}

export const DEFAULT_SITES: ScraperSiteInfo[] = [
  {
    id: 'lalamasa',
    name: 'lalamasa.mobi',
    domain: 'lalamasa.mobi',
    base_url: 'https://lalamasa.mobi',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'masahub2',
    name: 'masahub2.com',
    domain: 'masahub2.com',
    base_url: 'https://masahub2.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mmsvibex',
    name: 'mmsvibex.fit',
    domain: 'mmsvibex.fit',
    base_url: 'https://mmsvibex.fit',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mydesi13',
    name: 'mydesi13.com',
    domain: 'mydesi13.com',
    base_url: 'https://mydesi13.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mydesiRest',
    name: 'mydesi.rest',
    domain: 'mydesi.rest',
    base_url: 'https://mydesi.rest',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mykamababa',
    name: 'mykamababa.vip',
    domain: 'mykamababa.vip',
    base_url: 'https://mykamababa.vip',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'p4455',
    name: 'p4455.com',
    domain: 'p4455.com',
    base_url: 'https://p4455.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'viralchut',
    name: 'viralchut.com',
    domain: 'viralchut.com',
    base_url: 'https://viralchut.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'viralmms',
    name: 'viralmms.org',
    domain: 'viralmms.org',
    base_url: 'https://viralmms.org',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'xxxindianstories',
    name: 'xxxindianstories.com',
    domain: 'xxxindianstories.com',
    base_url: 'https://xxxindianstories.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
];
