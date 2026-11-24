import { useEffect, useState } from 'react';
import { Loader2, Mail, Send, X } from 'lucide-react';
import type { EmailDigestStatus } from '../types.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface EmailDigestConfirmModalProps {
  open: boolean;
  status: EmailDigestStatus | null;
  defaultEmail: string;
  hasGmailPermission: boolean;
  onConnectGmail: () => Promise<string | null>;
  onConfirmSend: (recipientEmail: string) => Promise<void>;
  onClose: () => void;
}

const CLIENT_EMAIL_RX = /^[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[^\s@<>()[\],;:]{2,}$/;

export function EmailDigestConfirmModal({
  open,
  status,
  defaultEmail,
  hasGmailPermission,
  onConnectGmail,
  onConfirmSend,
  onClose,
}: EmailDigestConfirmModalProps) {
  const [recipient, setRecipient] = useState(defaultEmail);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRecipient(status?.recipientEmail || defaultEmail || '');
      setError(null);
    }
  }, [open, status?.recipientEmail, defaultEmail]);

  if (!open) return null;

  const trimmedEmail = recipient.trim();
  const isValidEmail = trimmedEmail.length <= 254 && CLIENT_EMAIL_RX.test(trimmedEmail);
  const picks = status?.topPicks || [];

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const token = await onConnectGmail();
      if (!token) {
        setError('Gmail permission was not granted. Please approve sending permissions in Google sign-in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect Gmail account.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSend = async () => {
    if (!isValidEmail) {
      setError('Please enter a valid recipient email address.');
      return;
    }
    if (picks.length === 0) {
      setError('No eligible daily Jury picks are available to send right now.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onConfirmSend(trimmedEmail);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send daily picks email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-digest-confirm-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Mail className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="email-digest-confirm-title" className="font-display text-base font-bold text-slate-900">
                Confirm Sending Daily Jury Job Picks
              </h2>
              <p className="text-xs text-slate-500">
                Review the recipient and {picks.length} selected role{picks.length === 1 ? '' : 's'} before emailing via Gmail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel email send"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="confirm-email-recipient" className="block text-xs font-semibold text-slate-700">
              Recipient Email Address
            </label>
            <input
              id="confirm-email-recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
            {status?.previewSubject && (
              <p className="text-xs text-slate-500 truncate" title={status.previewSubject}>
                <span className="font-medium text-slate-700">Subject:</span> {status.previewSubject}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Top Job Picks Included ({picks.length})</span>
              <span className="font-mono text-slate-500">{status?.todayDate || ''}</span>
            </div>
            {picks.length > 0 ? (
              <ul className="border border-slate-200 rounded-xl divide-y divide-slate-200 bg-slate-50/70">
                {picks.map((job, idx) => (
                  <li key={job.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        #{idx + 1} · {job.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {job.company} · {job.location || 'Remote'} · {job.source}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums shrink-0">
                      {job.jury_score || job.score}/100
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 p-3 border border-slate-200 rounded-lg bg-slate-50">
                No eligible picks found yet. Convene the Supreme Jury first.
              </p>
            )}
          </div>

          {!hasGmailPermission && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-700">
                <strong className="font-semibold text-slate-900">Gmail permission needed:</strong> Sign in with Google to authorize sending this email from your account.
              </div>
              <GoogleSignInButton
                label="Connect Gmail"
                loading={connecting}
                onClick={() => void handleConnect()}
                className="shrink-0"
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasGmailPermission || !isValidEmail || picks.length === 0 || sending}
            onClick={() => void handleSend()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{sending ? 'Sending Email…' : 'Confirm & Send Email'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
