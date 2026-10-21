export interface ChannelItem {
  chat_id: number | string;
  channel_name: string;
  total_posts: number;
  success_posts: number;
  failed_posts: number;
  is_active: boolean;
  posted_ids: (number | string)[];
  added_at: string;
}

export interface BotState {
  id: string;
  is_running: boolean;
  stopped: boolean;
  bot_name: string;
  bot_username: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
}
