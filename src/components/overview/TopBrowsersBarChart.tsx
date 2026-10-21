import React, { useState } from 'react';
import { cn } from '@/src/lib/utils';

// ==========================================
// Pixel-Perfect Vector Browser Logos
// ==========================================

export function ChromeLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#FFFFFF" />
      {/* Red segment (top) */}
      <path d="M50 14C65.5 14 78.8 23.3 84.7 36.6L54 36.6C51.5 33.7 47.9 31.8 43.8 31.8C38.2 31.8 33.4 35.5 31.6 40.6L19 18.7C27.3 15.7 36.4 14 50 14Z" fill="#EA4335" />
      {/* Green segment (bottom-right) */}
      <path d="M84.7 36.6C88.1 43.4 89 51.5 87 59.8C83.2 75.3 70 86.8 54 88L38.6 61.4C40.6 63 43.1 64 45.8 64C52 64 57 59 57 52.8C57 50.8 56.4 49 55.4 47.4L84.7 36.6Z" fill="#34A853" />
      {/* Yellow segment (bottom-left) */}
      <path d="M19 18.7L31.6 40.6C29.6 44 28.5 48 28.5 52.3C28.5 61.2 34 68.8 42 71.8L26.6 88C15 82 8 70 8 52.3C8 38.6 12.8 26.8 19 18.7Z" fill="#FBBC05" />
      {/* Center White Mask Ring */}
      <circle cx="50" cy="52" r="19" fill="#FFFFFF" />
      {/* Center Blue Circle */}
      <circle cx="50" cy="52" r="15" fill="#4285F4" />
    </svg>
  );
}

export function SafariLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="safari-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="needle-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#B91C1C" />
        </linearGradient>
        <linearGradient id="needle-white" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#safari-bg)" stroke="#7DD3FC" strokeWidth="2.5" />
      {/* Compass Tick Ring */}
      <circle cx="50" cy="50" r="37" stroke="#E0F2FE" strokeWidth="1.8" strokeDasharray="2 6.8" fill="none" opacity="0.85" />
      {/* Red North Needle */}
      <polygon points="50,14 58,50 50,47 42,50" fill="url(#needle-red)" />
      {/* White South Needle */}
      <polygon points="50,86 58,50 50,53 42,50" fill="url(#needle-white)" />
      {/* Center Pivot */}
      <circle cx="50" cy="50" r="4.5" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="2.5" fill="#0369A1" />
    </svg>
  );
}

export function FirefoxLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ff-globe" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#4A154B" />
          <stop offset="50%" stopColor="#2E1065" />
          <stop offset="100%" stopColor="#1E1B4B" />
        </radialGradient>
        <linearGradient id="ff-flame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF9F43" />
          <stop offset="40%" stopColor="#FF3838" />
          <stop offset="100%" stopColor="#9C0075" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="52" r="36" fill="url(#ff-globe)" />
      <path
        d="M87 34C83 22 72 15 72 15C72 15 75 23 71 30C67 36 60 39 54 38C46 37 41 31 44 23C46 18 51 14 51 14C51 14 38 15 30 26C21 38 23 55 31 64C23 59 21 49 22 42C16 51 14 64 21 75C29 87 47 91 63 86C79 80 89 64 89 47C89 42 88 38 87 34Z"
        fill="url(#ff-flame)"
      />
      <path
        d="M50 88C35 88 24 78 24 65C24 55 30 46 39 42C35 48 37 57 43 62C49 67 59 67 65 62C72 56 74 46 70 38C77 46 80 57 77 67C74 79 63 88 50 88Z"
        fill="#FFA801"
      />
    </svg>
  );
}

export function EdgeLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="edge-swirl-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B55A0" />
          <stop offset="100%" stopColor="#00A4EF" />
        </linearGradient>
        <linearGradient id="edge-swirl-2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00A4EF" />
          <stop offset="55%" stopColor="#00C883" />
          <stop offset="100%" stopColor="#7EE600" />
        </linearGradient>
      </defs>
      <path
        d="M48 10C27 10 10 27 10 48C10 57 14 66 21 72C22 61 28 51 38 46C46 42 55 42 63 46C67 48 70 52 70 56C70 65 62 72 52 72C43 72 36 67 34 60C26 68 28 78 35 84C40 88 47 90 54 90C74 90 90 74 90 54C90 40 82 27 70 19C64 13 56 10 48 10Z"
        fill="url(#edge-swirl-1)"
      />
      <path
        d="M21 72C28 83 41 90 54 90C74 90 90 74 90 54C90 44 86 35 79 28C78 34 74 40 68 44C60 49 48 51 38 58C30 63 24 70 21 72Z"
        fill="url(#edge-swirl-2)"
        opacity="0.95"
      />
    </svg>
  );
}

