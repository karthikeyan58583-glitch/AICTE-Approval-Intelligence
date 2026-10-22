'use client';

import React from 'react';
import { DemoDataNotice } from '@/components/dashboard/DemoDataNotice';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { StageDistributionChart } from '@/components/dashboard/StageDistributionChart';
import { RecentActivityTable } from '@/components/dashboard/RecentActivityTable';
import { ActionRequiredList } from '@/components/dashboard/ActionRequiredList';
import { CoreInnovationsBanner } from '@/components/dashboard/CoreInnovationsBanner';
import { ShieldCheck, Building2, Calendar } from 'lucide-react';
import { MOCK_DASHBOARD_DATA, CURRENT_OFFICER_PROFILE } from '@/lib/mock-data';

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      {/* Top Welcome / Platform Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 border border-teal-200">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
              Sovereign Regulatory Operations
            </span>
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Cycle: {MOCK_DASHBOARD_DATA.academicYear}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">
            AICTE Approval Intelligence Platform
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
            Automating compliance verification, orchestrating statutory committee reviews, and providing explainable bottleneck telemetry for technical education approvals across India.
          </p>
        </div>

        {/* Quick Regional Office Context Box */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs self-start md:self-auto shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Building2 className="h-4 w-4 text-teal-600" />
            <span>{CURRENT_OFFICER_PROFILE.office}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Active Officer: <span className="font-semibold text-slate-700">{CURRENT_OFFICER_PROFILE.name}</span>
          </p>
          <div className="text-[10px] text-teal-700 font-medium mt-1">
            Status: <span className="text-emerald-600 font-bold">● Online</span> • Jurisdiction: 6 Regional Zones
          </div>
        </div>
      </div>

      {/* 1. Mandatory Demonstration Data Warning Banner */}
      <DemoDataNotice />

      {/* 2. Key Executive Summary Metric Cards (4 Cards) */}
      <SummaryCards />

      {/* 3. Stage-wise Distribution Visualisation & Bottleneck Hotspots */}
      <StageDistributionChart />

      {/* 4. Action Required and Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Recent Activity Table */}
          <RecentActivityTable />
        </div>
        <div className="lg:col-span-1">
          {/* Items Requiring Urgent Officer Attention */}
          <ActionRequiredList />
        </div>
      </div>

      {/* 5. Core Innovations Spotlight (Document Intelligence & Bottleneck Detection) */}
      <CoreInnovationsBanner />
    </div>
  );
}
