import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cloud, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import type { JuryDecisionRecord } from '../firebase.ts';

type ChartViewMode = 'matches' | 'decisions';

interface TooltipPayloadEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: JuryDecisionRecord;
}

function CustomTrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || !payload.length) return null;
  const record = payload[0]?.payload;
  if (!record) return null;

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg p-3.5 text-xs space-y-2 min-w-[210px]">
      <div className="border-b border-slate-100 pb-1.5">
        <div className="font-display font-bold text-slate-900">{record.label}</div>
        <div className="text-[11px] text-slate-500 font-mono">{record.sessionDate}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
        <span className="text-slate-500">Qualified Matches:</span>
        <span className="font-mono font-semibold text-blue-700 text-right">{record.matchedCount}</span>

        <span className="text-slate-500">Avg Match Score:</span>
        <span className="font-mono font-semibold text-emerald-700 text-right">{record.avgMatchScore}%</span>

        <span className="text-slate-500">Top Pick Score:</span>
        <span className="font-mono font-semibold text-violet-700 text-right">{record.topMatchScore}%</span>

        <span className="text-slate-500">Shortlisted:</span>
        <span className="font-mono font-semibold text-slate-800 text-right">{record.shortlistedCount}</span>

        <span className="text-slate-500">Disliked:</span>
        <span className="font-mono font-semibold text-rose-600 text-right">{record.dismissedCount}</span>

        <span className="text-slate-500">Reviewed Pool:</span>
        <span className="font-mono text-slate-700 text-right">{record.reviewedCount}</span>
      </div>
    </div>
  );
}

export function JuryMatchTrendChart() {
  const { user, juryDecisions, syncingCloud, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<ChartViewMode>('matches');

  const chartData = useMemo(() => {
    return juryDecisions.map((d, idx) => ({
      ...d,
      shortLabel: d.label || `Session ${idx + 1}`,
    }));
  }, [juryDecisions]);

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const first = chartData.length > 0 ? chartData[0] : null;
  const scoreDelta =
    latest && first && chartData.length > 1 ? latest.avgMatchScore - first.avgMatchScore : 0;

  return (
    <section
      aria-label="Jury match trends over time"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" aria-hidden="true" />
              <span>Jury Match Trend Over Time</span>
            </h2>
            {user ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
                <Cloud className="w-3 h-3" aria-hidden="true" />
                <span>
                  {syncingCloud
                    ? 'Syncing Firestore…'
                    : `Firebase Firestore · ${chartData.length} ${chartData.length === 1 ? 'checkpoint' : 'checkpoints'}`}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
                <Cloud className="w-3 h-3" aria-hidden="true" />
                <span>Firebase Sync Off</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Real-time progression of qualified matches, jury score calibration, shortlists, and dislikes recorded in your Firebase account.
          </p>
        </div>

        {user && chartData.length > 0 && (
          <div
            role="tablist"
            aria-label="Chart metric view"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start md:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'matches'}
              onClick={() => setMode('matches')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'matches'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matches &amp; Score %
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'decisions'}
              onClick={() => setMode('decisions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'decisions'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Shortlisted vs. Disliked
            </button>
          </div>
        )}
      </div>

      {!user ? (
        <div className="border border-dashed border-slate-200 bg-slate-50/70 rounded-xl p-8 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Cloud className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Sign in with Google to track live Jury match trends in Firebase
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Each time the Jury convenes or learns from your shortlists, clicks, and dislikes, a timestamped decision snapshot is saved to Firebase Firestore and plotted here automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign in with Google</span>
          </button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="border border-dashed border-slate-200 bg-slate-50/70 rounded-xl p-8 text-center space-y-2">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Collecting your first Firebase Jury checkpoint…
          </h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Click <strong>Refresh Top 5</strong> or shortlist/dislike any vacancy to record your first Jury decision trend point.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compact Summary Strip */}
          {latest && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="text-[11px] font-medium text-slate-500">Qualified Matches</div>
                <div className="font-mono text-lg font-semibold text-blue-700 tabular-nums mt-0.5">
                  {latest.matchedCount}
                </div>
              </div>
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="text-[11px] font-medium text-slate-500">Avg Match Score</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-mono text-lg font-semibold text-emerald-700 tabular-nums">
                    {latest.avgMatchScore}%
                  </span>
                  {scoreDelta !== 0 && (
                    <span
                      className={`text-[11px] font-mono font-medium ${
                        scoreDelta > 0 ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                    </span>
                  )}
                </div>
              </div>
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="text-[11px] font-medium text-slate-500">Peak Jury Score</div>
                <div className="font-mono text-lg font-semibold text-violet-700 tabular-nums mt-0.5">
                  {latest.topMatchScore}%
                </div>
              </div>
              <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-lg">
                <div className="text-[11px] font-medium text-slate-500">Shortlisted / Disliked</div>
                <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums mt-0.5">
                  {latest.shortlistedCount} <span className="text-slate-400 text-sm">/</span>{' '}
                  <span className="text-rose-600">{latest.dismissedCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* Recharts Visualization Container */}
          <div className="w-full h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              {mode === 'matches' ? (
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="matchedJobsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="matchedCount"
                    name="Qualified Matches"
                    stroke="#2563eb"
                    strokeWidth={2.2}
                    fill="url(#matchedJobsGradient)"
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgMatchScore"
                    name="Avg Match Score (%)"
                    stroke="#10b981"
                    strokeWidth={2.2}
                    dot={{ r: 3.5, fill: '#10b981' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="topMatchScore"
                    name="Top Pick Score (%)"
                    stroke="#7c3aed"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#7c3aed' }}
                  />
                </ComposedChart>
              ) : (
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTrendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar
                    dataKey="shortlistedCount"
                    name="Shortlisted"
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                    barSize={22}
                  />
                  <Bar
                    dataKey="dismissedCount"
                    name="Disliked"
                    fill="#f43f5e"
                    radius={[5, 5, 0, 0]}
                    barSize={22}
                  />
                  <Line
                    type="monotone"
                    dataKey="dailyPicksCount"
                    name="Daily Top Picks"
                    stroke="#10b981"
                    strokeWidth={2.2}
                    dot={{ r: 3.5, fill: '#10b981' }}
                  />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
