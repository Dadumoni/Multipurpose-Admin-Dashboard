import React from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Folder, 
  Menu, 
  ChevronRight, 
  Sun, 
  Moon, 
  LogOut 
} from 'lucide-react';
import { useTheme } from '@/src/components/ThemeProvider';
import { toast } from 'sonner';
import { MENU_ITEMS } from './Sidebar';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  profileDropdownOpen: boolean;
  setProfileDropdownOpen: (open: boolean) => void;
}

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  profileDropdownOpen,
  setProfileDropdownOpen
}: HeaderProps) {
  const location = useLocation();
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const currentLabel = MENU_ITEMS.find(i => i.href === location.pathname)?.label || 'Overview';

  return (
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
  );
}
