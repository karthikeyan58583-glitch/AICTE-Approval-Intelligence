'use client';

import React from 'react';
import { Info, Sparkles } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';

export function DemoDataNotice() {
  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/90 via-sky-50/60 to-slate-50 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white mt-0.5">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs uppercase tracking-wider text-teal-900 bg-teal-100/90 px-2 py-0.5 rounded border border-teal-300">
                Demonstration Data Mode
              </span>
              <span className="text-xs text-slate-700 font-semibold">
                Smart India Hackathon 2026 — Problem Statement 26262
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              All institutional filings, applications ({MOCK_DASHBOARD_DATA.academicYear}), and timeline telemetry shown on this dashboard are <strong>fictional demonstration records</strong> designed to evaluate workflow automation and delay attribution. No live AICTE production systems are connected in Module 1.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-center text-[11px] text-teal-800 font-medium bg-white/80 border border-teal-200 px-3 py-1 rounded-full shadow-2xs">
          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
          <span>Module 1: Verified Architecture</span>
        </div>
      </div>
    </div>
  );
}