export function OperaLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="opera-red" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF1B2D" />
          <stop offset="100%" stopColor="#B30012" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M50 8C26.8 8 8 26.8 8 50C8 73.2 26.8 92 50 92C73.2 92 92 73.2 92 50C92 26.8 73.2 8 50 8ZM50 22C61.5 22 69 34.5 69 50C69 65.5 61.5 78 50 78C38.5 78 31 65.5 31 50C31 34.5 38.5 22 50 22Z"
        fill="url(#opera-red)"
      />
    </svg>
  );
}

export function BraveLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brave-orange" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB542B" />
          <stop offset="100%" stopColor="#FF1800" />
        </linearGradient>
      </defs>
      <path
        d="M50 8L16 22V46C16 70 30 88 50 94C70 88 84 70 84 46V22L50 8Z"
        fill="url(#brave-orange)"
      />
      {/* Inner crest highlights */}
      <path
        d="M50 22L30 30V48C30 62 38 74 50 80C62 74 70 62 70 48V30L50 22Z"
        fill="#FFFFFF"
        opacity="0.25"
      />
      <circle cx="41" cy="44" r="3.5" fill="#FFFFFF" />
      <circle cx="59" cy="44" r="3.5" fill="#FFFFFF" />
      <polygon points="50,50 44,57 56,57" fill="#FFFFFF" />
      <path d="M43 64C47 67 53 67 57 64" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function TelegramLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tg-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2AABEE" />
          <stop offset="100%" stopColor="#1E96C8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#tg-blue)" />
      <path
        d="M74 27L22 47C19 48 19 51 22 52L35 56L67 36C68 35 69 36 68 37L42 61L41 71C43 71 44 70 45 69L52 62L64 71C66 72 68 71 69 68L80 30C81 27 77 25 74 27Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function SamsungInternetLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="samsung-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7052FB" />
          <stop offset="100%" stopColor="#4A2CD8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="32" fill="url(#samsung-purple)" />
      <ellipse cx="50" cy="50" rx="44" ry="17" transform="rotate(-32 50 50)" stroke="#A594FD" strokeWidth="5.5" fill="none" />
    </svg>
  );
}

export function UCBrowserLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="uc-orange" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF9F43" />
          <stop offset="100%" stopColor="#EE5A24" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#uc-orange)" />
      <circle cx="50" cy="50" r="30" stroke="#FFFFFF" strokeWidth="4.5" fill="none" strokeDasharray="6 4" />
      <path d="M35 46C35 56 42 63 50 63C58 63 65 56 65 46" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <circle cx="42" cy="40" r="4" fill="#FFFFFF" />
      <circle cx="58" cy="40" r="4" fill="#FFFFFF" />
    </svg>
  );
}

export function GenericBrowserLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#3B82F6" opacity="0.15" />
      <circle cx="50" cy="50" r="38" stroke="#3B82F6" strokeWidth="4.5" fill="none" />
      <path d="M12 50H88" stroke="#3B82F6" strokeWidth="3.5" />
      <ellipse cx="50" cy="50" rx="20" ry="38" stroke="#3B82F6" strokeWidth="3.5" fill="none" />
    </svg>
  );
}

// ==========================================
// Browser Metadata & Brand Styling
// ==========================================

export interface BrowserItem {
  name: string;
  count: number;
  percentage: number;
}

