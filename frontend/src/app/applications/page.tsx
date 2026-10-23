'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { fetchApplications } from '@/lib/api/applications';
import { ApplicationRecord, WorkflowStatus, ApplicationType } from '@/types/applications';
import { WORKFLOW_STATUS_METADATA, APPLICATION_TYPE_METADATA } from '@/lib/workflow/state-machine';
import {
  FileText,
  PlusCircle,
  Search,
  Filter,
  Clock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export default function ApplicationsPage() {
  const router = useRouter();
  const { user, role, isAuthenticated, isLoading: authLoading } = useAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchApplications();
      setApplications(data);
    } catch (err) {
      console.error('Failed to load applications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        searchQuery === '' ||
        (app.application_number && app.application_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (app.institution_name && app.institution_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (app.form_data?.head_of_institution && app.form_data.head_of_institution.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'draft' && app.current_status === 'draft') ||
        (statusFilter === 'in_progress' && !['draft', 'approved', 'rejected', 'withdrawn'].includes(app.current_status)) ||
        (statusFilter === 'deficiency' && app.current_status === 'deficiency_resolution') ||
        (statusFilter === 'approved' && app.current_status === 'approved') ||
        (statusFilter === 'rejected' && app.current_status === 'rejected');

      const matchesType = typeFilter === 'all' || app.application_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [applications, searchQuery, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const total = applications.length;
    const drafts = applications.filter((a) => a.current_status === 'draft').length;
    const active = applications.filter((a) => !['draft', 'approved', 'rejected', 'withdrawn'].includes(a.current_status)).length;
    const approved = applications.filter((a) => a.current_status === 'approved').length;
    return { total, drafts, active, approved };
  }, [applications]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              Module 3 — Statutory Workflow Engine
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Academic Session 2026-2027
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Institutional Applications Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage and track statutory technical institute applications through AICTE scrutiny, EVC inspections, and SAC decisions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            title="Refresh list"
            className="p-2.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/applications/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            New Application Intake
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Applications</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stats.total}</div>
          <div className="text-xs text-slate-500 mt-0.5">Under institutional purview</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Active Regulatory Scrutiny</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.active}</div>
          <div className="text-xs text-slate-500 mt-0.5">Scrutiny / EVC / SAC in progress</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Drafts</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-700 dark:text-slate-200 mt-1">{stats.drafts}</div>
          <div className="text-xs text-slate-500 mt-0.5">Incomplete intake records</div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Approved / EoA Issued</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.approved}</div>
          <div className="text-xs text-slate-500 mt-0.5">Statutory approvals granted</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by reference number, institution, or principal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Application Types</option>
              <option value="new_institute">New Institute (LoA)</option>
              <option value="extension_of_approval">Extension of Approval (EoA)</option>
              <option value="course_addition">Course Addition</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Workflow States</option>
              <option value="draft">Drafts Only</option>
              <option value="in_progress">Active Scrutiny & EVC</option>
              <option value="deficiency">Deficiency Resolution</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
            <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-medium text-slate-900 dark:text-white">Loading Applications...</h3>
            <p className="text-sm text-slate-500 mt-1">Retrieving institutional records and workflow states.</p>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No matching applications found'
                : 'No applications created yet'}
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-5">
              {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'Try clearing filters or search terms to display all institutional submissions.'
                : 'Get started by creating your first statutory application intake for Academic Session 2026-2027.'}
            </p>
            <Link
              href="/applications/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition"
            >
              <PlusCircle className="w-4 h-4" />
              Launch Application Intake Wizard
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Reference / Institution</th>
                    <th className="px-5 py-3.5">Type & Session</th>
                    <th className="px-5 py-3.5">Workflow Status</th>
                    <th className="px-5 py-3.5">Last Mutation</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredApplications.map((app) => {
                    const statusMeta = WORKFLOW_STATUS_METADATA[app.current_status];
                    const typeMeta = APPLICATION_TYPE_METADATA[app.application_type];
                    const isDraft = app.current_status === 'draft';

                    return (
                      <tr
                        key={app.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition group"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            {app.application_number ? (
                              <span className="font-mono text-teal-700 dark:text-teal-400">
                                {app.application_number}
                              </span>
                            ) : (
                              <span className="italic text-slate-400 dark:text-slate-500 font-normal">
                                [Unsubmitted Draft]
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-medium">
                            {app.institution_name || app.form_data?.institution_name || 'Institution Record'}
                          </div>
                          {app.form_data?.head_of_institution && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              Principal/Head: {app.form_data.head_of_institution}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
                            {typeMeta ? typeMeta.badge : app.application_type}
                          </span>
                          <div className="text-xs text-slate-400 mt-1">AY {app.academic_year}</div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              statusMeta ? statusMeta.badgeClass : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {statusMeta ? statusMeta.label : app.current_status}
                          </span>
                          {app.current_status === 'deficiency_resolution' && (
                            <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Action Required
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                          <div>{new Date(app.updated_at).toLocaleDateString()}</div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(app.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/applications/${app.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 transition"
                          >
                            {isDraft ? 'Resume Draft' : 'View Dossier'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Statutory Disclaimers */}
      <div className="rounded-lg p-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Statutory Notice: </span>
          Submission of an application does not constitute approval or verification of credentials by AICTE. All submissions are subject to scrutinized verification under the statutory regulations of the AICTE Approval Process Handbook (APH 2026-2027).
        </div>
      </div>
    </div>
  );
}
