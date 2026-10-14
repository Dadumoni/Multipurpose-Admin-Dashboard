import { getClientCache, setClientCache, invalidateClientCache } from '@/src/lib/clientCache';
import { useEffect, useState } from 'react';
import { 
  Users, 
  Video, 
  Film, 
  Upload, 
  Calendar, 
  AlertTriangle,
  RotateCw,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Globe,
  Compass
} from 'lucide-react';
import { 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTheme } from '@/src/components/ThemeProvider';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface TrendInfo {
  change: number;
  percent?: number;
  direction: 'increase' | 'decrease' | 'neutral';
  label: string;
}

interface VisitorsData {
  available: boolean;
  message: string;
  devices: { name: string; count: number; percentage: number }[];
  countries: { name: string; count: number; percentage: number }[];
  browsers: { name: string; count: number; percentage: number }[];
}

function getInitialMonthlyTraffic(year: number, month: number) {
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
  
  // Data state
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [stats, setStats] = useState<{
    totalVideos: number;
    totalViews: number;
    totalScraped: number;
    totalUploaded: number;
    videoTrend?: TrendInfo;
    viewsTrend?: TrendInfo;
    videoSources?: { domain: string; count: number; percentage: number; totalViews: number }[];
    lastScrapedAt?: string | null;
    statsUpdatedAt?: string | null;
  }>({
    totalVideos: 0,
    totalViews: 0,
    totalScraped: 0,
    totalUploaded: 0,
    videoSources: [],
  });

  const [monthlyTraffic, setMonthlyTraffic] = useState<any[]>(() => getInitialMonthlyTraffic(curYear, curMonth));
  const [visitors, setVisitors] = useState<VisitorsData>({
    available: false,
    message: '',
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
        // Cache in browser sessionStorage/localStorage for 90 seconds (1.5 minutes)
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
    // If selecting current year and selected month is in future, clamp to curMonth
    if (year === curYear && selectedMonth > curMonth) {
      setSelectedMonth(curMonth);
    }
  };

  const selectedMonthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
  const totalMonthViews = monthlyTraffic.reduce((acc, curr) => acc + (Number(curr.views) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Schema Notice if needed */}
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

      {/* Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">Overview</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage your video content and performance.</p>
        </div>

        {/* Dynamic Month Header Badge (top-right badge shows current month/year dynamically) */}
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-sm">
          <Calendar className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{format(new Date(), 'MMMM yyyy')}</span>
        </div>
      </div>

      {/* 4 STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Videos */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Total Videos</span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Video className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white">{stats.totalVideos}</div>
            
            {/* Dynamic Trend Indicator for TOTAL VIDEOS */}
            {stats.videoTrend?.direction === 'increase' && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                <span>{stats.videoTrend.label}</span>
              </div>
            )}
            {stats.videoTrend?.direction === 'decrease' && (
              <div className="mt-1 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                <span>{stats.videoTrend.label}</span>
              </div>
            )}
            {(!stats.videoTrend || stats.videoTrend?.direction === 'neutral') && (
              <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span>{stats.videoTrend?.label || 'No change since yesterday'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Total Views */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Total Views</span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
              {stats.totalViews.toLocaleString()}
            </div>

            {/* Dynamic Trend Indicator for TOTAL VIEWS */}
            {stats.viewsTrend?.direction === 'increase' && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                <span>{stats.viewsTrend.label}</span>
              </div>
            )}
            {stats.viewsTrend?.direction === 'decrease' && (
              <div className="mt-1 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                <span>{stats.viewsTrend.label}</span>
              </div>
            )}
            {(!stats.viewsTrend || stats.viewsTrend?.direction === 'neutral') && (
              <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span>{stats.viewsTrend?.label || '0% from last month'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: All Videos */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">All Videos</span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Film className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white">{stats.totalScraped}</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">MongoDB post (Primary)</div>
          </div>
        </div>

        {/* Card 4: Uploaded Videos - Changed label to Zerostorage stored */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Uploaded Videos</span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Upload className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white">{stats.totalUploaded}</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Zerostorage stored</div>
          </div>
        </div>
      </div>

      {/* DAILY TRAFFIC LINE GRAPH WITH MONTH/YEAR PICKER CONTROLS */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-lg p-2 text-zinc-800 dark:text-zinc-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-black dark:text-white">Daily Traffic</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Daily view traffic for {selectedMonthLabel} ({totalMonthViews.toLocaleString()} total views).
              </p>
            </div>
          </div>

          {/* Month/Year Picker Controls (Replacing old 'Month Total' text) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 shadow-sm">
              {/* Prev Month Button */}
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={selectedYear === 2023 && selectedMonth === 0}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Previous Month"
                aria-label="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Month Selector */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-black dark:text-white px-2 py-1 focus:outline-none cursor-pointer"
                aria-label="Select Month"
              >
                {MONTH_NAMES.map((name, index) => {
                  const isFutureMonth = selectedYear === curYear && index > curMonth;
                  return (
                    <option 
                      key={name} 
                      value={index} 
                      disabled={isFutureMonth}
                      className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                    >
                      {name}
                    </option>
                  );
                })}
              </select>

              {/* Year Selector */}
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="bg-transparent text-xs font-semibold text-black dark:text-white px-2 py-1 border-l border-zinc-200 dark:border-zinc-800 focus:outline-none cursor-pointer"
                aria-label="Select Year"
              >
                {availableYears.map((yr) => (
                  <option 
                    key={yr} 
                    value={yr}
                    className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                  >
                    {yr}
                  </option>
                ))}
              </select>

              {/* Next Month Button */}
              <button
                type="button"
                onClick={handleNextMonth}
                disabled={isCurrentMonthAndYear}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Next Month"
                aria-label="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-[320px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={monthlyTraffic} 
              margin={{ top: 12, right: 12, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#27272a' : '#f4f4f5'} />
              <XAxis 
                dataKey="date" 
                stroke={isDark ? '#a1a1aa' : '#71717a'} 
                fontSize={11} 
                tickLine={false} 
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke={isDark ? '#a1a1aa' : '#71717a'} 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDark ? '#000000' : '#ffffff', 
                  borderColor: isDark ? '#27272a' : '#e4e4e7', 
                  color: isDark ? '#ffffff' : '#000000',
                  borderRadius: '8px', 
                  fontSize: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: isDark ? '#ffffff' : '#000000' }}
                labelStyle={{ color: isDark ? '#a1a1aa' : '#71717a' }}
                formatter={(value: any) => [`${Number(value).toLocaleString()} views`, 'Traffic']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="views" 
                name="Traffic"
                stroke={isDark ? '#ffffff' : '#000000'} 
                strokeWidth={2}
                dot={{ r: 3, fill: isDark ? '#ffffff' : '#000000', strokeWidth: 1 }}
                activeDot={{ r: 6, fill: isDark ? '#ffffff' : '#000000' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* VISITORS ANALYTICS CARDS (Device Breakdown & Country Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Device Breakdown (Replaces Views in Last 7 Days) */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-semibold text-black dark:text-white">Device Breakdown</h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Distribution across platforms for {selectedMonthLabel}.
              </p>
            </div>
            {visitors.available && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
                Live
              </span>
            )}
          </div>

          {!visitors.available ? (
            /* Database Fallback Warning inside card */
            <div className="h-[230px] flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
              <div className="p-2.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-2.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Visitors Collection Not Found
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                The <code className="font-mono text-zinc-700 dark:text-zinc-300">visitors</code> collection does not exist in MongoDB. Device telemetry is unavailable.
              </p>
            </div>
          ) : visitors.devices.length === 0 ? (
            <div className="h-[230px] flex items-center justify-center text-xs text-zinc-500">
              No device records recorded for {selectedMonthLabel}.
            </div>
          ) : (
            <div className="h-[230px] flex flex-col justify-center space-y-3">
              {visitors.devices.map((device) => (
                <div key={device.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{device.name}</span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {device.count.toLocaleString()} ({device.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-black dark:bg-white rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, device.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Country Breakdown (Replaces Content Ratio) */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-semibold text-black dark:text-white">Country Breakdown</h3>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                View distribution by geographic region for {selectedMonthLabel}.
              </p>
            </div>
            {visitors.available && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
                Live
              </span>
            )}
          </div>

          {!visitors.available ? (
            /* Database Fallback Warning inside card */
            <div className="h-[230px] flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
              <div className="p-2.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-2.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Visitors Collection Not Found
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                The <code className="font-mono text-zinc-700 dark:text-zinc-300">visitors</code> collection does not exist in MongoDB. Geographic view metrics are unavailable.
              </p>
            </div>
          ) : visitors.countries.length === 0 ? (
            <div className="h-[230px] flex items-center justify-center text-xs text-zinc-500">
              No country view records found for {selectedMonthLabel}.
            </div>
          ) : (
            <div className="h-[230px] flex flex-col justify-center space-y-3">
              {visitors.countries.slice(0, 5).map((country) => (
                <div key={country.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{country.name}</span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {country.count.toLocaleString()} ({country.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-black dark:bg-white rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, country.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Browser Usage (New Analytics Card below) */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <h3 className="text-sm font-semibold text-black dark:text-white">Browser Usage</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Traffic distribution across web and mobile browsers (Chrome, Safari, Firefox, Edge) for {selectedMonthLabel}.
            </p>
          </div>
          {visitors.available && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
              Live
            </span>
          )}
        </div>

        {!visitors.available ? (
          /* Database Fallback Warning inside card */
          <div className="h-[180px] flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
            <div className="p-2.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-2.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Visitors Collection Not Found
            </span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[320px]">
              The <code className="font-mono text-zinc-700 dark:text-zinc-300">visitors</code> collection does not exist in MongoDB. Browser analytics are unavailable.
            </p>
          </div>
        ) : visitors.browsers.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-xs text-zinc-500">
            No browser telemetry recorded for {selectedMonthLabel}.
          </div>
        ) : (
          <div className="h-[180px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitors.browsers} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#27272a' : '#f4f4f5'} />
                <XAxis dataKey="name" stroke={isDark ? '#a1a1aa' : '#71717a'} fontSize={11} tickLine={false} />
                <YAxis stroke={isDark ? '#a1a1aa' : '#71717a'} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: isDark ? '#000000' : '#ffffff', 
                    borderColor: isDark ? '#27272a' : '#e4e4e7', 
                    color: isDark ? '#ffffff' : '#000000',
                    borderRadius: '8px', 
                    fontSize: '12px' 
                  }}
                  itemStyle={{ color: isDark ? '#ffffff' : '#000000' }}
                  labelStyle={{ color: isDark ? '#a1a1aa' : '#71717a' }}
                  formatter={(val: any) => [`${val} visitors`, 'Count']}
                />
                <Bar dataKey="count" fill={isDark ? '#ffffff' : '#000000'} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
