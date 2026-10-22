'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNavbar } from '@/components/layout/TopNavbar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth pages have standalone full-page presentation
  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/confirm-email') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/access-denied');

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
          {children}
        </main>
        <footer className="border-t border-slate-800 bg-slate-950 py-3 text-center text-xs text-slate-500">
          AICTE Approval Intelligence Platform (AIP) • SIH Problem Statement 26262 Prototype
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Persistent Desktop / Drawer Mobile Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Execution Column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-x-hidden">
        {/* Top Operational Navigation */}
        <TopNavbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        {/* Dynamic Page Content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Sovereign Platform Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
            <span>
              <strong>AICTE Approval Intelligence Platform (AIP)</strong> — Prototype for Smart India Hackathon PS 26262
            </span>
            <span className="text-[11px] text-slate-400">
              Module 2: Authentication &amp; Role-Based Access Control
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
