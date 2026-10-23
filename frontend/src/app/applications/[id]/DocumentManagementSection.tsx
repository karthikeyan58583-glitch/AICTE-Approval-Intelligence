'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ApplicationDocument,
  DocumentType,
  DocumentVerificationStatus,
  DocumentChecklistResponse,
  DOCUMENT_TYPE_LABELS,
} from '@/types/documents';
import {
  fetchApplicationDocuments,
  fetchDocumentChecklist,
  uploadApplicationDocument,
  deleteApplicationDocument,
  reviewApplicationDocument,
  downloadApplicationDocument,
} from '@/lib/api/documents';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  FileCheck,
  AlertCircle,
  Info,
  Lock,
} from 'lucide-react';

interface DocumentManagementSectionProps {
  applicationId: string;
  applicationType: string;
  applicationStatus: string;
  userRole: string;
  userId?: string;
}

const REGULATORY_ROLES = [
  'regional_scrutiny_officer',
  'evc_evaluator',
  'shc_member',
  'aicte_executive_admin',
];

export default function DocumentManagementSection({
  applicationId,
  applicationType,
  applicationStatus,
  userRole,
  userId,
}: DocumentManagementSectionProps) {
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentType>('land_ownership_deed');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Review modal state
  const [reviewingDoc, setReviewingDoc] = useState<ApplicationDocument | null>(null);
  const [reviewStatus, setReviewStatus] = useState<Exclude<DocumentVerificationStatus, 'pending_review'>>('verified_valid');
  const [reviewComments, setReviewComments] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Delete state
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const isEditableState = ['draft', 'deficiency_resolution'].includes(applicationStatus);
  const isRegulatoryReviewer = REGULATORY_ROLES.includes(userRole);
  const isAdmin = userRole === 'aicte_executive_admin';
  const canUploadOrDelete = isEditableState || isAdmin;

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [docs, chk] = await Promise.all([
        fetchApplicationDocuments(applicationId),
        fetchDocumentChecklist(applicationId).catch(() => null),
      ]);
      setDocuments(docs);
      setChecklist(chk);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load document records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (applicationId) {
      loadData();
    }
  }, [applicationId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Invalid file type: Only PDF documents (.pdf) are permitted.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds the 10 MiB statutory limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a valid PDF document to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadApplicationDocument(applicationId, selectedCategory, selectedFile);
      setSuccessMsg(`Document '${selectedFile.name}' successfully uploaded and verified.`);
      setShowUploadModal(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (doc: ApplicationDocument) => {
    if (!window.confirm(`Are you sure you want to delete '${doc.original_filename}'?`)) {
      return;
    }

    setDeletingDocId(doc.id);
    setErrorMsg(null);
    try {
      await deleteApplicationDocument(doc.id);
      setSuccessMsg(`Document '${doc.original_filename}' deleted (storage cleanup enqueued).`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete document.');
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleDownload = async (doc: ApplicationDocument) => {
    try {
      await downloadApplicationDocument(doc.id, doc.original_filename);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingDoc) return;

    if (['deficiency_flagged', 'rejected'].includes(reviewStatus) && !reviewComments.trim()) {
      setReviewError('Official review remarks are mandatory when flagging a deficiency or rejecting.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);
    try {
      await reviewApplicationDocument(reviewingDoc.id, {
        verification_status: reviewStatus,
        review_comments: reviewComments.trim() || undefined,
      });
      setSuccessMsg(`Evaluation recorded for '${reviewingDoc.original_filename}'.`);
      setReviewingDoc(null);
      setReviewComments('');
      await loadData();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to record evaluation.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderStatusBadge = (status: DocumentVerificationStatus) => {
    switch (status) {
      case 'verified_valid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle className="w-3.5 h-3.5" />
            Verified Valid
          </span>
        );
      case 'deficiency_flagged':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Deficiency Flagged
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
      case 'pending_review':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5" />
            Pending Scrutiny
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Statutory Evidence & Document Management
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative repository for regulatory certificates, building plans, and statutory affidavits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
            title="Refresh documents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canUploadOrDelete ? (
            <button
              type="button"
              onClick={() => {
                setUploadError(null);
                setShowUploadModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Document
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5" />
              Uploads Locked ({applicationStatus.replace('_', ' ')})
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 font-bold">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800 font-bold">✕</button>
        </div>
      )}

      {/* Statutory Checklist Card */}
      {checklist && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                AICTE APH Statutory Document Checklist
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Mandatory requirements for {checklist.application_type.replace('_', ' ')}: {checklist.uploaded_mandatory_count} of {checklist.mandatory_count} fulfilled.
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              checklist.is_complete
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}>
              {checklist.is_complete ? 'All Mandatory Documents Provided' : 'Requirements Incomplete'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklist.items.map((item) => (
              <div
                key={item.document_type}
                className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                  item.document
                    ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'
                    : item.is_mandatory
                    ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                    : 'bg-slate-50/30 dark:bg-slate-900/20 border-slate-100 dark:border-slate-800'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                    <span>{item.title}</span>
                    {item.is_mandatory && (
                      <span className="text-[10px] uppercase font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.2 rounded">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{item.description}</p>
                </div>

                <div className="flex-shrink-0">
                  {item.document ? (
                    renderStatusBadge(item.document.verification_status)
                  ) : (
                    canUploadOrDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(item.document_type);
                          setUploadError(null);
                          setShowUploadModal(true);
                        }}
                        className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                      >
                        + Upload Now
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Missing</span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Documents Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Dossier Attachments ({documents.length})
          </h4>
          <span className="text-xs text-slate-400">
            Private bucket: <code className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">aip-application-documents</code>
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Documents Uploaded</h5>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Statutory certificates, land records, and building plans must be uploaded in PDF format before submission.
            </p>
            {canUploadOrDelete && (
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 dark:bg-teal-950/40 rounded-lg transition"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload First Document
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Document Category</th>
                  <th className="py-3 px-4">Filename & Hash</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4">Verification Status</th>
                  <th className="py-3 px-4">Observations</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.map((doc) => {
                  const meta = DOCUMENT_TYPE_LABELS[doc.document_type] || { title: doc.document_type };
                  const isUploader = userId ? doc.uploaded_by === userId : true;
                  const canDeleteDoc = (isUploader && isEditableState) || isAdmin;

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {meta.title}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {doc.document_type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                          <span className="truncate max-w-[200px]" title={doc.original_filename}>
                            {doc.original_filename}
                          </span>
                        </div>
                        {doc.file_hash_sha256 && (
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]" title={`SHA-256: ${doc.file_hash_sha256}`}>
                            SHA: {doc.file_hash_sha256.substring(0, 12)}...
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {formatBytes(doc.file_size_bytes)}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(doc.uploaded_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {renderStatusBadge(doc.verification_status)}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {doc.review_comments ? (
                          <div className="max-w-[220px]">
                            <p className="line-clamp-2 italic text-[11px] bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                              "{doc.review_comments}"
                            </p>
                            {doc.reviewed_at && (
                              <span className="text-[9px] text-slate-400 block mt-0.5">
                                Scrutiny on {new Date(doc.reviewed_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Download / View Button */}
                          <button
                            type="button"
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-slate-600 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                            title="Download verified PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Scrutiny / Review Button (Regulatory Officers) */}
                          {isRegulatoryReviewer && (
                            <button
                              type="button"
                              onClick={() => {
                                setReviewingDoc(doc);
                                setReviewStatus(
                                  doc.verification_status !== 'pending_review'
                                    ? doc.verification_status
                                    : 'verified_valid'
                                );
                                setReviewComments(doc.review_comments || '');
                                setReviewError(null);
                              }}
                              className="p-1.5 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded transition"
                              title="Evaluate document compliance"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Button (Uploader / Admin in editable state) */}
                          {canDeleteDoc && (
                            <button
                              type="button"
                              disabled={deletingDocId === doc.id}
                              onClick={() => handleDelete(doc)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded disabled:opacity-40 transition"
                              title="Delete document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Upload Statutory Evidence
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Document Classification *
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value as DocumentType)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {DOCUMENT_TYPE_LABELS[selectedCategory]?.description}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PDF Document File (Max 10 MiB) *
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-950/40 dark:file:text-teal-300 hover:file:bg-teal-100 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                  <Info className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                  <span>Files are checked for %PDF- signature and verified with SHA-256 hash.</span>
                </div>
              </div>

              {uploadError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {uploadError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition"
                >
                  {isUploading ? 'Validating & Uploading...' : 'Upload & Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reviewer Scrutiny Modal */}
      {reviewingDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Regulatory Document Scrutiny
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewingDoc(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                {DOCUMENT_TYPE_LABELS[reviewingDoc.document_type]?.title || reviewingDoc.document_type}
              </div>
              <div className="text-slate-500">File: {reviewingDoc.original_filename} ({formatBytes(reviewingDoc.file_size_bytes)})</div>
              {reviewingDoc.file_hash_sha256 && (
                <div className="font-mono text-[10px] text-slate-400 truncate">
                  SHA-256: {reviewingDoc.file_hash_sha256}
                </div>
              )}
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Scrutiny Determination *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewStatus('verified_valid')}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-center transition ${
                      reviewStatus === 'verified_valid'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ✓ Verified Valid
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatus('deficiency_flagged')}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-center transition ${
                      reviewStatus === 'deficiency_flagged'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ⚠ Deficiency
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatus('rejected')}
                    className={`p-2.5 rounded-lg border text-xs font-bold text-center transition ${
                      reviewStatus === 'rejected'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Official Scrutiny Remarks {['deficiency_flagged', 'rejected'].includes(reviewStatus) ? '*' : '(Optional)'}
                </label>
                <textarea
                  rows={4}
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  placeholder="Record formal scrutiny observations, statutory clause references, or specific rectification requirements..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {reviewError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {reviewError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setReviewingDoc(null)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2 text-xs font-bold rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition"
                >
                  {isSubmittingReview ? 'Recording Determination...' : 'Commit Determination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
