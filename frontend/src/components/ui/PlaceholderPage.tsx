'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, CheckCircle2, Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  moduleBadge: string;
  tagline: string;
  description: string;
  plannedFeatures: string[];
  roadmapPhase: string;
}

export function PlaceholderPage({
  title,
  moduleBadge,
  tagline,
  description,
  plannedFeatures,
  roadmapPhase,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      {/* Return to Overview Button */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Return to Overview Dashboard</span>
      </Link>

      {/* Main Notice Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                {moduleBadge}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {roadmapPhase}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-2">
              {title}
            </h1>
            <p className="text-sm font-medium text-teal-700 mt-0.5">{tagline}</p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 self-start sm:self-center">
            <Construction className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Scheduled in Roadmap</span>
              <span className="text-slate-500">Not active in Module 1 shell</span>
            </div>
          </div>
        </div>

        {/* Module Scope & Architectural Intent */}
        <div className="mt-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-xs">
            Module Scope &amp; Architectural Objectives
          </h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-3xl">
            {description}
          </p>
        </div>

        {/* Planned Features List */}
        <div className="mt-6">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Planned Technical Deliverables:
          </h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {plannedFeatures.map((feat, index) => (
              <div
                key={index}
                className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700"
              >
                <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scope Restriction Governance Box */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <span>Scope Restriction Assurance (Module 1 Foundation)</span>
          </div>
          <p className="mt-1 text-slate-500 leading-relaxed">
            In strict compliance with the development specification, this module has not been prematurely implemented. Database schemas, AI inference jobs, and business workflow transitions will be authored in their designated roadmap sequence to preserve software integrity and maintainable boundaries.
          </p>
        </div>
      </div>
    </div>
  );
}
