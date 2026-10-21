import React from 'react';
import { Globe, AlertTriangle } from 'lucide-react';

export const COUNTRY_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#64748b'];

interface CountryItem {
  name: string;
  count: number;
  percentage: number;
}

interface TopCountriesCardProps {
  available: boolean;
  message?: string;
  countries: CountryItem[];
  selectedMonthLabel: string;
}

export default function TopCountriesCard({
  available,
  message,
  countries,
  selectedMonthLabel,
}: TopCountriesCardProps) {
  return (
    <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-sm font-semibold text-black dark:text-white">Top Countries by Views</h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            View distribution by geographic region for {selectedMonthLabel}.
          </p>
        </div>
        {available && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
            Live
          </span>
        )}
      </div>

      {!available ? (
        <div className="h-[230px] flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="p-2.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-2.5">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Visitor Telemetry Unavailable
          </span>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
            {message || 'No geographic visitor view records recorded yet in visitor_views.'}
          </p>
        </div>
      ) : countries.length === 0 ? (
        <div className="h-[230px] flex items-center justify-center text-xs text-zinc-500">
          No country view records found for {selectedMonthLabel}.
        </div>
      ) : (
        <div className="h-[230px] flex flex-col justify-center space-y-3.5">
          {countries.slice(0, 6).map((country, index) => (
            <div key={country.name} className="flex items-center justify-between gap-3 text-xs">
              <span className="w-28 sm:w-36 truncate font-medium text-zinc-800 dark:text-zinc-200 shrink-0">
                {country.name}
              </span>

              {/* Rounded pill progress bar */}
              <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${Math.min(100, Math.max(6, country.percentage))}%`,
                    backgroundColor: COUNTRY_COLORS[index % COUNTRY_COLORS.length]
                  }}
                />
              </div>

              <div className="font-mono text-zinc-600 dark:text-zinc-300 text-right w-24 shrink-0">
                <span className="font-semibold text-black dark:text-white">{country.count.toLocaleString()}</span>{' '}
                <span className="text-zinc-500 dark:text-zinc-400">({country.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
