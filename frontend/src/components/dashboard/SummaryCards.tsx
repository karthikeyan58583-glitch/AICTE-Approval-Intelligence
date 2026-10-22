'use client';

import React from 'react';
import { Files, Clock3, FileSearch, AlertTriangle } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const METRIC_ICON_MAP: Record<string, React.ElementType> = {
  Files,
  Clock3,
  FileSearch,
  AlertTriangle,
};

export function SummaryCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {MOCK_DASHBOARD_DATA.metrics.map((metric) => {
        const Icon = METRIC_ICON_MAP[metric.iconName] || Files;

        return (
          <div
            key={metric.id}
            className={cn(
              'rounded-xl border bg-white p-5 shadow-xs transition-all hover:shadow-md hover:border-slate-300',
              metric.tone === 'critical'
                ? 'border-rose-200/90 bg-gradient-to-b from-rose-50/20 to-white'
                : metric.tone === 'warning'
                ? 'border-amber-200/90 bg-gradient-to-b from-amber-50/20 to-white'
                : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {metric.title}
              </span>
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  metric.tone === 'critical'
                    ? 'bg-rose-100 text-rose-700'
                    : metric.tone === 'warning'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-teal-50 text-teal-700 border border-teal-100'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 font-mono">
                {metric.formattedValue}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span
                className={cn(
                  'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
                  metric.tone === 'critical'
                    ? 'bg-rose-100 text-rose-800'
                    : metric.tone === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                )}
              >
                {metric.changeLabel}
              </span>
            </div>

            <p className="mt-2 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
              {metric.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
