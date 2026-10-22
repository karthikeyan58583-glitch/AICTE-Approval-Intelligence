'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Menu,
  Search,
  Bell,
  AlertCircle,
  ChevronDown,
  ShieldCheck,
  X,
  LogOut,
  UserCheck,
  KeyRound,
} from 'lucide-react';
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-data';
import { useAuth } from '@/lib/auth/AuthContext';
import { ROLE_METADATA } from '@/lib/auth/roles';

interface TopNavbarProps {
  onToggleSidebar: () => void;
}

export function TopNavbar({ onToggleSidebar }: TopNavbarProps) {
  const pathname = usePathname();
  const { user, role, isConfigured, isAuthenticated, signOut } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Determine current page name for header breadcrumb
  const pageTitle =
    pathname === '/'
      ? 'Overview'
      : pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2);

  const roleMeta = ROLE_METADATA[role] || ROLE_METADATA.applicant_institution_representative;

  const displayName = user?.fullName || (isConfigured ? 'Officer' : 'Dr. Ramesh Sundaram');
  const displayEmail = user?.email || (isConfigured ? '' : 'ramesh.sundaram@aicte-india.org');
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 backdrop-blur-xs">
      {/* Left: Mobile hamburger & route breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-hidden focus:ring-2 focus:ring-teal-600"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>AICTE Approval Intelligence</span>
            <span>/</span>
            <span className="text-teal-700 font-semibold">{pageTitle}</span>
          </div>
          <h1 className="text-base font-bold text-slate-900 leading-none mt-0.5">
            {pageTitle === 'Overview'
              ? 'Institutional Approval Operations Dashboard'
              : `${pageTitle} Module`}
          </h1>
        </div>
      </div>

      {/* Middle: Search affordance */}
      <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search applications, institutions, or PID... (Demo)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-slate-50/80 py-1.5 pl-9 pr-12 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-600 transition-colors"
          />
          <kbd className="absolute right-2.5 top-2 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right side controls: Role Badge, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Role Badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${roleMeta.colorClass}`}
          title={`Active Regulatory Persona: ${roleMeta.title}`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-[11px]">{roleMeta.badgeLabel}</span>
        </div>

        {/* Notifications Popover Affordance */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
            aria-label="View system alerts"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              {MOCK_DASHBOARD_DATA.actionRequiredItems.length}
            </span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-900">
                  Operational Notifications ({MOCK_DASHBOARD_DATA.actionRequiredItems.length})
                </span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {MOCK_DASHBOARD_DATA.actionRequiredItems.map((item) => (
                  <div key={item.id} className="py-2.5 px-1 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.institutionName} ({item.applicationNumber})
                        </div>
                        <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                          Action Due: {item.dueDate}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-2 text-center">
                <span className="text-[11px] text-slate-500 italic">
                  Demonstration Alert Queue — Full engine in Module 6
                </span>
              </div>
            </div>
          )}
        </div>

        {/* User Profile & Session Controls */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-teal-300 font-semibold text-xs border border-slate-700">
              {initials}
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {displayName}
              </span>
              <span className="text-[10px] text-slate-500 leading-tight">
                {roleMeta.badgeLabel}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50">
              <div className="border-b border-slate-100 pb-2.5">
                <p className="text-xs font-bold text-slate-900">{displayName}</p>
                {displayEmail && (
                  <p className="text-[11px] text-slate-500 truncate">{displayEmail}</p>
                )}
                <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 border border-teal-200">
                  <UserCheck className="h-3 w-3" />
                  {roleMeta.title}
                </div>
              </div>

              <div className="py-2 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Jurisdiction &amp; Office:</p>
                <p className="text-slate-500">
                  {user?.institutionName || user?.regionalOffice || 'Southern Regional Office (SRO)'}
                </p>
              </div>

              <div className="border-t border-slate-100 pt-2 flex flex-col gap-1">
                {isAuthenticated ? (
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 transition-colors"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>Sign In to Your Account</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
