import { useEffect, useState } from 'react';
import { Check, Mail, Send } from 'lucide-react';
import type { EmailDigestStatus } from '../types.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';

interface DailyEmailPanelProps {
  status: EmailDigestStatus | null;
  defaultEmail: string;
  hasGmailPermission: boolean;
  onConnectGmail: () => Promise<string | null>;
  onSavePreferences: (enabled: boolean, recipientEmail: string) => Promise<void>;
  onRequestSendModal: () => void;
  compact?: boolean;
}

const CLIENT_EMAIL_RX = /^[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[^\s@<>()[\],;:]{2,}$/;

export function DailyEmailPanel({
  status,
  defaultEmail,
  hasGmailPermission,
  onConnectGmail,
  onSavePreferences,
  onRequestSendModal,
  compact = false,
}: DailyEmailPanelProps) {
  const [recipientInput, setRecipientInput] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (status) {
      setEnabled(Boolean(status.enabled));
      setRecipientInput(status.recipientEmail || defaultEmail || '');
    } else if (defaultEmail && !recipientInput) {
      setRecipientInput(defaultEmail);
    }
  }, [status, defaultEmail]);

  const trimmed = recipientInput.trim();
  const emailValid = trimmed.length <= 254 && CLIENT_EMAIL_RX.test(trimmed);

  const handleToggleAndSave = async (nextEnabled: boolean) => {
    setLocalError(null);
    if (nextEnabled && !emailValid) {
      setLocalError('Enter a valid email address before enabling daily digests.');
      return;
    }
    setSaving(true);
    try {
      await onSavePreferences(nextEnabled, trimmed);
      setEnabled(nextEnabled);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to save email settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAddress = async () => {
    setLocalError(null);
    if (trimmed && !emailValid) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setSaving(true);
    try {
      await onSavePreferences(enabled, trimmed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to save recipient email.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setLocalError(null);
    try {
      await onConnectGmail();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gmail sign-in failed.');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <section
      aria-label="Daily Jury Email Digest Settings"
      className={`bg-white border border-slate-200 rounded-xl ${compact ? 'p-4' : 'p-6'} space-y-4`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
            <Mail className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Daily Top Jury Job Picks Email
              </h3>
              {status?.lastSentDate && (
                <span className="text-[11px] font-medium text-emerald-700 tabular-nums">
                  · Last sent {status.lastSentDate} ({status.lastSentCount} picks)
                </span>
              )}
              {status?.dueToday && (
                <span className="text-[11px] font-semibold text-blue-700">
                  · Ready for today
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Receive today&apos;s top ranked CV-matched &amp; language-vetted Jury vacancies directly in your Gmail inbox after reviewing picks.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!hasGmailPermission && (
            <GoogleSignInButton
              label="Sign in with Google"
              loading={connecting}
              onClick={() => void handleConnect()}
              className="py-1.5 px-3 text-xs"
            />
          )}
          <button
            type="button"
            onClick={onRequestSendModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Email Today&apos;s Picks</span>
          </button>
        </div>
      </div>

      {localError && (
        <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {localError}
        </div>
      )}

      {status?.lastError && !localError && (
        <div className="p-2.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
          Previous delivery note: {status.lastError}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <label htmlFor={compact ? 'overview-digest-email' : 'settings-digest-email'} className="sr-only">
            Recipient email address
          </label>
          <input
            id={compact ? 'overview-digest-email' : 'settings-digest-email'}
            type="email"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="your-email@gmail.com"
            className="flex-1 min-w-[220px] max-w-sm px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAddress()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving…' : 'Save Email'}</span>
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => void handleToggleAndSave(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span>Prompt daily top-picks email when Jury deliberates</span>
        </label>
      </div>
    </section>
  );
}
