'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileSpreadsheet,
  FileCheck2,
  Activity,
  ShieldAlert,
  BellRing,
  BarChart3,
  Settings,
  X,
  Building2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { getNavItemsForRole, ROLE_METADATA } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  FileSpreadsheet,
  FileCheck2,
  Activity,
  ShieldAlert,
  BellRing,
  BarChart3,
  Settings,
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, role, isConfigured } = useAuth();

  // Role-filtered navigation menu items
  const authorizedNavItems = getNavItemsForRole(role);
  const roleMeta = ROLE_METADATA[role] || ROLE_METADATA.applicant_institution_representative;

  // Derive display initials
  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'AI';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 text-slate-100 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-18 items-center justify-between border-b border-slate-800 px-5">
          <Link href="/" className="flex items-center gap-3 group focus:outline-hidden" onClick={onClose}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white font-bold text-lg shadow-sm group-hover:bg-teal-500 transition-colors">
              AIP
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-wide text-white leading-tight">
                AICTE Approval
              </span>
              <span className="text-xs text-teal-400 font-medium">
                Intelligence Platform
              </span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            onClick={onClose}
            aria-label="Close navigation sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Regulatory Authority Sub-badge */}
        <div className="mx-4 my-3 rounded-md bg-slate-800/80 border border-slate-700/60 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium truncate">
              <Building2 className="h-4 w-4 text-teal-400 shrink-0" />
              <span className="truncate">SIH PS 26262 Prototype</span>
            </div>
            <span className="text-[10px] rounded bg-teal-950 px-1.5 py-0.5 text-teal-300 font-semibold border border-teal-800/60 shrink-0">
              Module 2 RBAC
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            {roleMeta.title}
          </p>
        </div>

        {/* Navigation Menu Links (Role-Governed) */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="flex items-center justify-between px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Authorized Menu</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {authorizedNavItems.length} routes
            </span>
          </div>

          {authorizedNavItems.map((item) => {
            const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150',
                  isActive
                    ? 'bg-teal-700 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                )}
                title={item.description}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-teal-200' : 'text-slate-400 group-hover:text-slate-200'
                    )}
                  />
                  <span className="truncate">{item.name}</span>
                </div>

                {item.badge && (
                  <span
                    className={cn(
                      'ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0',
                      isActive
                        ? 'bg-teal-900/90 text-teal-200 border border-teal-600/40'
                        : item.badgeVariant === 'warning'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : item.badgeVariant === 'info'
                        ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Officer Profile Card */}
        <div className="border-t border-slate-800 p-3 bg-slate-950/60">
          <div className="flex items-center gap-3 rounded-lg bg-slate-900 border border-slate-800 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-900 text-teal-300 font-semibold text-xs border border-teal-700/50">
              {initials}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate text-xs font-medium text-slate-200">
                {user?.fullName || (isConfigured ? 'Authenticated Officer' : 'Demo Officer (Dev)')}
              </span>
              <span className="truncate text-[11px] text-teal-400 font-medium">
                {roleMeta.badgeLabel}
              </span>
              <span className="truncate text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                {user?.institutionName || user?.regionalOffice || 'AICTE Regulatory System'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
