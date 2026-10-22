'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase/config';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const configured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!configured) {
      setErrorMessage(
        configError ||
          'Supabase is not configured yet. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local and restart Next.js.'
      );
      return;
    }

    if (!email) {
      setErrorMessage('Please provide your institutional email address.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const origin = window.location.origin;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setSuccessMessage(
        'A password recovery link has been dispatched to your institutional email. Please follow the instructions in the email.'
      );
      setIsLoading(false);
    } catch (err: unknown) {
      const errObj = err as Error;
      setErrorMessage(errObj.message || 'An error occurred while requesting password recovery.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white font-black text-xl shadow-lg mb-2">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">
          Password Recovery
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          AICTE Approval Intelligence Platform
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          Enter the official institutional email address associated with your regulatory account. We will transmit a secure, one-time recovery link.
        </p>

        {errorMessage && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-800/80 bg-rose-950/50 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-800/80 bg-emerald-950/50 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleResetRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Institutional Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@aicte-india.org or rep@college.edu"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span>Dispatching Recovery Email...</span>
            ) : (
              <>
                <span>Send Password Reset Link</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
