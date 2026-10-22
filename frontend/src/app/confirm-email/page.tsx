'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MailCheck, ArrowRight } from 'lucide-react';

function ConfirmEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'your institutional email address';

  return (
    <div className="w-full max-w-md text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600/20 text-teal-400 border border-teal-500/30 mb-4 shadow-xl">
        <MailCheck className="h-8 w-8" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <h1 className="text-xl font-bold text-white">
          Institutional Verification Dispatched
        </h1>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          A secure verification link has been transmitted to:
        </p>
        <div className="my-3 rounded-lg bg-slate-950 p-2.5 font-mono text-xs font-semibold text-teal-300 border border-slate-800 truncate">
          {email}
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Please check your inbox and click the verification link to activate your institutional representative account and commence AICTE filing workflows.
        </p>

        <div className="mt-6 pt-5 border-t border-slate-800">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-teal-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-teal-500 transition-colors"
          >
            <span>Proceed to Sign In</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="text-white text-xs">Loading verification status...</div>}>
      <ConfirmEmailContent />
    </Suspense>
  );
}
