import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { getClientCache, setClientCache } from '@/src/lib/clientCache';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

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
      {/* Reusable Sidebar Component */}
      <Sidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
        storageStats={storageStats} 
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-[260px] min-w-0 flex flex-col bg-white dark:bg-black transition-colors">
        {/* Reusable Header Component */}
        <Header 
          sidebarOpen={sidebarOpen} 
          setSidebarOpen={setSidebarOpen} 
          profileDropdownOpen={profileDropdownOpen} 
          setProfileDropdownOpen={setProfileDropdownOpen} 
        />

        {/* Page Content Viewport */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
