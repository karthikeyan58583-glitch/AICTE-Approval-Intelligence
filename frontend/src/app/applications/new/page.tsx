'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  createApplicationDraft,
  updateApplicationDraft,
  submitApplication,
  saveLocalDraft,
  getLocalDraft,
  clearLocalDraft,
  sanitizeApplicationPayload,
} from '@/lib/api/applications';
import {
  ApplicationType,
  InstitutionType,
  ApplicationFormData,
  ProgramCourseItem,
} from '@/types/applications';
import { APPLICATION_TYPE_METADATA } from '@/lib/workflow/state-machine';
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  ShieldCheck,
  FileCheck2,
  ExternalLink,
} from 'lucide-react';

const WIZARD_STEPS = [
  { id: 1, title: 'Category', subtitle: 'Application Type' },
  { id: 2, title: 'Institution', subtitle: 'Profile & Contact' },
  { id: 3, title: 'Academic', subtitle: 'Programs & Intake' },
  { id: 4, title: 'Compliance', subtitle: 'Infrastructure / Cadastral' },
  { id: 5, title: 'Review & Submit', subtitle: 'Statutory Verification' },
];

export default function NewApplicationWizard() {
  const router = useRouter();
  const { user, role } = useAuth();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [appType, setAppType] = useState<ApplicationType>('new_institute');
  const [draftId, setDraftId] = useState<string | null>(null);

  // Form State with canonical permanent_id
  const [formData, setFormData] = useState<Partial<ApplicationFormData>>({
    academic_year: '2026-2027',
    permanent_id: '',
    institution_name: '',
    institution_type: 'engineering_technology',
    state: 'National Capital Region',
    district: 'New Delhi',
    address: '',
    pincode: '',
    head_of_institution: '',
    contact_email: '',
    contact_phone: '',
    programs_courses: [
      {
        course_name: 'Computer Science and Engineering',
        level: 'UG',
        intake_capacity: 60,
        duration_years: 4,
        faculty_count: 4,
      },
    ],
    infrastructure: {
      land_area_acres: 5.0,
      built_up_area_sqm: 6000.0,
      instructional_area_sqm: 3000.0,
      administrative_area_sqm: 1000.0,
      amenities_area_sqm: 600.0,
      title_deed_number: '',
    },
    declaration_confirmed: false,
  });

  // UI & Validation States
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Auto-fill user metadata if present
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        institution_name: prev.institution_name || user.institutionName || '',
        contact_email: prev.contact_email || user.email || '',
        head_of_institution: prev.head_of_institution || user.fullName || '',
      }));
    }
  }, [user]);

  // Check local draft on type selection
  useEffect(() => {
    const backup = getLocalDraft(appType);
    if (backup && backup.data && !hasRestoredDraft) {
      const restored = backup.data;
      const pid = restored.permanent_id || restored.eoa_details?.permanent_id || restored.course_addition_details?.permanent_id || '';
      setFormData((prev) => ({
        ...prev,
        ...restored,
        permanent_id: pid,
      }));
      setHasRestoredDraft(true);
    }
  }, [appType, hasRestoredDraft]);

  // Persist locally on form change
  const handleInputChange = (field: keyof ApplicationFormData, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    saveLocalDraft(appType, updated);
    // Clear error for field
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  // Synchronized Permanent ID updater
  const handlePermanentIdChange = (value: string) => {
    const trimmed = value;
    setFormData((prev) => {
      const updated = {
        ...prev,
        permanent_id: trimmed,
        eoa_details: {
          ...(prev.eoa_details || {
            nba_accredited: false,
            naac_score: 3.2,
            faculty_cadre_ratio: '1:2:6',
            compliance_declaration: true,
          }),
          permanent_id: trimmed,
        },
        course_addition_details: {
          ...(prev.course_addition_details || {
            new_course_name: '',
            level: 'UG',
            proposed_intake: 60,
            labs_ready: true,
            faculty_recruited: 2,
          }),
          permanent_id: trimmed,
        },
      };
      saveLocalDraft(appType, updated);
      return updated;
    });

    if (validationErrors.permanent_id) {
      setValidationErrors((prev) => {
        const copy = { ...prev };
        delete copy.permanent_id;
        return copy;
      });
    }
  };

  const validateStep = (stepNumber: number): boolean => {
    const errors: Record<string, string> = {};

    if (stepNumber === 1) {
      if (!appType) errors.appType = 'Please select a statutory application category.';
    } else if (stepNumber === 2) {
      if (!formData.institution_name?.trim()) errors.institution_name = 'Institution name is required.';
      if (appType !== 'new_institute') {
        const pid = (formData.permanent_id || formData.eoa_details?.permanent_id || formData.course_addition_details?.permanent_id || '').trim();
        if (!pid) {
          errors.permanent_id = 'Existing AICTE Permanent ID (PID) is required for established institutions.';
        } else if (pid.length < 4) {
          errors.permanent_id = 'Permanent ID must be at least 4 characters (e.g. 1-9318420191).';
        }
      }
      if (!formData.state?.trim()) errors.state = 'State / UT is required.';
      if (!formData.district?.trim()) errors.district = 'District is required.';
      if (!formData.address?.trim() || formData.address.length < 5) errors.address = 'Complete postal address is required (min 5 characters).';
      if (!formData.pincode || !/^[1-9][0-9]{5}$/.test(formData.pincode)) errors.pincode = 'Valid 6-digit Indian PIN code required.';
      if (!formData.head_of_institution?.trim()) errors.head_of_institution = 'Head of Institution / Principal name is required.';
      if (!formData.contact_email?.trim() || !formData.contact_email.includes('@')) errors.contact_email = 'Valid official email address is required.';
      if (!formData.contact_phone || !/^[6-9]\d{9}$/.test(formData.contact_phone)) errors.contact_phone = '10-digit mobile number required (starting 6-9).';
    } else if (stepNumber === 3) {
      if (appType === 'new_institute') {
        if (!formData.programs_courses || formData.programs_courses.length === 0) {
          errors.programs = 'At least one proposed academic program is required.';
        }
      } else if (appType === 'extension_of_approval') {
        const pid = (formData.permanent_id || formData.eoa_details?.permanent_id || '').trim();
        if (!pid) {
          errors.permanent_id = 'Existing AICTE Permanent ID (PID) is required.';
        } else if (pid.length < 4) {
          errors.permanent_id = 'Permanent ID must be at least 4 characters (e.g. 1-93820194).';
        }
      } else if (appType === 'course_addition') {
        const pid = (formData.permanent_id || formData.course_addition_details?.permanent_id || '').trim();
        if (!pid) {
          errors.permanent_id = 'Existing AICTE Permanent ID (PID) is required.';
        } else if (pid.length < 4) {
          errors.permanent_id = 'Permanent ID must be at least 4 characters (e.g. 1-93820194).';
        }
        if (!formData.course_addition_details?.new_course_name?.trim() || formData.course_addition_details.new_course_name.trim().length < 2) {
          errors.new_course_name = 'Proposed new course / degree name is required (minimum 2 characters).';
        }
      }
    } else if (stepNumber === 4) {
      if (appType === 'new_institute') {
        const inf = formData.infrastructure;
        if (!inf?.land_area_acres || inf.land_area_acres < 0.5) errors.land_area_acres = 'Land area must be at least 0.5 contiguous acres.';
        if (!inf?.built_up_area_sqm || inf.built_up_area_sqm < 500) errors.built_up_area_sqm = 'Built-up area must be at least 500 sqm.';
        if (!inf?.instructional_area_sqm || inf.instructional_area_sqm < 250) errors.instructional_area_sqm = 'Instructional area must be at least 250 sqm.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;
    setServerError(null);

    // Persist draft to backend on progression from Step 2 to Step 3
    if (currentStep === 2) {
      setIsSaving(true);
      try {
        saveLocalDraft(appType, formData);
        const sanitizedPayload = sanitizeApplicationPayload(appType, formData);
        if (!draftId) {
          const draft = await createApplicationDraft(appType, formData.institution_name, sanitizedPayload);
          setDraftId(draft.id);
        } else {
          await updateApplicationDraft(draftId, sanitizedPayload);
        }
      } catch (err: any) {
        setServerError(`Draft save issue: ${err.message || 'Failed to save application draft to server.'}`);
        return; // Gated: Do not advance to Step 3 if draft save fails!
      } finally {
        setIsSaving(false);
      }
    } else if (currentStep > 2 && draftId) {
      // Background sync for later steps
      saveLocalDraft(appType, formData);
      const sanitizedPayload = sanitizeApplicationPayload(appType, formData);
      updateApplicationDraft(draftId, sanitizedPayload).catch((err: any) => {
        console.warn('Background draft sync notice:', err.message);
      });
    }

    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleManualSaveDraft = async () => {
    setIsSaving(true);
    setServerError(null);
    try {
      saveLocalDraft(appType, formData);
      const sanitizedPayload = sanitizeApplicationPayload(appType, formData);
      if (!draftId) {
        const draft = await createApplicationDraft(appType, formData.institution_name, sanitizedPayload);
        setDraftId(draft.id);
      } else {
        await updateApplicationDraft(draftId, sanitizedPayload);
      }
      alert('Application draft saved successfully. You can safely navigate away and resume anytime.');
    } catch (err: any) {
      setServerError(`Draft save issue: ${err.message || 'Failed to save application draft to server.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteSubmission = async () => {
    if (!formData.declaration_confirmed) {
      setValidationErrors((prev) => ({
        ...prev,
        declaration: 'You must confirm the statutory declaration before submitting.',
      }));
      return;
    }

    setIsSubmitting(true);
    setServerError(null);
    setShowConfirmModal(false);

    try {
      const sanitizedPayload = sanitizeApplicationPayload(appType, formData);
      let targetId = draftId;
      if (!targetId) {
        const draft = await createApplicationDraft(appType, formData.institution_name, sanitizedPayload);
        targetId = draft.id;
        setDraftId(draft.id);
      }

      const submittedRecord = await submitApplication(targetId, sanitizedPayload);
      clearLocalDraft(appType);
      setSubmittedRef(submittedRecord.application_number);
      setSubmittedId(submittedRecord.id);
    } catch (err: any) {
      setServerError(err.message || 'Server validation or submission rejected.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submission Success Screen
  if (submittedRef) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 mb-2">
              Statutory Submission Successful
            </span>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Application Officially Lodged
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Your application has entered the statutory AICTE scrutiny pipeline for Academic Session 2026-2027.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
            <div className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
              Permanent Reference Number
            </div>
            <div className="text-2xl font-mono font-bold text-teal-700 dark:text-teal-400 mt-1 select-all">
              {submittedRef}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Immutable statutory identifier assigned under AICTE Regulations.
            </div>
          </div>

          <div className="text-left bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Next Statutory Stages:
            </div>
            <div>1. Allocation to Regional Scrutiny Officer for cadastral & document verification.</div>
            <div>2. In case of deficiencies, a formal deficiency resolution window will open.</div>
            <div>3. You can monitor scrutiny findings and timeline updates in the Application Dossier.</div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={`/applications/${submittedId}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition"
            >
              Open Application Dossier
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/applications"
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition"
            >
              Back to Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-2 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Applications Directory
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Application Intake Wizard
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Statutory technical institution application for Academic Year 2026-2027.
            </p>
          </div>
          <button
            type="button"
            onClick={handleManualSaveDraft}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Save className="w-3.5 h-3.5 text-slate-400" />
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>

      {/* Stepper Indicator */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="grid grid-cols-5 gap-2 text-center">
          {WIZARD_STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <div key={step.id} className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold mb-1 transition ${
                    isCompleted
                      ? 'bg-teal-600 text-white'
                      : isActive
                      ? 'bg-teal-500 text-white ring-4 ring-teal-100 dark:ring-teal-900/40'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : step.id}
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 hidden sm:block">
                  {step.title}
                </div>
                <div className="text-[10px] text-slate-400 hidden sm:block">{step.subtitle}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Server Error Alert */}
      {serverError && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Statutory Verification Notice</div>
            <div className="mt-0.5">{serverError}</div>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
        {/* STEP 1: Application Category */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Select Statutory Application Category
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose the regulatory approval category governed by AICTE Approval Process Handbook (APH).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {(['new_institute', 'extension_of_approval', 'course_addition'] as ApplicationType[]).map((type) => {
                const meta = APPLICATION_TYPE_METADATA[type];
                const isSelected = appType === type;

                return (
                  <div
                    key={type}
                    onClick={() => {
                      setAppType(type);
                      saveLocalDraft(type, formData);
                    }}
                    className={`cursor-pointer p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-semibold tracking-wider text-teal-700 dark:text-teal-400 uppercase">
                        {meta.tag}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white mt-1 text-sm">{meta.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{meta.description}</p>
                    </div>

                    <div className="pt-4 flex items-center justify-between text-xs font-medium">
                      <span className={isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}>
                        {isSelected ? 'Selected Category' : 'Click to select'}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: Institution & Signatory Profile */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Institution Profile & Signatory Information
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official contact and registered postal coordinates for statutory correspondence.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={appType === 'new_institute' ? "sm:col-span-2" : ""}>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Registered Institution Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Institute of Technology and Science"
                  value={formData.institution_name || ''}
                  onChange={(e) => handleInputChange('institution_name', e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-white ${
                    validationErrors.institution_name ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {validationErrors.institution_name && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.institution_name}</p>
                )}
              </div>

              {appType !== 'new_institute' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Existing AICTE Permanent ID (PID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1-93820194"
                    value={formData.permanent_id || formData.eoa_details?.permanent_id || formData.course_addition_details?.permanent_id || ''}
                    onChange={(e) => handlePermanentIdChange(e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-white font-mono ${
                      validationErrors.permanent_id ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {validationErrors.permanent_id && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.permanent_id}</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Discipline / Institution Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.institution_type}
                  onChange={(e) => handleInputChange('institution_type', e.target.value as InstitutionType)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="engineering_technology">Engineering & Technology</option>
                  <option value="management">Management Studies (MBA/PGDM)</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="architecture_planning">Architecture & Planning</option>
                  <option value="applied_arts_crafts">Applied Arts & Crafts</option>
                  <option value="hotel_management_catering">Hotel Management & Catering</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Academic Session
                </label>
                <input
                  type="text"
                  disabled
                  value={formData.academic_year || '2026-2027'}
                  className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  State / Union Territory <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maharashtra, Tamil Nadu, Delhi"
                  value={formData.state || ''}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  District <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune, Chennai, New Delhi"
                  value={formData.district || ''}
                  onChange={(e) => handleInputChange('district', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Complete Postal Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Street, Institutional Area, Survey No..."
                  value={formData.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PIN Code (6 Digits) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 110001"
                  value={formData.pincode || ''}
                  onChange={(e) => handleInputChange('pincode', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
                {validationErrors.pincode && (
                  <p className="text-xs text-red-500 mt-1">{validationErrors.pincode}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Principal / Head of Institution <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Dr. Full Name"
                  value={formData.head_of_institution || ''}
                  onChange={(e) => handleInputChange('head_of_institution', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Official Contact Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="principal@institution.edu.in"
                  value={formData.contact_email || ''}
                  onChange={(e) => handleInputChange('contact_email', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Official Mobile Contact <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10 digit number"
                  value={formData.contact_phone || ''}
                  onChange={(e) => handleInputChange('contact_phone', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Academic Programs & Intake */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Academic Programs & Sanctioned Intake
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {appType === 'new_institute'
                  ? 'Proposed degree programs and dedicated faculty allotment.'
                  : appType === 'extension_of_approval'
                  ? 'Existing AICTE permanent identifier and accreditation score.'
                  : 'New course program readiness and cadre recruitment.'}
              </p>
            </div>

            {/* Type-Specific Academic Input */}
            {appType === 'new_institute' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Proposed Courses / Branches
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const courses = formData.programs_courses || [];
                      handleInputChange('programs_courses', [
                        ...courses,
                        { course_name: '', level: 'UG', intake_capacity: 60, duration_years: 4, faculty_count: 4 },
                      ]);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Branch
                  </button>
                </div>

                {formData.programs_courses?.map((course, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end"
                  >
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Course Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Mechanical Engineering"
                        value={course.course_name}
                        onChange={(e) => {
                          const updated = [...(formData.programs_courses || [])];
                          updated[idx].course_name = e.target.value;
                          handleInputChange('programs_courses', updated);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Level</label>
                      <select
                        value={course.level}
                        onChange={(e) => {
                          const updated = [...(formData.programs_courses || [])];
                          updated[idx].level = e.target.value;
                          handleInputChange('programs_courses', updated);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                      >
                        <option value="UG">UG</option>
                        <option value="PG">PG</option>
                        <option value="Diploma">Diploma</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Intake</label>
                      <input
                        type="number"
                        min={10}
                        max={300}
                        value={course.intake_capacity}
                        onChange={(e) => {
                          const updated = [...(formData.programs_courses || [])];
                          updated[idx].intake_capacity = parseInt(e.target.value) || 0;
                          handleInputChange('programs_courses', updated);
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Faculty</label>
                        <input
                          type="number"
                          min={1}
                          value={course.faculty_count}
                          onChange={(e) => {
                            const updated = [...(formData.programs_courses || [])];
                            updated[idx].faculty_count = parseInt(e.target.value) || 1;
                            handleInputChange('programs_courses', updated);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                        />
                      </div>
                      {formData.programs_courses && formData.programs_courses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.programs_courses!.filter((_, i) => i !== idx);
                            handleInputChange('programs_courses', updated);
                          }}
                          className="p-1.5 text-red-500 hover:text-red-700 rounded mb-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {appType === 'extension_of_approval' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Existing AICTE Permanent ID (PID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1-93820194"
                    value={formData.permanent_id || formData.eoa_details?.permanent_id || ''}
                    onChange={(e) => handlePermanentIdChange(e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-white font-mono ${
                      validationErrors.permanent_id ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {validationErrors.permanent_id && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.permanent_id}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    NAAC CGPA Score (if accredited)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    placeholder="e.g. 3.45"
                    value={formData.eoa_details?.naac_score || ''}
                    onChange={(e) =>
                      handleInputChange('eoa_details', {
                        ...formData.eoa_details,
                        naac_score: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="nba_checkbox"
                    checked={formData.eoa_details?.nba_accredited || false}
                    onChange={(e) =>
                      handleInputChange('eoa_details', {
                        ...formData.eoa_details,
                        nba_accredited: e.target.checked,
                      })
                    }
                    className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                  />
                  <label htmlFor="nba_checkbox" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Institution holds active National Board of Accreditation (NBA) for qualifying eligible courses.
                  </label>
                </div>
              </div>
            )}

            {appType === 'course_addition' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Existing AICTE Permanent ID (PID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1-93820194"
                    value={formData.permanent_id || formData.course_addition_details?.permanent_id || ''}
                    onChange={(e) => handlePermanentIdChange(e.target.value)}
                    className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-white font-mono ${
                      validationErrors.permanent_id ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {validationErrors.permanent_id && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.permanent_id}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Proposed Course / Degree Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Artificial Intelligence & Data Science"
                    value={formData.course_addition_details?.new_course_name || ''}
                    onChange={(e) =>
                      handleInputChange('course_addition_details', {
                        ...formData.course_addition_details,
                        new_course_name: e.target.value,
                      })
                    }
                    className={`w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded-lg text-slate-900 dark:text-white ${
                      validationErrors.new_course_name ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  />
                  {validationErrors.new_course_name && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.new_course_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Proposed Intake Capacity
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="180"
                    value={formData.course_addition_details?.proposed_intake || 60}
                    onChange={(e) =>
                      handleInputChange('course_addition_details', {
                        ...formData.course_addition_details,
                        proposed_intake: parseInt(e.target.value) || 60,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Faculty Recruited for New Course
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.course_addition_details?.faculty_recruited || 2}
                    onChange={(e) =>
                      handleInputChange('course_addition_details', {
                        ...formData.course_addition_details,
                        faculty_recruited: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Infrastructure & Cadastral Metrics */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Cadastral Land & Infrastructure Compliance
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical premises and sanctioned architectural dimensions under statutory scrutiny.
              </p>
            </div>

            {appType === 'new_institute' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contiguous Land Area (Acres) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={formData.infrastructure?.land_area_acres || ''}
                    onChange={(e) =>
                      handleInputChange('infrastructure', {
                        ...formData.infrastructure,
                        land_area_acres: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total Built-up Area (sq.m) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="500"
                    value={formData.infrastructure?.built_up_area_sqm || ''}
                    onChange={(e) =>
                      handleInputChange('infrastructure', {
                        ...formData.infrastructure,
                        built_up_area_sqm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Instructional Area (Classrooms/Labs in sq.m) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="250"
                    value={formData.infrastructure?.instructional_area_sqm || ''}
                    onChange={(e) =>
                      handleInputChange('infrastructure', {
                        ...formData.infrastructure,
                        instructional_area_sqm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Administrative Area (Offices in sq.m)
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="100"
                    value={formData.infrastructure?.administrative_area_sqm || ''}
                    onChange={(e) =>
                      handleInputChange('infrastructure', {
                        ...formData.infrastructure,
                        administrative_area_sqm: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registered Title Deed Reference / Lease Registry Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. REG-DL-2026-BOOK1-VOL4-PAGE89"
                    value={formData.infrastructure?.title_deed_number || ''}
                    onChange={(e) =>
                      handleInputChange('infrastructure', {
                        ...formData.infrastructure,
                        title_deed_number: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-teal-600" />
                  Statutory Infrastructure Continuation Attestation
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The institution hereby declares that all sanctioned instructional spaces, laboratories, fire safety equipment, barrier-free access provisions, and barrier-free toilets conform strictly to the minimum prescribed norms of AICTE Approval Process Handbook (APH 2026-2027) without violation or unauthorized alterations.
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: Review & Statutory Submission */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Review & Authoritative Statutory Submission
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review disclosures thoroughly. Submission assigns a unique permanent reference number and initiates regional regulatory scrutiny.
              </p>
            </div>

            {/* Summary Dossier Card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400">Application Category:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    {APPLICATION_TYPE_METADATA[appType].title}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Academic Year:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{formData.academic_year}</div>
                </div>
                <div>
                  <span className="text-slate-400">Institution Discipline:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {formData.institution_type?.replace('_', ' ')}
                  </div>
                </div>
                <div className={appType !== 'new_institute' ? "" : "col-span-2"}>
                  <span className="text-slate-400">Institution Name:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{formData.institution_name}</div>
                </div>
                {appType !== 'new_institute' && (
                  <div>
                    <span className="text-slate-400">AICTE Permanent ID:</span>
                    <div className="font-semibold font-mono text-teal-700 dark:text-teal-400">
                      {formData.permanent_id || formData.course_addition_details?.permanent_id || formData.eoa_details?.permanent_id || 'Not Specified'}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Principal / Signatory:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{formData.head_of_institution}</div>
                </div>
                {appType === 'course_addition' && formData.course_addition_details?.new_course_name && (
                  <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">Proposed New Course & Intake:</span>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {formData.course_addition_details.new_course_name} ({formData.course_addition_details.proposed_intake || 60} seats)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Statutory Declaration Checkbox */}
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="declaration_checkbox"
                  checked={formData.declaration_confirmed || false}
                  onChange={(e) => handleInputChange('declaration_confirmed', e.target.checked)}
                  className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="declaration_checkbox"
                  className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium cursor-pointer"
                >
                  I, the authorized representative/signatory of the applicant institution, solemnly affirm and declare that the statements, cadastral metrics, and academic disclosures submitted herein are truthful and verified against institutional records. I acknowledge that furnishing false declarations or fraudulent claims invites penal disqualification under AICTE Act regulations.
                </label>
              </div>
              {validationErrors.declaration && (
                <p className="text-xs text-red-500 font-semibold pl-6">{validationErrors.declaration}</p>
              )}
            </div>
          </div>
        )}

        {/* Wizard Footer Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Previous Step
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 5 ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition"
              >
                {isSaving ? 'Saving Draft...' : `Continue to Step ${currentStep + 1}`}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting || !formData.declaration_confirmed}
                onClick={() => setShowConfirmModal(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition shadow"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Verifying & Submitting...' : 'Submit Statutory Application'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Confirm Statutory Lodgement
                </h3>
                <p className="text-xs text-slate-500">Academic Session 2026-2027</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Once submitted, your application data will be sealed and transferred to the Regional Scrutiny Office. A unique AICTE Reference Number will be generated. You cannot alter intake fields without formal scrutiny officer deficiency resolution.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSubmission}
                className="px-5 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition"
              >
                Yes, Submit Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
