import { Clock, ExternalLink, FileText, Sparkles, Star } from 'lucide-react';
import type { DailyDigestData, JobItem, JobStatus } from '../types.ts';
import { formatJobSalaryBadge } from './SalaryRangeSlider.tsx';
import { LivenessLabel } from './StatusText.tsx';

interface DailyDigestProps {
  digest?: DailyDigestData;
  loading: boolean;
  onSelectJob: (job: JobItem, eventType?: 'inspect' | 'view_debate') => void;
  onQuickStatus: (job: JobItem, status: JobStatus) => Promise<void>;
  onOpenApplication: (jobId: string) => void;
  onTrackClick: (
    jobId: string,
    eventType?: 'click' | 'inspect' | 'open_link' | 'view_debate' | 'view_drafts'
  ) => void;
  onNavigateJury: () => void;
}

function formatRelativeCycleTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Recent cycle';
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'Just deliberated';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return iso.slice(0, 10);
}

export function DailyDigest({
  digest,
  loading,
  onSelectJob,
  onQuickStatus,
  onOpenApplication,
  onTrackClick,
  onNavigateJury,
}: DailyDigestProps) {
  const items = digest?.items || [];

  return (
    <section
      aria-label="24-hour agent daily digest"
      className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800 space-y-5"
    >
      {/* Digest Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800/90">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-blue-300">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Daily Digest · Top 3 High-Affinity Matches</span>
            </span>
            {digest && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-300 bg-slate-800/90 border border-slate-700 rounded-md tabular-nums">
                <Clock className="w-3 h-3 text-blue-400" aria-hidden="true" />
                <span>
                  {digest.withinLast24Hours ? '24h Cycle' : 'Latest Cycle'} ·{' '}
                  {formatRelativeCycleTime(digest.cycleTimestamp)} · {digest.reviewedCount} roles reviewed
                </span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
            {digest?.cycleSummary ||
              'Multi-agent scouts and jury consensus highlights from the past 24-hour deliberation run.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateJury}
          className="text-xs font-semibold text-blue-300 hover:text-white hover:underline whitespace-nowrap self-start md:self-auto"
        >
          Open Jury Room →
        </button>
      </div>

      {/* Top 3 Digest Cards */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl bg-slate-800/60 border border-slate-700/70 animate-pulse"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {items.map((entry, idx) => {
            const { job } = entry;
            const salaryLabel = formatJobSalaryBadge(
              job.salary_min,
              job.salary_max,
              job.salary_currency
            );

            return (
              <article
                key={job.id}
                className="bg-slate-800/55 hover:bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between gap-3.5 transition-colors"
              >
                <div className="space-y-2.5">
                  {/* Rank & Score */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-blue-600 text-white font-mono text-[11px] font-bold shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="text-[11px] font-medium text-slate-300 truncate">
                        {job.source}
                      </span>
                      <LivenessLabel status={job.liveness_status} />
                    </div>
                    <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 rounded tabular-nums shrink-0">
                      {entry.consensusScore}/100
                    </span>
                  </div>

                  {/* Role & Company */}
                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectJob(job, 'view_debate')}
                      className="text-left font-display text-sm sm:text-base font-bold text-white hover:text-blue-300 transition-colors line-clamp-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                    >
                      {job.title}
                    </button>
                    <p className="text-xs text-slate-300 mt-0.5 truncate">
                      {job.company} · {job.location || 'Remote'}
                      {salaryLabel ? ` · ${salaryLabel}` : ''}
                    </p>
                    {job.location_priority_tier && job.location_priority_tier <= 2 && job.location_priority_label && (
                      <p className="text-[11px] font-medium text-blue-300 mt-1 truncate">
                        {job.location_priority_label}
                      </p>
                    )}
                  </div>

                  {/* Agent Note Highlight */}
                  <div className="bg-slate-900/65 border border-slate-700/70 rounded-lg p-2.5 space-y-1">
                    <div className="text-[11px] font-semibold text-blue-300 truncate">
                      {entry.advocateName} · {entry.advocateRole}
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {entry.advocateStatement}
                    </p>
                  </div>
                </div>

                {/* Digest Actions */}
                <div className="pt-2.5 border-t border-slate-700/70 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectJob(job, 'view_debate')}
                    className="text-xs font-semibold text-blue-300 hover:text-white hover:underline whitespace-nowrap"
                  >
                    Read verdict
                  </button>

                  <div className="flex items-center gap-1.5">
                    {job.status === 'shortlisted' || job.status === 'applied' ? (
                      <button
                        type="button"
                        onClick={() => {
                          onTrackClick(job.id, 'view_drafts');
                          onOpenApplication(job.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-100 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3 h-3" aria-hidden="true" />
                        <span>Drafts</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void onQuickStatus(job, 'shortlisted')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap"
                      >
                        <Star className="w-3 h-3" aria-hidden="true" />
                        <span>Shortlist</span>
                      </button>
                    )}

                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTrackClick(job.id, 'open_link')}
                        aria-label={`Open ${job.title} posting`}
                        className="p-1.5 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-md transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-300">
          No 24-hour deliberation highlights available yet. Click <strong>Refresh Top 5</strong> to run a fresh Jury cycle.
        </div>
      )}
    </section>
  );
}
