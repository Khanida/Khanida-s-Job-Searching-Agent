import { useState } from 'react';
import { X } from 'lucide-react';
import { REJECTION_REASONS } from '../types.ts';
import type { JobItem } from '../types.ts';

interface RejectModalProps {
  job: JobItem | null;
  onClose: () => void;
  onConfirm: (jobId: string, reason: string, detail: string) => Promise<void>;
}

export function RejectModal({ job, onClose, onConfirm }: RejectModalProps) {
  const [reason, setReason] = useState<string>('skills');
  const [detail, setDetail] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!job) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(job.id, reason, detail.trim());
      setDetail('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="reject-modal-title" className="text-base font-semibold text-slate-900 truncate">
              Reject &amp; Train Jury
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {job.title} · {job.company}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label
              htmlFor="reject-reason-select"
              className="block text-sm font-medium text-slate-800 mb-2"
            >
              Primary rejection reason
            </label>
            <select
              id="reject-reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              {Object.entries(REJECTION_REASONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              Your feedback applies a learned penalty to matching seniority, language, skill, location, or company attributes in future deliberations.
            </p>
          </div>

          <div>
            <label
              htmlFor="reject-detail-input"
              className="block text-sm font-medium text-slate-800 mb-2"
            >
              Specific detail (optional)
            </label>
            <textarea
              id="reject-detail-input"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="e.g. Requires fluent German (C1), written in French, or 5+ years Rust experience"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting ? 'Saving…' : 'Dismiss & Record Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
