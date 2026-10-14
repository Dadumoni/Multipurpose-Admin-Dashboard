import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard,
  Settings as SettingsIcon, 
  Film, 
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
  const [isSyncingDb, setIsSyncingDb] = useState(false);
  const [showSyncCard, setShowSyncCard] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Overview', href: '/overview' },
    { icon: Film, label: 'All Videos', href: '/scraped' },
    { icon: Upload, label: 'Upload Video', href: '/uploaded' },
    { icon: Globe, label: 'Site Scraper', href: '/scrapers' },
    { icon: Bot, label: 'Telegram Bot', href: '/telegram-bot' },
    { icon: Terminal, label: 'Logs', href: '/logs' },
    { icon: SettingsIcon, label: 'Settings', href: '/settings' },
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
                  {/* DB Sync Action inside Settings Menu */}
                  <div className="px-3 py-2 flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                    <span className="flex items-center gap-2 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-database h-4 w-4 text-zinc-500 dark:text-zinc-400"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
                      <span>DB Sync</span>
                    </span>
                    <button
                      type="button"
                      disabled={isSyncingDb}
                      onClick={async () => {
                        if (isSyncingDb) return;
                        setIsSyncingDb(true);
                        setShowSyncCard(true);
                        try {
                          const res = await fetch('/api/sync/migrate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                          });
                          const data = await res.json();
                          if (!res.ok || !data.success) {
                            toast.error(data.error || 'Failed to start DB Sync');
                          }
                        } catch {
                          toast.error('Failed to trigger DB Sync');
                        } finally {
                          setTimeout(() => setIsSyncingDb(false), 1500);
                        }
                      }}
                      title="Sync MongoDB to Supabase"
                      aria-label="Sync MongoDB to Supabase"
                      className="p-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-black dark:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn("lucide lucide-rotate-ccw-icon lucide-rotate-ccw h-3.5 w-3.5", isSyncingDb && "animate-spin")}
                      >
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                    </button>
                  </div>

                  {/* Card below DB Sync showing live copying status and See Logs link */}
                  {showSyncCard && (
                    <div className="mx-1.5 mb-1.5 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-black dark:text-white">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="truncate">Copying to Supabase...</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSyncCard(false);
                          }}
                          title="Close notification"
                          aria-label="Close notification"
                          className="p-0.5 rounded text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          navigate('/logs');
                        }}
                        className="w-full py-1 px-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                      >
                        <span>See Logs</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
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
