import { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, Scale } from 'lucide-react';
import type { EmailDigestStatus, SettingsResponse } from '../types.ts';
import { DailyEmailPanel } from './DailyEmailPanel.tsx';
import { JuryMatchTrendChart } from './JuryMatchTrendChart.tsx';

interface SettingsViewProps {
  onConveneJury: () => Promise<void>;
  isConvening: boolean;
  onNotify: (message: string) => void;
  refreshSignal: number;
  emailStatus: EmailDigestStatus | null;
  defaultEmail: string;
  hasGmailPermission: boolean;
  onConnectGmail: () => Promise<string | null>;
  onSaveEmailPreferences: (enabled: boolean, recipientEmail: string) => Promise<void>;
  onRequestEmailModal: () => void;
}

export function SettingsView({
  onConveneJury,
  isConvening,
  onNotify,
  refreshSignal,
  emailStatus,
  defaultEmail,
  hasGmailPermission,
  onConnectGmail,
  onSaveEmailPreferences,
  onRequestEmailModal,
}: SettingsViewProps) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncingSources, setSyncingSources] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    setError(null);
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load system settings.');
        return res.json();
      })
      .then((payload: SettingsResponse) => setData(payload))
      .catch((err) => setError(err instanceof Error ? err.message : 'Load error.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, [refreshSignal]);

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/training/reset', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Reset failed.');
      setConfirmResetOpen(false);
      onNotify(payload.message || 'Learned memory reset.');
      loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset error.');
    } finally {
      setResetting(false);
    }
  };

  const handleSyncSources = async () => {
    setSyncingSources(true);
    setError(null);
    try {
      const res = await fetch('/api/sources/sync', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Sync failed.');
      onNotify(payload.message || 'Synced live job boards.');
      loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync error.');
    } finally {
      setSyncingSources(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="pb-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">System Orchestration &amp; Memory</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Agent Architecture &amp; Learning
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Monitor behavioral reinforcement weights learned from your clicks, shortlists, and reasoned rejections.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleSyncSources}
            disabled={syncingSources || isConvening}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${syncingSources ? 'animate-spin' : ''}`} />
            <span>{syncingSources ? 'Syncing Boards…' : 'Sync 10 Job Boards'}</span>
          </button>
          <button
            type="button"
            onClick={onConveneJury}
            disabled={isConvening}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <Scale className="w-4 h-4" />
            <span>{isConvening ? 'Deliberating…' : 'Convene Supreme Jury'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {error}
        </div>
      )}

      {/* Firebase-Synced Recharts Job Match Trend Visualization */}
      <JuryMatchTrendChart />

      {/* Daily Top Jury Job Picks Email Delivery */}
      <DailyEmailPanel
        status={emailStatus}
        defaultEmail={defaultEmail}
        hasGmailPermission={hasGmailPermission}
        onConnectGmail={onConnectGmail}
        onSavePreferences={onSaveEmailPreferences}
        onRequestSendModal={onRequestEmailModal}
      />

      {/* Behavioral Learning Summary */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Behavioral Reinforcement Learning
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Stage: <strong className="text-slate-900">{data?.training.stage || 'Loading…'}</strong>
              {data ? ` · ${data.training.total_events} total logged interactions` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Agent Memory
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500">Vacancy Clicks</div>
            <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading ? '—' : data?.training.clicks ?? 0}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Shortlists Learned</div>
            <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading ? '—' : data?.training.shortlists ?? 0}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Applied Decisions</div>
            <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading ? '—' : data?.training.applies ?? 0}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Dismissed Penalties</div>
            <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading ? '—' : data?.training.dismisses ?? 0}
            </div>
          </div>
        </div>

        {/* Learned Feature Weights Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500">
            Active Learned Feature Weights
          </h3>
          {data && data.training.weights.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Feature Type</th>
                    <th className="py-2.5 px-4 font-semibold">Signal Value</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Score Delta</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Positive Hits</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Negative Hits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.training.weights.map((w) => (
                    <tr key={`${w.feature_type}-${w.feature_value}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500">{w.feature_type}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{w.feature_value}</td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                          w.score_delta >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {w.score_delta > 0 ? `+${w.score_delta.toFixed(1)}` : w.score_delta.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {w.positive_hits}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {w.negative_hits}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-3">
              No learned weights recorded yet. Shortlist, apply, or dismiss roles with reasons to train the Jury.
            </p>
          )}
        </div>
      </section>

      {/* Hierarchy & Governance */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Agent Hierarchy &amp; Cache
          </h2>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">Level 3 Scouts ({data?.sources.length || 10} Job Boards)</dt>
              <dd className="text-slate-800 mt-0.5">
                Google Careers, Greenhouse ATS, Ashby ATS, Himalayas, Jobicy, RemoteOK, WorkingNomads, Arbeitnow, Remotive, Direct Employer
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Level 2 Sub-Agents</dt>
              <dd className="text-slate-800 mt-0.5">Software &amp; Systems Screener, Language Alignment Counsel, Quality &amp; Operations, Visa &amp; Relocation Advocate, CV Analyst</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Level 1 Arbiter</dt>
              <dd className="text-slate-800 mt-0.5">Supreme Jury issuing daily verdicts and top 5 selections</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Cached Sources</dt>
              <dd className="text-slate-800 mt-0.5 tabular-nums">
                {data?.sources.map((s) => `${s.source} (${s.count})`).join(' · ') || 'Loading…'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Human-in-the-Loop Governance
          </h2>
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>
              <strong className="text-slate-900 font-medium">Manual Submission Control:</strong> The system never submits applications autonomously or transmits personal documents to employers.
            </p>
            <p>
              <strong className="text-slate-900 font-medium">Verification Safeguard:</strong> Link reachability, domain authenticity, and visa/relocation evidence are surfaced as decision signals and must be confirmed on the employer&apos;s official careers page.
            </p>
            <button
              type="button"
              onClick={onConveneJury}
              disabled={isConvening}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isConvening ? 'animate-spin' : ''}`} />
              Re-Evaluate All {data?.totalJobs ?? ''} Vacancies
            </button>
          </div>
        </div>
      </section>

      {/* In-App Confirmation Modal for Reset */}
      {confirmResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-confirm-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 id="reset-confirm-title" className="font-display text-base font-bold text-slate-900">
              Reset learned agent memory?
            </h2>
            <p className="text-sm text-slate-600">
              This clears all recorded interaction events and learned score adjustments, returning the Jury to baseline CV and profile calibration.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {resetting ? 'Resetting…' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
