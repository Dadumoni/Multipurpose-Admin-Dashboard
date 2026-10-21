import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useTheme } from '@/src/components/ThemeProvider';
import { getClientCache, setClientCache, invalidateClientCache } from '@/src/lib/clientCache';
import { toast } from 'sonner';

// Modular Overview Subcomponents
import OverviewHeader from '@/src/components/overview/OverviewHeader';
import OverviewStatsCards, { OverviewStatsData, TrendInfo } from '@/src/components/overview/OverviewStatsCards';
import TrafficLineChart, { DailyTrafficPoint } from '@/src/components/overview/TrafficLineChart';
import DeviceBreakdownCard from '@/src/components/overview/DeviceBreakdownCard';
import TopCountriesCard from '@/src/components/overview/TopCountriesCard';
import TopBrowsersCard from '@/src/components/overview/TopBrowsersCard';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface VisitorsData {
  available: boolean;
  message: string;
  totalUsers?: number;
  totalOnline?: number;
  devices: { name: string; count: number; percentage: number }[];
  countries: { name: string; count: number; percentage: number }[];
  browsers: { name: string; count: number; percentage: number }[];
}

function getInitialMonthlyTraffic(year: number, month: number): DailyTrafficPoint[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthShort = MONTH_NAMES_SHORT[month];

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    return {
      day,
      date: `${monthShort} ${dayStr}`,
      name: `${monthShort} ${dayStr}`,
      views: 0,
    };
  });
}