export function getBrowserInfo(name: string) {
  const lower = (name || '').toLowerCase();

  if (lower.includes('chrome') || lower.includes('crios') || lower.includes('chromium')) {
    return {
      displayName: 'Chrome',
      logo: (className?: string) => <ChromeLogo className={className} />,
      barGradient: 'from-blue-600 via-sky-500 to-emerald-400',
      activeColor: '#4285F4',
      badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    };
  }
  if (lower.includes('safari') && !lower.includes('chrome')) {
    return {
      displayName: 'Safari',
      logo: (className?: string) => <SafariLogo className={className} />,
      barGradient: 'from-sky-600 via-cyan-500 to-blue-400',
      activeColor: '#0EA5E9',
      badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
    };
  }
  if (lower.includes('firefox') || lower.includes('fxios') || lower.includes('mozilla')) {
    return {
      displayName: 'Firefox',
      logo: (className?: string) => <FirefoxLogo className={className} />,
      barGradient: 'from-purple-600 via-rose-500 to-amber-400',
      activeColor: '#FF7A00',
      badgeBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    };
  }
  if (lower.includes('edge') || lower.includes('edg')) {
    return {
      displayName: 'Edge',
      logo: (className?: string) => <EdgeLogo className={className} />,
      barGradient: 'from-blue-700 via-cyan-600 to-emerald-400',
      activeColor: '#00A4EF',
      badgeBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
    };
  }
  if (lower.includes('opera') || lower.includes('opr')) {
    return {
      displayName: 'Opera',
      logo: (className?: string) => <OperaLogo className={className} />,
      barGradient: 'from-red-700 via-red-600 to-rose-400',
      activeColor: '#FF1B2D',
      badgeBg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
    };
  }
  if (lower.includes('brave')) {
    return {
      displayName: 'Brave',
      logo: (className?: string) => <BraveLogo className={className} />,
      barGradient: 'from-orange-600 via-amber-500 to-amber-300',
      activeColor: '#FB542B',
      badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    };
  }
  if (lower.includes('telegram') || lower.includes('in-app') || lower.includes('tg')) {
    return {
      displayName: 'Telegram',
      logo: (className?: string) => <TelegramLogo className={className} />,
      barGradient: 'from-sky-600 via-blue-500 to-cyan-400',
      activeColor: '#2AABEE',
      badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
    };
  }
  if (lower.includes('samsung')) {
    return {
      displayName: 'Samsung',
      logo: (className?: string) => <SamsungInternetLogo className={className} />,
      barGradient: 'from-indigo-700 via-purple-600 to-violet-400',
      activeColor: '#7052FB',
      badgeBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    };
  }
  if (lower.includes('uc')) {
    return {
      displayName: 'UC Browser',
      logo: (className?: string) => <UCBrowserLogo className={className} />,
      barGradient: 'from-amber-600 via-orange-500 to-yellow-400',
      activeColor: '#EE5A24',
      badgeBg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
    };
  }

  return {
    displayName: name || 'Browser',
    logo: (className?: string) => <GenericBrowserLogo className={className} />,
    barGradient: 'from-zinc-700 via-zinc-500 to-zinc-400',
    activeColor: '#64748B',
    badgeBg: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
  };
}

// ==========================================
// Vertical Bar Chart Component
// ==========================================

interface TopBrowsersBarChartProps {
  browsers: BrowserItem[];
  selectedMonthLabel?: string;
}

