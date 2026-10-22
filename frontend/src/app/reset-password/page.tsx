'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, ArrowRight, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase/config';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const configured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

  const handlePasswordUpdate = async (e: React.FormEvent) => {
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

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your entries.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setSuccessMessage('Password updated successfully! Redirecting to sign in...');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: unknown) {
      const errObj = err as Error;
      setErrorMessage(errObj.message || 'An error occurred while updating your password.');
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
          Set New Account Password
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          AICTE Approval Intelligence Platform
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
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

        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              New Password (min 8 chars)
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
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
              <span>Updating Credentials...</span>
            ) : (
              <>
                <span>Save New Password</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center">
          <Link
            href="/login"
            className="text-xs font-semibold text-teal-400 hover:text-teal-300 hover:underline"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
