import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Star,
  ThumbsDown,
} from 'lucide-react';
import type { DashboardResponse, JobItem, JobStatus } from '../types.ts';
import { AuthenticityLabel, LivenessLabel, PipelineStatusLabel } from './StatusText.tsx';
import { CuteRadarWidget } from './CuteRadarWidget.tsx';
import { DailyDigest } from './DailyDigest.tsx';
import { formatJobSalaryBadge, SalaryRangeSlider } from './SalaryRangeSlider.tsx';

interface OverviewViewProps {
  data: DashboardResponse | null;
  loading: boolean;
  statusFilter: string;
  sourceFilter: string;
  livenessFilter: string;
  fitFilter: 'matched' | 'all';
  searchInput: string;
  minSalary: number;
  maxSalary: number;
  includeUndisclosed: boolean;
  page: number;
  isConvening: boolean;
  onStatusFilterChange: (status: string) => void;
  onSourceFilterChange: (source: string) => void;
  onLivenessFilterChange: (liveness: string) => void;
  onFitFilterChange: (fit: 'matched' | 'all') => void;
  onSearchInputChange: (value: string) => void;
  onSalaryRangeChange: (min: number, max: number) => void;
  onIncludeUndisclosedChange: (include: boolean) => void;
  onResetSalaryRange: () => void;
  onPageChange: (page: number) => void;
  onSelectJob: (job: JobItem, eventType?: 'inspect' | 'view_debate') => void;
  onQuickStatus: (job: JobItem, status: JobStatus) => Promise<void>;
  onOpenReject: (job: JobItem) => void;
  onOpenApplication: (jobId: string) => void;
  onTrackClick: (jobId: string, eventType?: 'click' | 'inspect' | 'open_link' | 'view_debate' | 'view_drafts') => void;
  onConveneJury: () => void;
  onNavigateTab: (tab: 'jury' | 'profile') => void;
}

