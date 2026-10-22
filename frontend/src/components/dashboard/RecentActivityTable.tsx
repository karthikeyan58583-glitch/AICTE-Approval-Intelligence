'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';
import { ApplicationStatus } from '@/types/dashboard';
import { cn } from '@/lib/utils';

export function RecentActivityTable() {
  const getStatusBadge = (status: ApplicationStatus) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'Deficiencies Communicated':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'At Risk':
        return 'bg-rose-50 text-rose-800 border-rose-300';
      case 'Inspection Scheduled':
        return 'bg-sky-50 text-sky-800 border-sky-300';
      case 'Under Review':
        return 'bg-indigo-50 text-indigo-800 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 border-b border-slate-200 bg-white gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Recent Institutional Applications &amp; Scrutiny Stream
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active filings undergoing verification, committee reviews, and deficiency reconciliation.
          </p>
        </div>

        <Link
          href="/applications"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
        >
          <span>View All 384 Active Applications</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Application ID</th>
              <th className="py-3 px-4">Institution Name</th>
              <th className="py-3 px-4">Programme &amp; State</th>
              <th className="py-3 px-4">Current Stage</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-center">Stage Latency</th>
              <th className="py-3 px-4 text-center">AI Discrepancies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {MOCK_DASHBOARD_DATA.recentApplications.map((app) => (
              <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                  {app.applicationNumber}
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-slate-900 leading-snug">
                    {app.institutionName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Submitted: {app.submittedDate} • Last Action: {app.lastUpdated}
                  </div>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <div className="text-slate-900 font-medium">{app.programme}</div>
                  <div className="text-[11px] text-slate-500">
                    {app.state} ({app.region})
                  </div>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="text-slate-800 font-medium">
                    {app.currentStage}
                  </span>
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border',
                      getStatusBadge(app.status)
                    )}
                  >
                    {app.status}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 font-mono font-semibold px-2 py-0.5 rounded text-xs',
                      app.daysInCurrentStage > 14
                        ? 'text-rose-700 bg-rose-50 border border-rose-200'
                        : 'text-slate-700 bg-slate-100'
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {app.daysInCurrentStage}d
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  {app.flaggedDiscrepancies > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-bold text-amber-800 border border-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {app.flaggedDiscrepancies} Flagged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 border border-emerald-200">
                      <ShieldCheck className="h-3 w-3" /> Clean
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