export default function TopBrowsersBarChart({ browsers, selectedMonthLabel }: TopBrowsersBarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Take top 6 browsers for ideal vertical spacing
  const data = browsers.slice(0, 6);
  if (data.length === 0) return null;

  // Maximum count or percentage for height scaling
  const maxCount = Math.max(...data.map(b => b.count), 1);
  const totalCount = data.reduce((acc, b) => acc + b.count, 0);
  const topBrowser = data[0];

  return (
    <div className="w-full space-y-4">
      {/* Chart Canvas Area */}
      <div className="relative w-full h-[260px] sm:h-[280px] bg-zinc-50/60 dark:bg-zinc-950/40 rounded-xl p-4 sm:p-5 border border-zinc-200/80 dark:border-zinc-800/80 select-none overflow-hidden">
        
        {/* Background Horizontal Guide Lines */}
        <div className="absolute inset-x-4 sm:inset-x-6 top-10 bottom-12 flex flex-col justify-between pointer-events-none z-0">
          {[100, 75, 50, 25, 0].map((step) => (
            <div key={step} className="w-full flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 w-7 shrink-0 text-right">
                {step}%
              </span>
              <div className="flex-1 border-b border-dashed border-zinc-200 dark:border-zinc-800/80" />
            </div>
          ))}
        </div>

        {/* Vertical Bars Container */}
        <div className="relative z-10 w-full h-full flex items-end justify-around pl-8 pr-2 pb-6">
          {data.map((item, idx) => {
            const info = getBrowserInfo(item.name);
            const isHovered = hoveredIdx === idx;
            // Bar height scaled between 10% and 100% of available height
            const heightPercent = Math.min(100, Math.max(12, Math.round((item.count / maxCount) * 100)));

            return (
              <div
                key={item.name + idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="flex-1 max-w-[80px] sm:max-w-[95px] h-full flex flex-col items-center justify-end relative group cursor-pointer"
              >
                {/* Floating Tooltip */}
                {isHovered && (
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-30 bg-black/90 dark:bg-zinc-900/95 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-xl border border-zinc-700/80 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {info.logo("w-3.5 h-3.5 shrink-0")}
                      <span>{info.displayName}</span>
                    </div>
                    <div className="text-[10px] text-zinc-300 font-mono mt-0.5">
                      {item.count.toLocaleString()} views ({item.percentage}%)
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90 dark:border-t-zinc-900/95" />
                  </div>
                )}

                {/* Above Bar Header: Browser Logo & Percentage Badge */}
                <div className="flex flex-col items-center mb-2 transition-transform duration-200 group-hover:-translate-y-1">
                  {/* Browser Logo in Circular Badge */}
                  <div
                    className={cn(
                      "w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white dark:bg-zinc-900 p-1.5 flex items-center justify-center shadow-sm border transition-all duration-200",
                      isHovered
                        ? "scale-110 shadow-md ring-2 ring-blue-500/40 border-blue-500/40"
                        : "border-zinc-200 dark:border-zinc-800"
                    )}
                  >
                    {info.logo("w-full h-full")}
                  </div>

                  {/* Percentage label right on top of the bar */}
                  <span className={cn(
                    "text-[10px] sm:text-[11px] font-mono font-bold mt-1 transition-colors",
                    isHovered ? "text-blue-600 dark:text-blue-400" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {item.percentage}%
                  </span>
                </div>

                {/* Vertical Bar */}
                <div className="w-full max-w-[38px] sm:max-w-[48px] h-[130px] sm:h-[145px] flex items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-xl bg-gradient-to-t transition-all duration-500 relative overflow-hidden shadow-sm",
                      info.barGradient,
                      isHovered ? "brightness-110 shadow-md scale-[1.02]" : "opacity-90"
                    )}
                    style={{ height: `${heightPercent}%` }}
                  >
                    {/* Glossy glass reflection overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent opacity-60 pointer-events-none" />
                  </div>
                </div>

                {/* X-Axis Bottom Label: Browser Name & Count */}
                <div className="w-full text-center mt-2 flex flex-col items-center">
                  <span className={cn(
                    "text-[11px] sm:text-xs font-medium truncate max-w-full transition-colors",
                    isHovered ? "text-black dark:text-white font-semibold" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {info.displayName}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-full">
                    {item.count >= 1000 ? `${(item.count / 1000).toFixed(1)}k` : item.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini Summary / Insights Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/70 flex items-center gap-2.5">
          {topBrowser && (
            <>
              <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-800 p-0.5 shadow-xs shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                {getBrowserInfo(topBrowser.name).logo("w-full h-full")}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate">Most Used Browser</span>
                <span className="text-xs font-semibold text-black dark:text-white truncate block">
                  {getBrowserInfo(topBrowser.name).displayName} ({topBrowser.percentage}%)
                </span>
              </div>
            </>
          )}
        </div>

        <div className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/70 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border border-blue-500/20">
            {data.length}
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate">Browsers Tracked</span>
            <span className="text-xs font-semibold text-black dark:text-white truncate block">
              {browsers.length} Active Engines
            </span>
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/70 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border border-emerald-500/20">
            Σ
          </div>
          <div className="min-w-0">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate">Total Views Sampled</span>
            <span className="text-xs font-semibold text-black dark:text-white truncate block font-mono">
              {totalCount.toLocaleString()} views
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