export default function Overview() {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  // Date filter state: limit cannot exceed current month/year
  const [selectedYear, setSelectedYear] = useState<number>(curYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(curMonth);

  const [loading, setLoading] = useState(true);
  const [postsSchemaNotice, setPostsSchemaNotice] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Data state
  const [stats, setStats] = useState<OverviewStatsData>({
    totalVideos: 0,
    totalViews: 0,
    totalScraped: 0,
    totalUploaded: 0,
    mongoTotalVideos: 0,
    supabaseTotal: 0,
  });

  const [monthlyTraffic, setMonthlyTraffic] = useState<DailyTrafficPoint[]>(() => getInitialMonthlyTraffic(curYear, curMonth));
  const [visitors, setVisitors] = useState<VisitorsData>({
    available: false,
    message: '',
    totalUsers: 0,
    totalOnline: 0,
    devices: [],
    countries: [],
    browsers: [],
  });

  // Available selectable years (from 2023 up to current year)
  const availableYears = Array.from({ length: curYear - 2023 + 1 }, (_, i) => 2023 + i);
  const isCurrentMonthAndYear = selectedYear === curYear && selectedMonth === curMonth;

  useEffect(() => {
    fetchOverviewData(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  // Periodic poll for realtime online users and total users every 20 seconds
  useEffect(() => {
    let isMounted = true;
    const fetchRealtime = async () => {
      try {
        const res = await fetch('/api/overview/realtime');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success) {
            setVisitors((prev) => ({
              ...prev,
              totalUsers: typeof data.totalUsers === 'number' ? data.totalUsers : prev.totalUsers,
              totalOnline: typeof data.totalOnline === 'number' ? data.totalOnline : prev.totalOnline,
              available: true,
            }));
          }
        }
      } catch {}
    };

    const interval = setInterval(fetchRealtime, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleRecalculateStats() {
    if (isRecalculating) return;
    setIsRecalculating(true);
    try {
      const res = await fetch('/api/stats/recalculate', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Stats and counters synced successfully from database!');
        await fetchOverviewData(selectedYear, selectedMonth, true);
      } else {
        toast.error(data.error || 'Failed to sync counters');
      }
    } catch {
      toast.error('Network error syncing counters');
    } finally {
      setIsRecalculating(false);
    }
  }

  async function fetchOverviewData(year: number, month: number, forceRefresh = false) {
    const cacheKey = `overview:data:${year}:${month}`;

    if (!forceRefresh) {
      const cached = getClientCache<any>(cacheKey);
      if (cached) {
        if (cached.stats) setStats(cached.stats);
        if (cached.monthlyTraffic && Array.isArray(cached.monthlyTraffic)) setMonthlyTraffic(cached.monthlyTraffic);
        if (cached.visitors) setVisitors(cached.visitors);
        setLoading(false);
        return;
      }
    } else {
      invalidateClientCache(cacheKey);
    }

    setLoading(true);
    setPostsSchemaNotice(false);
    try {
      const res = await fetch(`/api/overview?year=${year}&month=${month}${forceRefresh ? '&refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
        }
        if (data.monthlyTraffic && Array.isArray(data.monthlyTraffic)) {
          setMonthlyTraffic(data.monthlyTraffic);
        }
        if (data.visitors) {
          setVisitors(data.visitors);
        }
        setClientCache(cacheKey, data);
      }
    } catch (err: any) {
      console.error('Failed to load overview data from MongoDB:', err);
    } finally {
      setLoading(false);
    }
  }

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      const newYear = selectedYear - 1;
      if (newYear >= 2023) {
        setSelectedYear(newYear);
        setSelectedMonth(11);
      }
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (isCurrentMonthAndYear) return;
    if (selectedMonth === 11) {
      const newYear = selectedYear + 1;
      if (newYear <= curYear) {
        setSelectedYear(newYear);
        setSelectedMonth(0);
      }
    } else {
      const nextMonth = selectedMonth + 1;
      if (selectedYear < curYear || nextMonth <= curMonth) {
        setSelectedMonth(nextMonth);
      }
    }
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    if (year === curYear && selectedMonth > curMonth) {
      setSelectedMonth(curMonth);
    }
  };

  const selectedMonthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
  const totalMonthViews = monthlyTraffic.reduce((acc, curr) => acc + (Number(curr.views) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Schema Notice */}
      {postsSchemaNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-900">
              Supabase <code>public.posts</code> table is waiting for schema cache reload (PGRST205).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link 
              to="/scraped"
              className="h-8 px-3 rounded-lg border border-amber-300 bg-white hover:bg-zinc-50 text-xs font-medium text-amber-900 inline-flex items-center"
            >
              View SQL Script
            </Link>
            <button 
              type="button" 
              onClick={() => fetchOverviewData(selectedYear, selectedMonth)} 
              className="h-8 px-3 rounded-lg bg-zinc-900 text-white hover:bg-black text-xs font-medium inline-flex items-center gap-1.5"
            >
              <RotateCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Reusable Main Header */}
      <OverviewHeader 
        totalUsers={visitors.totalUsers} 
        totalOnline={visitors.totalOnline} 
      />

      {/* Reusable 4 Stat Cards */}
      <OverviewStatsCards stats={stats} />

      {/* Reusable Daily Traffic Line Graph */}
      <TrafficLineChart
        monthlyTraffic={monthlyTraffic}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedYear={selectedYear}
        handleYearChange={handleYearChange}
        handlePrevMonth={handlePrevMonth}
        handleNextMonth={handleNextMonth}
        isCurrentMonthAndYear={isCurrentMonthAndYear}
        selectedMonthLabel={selectedMonthLabel}
        totalMonthViews={totalMonthViews}
        monthNames={MONTH_NAMES}
        availableYears={availableYears}
        curYear={curYear}
        curMonth={curMonth}
        isDark={isDark}
      />

      {/* VISITORS ANALYTICS CARDS (Device Breakdown & Top Countries) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Reusable Device Breakdown Card */}
        <DeviceBreakdownCard
          available={visitors.available}
          message={visitors.message}
          devices={visitors.devices}
          selectedMonthLabel={selectedMonthLabel}
          isDark={isDark}
        />

        {/* Reusable Top Countries Card */}
        <TopCountriesCard
          available={visitors.available}
          message={visitors.message}
          countries={visitors.countries}
          selectedMonthLabel={selectedMonthLabel}
        />
      </div>

      {/* Reusable Top Browsers Card with Vertical Bar Chart */}
      <TopBrowsersCard
        available={visitors.available}
        message={visitors.message}
        browsers={visitors.browsers}
        selectedMonthLabel={selectedMonthLabel}
      />
    </div>
  );
}
