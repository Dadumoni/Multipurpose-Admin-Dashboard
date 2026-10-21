import React from 'react';
import { Smartphone, AlertTriangle } from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip 
} from 'recharts';

export const DEVICE_COLORS = ['#bbf7f9', '#e6739f', '#fef08a', '#d9c814', '#be185d', '#8b5cf6'];

interface DeviceItem {
  name: string;
  count: number;
  percentage: number;
}

interface DeviceBreakdownCardProps {
  available: boolean;
  message?: string;
  devices: DeviceItem[];
  selectedMonthLabel: string;
  isDark: boolean;
}

export default function DeviceBreakdownCard({
  available,
  message,
  devices,
  selectedMonthLabel,
  isDark,
}: DeviceBreakdownCardProps) {
  return (
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
            {message || 'No visitor records recorded yet in visitor_views.'}
          </p>
        </div>
      ) : devices.length === 0 ? (
        <div className="h-[230px] flex items-center justify-center text-xs text-zinc-500">
          No device records recorded for {selectedMonthLabel}.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-2">
          <div className="h-[200px] w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={devices}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={0}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
                    if (percent < 0.05) return null;
                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.58;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="#292524"
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="text-xs font-bold"
                      >
                        {`${Math.round(percent * 100)}%`}
                      </text>
                    );
                  }}
                  labelLine={false}
                  stroke={isDark ? '#09090b' : '#ffffff'}
                  strokeWidth={2}
                >
                  {devices.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={DEVICE_COLORS[index % DEVICE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#000000' : '#ffffff',
                    borderColor: isDark ? '#27272a' : '#e4e4e7',
                    color: isDark ? '#ffffff' : '#000000',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(val: any, name: any) => [`${val} visitors`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with matching colors */}
          <div className="flex-1 w-full space-y-2.5">
            {devices.map((device, index) => (
              <div key={device.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: DEVICE_COLORS[index % DEVICE_COLORS.length] }}
                  />
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{device.name}</span>
                </div>
                <span className="font-mono text-zinc-500 dark:text-zinc-400">
                  {device.count.toLocaleString()} ({device.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
