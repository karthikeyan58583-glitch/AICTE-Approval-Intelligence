'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Building,
  Info,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured, getSupabaseConfigError } from '@/lib/supabase/config';

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const configured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

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
      setErrorMessage('Password must be at least 8 characters long for regulatory security.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const origin = window.location.origin;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
          data: {
            full_name: fullName.trim(),
            institution_name: institutionName.trim(),
            // Immutable assignment: All public self-registrations default to applicant role
            role: 'applicant_institution_representative',
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      // Check if user email confirmation is required by Supabase project settings
      if (data.user && data.session) {
        // Immediate login permitted (e.g. email confirmations disabled in local dev)
        router.push('/');
      } else {
        // Email verification dispatched
        router.push(`/confirm-email?email=${encodeURIComponent(email)}`);
      }
    } catch (err: unknown) {
      const errObj = err as Error;
      setErrorMessage(errObj.message || 'An unexpected registration error occurred.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white font-black text-xl shadow-lg mb-2">
          AIP
        </div>
        <h1 className="text-2xl font-black text-white">
          Institutional Representative Registration
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          AICTE Approval Process Handbook (APH) Intake Portal
        </p>
      </div>

      {/* Main Registration Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Role Enforcement Assurance Notice */}
        <div className="rounded-xl border border-teal-800/80 bg-teal-950/40 p-3 text-xs text-teal-200 mb-5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-teal-300">
                Authorized Persona: Applicant Institution Representative
              </span>
              <p className="text-[11px] text-teal-200/80 mt-0.5 leading-relaxed">
                Public self-registration assigns the applicant representative role for institutional filing, deficiency resolution, and status tracking. Privileged scrutiny and hearing committee roles are assigned strictly through administrative delegation.
              </p>
            </div>
          </div>
        </div>

        {/* Supabase Configuration Required Banner */}
        {!configured && (
          <div className="mb-5 rounded-xl border border-amber-800/80 bg-amber-950/40 p-3 text-xs text-amber-200">
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

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-800/80 bg-rose-950/50 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Authorized Representative Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Anand Varma / Principal / Director"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Official Institutional Name
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. National Institute of Technology & Science"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Official Email Address (Primary Contact)
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="representative@institution.edu.in"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Password (min 8 chars)
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Confirm Password
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
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 px-4 text-xs font-bold text-white shadow-md hover:bg-teal-500 focus:outline-hidden focus:ring-2 focus:ring-teal-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <span>Registering Institution Account...</span>
            ) : (
              <>
                <span>Complete Registration</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center">
          <p className="text-xs text-slate-400">
            Already have an authorized institutional account?{' '}
            <Link
              href="/login"
              className="font-semibold text-teal-400 hover:text-teal-300 hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
