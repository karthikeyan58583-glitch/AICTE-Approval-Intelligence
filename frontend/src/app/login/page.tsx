'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase/config';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const reason = searchParams.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const configured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

  const handleLogin = async (e: React.FormEvent) => {
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

    if (!email || !password) {
      setErrorMessage('Please provide both your institutional email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setErrorMessage(
            'Your institutional email has not been confirmed yet. Please check your inbox for the verification link.'
          );
        } else {
          setErrorMessage(error.message || 'Invalid institutional credentials provided.');
        }
        setIsLoading(false);
        return;
      }

      if (data.session) {
        setSuccessMessage('Authentication verified. Redirecting to regulatory dashboard...');
        // Force full refresh to let proxy update cookies and authorization headers
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 600);
      }
    } catch (err: unknown) {
      const errObj = err as Error;
      setErrorMessage(errObj.message || 'An unexpected error occurred during authentication.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Sovereign Header Emblem */}
      <div className="text-center mb-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white font-black text-2xl shadow-lg shadow-teal-900/40 mb-3">
          AIP
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">
          AICTE Approval Intelligence
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-medium">
          Integrated Regulatory Governance &amp; Compliance Portal
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white">Sign In to Regulatory Portal</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your credentials to access your assigned queue
            </p>
          </div>
          <ShieldCheck className="h-6 w-6 text-teal-400" />
        </div>

        {/* Missing Supabase Configuration Notice */}
        {!configured && (
          <div className="mt-4 rounded-xl border border-amber-800/80 bg-amber-950/40 p-3.5 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300">Supabase Project Configuration Required</p>
                <p className="text-[11px] text-amber-200/80 mt-1 leading-relaxed">
                  {configError ||
                    'Real credentials are required for live authentication. Save your project values to frontend/.env.local and restart Next.js:'}
                </p>
                <div className="mt-2 rounded bg-slate-950/80 p-2 font-mono text-[10px] text-slate-300 select-all">
                  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
                  <br />
                  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Access Restriction Notice */}
        {reason === 'setup_required' && configured && (
          <div className="mt-4 rounded-xl border border-sky-800/80 bg-sky-950/40 p-3 text-xs text-sky-200">
            Please sign in with your authorized institutional credentials to continue.
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-800/80 bg-rose-950/50 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-800/80 bg-emerald-950/50 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Fields */}
        <form onSubmit={handleLogin} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Institutional Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="officer@aicte-india.org or rep@college.edu"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Security Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-teal-400 hover:text-teal-300 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span>Verifying Credentials...</span>
            ) : (
              <>
                <span>Sign In to Platform</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Registration Link */}
        <div className="mt-6 border-t border-slate-800 pt-4 text-center">
          <p className="text-xs text-slate-400">
            Applicant Institution Representative?{' '}
            <Link
              href="/register"
              className="font-semibold text-teal-400 hover:text-teal-300 hover:underline"
            >
              Register Institutional Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-white text-xs">Loading authentication portal...</div>}>
      <LoginForm />
    </Suspense>
  );
}
