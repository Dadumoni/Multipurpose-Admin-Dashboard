import React from 'react';
import { 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export interface DailyTrafficPoint {
  day: number;
  date: string;
  name: string;
  views: number;
}

interface TrafficLineChartProps {
  monthlyTraffic: DailyTrafficPoint[];
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedYear: number;
  handleYearChange: (year: number) => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  isCurrentMonthAndYear: boolean;
  selectedMonthLabel: string;
  totalMonthViews: number;
  monthNames: string[];
  availableYears: number[];
  curYear: number;
  curMonth: number;
  isDark: boolean;
}

export default function TrafficLineChart({
  monthlyTraffic,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  handleYearChange,
  handlePrevMonth,
  handleNextMonth,
  isCurrentMonthAndYear,
  selectedMonthLabel,
  totalMonthViews,
  monthNames,
  availableYears,
  curYear,
  curMonth,
  isDark,
}: TrafficLineChartProps) {
  return (
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

        {/* Month/Year Picker Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 shadow-sm">
            {/* Prev Month Button */}
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={selectedYear === 2023 && selectedMonth === 0}
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
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
              {monthNames.map((name, index) => {
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
              className="p-1.5 rounded-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
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
              formatter={(val: any) => [`${val} views`, 'Traffic']}
              labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
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
  );
}
