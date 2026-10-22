'use client';

import React from 'react';
import Link from 'next/link';
import { FileCheck2, Activity, ArrowRight, CheckCircle2, Cpu } from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';

export function CoreInnovationsBanner() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white">
          <Cpu className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Platform Core Innovations — SIH Problem Statement 26262
          </h2>
          <p className="text-xs text-slate-500">
            Transforming AICTE regulatory governance with document understanding and explainable latency models.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {MOCK_DASHBOARD_DATA.innovations.map((inno) => (
          <div
            key={inno.id}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between hover:border-teal-300 hover:bg-slate-50 transition-all group"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800">
                    {inno.id === 'inno-doc-ai' ? (
                      <FileCheck2 className="h-4 w-4" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-slate-900 group-hover:text-teal-900 transition-colors">
                      {inno.title}
                    </h3>
                    <p className="text-[10px] text-teal-700 font-medium">
                      {inno.subtitle}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {inno.targetModule.split(':')[0]}
                </span>
              </div>

              <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                {inno.description}
              </p>

              <div className="mt-3 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-700 block">
                  Key Technical Capabilities:
                </span>
                {inno.benefits.map((b, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                    <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 italic">
                {inno.status}
              </span>

              <Link
                href={inno.id === 'inno-doc-ai' ? '/documents' : '/bottlenecks'}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 group-hover:translate-x-0.5 transition-transform"
              >
                <span>Explore Architecture</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
