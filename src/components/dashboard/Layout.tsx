import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard,
  Settings as SettingsIcon, 
  Film, 
  Video,
  Upload, 
  Folder, 
  HardDrive, 
  Infinity,
  Menu, 
  X,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  Terminal,
  Bot,
  Globe,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useTheme } from '@/src/components/ThemeProvider';
import { toast } from 'sonner';
import { getClientCache, setClientCache } from '@/src/lib/clientCache';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  active: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon: Icon, label, href, active, onClick }: SidebarItemProps) => (
  <Link
    to={href}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors border",
      active 
        ? "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white font-medium" 
        : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
    )}
  >
    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-black dark:text-white" : "text-zinc-500 dark:text-zinc-400")} />
    <span className="truncate">{label}</span>
  </Link>
);

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', href: '/overview' },
    { icon: Film, label: 'All Videos', href: '/scraped' },
    { icon: Upload, label: 'Telegram Uploaded', href: '/uploaded' },
    { icon: Video, label: 'R2 Videos', href: '/r2-videos' },
    { icon: Globe, label: 'Site Scraper', href: '/scrapers' },
    { icon: Bot, label: 'Telegram Bot', href: '/telegram-bot' },
    { icon: Terminal, label: 'Logs', href: '/logs' },
  ];

  const currentLabel = menuItems.find(i => i.href === location.pathname)?.label || 'Overview';

  useEffect(() => {
    const closeProfile = () => setProfileDropdownOpen(false);
    window.addEventListener('click', closeProfile);
    return () => window.removeEventListener('click', closeProfile);
  }, []);

  // Storage usage stats
  const [storageStats, setStorageStats] = useState<{
    totalFiles: number;
    formattedSize: string;
    isInfinite: boolean;
  }>({
    totalFiles: 0,
    formattedSize: '0.0 MB',
    isInfinite: true,
  });

  useEffect(() => {
    const fetchStorage = async (force = false) => {
      const cacheKey = 'storage_stats';
      if (!force) {
        const cached = getClientCache<any>(cacheKey, 90000);
        if (cached) {
          setStorageStats(cached);
          return;
        }
      }
      try {
        const res = await fetch('/api/storage/stats');
        if (res.ok) {
          const data = await res.json();
          const statsPayload = {
            totalFiles: data.totalFiles || 0,
            formattedSize: data.formattedSize || '0.0 MB',
            isInfinite: true,
          };
          setStorageStats(statsPayload);
          setClientCache(cacheKey, statsPayload);
        }
      } catch {
        // silent fallback
      }
    };
    fetchStorage();
    const interval = setInterval(() => fetchStorage(true), 60000);
    return () => clearInterval(interval);
  }, []);


  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-[Inter,system-ui,sans-serif] antialiased flex transition-colors">
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[260px] bg-white dark:bg-black text-black dark:text-white border-r border-zinc-200 dark:border-zinc-800 flex flex-col transition-all duration-200 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="h-[72px] flex items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white grid place-items-center shrink-0">
              <Folder className="h-4 w-4" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-black dark:text-white">
              Admin Dashboard
            </span>
          </div>

          <button 
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <SidebarItem
              key={item.href}
              {...item}
              active={location.pathname === item.href || (item.href === '/overview' && location.pathname === '/')}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* Bottom Section: Storage Card */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          {/* Storage Card (Clickable to All Videos page) */}
          <Link
            to="/scraped"
            onClick={() => setSidebarOpen(false)}
            className="block group rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all cursor-pointer"
            title="Click to view all uploaded videos (Telegram & Dashboard)"
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <div className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                <HardDrive className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white" />
                <span>Storage Used</span>
              </div>
              <span className="font-semibold text-black dark:text-white font-mono">
                {storageStats.formattedSize}
              </span>
            </div>

            {/* ZeroStorage Infinite limit display indicator */}
            <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-black dark:bg-white rounded-full w-full opacity-80" />
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="truncate">
                {storageStats.totalFiles} {storageStats.totalFiles === 1 ? 'file' : 'files'} uploaded
              </span>
              <div className="flex items-center gap-1 font-semibold text-black dark:text-white bg-zinc-200/70 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded text-[10px]">
                <span>Limit:</span>
                <span className="text-xs leading-none">∞</span>
                <span className="font-normal text-[9.5px] opacity-80">Infinite</span>
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-[260px] min-w-0 flex flex-col bg-white dark:bg-black transition-colors">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 lg:px-6 flex items-center justify-between transition-colors">
          {/* Left Side: Mobile Menu Button + Breadcrumb */}
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 text-black dark:text-white">
                <Folder className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                <span className="hidden sm:inline">Admin</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 mx-1 text-zinc-400 dark:text-zinc-600 hidden sm:inline" />
              <span className="text-black dark:text-white font-semibold">{currentLabel}</span>
            </div>
          </div>

          {/* Right Side: Settings */}
          <div className="flex items-center gap-2.5">
            {/* Settings Icon with Dropdown Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 grid place-items-center shadow-sm focus:outline-none transition-all cursor-pointer"
                title="Settings"
                aria-label="Settings"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-settings-icon lucide-settings h-4 w-4"
                >
                  <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">

                  {/* Day / Night Theme toggle */}
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {resolvedTheme === 'dark' ? (
                        <Sun className="h-4 w-4 text-zinc-400" />
                      ) : (
                        <Moon className="h-4 w-4 text-zinc-500" />
                      )}
                      <span>Theme</span>
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      {resolvedTheme === 'dark' ? 'Night' : 'Day'}
                    </span>
                  </button>

                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />

                  {/* Logout */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      toast.info('Logged out');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 font-medium transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
