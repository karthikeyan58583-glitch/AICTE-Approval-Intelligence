'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, ArrowRight } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';
import { UrgencyLevel } from '@/types/dashboard';
import { cn } from '@/lib/utils';

export function ActionRequiredList() {
  const getUrgencyBadge = (urgency: UrgencyLevel) => {
    switch (urgency) {
      case 'critical':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'high':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'medium':
        return 'bg-sky-100 text-sky-800 border-sky-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Immediate Officer Attention Required
            </h2>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
              {MOCK_DASHBOARD_DATA.actionRequiredItems.length} Urgent Items
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Filings with expiring deficiency response windows or algorithmic discrepancy alerts.
          </p>
        </div>

        <Link
          href="/alerts"
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
        >
          <span>View All Alerts</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {MOCK_DASHBOARD_DATA.actionRequiredItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border p-3.5 transition-all text-xs',
              item.urgency === 'critical'
                ? 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className={cn(
                    'h-4 w-4 shrink-0 mt-0.5',
                    item.urgency === 'critical'
                      ? 'text-rose-600'
                      : item.urgency === 'high'
                      ? 'text-amber-600'
                      : 'text-sky-600'
                  )}
                />
                <div>
                  <h3 className="font-bold text-slate-900 text-xs">{item.title}</h3>
                  <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                    {item.institutionName} •{' '}
                    <span className="font-mono text-slate-800">{item.applicationNumber}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
                    getUrgencyBadge(item.urgency)
                  )}
                >
                  {item.urgency}
                </span>

                <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Due: <strong>{item.dueDate}</strong>
                </span>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-slate-600 pl-6 leading-relaxed">
              <strong>Trigger Cause:</strong> {item.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