export function OverviewView({
  data,
  loading,
  statusFilter,
  sourceFilter,
  livenessFilter,
  fitFilter,
  searchInput,
  minSalary,
  maxSalary,
  includeUndisclosed,
  page,
  isConvening,
  onStatusFilterChange,
  onSourceFilterChange,
  onLivenessFilterChange,
  onFitFilterChange,
  onSearchInputChange,
  onSalaryRangeChange,
  onIncludeUndisclosedChange,
  onResetSalaryRange,
  onPageChange,
  onSelectJob,
  onQuickStatus,
  onOpenReject,
  onOpenApplication,
  onTrackClick,
  onConveneJury,
  onNavigateTab,
}: OverviewViewProps) {
  const stats = data?.stats;
  const profile = data?.profile;
  const dailyPicks = data?.dailyPicks || [];
  const jobs = data?.jobs || [];
  const pagination = data?.pagination;

  const statusTabs: Array<{ key: string; label: string; count?: number }> = [
    { key: 'all', label: 'Active', count: fitFilter === 'matched' ? (stats?.matchedCount ?? stats?.activeCount) : stats?.activeCount },
    { key: 'shortlisted', label: 'Shortlisted', count: stats?.shortlistedCount },
    { key: 'applied', label: 'Applied', count: stats?.appliedCount },
    { key: 'new', label: 'New', count: stats?.newCount },
    { key: 'expired', label: 'Expired', count: stats?.expiredCount ?? 0 },
  ];
  if (stats && stats.dismissedCount > 0) {
    statusTabs.push({ key: 'dismissed', label: 'Dismissed', count: stats.dismissedCount });
  }

  return (
    <div className="space-y-10">
      {/* Workspace Hero & Primary Controls */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-8 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 max-w-3xl">
          <div className="space-y-2.5 flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-500">
              {profile?.name || 'Candidate Workspace'}
              {profile?.residence ? ` · ${profile.residence}` : ''}
              {data?.latestDeliberation?.session_date
                ? ` · Last deliberated ${data.latestDeliberation.session_date}`
                : ''}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
              Multi-agent career radar, calibrated to your profile.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Scouts gather international and remote postings, Sub-Agents cross-examine CV fit and mobility evidence, and the Supreme Jury ranks your top reachable openings.
            </p>
          </div>

          <div className="self-start sm:self-center shrink-0 pb-2 sm:pb-0">
            <CuteRadarWidget
              isScanning={isConvening}
              picksCount={stats?.dailyPicksCount ?? dailyPicks.length}
              onClick={onConveneJury}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {data?.googleSearchUrl && (
            <a
              href={data.googleSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>Search ATS Boards on Google</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={onConveneJury}
            disabled={isConvening}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${isConvening ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{isConvening ? 'Refreshing Picks…' : 'Refresh Top 5'}</span>
          </button>
        </div>
      </section>

      {/* 4-Column Pipeline KPI Strip */}
      <section aria-label="Pipeline metrics">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">CV &amp; Level Matched</div>
            <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {stats ? (stats.matchedCount ?? stats.activeCount) : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {stats ? `${stats.seniorFilteredCount ?? 0} senior/language/off-track excluded` : 'Loading…'}
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Daily Jury Picks</div>
            <div className="font-mono text-2xl font-semibold text-blue-600 tabular-nums mt-1">
              {stats ? stats.dailyPicksCount : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Reachable top-ranked roles</div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Shortlisted</div>
            <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {stats ? stats.shortlistedCount : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Ready for tailored drafts</div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-slate-500">Applied</div>
            <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {stats ? stats.appliedCount : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">Submitted externally</div>
          </div>
        </div>
      </section>

      {/* Today's Top 5 Jury Selections */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Today&apos;s Jury Selection
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Top reachable vacancies approved after multi-agent cross-examination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('profile')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline self-start sm:self-auto"
          >
            Adjust matching criteria →
          </button>
        </div>

        {loading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-52 bg-white border border-slate-200 rounded-xl p-5 animate-pulse" />
            ))}
          </div>
        ) : dailyPicks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {dailyPicks.map((pick) => (
              <article
                key={pick.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  {/* Clean unboxed 1-line metadata kicker */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 truncate">
                      <span className="truncate">{pick.source}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{pick.posted_date}</span>
                    </div>
                    <LivenessLabel status={pick.liveness_status} />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectJob(pick, 'view_debate')}
                      className="text-left font-display text-base font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      {pick.title}
                    </button>
                    <p className="text-sm text-slate-600 mt-1 truncate">
                      {pick.company} · {pick.location || 'Remote'}
                    </p>
                    {pick.location_priority_tier && pick.location_priority_tier <= 2 && pick.location_priority_label && (
                      <p className="text-[11px] font-medium text-blue-700 mt-1 truncate">
                        {pick.location_priority_label}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 truncate">
                      <span className="text-slate-400">Visa: </span>
                      <span
                        className={
                          (pick.visa_evidence || '').includes('Mentioned')
                            ? 'font-medium text-emerald-700'
                            : 'text-slate-600'
                        }
                      >
                        {pick.visa_evidence || 'Not verified'}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-blue-700 tabular-nums shrink-0">
                      {pick.jury_score || pick.score}/100
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectJob(pick, 'view_debate')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap"
                  >
                    Read debate
                  </button>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {pick.status === 'shortlisted' || pick.status === 'applied' ? (
                      <button
                        type="button"
                        onClick={() => {
                          onTrackClick(pick.id, 'view_drafts');
                          onOpenApplication(pick.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Drafts
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onQuickStatus(pick, 'shortlisted')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap"
                      >
                        <Star className="w-3.5 h-3.5" />
                        Shortlist
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenReject(pick)}
                      aria-label={`Dislike ${pick.title}`}
                      title="Dislike & train Jury"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>Dislike</span>
                    </button>

                    {pick.url && (
                      <a
                        href={pick.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTrackClick(pick.id, 'open_link')}
                        aria-label={`Open ${pick.title} posting`}
                        className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <h3 className="font-display text-base font-semibold text-slate-900">
              No daily selections match your current constraints
            </h3>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              Only verified live openings matching your entry-level and skill rules enter the top 5 roster. Update your profile preferences or re-convene the Jury.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={onConveneJury}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Re-Convene Jury
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('profile')}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 24-Hour Agent Daily Digest (Top 3 High-Affinity Matches) */}
      <DailyDigest
        digest={data?.dailyDigest}
        loading={loading && !data}
        onSelectJob={onSelectJob}
        onQuickStatus={onQuickStatus}
        onOpenApplication={onOpenApplication}
        onTrackClick={onTrackClick}
        onNavigateJury={() => onNavigateTab('jury')}
      />

      {/* Master Opportunities Pipeline */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Opportunities Pipeline
            </h2>
            <p className="text-sm text-slate-600 mt-0.5 tabular-nums">
              {pagination
                ? `${pagination.totalMatching} matching vacancies`
                : 'Loading vacancies…'}
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Interactive Status Segmented Control */}
            <div
              role="tablist"
              aria-label="Filter vacancies by status"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
            >
              {statusTabs.map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => onStatusFilterChange(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                    {typeof tab.count === 'number' ? ` (${tab.count})` : ''}
                  </button>
                );
              })}
            </div>

            {/* Search & Secondary Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter by source"
                value={sourceFilter}
                onChange={(e) => onSourceFilterChange(e.target.value)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Sources</option>
                {stats?.sources.map((s) => (
                  <option key={s.source} value={s.source}>
                    {s.source} ({s.count})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" title="Filter senior and unrelated roles">
                <button
                  type="button"
                  onClick={() => onFitFilterChange('matched')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    fitFilter === 'matched'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  CV &amp; Level Fit
                </button>
                <button
                  type="button"
                  onClick={() => onFitFilterChange('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    fitFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Roles
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => onLivenessFilterChange('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    livenessFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Links
                </button>
                <button
                  type="button"
                  onClick={() => onLivenessFilterChange('live')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    livenessFilter === 'live'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live Only
                </button>
              </div>

              <div className="relative flex-1 sm:flex-initial min-w-[220px]">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => onSearchInputChange(e.target.value)}
                  placeholder="Search title, company, city…"
                  aria-label="Search vacancies"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <SalaryRangeSlider
            minSalary={minSalary}
            maxSalary={maxSalary}
            includeUndisclosed={includeUndisclosed}
            disclosedCount={data?.salaryStats?.disclosedCount}
            onChange={onSalaryRangeChange}
            onIncludeUndisclosedChange={onIncludeUndisclosedChange}
            onReset={onResetSalaryRange}
          />
        </div>

        {/* High-Density Data Table / Responsive List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading && !data ? (
            <div className="divide-y divide-slate-200">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-1/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                  <div className="h-6 bg-slate-100 rounded w-20" />
                </div>
              ))}
            </div>
          ) : jobs.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="px-4 sm:px-5 py-4 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{job.source}</span>
                      <span aria-hidden="true">·</span>
                      <LivenessLabel status={job.liveness_status} />
                      <span aria-hidden="true">·</span>
                      <AuthenticityLabel status={job.authenticity_status} />
                      {job.status !== 'new' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <PipelineStatusLabel status={job.status} />
                        </>
                      )}
                      {typeof job.cv_score === 'number' && job.cv_score > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono font-medium tabular-nums ${
                              job.cv_score >= 55
                                ? 'text-emerald-700'
                                : job.cv_score >= 35
                                  ? 'text-slate-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            CV {job.cv_score}%
                          </span>
                        </>
                      )}
                      {job.seniority_blocked === 1 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-amber-700">Senior / Off-Track</span>
                        </>
                      )}
                      {typeof job.learned_boost === 'number' && job.learned_boost !== 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono font-medium tabular-nums ${
                              job.learned_boost > 0 ? 'text-blue-700' : 'text-amber-700'
                            }`}
                          >
                            {job.learned_boost > 0 ? `+${job.learned_boost}` : job.learned_boost} fit
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectJob(job, 'inspect')}
                      className="text-left font-display text-base font-semibold text-slate-900 hover:text-blue-600 transition-colors block max-w-full truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      {job.title}
                    </button>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{job.company}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.location || 'Global / Remote'}</span>
                      {job.location_priority_tier && job.location_priority_tier <= 2 && job.location_priority_label && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-blue-700">{job.location_priority_label}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>Visa: {job.visa_evidence || 'Not verified'}</span>
                      {formatJobSalaryBadge(job.salary_min, job.salary_max, job.salary_currency) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-medium text-emerald-700 tabular-nums">
                            {formatJobSalaryBadge(job.salary_min, job.salary_max, job.salary_currency)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                    <div className="text-left lg:text-right">
                      <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {job.jury_score || job.score}/100
                      </div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">
                        {job.is_daily_pick === 1 ? 'Daily pick' : job.posted_date || 'Recently posted'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectJob(job, 'inspect')}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Inspect
                      </button>

                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onTrackClick(job.id, 'open_link')}
                          aria-label={`Open ${job.title} posting`}
                          title={job.url}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/60 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {job.status === 'shortlisted' || job.status === 'applied' ? (
                        <button
                          type="button"
                          onClick={() => {
                            onTrackClick(job.id, 'view_drafts');
                            onOpenApplication(job.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Drafts
                        </button>
                      ) : job.status === 'dismissed' ? (
                        <button
                          type="button"
                          onClick={() => onQuickStatus(job, 'new')}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onQuickStatus(job, 'shortlisted')}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Shortlist
                        </button>
                      )}

                      {job.status !== 'dismissed' && (
                        <button
                          type="button"
                          onClick={() => onOpenReject(job)}
                          aria-label={`Reject ${job.title}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center space-y-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                No vacancies match your filters
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Clear your search query or switch status filters to view the rest of the pipeline.
              </p>
              <button
                type="button"
                onClick={() => {
                  onStatusFilterChange('all');
                  onSourceFilterChange('all');
                  onLivenessFilterChange('all');
                  onSearchInputChange('');
                  onResetSalaryRange();
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* Pagination Footer */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-600 tabular-nums">
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalMatching} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
