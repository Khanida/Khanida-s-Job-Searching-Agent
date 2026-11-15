import { useEffect, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Scale,
  Star,
  ThumbsDown,
  X,
} from 'lucide-react';
import type { JobItem, JobStatus, JuryRoomResponse } from '../types.ts';
import { AuthenticityLabel, LivenessLabel, PipelineStatusLabel } from './StatusText.tsx';
import { JuryCourtroomCGI } from './JuryCourtroomCGI.tsx';

interface JuryRoomViewProps {
  onStatusChange: (job: JobItem, status: JobStatus) => Promise<void>;
  onOpenReject: (job: JobItem) => void;
  onOpenApplication: (jobId: string) => void;
  onTrackClick: (jobId: string) => void;
  onConveneJury: () => Promise<void>;
  isConvening: boolean;
  refreshSignal: number;
}

function formatArgType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function JuryRoomView({
  onStatusChange,
  onOpenReject,
  onOpenApplication,
  onTrackClick,
  onConveneJury,
  isConvening,
  refreshSignal,
}: JuryRoomViewProps) {
  const [data, setData] = useState<JuryRoomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [docketOpen, setDocketOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch('/api/jury')
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load Jury deliberations.');
        return res.json();
      })
      .then((payload: JuryRoomResponse) => {
        if (!active) return;
        setData(payload);
        if (payload.items.length > 0) {
          setSelectedId((prev) =>
            prev && payload.items.some((i) => i.job.id === prev)
              ? prev
              : payload.items[0].job.id
          );
        } else {
          setSelectedId(null);
        }
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
  }, [refreshSignal]);

  const selectedItem =
    data?.items.find((item) => item.job.id === selectedId) || data?.items[0] || null;

  return (
    <div className="relative w-full">
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 p-3 text-sm text-red-200 bg-red-950/90 border border-red-700 rounded-xl">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="w-full h-screen min-h-[600px] bg-slate-950 flex items-center justify-center text-slate-300 text-sm">
          Preparing Supreme Jury Courtroom…
        </div>
      ) : (
        <JuryCourtroomCGI
          items={data?.items || []}
          selectedJobId={selectedItem?.job.id || null}
          sessionId={data?.deliberation?.id || 'Pending'}
          sessionDate={data?.deliberation?.session_date || ''}
          isConvening={isConvening}
          onSelectJob={(jobId) => setSelectedId(jobId)}
          onStatusChange={onStatusChange}
          onOpenApplication={onOpenApplication}
          onTrackClick={onTrackClick}
          onConveneJury={onConveneJury}
          onOpenDocket={() => setDocketOpen(true)}
        />
      )}

      {/* Slide-Over Full Docket & Cross-Examination Drawer */}
      {docketOpen && data && selectedItem && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60">
          <div className="flex-1" onClick={() => setDocketOpen(false)} aria-hidden="true" />
          <aside
            aria-label="Full Jury Docket and Cross-Examination Transcripts"
            className="w-full max-w-4xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Courtroom Docket &amp; Debate Transcripts
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {data.deliberation?.summary || `Reviewing ${data.items.length} screened vacancies`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocketOpen(false)}
                aria-label="Close docket drawer"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
              {/* Left List */}
              <div
                role="listbox"
                aria-label="Deliberated roles"
                className="md:col-span-5 border-r border-slate-200 overflow-y-auto divide-y divide-slate-200"
              >
                {data.items.map(({ job }) => {
                  const active = job.id === selectedItem.job.id;
                  return (
                    <button
                      key={job.id}
                      role="option"
                      aria-selected={active}
                      type="button"
                      onClick={() => setSelectedId(job.id)}
                      className={`w-full text-left p-4 transition-colors ${
                        active ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-medium truncate">
                          {job.is_daily_pick === 1 ? 'Daily Selection' : job.source}
                        </span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                          {job.jury_score || job.score}/100
                        </span>
                      </div>
                      <div className="font-display text-sm font-semibold text-slate-900 line-clamp-2">
                        {job.title}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5 text-xs text-slate-600">
                        <span className="truncate">{job.company}</span>
                        <LivenessLabel status={job.liveness_status} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Transcript */}
              <div className="md:col-span-7 overflow-y-auto">
                <div className="p-6 border-b border-slate-200 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <LivenessLabel status={selectedItem.job.liveness_status} />
                        <span aria-hidden="true">·</span>
                        <AuthenticityLabel status={selectedItem.job.authenticity_status} />
                        <span aria-hidden="true">·</span>
                        <PipelineStatusLabel status={selectedItem.job.status} />
                      </div>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {selectedItem.job.title}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {selectedItem.job.company} · {selectedItem.job.location || 'Global / Remote'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-xl font-bold text-blue-700 tabular-nums">
                        {selectedItem.job.jury_score || selectedItem.job.score}/100
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedItem.job.status !== 'shortlisted' &&
                        selectedItem.job.status !== 'applied' && (
                          <button
                            type="button"
                            onClick={() => onStatusChange(selectedItem.job, 'shortlisted')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" />
                            Shortlist
                          </button>
                        )}
                      {(selectedItem.job.status === 'shortlisted' ||
                        selectedItem.job.status === 'applied') && (
                        <button
                          type="button"
                          onClick={() => onOpenApplication(selectedItem.job.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Resume &amp; Cover Letter
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenReject(selectedItem.job)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:text-red-700 hover:border-red-300 rounded-lg transition-colors"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>

                    {selectedItem.job.url && (
                      <a
                        href={selectedItem.job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTrackClick(selectedItem.job.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        <span>Open posting</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                      <Scale className="w-3.5 h-3.5 text-blue-600" />
                      Supreme Jury Verdict
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedItem.job.jury_verdict || selectedItem.verdict?.verdict || 'Pending'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">
                    {selectedItem.verdict?.recommendation ||
                      'Review job details and confirm work authorization requirements before applying.'}
                  </p>
                </div>

                <div className="p-6 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500">
                    Court Debate &amp; Cross-Examination ({selectedItem.arguments.length})
                  </h4>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {selectedItem.arguments.map((arg) => (
                      <div key={arg.id} className="p-4 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-semibold text-slate-900">
                              {arg.agent_name}
                            </span>
                            <span className="text-xs text-slate-500 ml-2">
                              {arg.agent_role}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-500">
                              {formatArgType(arg.argument_type)}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
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
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
