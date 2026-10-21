import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Folder, 
  X, 
  HardDrive,
  LayoutDashboard,
  Film,
  Upload,
  Video,
  Globe,
  Bot
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface MenuItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { icon: LayoutDashboard, label: 'Overview', href: '/overview' },
  { icon: Film, label: 'All Videos', href: '/scraped' },
  { icon: Upload, label: 'Telegram Uploaded', href: '/uploaded' },
  { icon: Video, label: 'R2 Videos', href: '/r2-videos' },
  { icon: Globe, label: 'Site Scraper', href: '/scrapers' },
  { icon: Bot, label: 'Telegram Bot', href: '/telegram-bot' },
];

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  active: boolean;
  onClick?: () => void;
}

export function SidebarItem({ icon: Icon, label, href, active, onClick }: SidebarItemProps) {
  return (
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
}

interface StorageStats {
  totalFiles: number;
  formattedSize: string;
  isInfinite: boolean;
}

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  storageStats: StorageStats;
}

export default function Sidebar({ sidebarOpen, setSidebarOpen, storageStats }: SidebarProps) {
  const location = useLocation();

  return (
    <>
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
          {MENU_ITEMS.map((item) => (
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
    </>
  );
}
