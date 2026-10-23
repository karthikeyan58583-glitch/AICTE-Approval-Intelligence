'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  fetchApplicationById,
  fetchWorkflowTimeline,
  transitionApplication,
  updateApplicationDraft,
  submitApplication,
} from '@/lib/api/applications';
import {
  ApplicationRecord,
  WorkflowHistoryRecord,
  WorkflowStatus,
} from '@/types/applications';
import {
  WORKFLOW_STATUS_METADATA,
  APPLICATION_TYPE_METADATA,
  STATUTORY_STEPPER_STAGES,
  canEditApplication,
} from '@/lib/workflow/state-machine';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  ShieldCheck,
  UserCheck,
  Send,
  Save,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Info,
  FolderOpen,
} from 'lucide-react';
import DocumentManagementSection from './DocumentManagementSection';


function ApplicationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const applicationId = params?.id as string;

  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [timeline, setTimeline] = useState<WorkflowHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Transition modal state
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<WorkflowStatus | null>(null);
  const [transitionAction, setTransitionAction] = useState<string>('');
  const [transitionNotes, setTransitionNotes] = useState<string>('');

  // Deficiency reply state
  const [deficiencyReply, setDeficiencyReply] = useState('');
  const [isReplyingDeficiency, setIsReplyingDeficiency] = useState(false);

  // Active view tab state: 'dossier' or 'documents'
  const [activeTab, setActiveTab] = useState<'dossier' | 'documents'>('documents');


  const loadApplication = async () => {
    if (!applicationId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const app = await fetchApplicationById(applicationId);
      if (app) {
        setApplication(app);
        const history = await fetchWorkflowTimeline(applicationId);
        setTimeline(history);
      } else {
        setErrorMsg('Application record not found or access restricted.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to retrieve application details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplication();
  }, [applicationId]);

  const handleExecuteTransition = async () => {
    if (!selectedTransition || !application) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await transitionApplication(
        application.id,
        selectedTransition,
        transitionAction || 'regulatory_transition',
        transitionNotes,
      );
      setShowTransitionModal(false);
      setTransitionNotes('');
      await loadApplication();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to execute statutory transition.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeficiencyResubmission = async () => {
    if (!application || !deficiencyReply.trim()) return;
    setIsReplyingDeficiency(true);
    setErrorMsg(null);
    try {
      await transitionApplication(
        application.id,
        'regional_scrutiny',
        'resubmit_rectification',
        deficiencyReply,
      );
      setDeficiencyReply('');
      await loadApplication();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to resubmit rectification.');
    } finally {
      setIsReplyingDeficiency(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center">
        <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-white">Loading Application Dossier...</h2>
        <p className="text-xs text-slate-500 mt-1">Retrieving official application records and audit logs.</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Application Not Found</h2>
        <p className="text-sm text-slate-500">{errorMsg || 'The requested application could not be accessed.'}</p>
        <Link
          href="/applications"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Directory
        </Link>
      </div>
    );
  }

  const statusMeta = WORKFLOW_STATUS_METADATA[application.current_status];
  const typeMeta = APPLICATION_TYPE_METADATA[application.application_type];
  const isOfficer = ['regional_scrutiny_officer', 'evc_evaluator', 'shc_member', 'aicte_executive_admin'].includes(role);
  const isApplicant = role === 'applicant_institution_representative' || role === 'aicte_executive_admin';
  const isDeficiency = application.current_status === 'deficiency_resolution';

  // Last deficiency note if any
  const lastDeficiency = timeline
    .slice()
    .reverse()
    .find((t) => t.new_status === 'deficiency_resolution');

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Back and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Applications Directory
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white">
              {application.application_number || '[Draft Application]'}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                statusMeta ? statusMeta.badgeClass : 'bg-slate-100'
              }`}
            >
              {statusMeta ? statusMeta.label : application.current_status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
            <span>{application.institution_name || application.form_data?.institution_name}</span>
            <span>•</span>
            <span>AY {application.academic_year}</span>
            <span>•</span>
            <span>Created {new Date(application.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Officer Regulatory Action Button */}
          {isOfficer && (
            <button
              onClick={() => {
                setShowTransitionModal(true);
                setSelectedTransition(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow transition"
            >
              <ShieldCheck className="w-4 h-4 text-teal-400 dark:text-teal-600" />
              Regulatory Actions
            </button>
          )}

          <button
            onClick={loadApplication}
            title="Refresh Dossier"
            className="p-2 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stepper Stage Tracker */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Statutory Progression Lifecycle
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {STATUTORY_STEPPER_STAGES.map((stg, idx) => {
            const isCurrent = application.current_status === stg.status;
            return (
              <div
                key={stg.status}
                className={`p-2.5 rounded-lg border text-center transition ${
                  isCurrent
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-300 font-bold ring-2 ring-teal-500/20'
                    : 'border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 font-medium'
                }`}
              >
                <div className="text-[10px] text-slate-400">{`Stage ${idx + 1}`}</div>
                <div className="text-xs truncate mt-0.5">{stg.label.split('. ')[1]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deficiency Alert Banner if in Deficiency Resolution */}
      {isDeficiency && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                Statutory Deficiency Notice Issued
              </h3>
              <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                The Regional Scrutiny Officer has identified non-compliances requiring clarification or rectified documentation before proceeding to inspection.
              </p>
              {lastDeficiency?.transition_notes && (
                <div className="mt-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-rose-200 dark:border-rose-800 text-xs text-slate-800 dark:text-slate-200">
                  <span className="font-semibold text-rose-700 dark:text-rose-400">Scrutiny Officer Remarks: </span>
                  {lastDeficiency.transition_notes}
                </div>
              )}
            </div>
          </div>

          {isApplicant && (
            <div className="pt-2 border-t border-rose-200 dark:border-rose-800 space-y-2">
              <label className="block text-xs font-semibold text-rose-900 dark:text-rose-200">
                Rectification Response & Compliance Note:
              </label>
              <textarea
                rows={3}
                placeholder="Detail the corrections made, surveyor endorsement uploaded, or compliance explanations..."
                value={deficiencyReply}
                onChange={(e) => setDeficiencyReply(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-lg text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={isReplyingDeficiency || !deficiencyReply.trim()}
                onClick={handleDeficiencyResubmission}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition"
              >
                <Send className="w-3.5 h-3.5" />
                {isReplyingDeficiency ? 'Submitting Rectification...' : 'Resubmit Rectification to Regional Office'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tab Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 transition ${
            activeTab === 'documents'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-800'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          Statutory Documents & Scrutiny
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dossier')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-lg flex items-center gap-2 border-b-2 transition ${
            activeTab === 'dossier'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-800'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Application Disclosures & Audit Trail
        </button>
      </div>

      {/* Tab Content 1: Statutory Documents & Compliance Management */}
      {activeTab === 'documents' && (
        <DocumentManagementSection
          applicationId={application.id}
          applicationType={application.application_type}
          applicationStatus={application.current_status}
          userRole={role}
          userId={user?.id}
        />
      )}

      {/* Tab Content 2: Application Details & Audit Trail */}
      {activeTab === 'dossier' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Submitted Disclosures (2 cols) */}
          <div className="lg:col-span-2 space-y-6">

          {/* Institutional Information */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                Institutional Coordinates
              </h3>
              <span className="text-xs text-slate-400 capitalize">
                {application.form_data?.institution_type?.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Head / Principal:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {application.form_data?.head_of_institution || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Official Contact:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {application.form_data?.contact_email || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Phone:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {application.form_data?.contact_phone || '—'}
                </div>
              </div>
              <div>
                <span className="text-slate-400">Location:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {application.form_data?.district}, {application.form_data?.state} (PIN: {application.form_data?.pincode})
                </div>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Registered Address:</span>
                <div className="font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                  {application.form_data?.address || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Type-Specific Metrics */}
          {application.application_type === 'new_institute' && application.form_data?.infrastructure && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Cadastral Land & Built-up Compliance
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <span className="text-slate-400">Land Area</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {application.form_data.infrastructure.land_area_acres} Acres
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <span className="text-slate-400">Total Built-up</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {application.form_data.infrastructure.built_up_area_sqm} sq.m
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <span className="text-slate-400">Instructional Area</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {application.form_data.infrastructure.instructional_area_sqm} sq.m
                  </div>
                </div>
              </div>

              {application.form_data.infrastructure.title_deed_number && (
                <div className="text-xs text-slate-500 font-mono">
                  Deed Ref: {application.form_data.infrastructure.title_deed_number}
                </div>
              )}
            </div>
          )}

          {application.application_type === 'extension_of_approval' && application.form_data?.eoa_details && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Extension of Approval Compliance Record
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">AICTE Permanent ID:</span>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {application.form_data.eoa_details.permanent_id}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">NBA Accredited:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {application.form_data.eoa_details.nba_accredited ? 'Yes (Active)' : 'No'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">NAAC CGPA:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {application.form_data.eoa_details.naac_score || 'Not Accredited'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Academic Courses Table */}
          {application.form_data?.programs_courses && application.form_data.programs_courses.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Sanctioned Academic Programs
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="p-2">Course Name</th>
                      <th className="p-2">Level</th>
                      <th className="p-2">Intake</th>
                      <th className="p-2">Faculty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {application.form_data.programs_courses.map((crs, i) => (
                      <tr key={i}>
                        <td className="p-2 font-medium text-slate-800 dark:text-slate-200">{crs.course_name}</td>
                        <td className="p-2 text-slate-500">{crs.level}</td>
                        <td className="p-2 font-semibold text-slate-700 dark:text-slate-300">{crs.intake_capacity}</td>
                        <td className="p-2 text-slate-500">{crs.faculty_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Append-Only Workflow Timeline (1 col) */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                Statutory Audit Trail
              </span>
              <span className="text-[11px] font-normal text-slate-400">Append-Only</span>
            </h3>

            {timeline.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">No transition history logged yet.</div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                {timeline.map((item, idx) => {
                  const itemMeta = WORKFLOW_STATUS_METADATA[item.new_status];
                  return (
                    <div key={item.id} className="relative group">
                      {/* Node Dot */}
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-teal-600 ring-4 ring-white dark:ring-slate-800" />

                      <div className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white capitalize">
                            {item.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              itemMeta ? itemMeta.badgeClass : 'bg-slate-100'
                            }`}
                          >
                            {itemMeta ? itemMeta.label : item.new_status}
                          </span>
                        </div>

                        {item.transition_notes && (
                          <div className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-900/60 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.transition_notes}
                          </div>
                        )}

                        <div className="mt-1 text-[10px] text-slate-400">
                          Actor: {item.actor_name || item.actor_role || 'System'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}


      {/* Officer Regulatory Transition Modal */}
      {showTransitionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Regulatory Workflow Transition
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTransitionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Target Statutory Status
                </label>
                <select
                  value={selectedTransition || ''}
                  onChange={(e) => {
                    const val = e.target.value as WorkflowStatus;
                    setSelectedTransition(val);
                    if (val === 'deficiency_resolution') setTransitionAction('raise_deficiency');
                    else if (val === 'evc_evaluation') setTransitionAction('recommend_evc');
                    else if (val === 'sac_review') setTransitionAction('forward_to_sac');
                    else if (val === 'approved') setTransitionAction('grant_approval');
                    else if (val === 'rejected') setTransitionAction('deny_approval');
                    else setTransitionAction('advance_workflow');
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="">Select Permitted Next Stage...</option>
                  <option value="regional_scrutiny">Regional Scrutiny</option>
                  <option value="deficiency_resolution">Deficiency Resolution (Return to Applicant)</option>
                  <option value="evc_evaluation">EVC Evaluation (Recommend Inspection)</option>
                  <option value="sac_review">SAC Review (Appraisal Committee)</option>
                  <option value="shc_hearing">SHC Hearing (Standing Hearing Referral)</option>
                  <option value="approved">Approved (Grant Letter of Approval / EoA)</option>
                  <option value="rejected">Rejected (Final Statutory Denial)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Statutory Scrutiny / Deficiency Notes (Mandatory for deficiencies & decisions)
                </label>
                <textarea
                  rows={4}
                  placeholder="Record formal regulatory findings, deficiencies, or committee resolution citations..."
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-500 font-semibold">{errorMsg}</p>}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowTransitionModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !selectedTransition}
                onClick={handleExecuteTransition}
                className="px-5 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition"
              >
                {actionLoading ? 'Recording Transition...' : 'Execute Statutory Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApplicationDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-4xl mx-auto py-16 text-center">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            Loading Application Dossier...
          </h2>
        </div>
      }
    >
      <ApplicationDetailContent />
    </React.Suspense>
  );
}
