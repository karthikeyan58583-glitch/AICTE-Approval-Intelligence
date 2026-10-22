'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, Home, KeyRound } from 'lucide-react';
import { ROLE_METADATA } from '@/lib/auth/roles';
import { AppRole } from '@/types/auth';

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path') || 'Requested Resource';
  const role = (searchParams.get('role') as AppRole) || 'applicant_institution_representative';

  const roleMeta = ROLE_METADATA[role] || ROLE_METADATA.applicant_institution_representative;

  return (
    <div className="w-full max-w-md text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30 mb-4 shadow-xl">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <h1 className="text-xl font-bold text-white">
          403 — Regulatory Access Restricted
        </h1>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Your current authenticated persona is not authorized to access:
        </p>

        <div className="my-3 rounded-lg bg-slate-950 p-2.5 font-mono text-xs font-semibold text-rose-300 border border-slate-800 truncate">
          {path}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 text-left my-4">
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
            Current Authenticated Role:
          </p>
          <div className="flex items-center gap-1.5 mt-1 font-bold text-teal-400">
            <span>{roleMeta.title}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {roleMeta.description}
          </p>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Access to this area requires elevated scrutiny, hearing committee, or executive administrative privileges under AICTE statutory governance rules.
        </p>

        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row gap-2.5">
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-teal-500 transition-colors"
          >
            <Home className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 px-4 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <KeyRound className="h-4 w-4" />
            <span>Switch Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={<div className="text-white text-xs">Loading access validation...</div>}>
      <AccessDeniedContent />
    </Suspense>
  );
}
