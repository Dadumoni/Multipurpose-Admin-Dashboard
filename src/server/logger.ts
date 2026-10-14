export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX_LOGS = 1500;
const logsBuffer: LogEntry[] = [];
let logCounter = 1;

export function addLog(level: LogLevel, message: string, source = 'system'): LogEntry {
  const cleanMsg = String(message || '').trim();
  const entry: LogEntry = {
    id: `${Date.now()}-${logCounter++}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message: cleanMsg,
  };
  logsBuffer.push(entry);
  if (logsBuffer.length > MAX_LOGS) {
    logsBuffer.splice(0, logsBuffer.length - MAX_LOGS);
  }
  return entry;
}

export function getLogs(sinceId?: string): LogEntry[] {
  if (!sinceId) {
    return [...logsBuffer];
  }
  const idx = logsBuffer.findIndex((l) => l.id === sinceId);
  if (idx === -1) {
    return [...logsBuffer];
  }
  return logsBuffer.slice(idx + 1);
}

export function clearLogs(): void {
  logsBuffer.length = 0;
  addLog('info', 'Terminal logs cleared by user.', 'terminal');
}

let consoleHooked = false;

export function initConsoleLogger(): void {
  if (consoleHooked) return;
  consoleHooked = true;

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  const formatArgs = (args: any[]): string =>
    args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');

  console.log = (...args: any[]) => {
    origLog(...args);
    const msg = formatArgs(args);
    if (!msg) return;
    const lower = msg.toLowerCase();
    let level: LogLevel = 'info';
    if (
      msg.includes('[Success]') ||
      lower.includes('successfully') ||
      lower.includes('migration summary') ||
      lower.includes('scan complete') ||
      lower.includes('0 failed')
    ) {
      level = 'success';
    } else if (
      msg.includes('[Error]') ||
      (lower.includes('failed') && !lower.includes('0 failed'))
    ) {
      level = 'error';
    }
    const source = msg.includes('[TelegramBot]') || msg.includes('[Telegram Bot]')
      ? 'telegram-bot'
      : msg.includes('[SiteScraper') || msg.includes('[Scraper')
      ? 'scraper'
      : msg.includes('Migrated:') || msg.includes('MongoDB (videos_db') || msg.includes('[DB Sync]')
      ? 'db-sync'
      : 'server';
    addLog(level, msg, source);
  };

  console.warn = (...args: any[]) => {
    origWarn(...args);
    const msg = formatArgs(args);
    if (!msg) return;
    const source = msg.includes('[TelegramBot]') || msg.includes('[Telegram Bot]')
      ? 'telegram-bot'
      : msg.includes('[SiteScraper') || msg.includes('[Scraper')
      ? 'scraper'
      : 'server';
    addLog('warn', msg, source);
  };

  console.error = (...args: any[]) => {
    origError(...args);
    const msg = formatArgs(args);
    if (!msg) return;
    const source = msg.includes('[TelegramBot]') || msg.includes('[Telegram Bot]')
      ? 'telegram-bot'
      : msg.includes('[SiteScraper') || msg.includes('[Scraper')
      ? 'scraper'
      : msg.includes('[Error] Failed for ID') || msg.includes('[DB Sync]')
      ? 'db-sync'
      : 'server';
    addLog('error', msg, source);
  };

  addLog('info', 'System terminal logger initialized and listening for events.', 'system');
}
