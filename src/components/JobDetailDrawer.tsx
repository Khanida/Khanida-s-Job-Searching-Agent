import { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileText,
  Scale,
  Star,
  ThumbsDown,
  X,
} from 'lucide-react';
import type { JobDetailResponse, JobItem, JobStatus } from '../types.ts';
import { AuthenticityLabel, LivenessLabel, PipelineStatusLabel } from './StatusText.tsx';

interface JobDetailDrawerProps {
  jobId: string | null;
  onClose: () => void;
  onStatusChange: (job: JobItem, status: JobStatus) => Promise<void>;
  onOpenReject: (job: JobItem) => void;
  onOpenApplication: (jobId: string) => void;
  onTrackClick: (jobId: string) => void;
}

function formatArgType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function JobDetailDrawer({
  jobId,
  onClose,
  onStatusChange,
  onOpenReject,
  onOpenApplication,
  onTrackClick,
}: JobDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<JobDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load job details.');
        return res.json();
      })
      .then((data: JobDetailResponse) => {
        if (active) setDetail(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Load error.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [jobId]);

  if (!jobId) return null;

  const job = detail?.job;

  const handleStatus = async (status: JobStatus) => {
    if (!job) return;
    setUpdating(true);
    try {
      await onStatusChange(job, status);
      setDetail((prev) => (prev ? { ...prev, job: { ...prev.job, status } } : prev));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/35 backdrop-blur-[1px]">
      <div
        className="flex-1"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="Opportunity details and jury debate"
        className="w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            {job ? (
              <>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mb-1.5">
                  <span className="font-medium text-slate-700">{job.source}</span>
                  <span aria-hidden="true">·</span>
                  <span>{job.posted_date || 'Recently posted'}</span>
                  <span aria-hidden="true">·</span>
                  <LivenessLabel status={job.liveness_status} />
                  <span aria-hidden="true">·</span>
                  <AuthenticityLabel status={job.authenticity_status} />
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900 leading-snug">
                  {job.title}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  {job.company} · {job.location || 'Global / Remote'}
                </p>
              </>
            ) : (
              <div className="h-12 w-64 bg-slate-100 rounded animate-pulse" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail drawer"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Strip */}
        {job && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {job.jury_score || job.score || 0}
                </span>
                <span className="text-xs text-slate-500">/100 consensus</span>
              </div>
              <span className="text-slate-300" aria-hidden="true">|</span>
              <PipelineStatusLabel status={job.status} />
              {typeof job.learned_boost === 'number' && job.learned_boost !== 0 && (
                <>
                  <span className="text-slate-300" aria-hidden="true">|</span>
                  <span
                    className={`font-mono text-xs font-medium tabular-nums ${
                      job.learned_boost > 0 ? 'text-blue-700' : 'text-amber-700'
                    }`}
                  >
                    {job.learned_boost > 0 ? `+${job.learned_boost}` : job.learned_boost} learned fit
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {job.status !== 'shortlisted' && job.status !== 'applied' && (
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleStatus('shortlisted')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Star className="w-3.5 h-3.5" />
                  Shortlist
                </button>
              )}
              {job.status === 'shortlisted' && (
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleStatus('applied')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Mark Applied
                </button>
              )}
              {(job.status === 'shortlisted' || job.status === 'applied') && (
                <button
                  type="button"
                  onClick={() => onOpenApplication(job.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Resume &amp; Cover Letter
                </button>
              )}
              {job.status !== 'dismissed' ? (
                <button
                  type="button"
                  onClick={() => onOpenReject(job)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:text-red-700 hover:border-red-300 rounded-lg transition-colors whitespace-nowrap"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  Reject
                </button>
              ) : (
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleStatus('new')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Restore to Pipeline
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 bg-slate-100 rounded-lg" />
              <div className="h-40 bg-slate-100 rounded-lg" />
              <div className="h-40 bg-slate-100 rounded-lg" />
            </div>
          ) : job ? (
            <>
              {/* Supreme Jury Verdict */}
              <section className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Scale className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>Supreme Jury Verdict</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-900">
                    {job.jury_verdict || detail?.verdict?.verdict || 'Pending Deliberation'}
                  </span>
                </div>
                {detail?.verdict?.recommendation && (
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {detail.verdict.recommendation}
                  </p>
                )}
              </section>

              {/* Immigration & Mobility Evidence */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500">
                  Mobility, Visa &amp; Authenticity Checks
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-100">
                  <div>
                    <dt className="text-xs text-slate-500">Visa Sponsorship Evidence</dt>
                    <dd
                      className={`text-sm font-medium mt-0.5 ${
                        (job.visa_evidence || '').includes('Mentioned')
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {job.visa_evidence || 'Not verified'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Relocation &amp; Accommodation</dt>
                    <dd
                      className={`text-sm font-medium mt-0.5 ${
                        (job.housing_evidence || '').includes('Mentioned')
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {job.housing_evidence || 'Not verified'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Domain Verification</dt>
                    <dd className="text-sm text-slate-700 mt-0.5">
                      {job.authenticity_evidence || 'HTTPS posting URL recorded; verify on employer career site.'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Sub-Agent Debate Transcript */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Sub-Agent Cross-Examination ({detail?.arguments.length || 0} notes)
                  </h3>
                  {job.advocate_agent && (
                    <span className="text-xs text-slate-500">
                      Primary advocate: <strong className="text-slate-700 font-medium">{job.advocate_agent}</strong>
                    </span>
                  )}
                </div>
                {detail?.arguments.length ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                    {detail.arguments.map((arg) => (
                      <div key={arg.id} className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-slate-900">
                              {arg.agent_name}
                            </span>
                            <span className="text-xs text-slate-500 ml-2">
                              {arg.agent_role}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-slate-500">
                              {formatArgType(arg.argument_type)}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                              {arg.score}/100
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {arg.statement}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-3 border-t border-slate-100">
                    Run &ldquo;Convene Jury&rdquo; to generate a fresh Sub-Agent cross-examination transcript for this role.
                  </p>
                )}
              </section>

              {/* Posting Description */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Posting Description
                  </h3>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onTrackClick(job.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <span>Open original posting</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line border-t border-slate-100 pt-3">
                  {job.description
                    ? job.description.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
                    : 'No posting description text recorded.'}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
