import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { TopNav } from './components/TopNav.tsx';
import type { NavTab } from './components/TopNav.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { JuryRoomView } from './components/JuryRoomView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { JobDetailDrawer } from './components/JobDetailDrawer.tsx';
import { RejectModal } from './components/RejectModal.tsx';
import { ApplicationModal } from './components/ApplicationModal.tsx';
import type { DashboardResponse, JobItem, JobStatus } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');

  // Overview state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [livenessFilter, setLivenessFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);

  // Shared modals & drawers
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<JobItem | null>(null);
  const [applicationJobId, setApplicationJobId] = useState<string | null>(null);

  // Global actions & feedback
  const [isConvening, setIsConvening] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const lastCycleAtRef = useRef<number>(Date.now());
  const bootStartedRef = useRef(false);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Debounce search query
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput);
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setErrorBanner(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        source: sourceFilter,
        liveness: livenessFilter,
        q: debouncedQuery,
        page: String(page),
        limit: '20',
      });
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error('Unable to load opportunities dashboard.');
      const payload = (await res.json()) as DashboardResponse;
      setDashboard(payload);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Dashboard request failed.');
    } finally {
      setDashboardLoading(false);
    }
  }, [statusFilter, sourceFilter, livenessFilter, debouncedQuery, page]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, refreshSignal]);

  const handleTrackClick = useCallback((jobId: string) => {
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'click' }),
    }).catch(() => {});
  }, []);

  const handleSelectJob = useCallback((job: JobItem) => {
    setSelectedJobId(job.id);
    fetch(`/api/jobs/${encodeURIComponent(job.id)}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'view_debate' }),
    }).catch(() => {});
  }, []);

  const handleStatusChange = useCallback(
    async (job: JobItem, status: JobStatus) => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update job status.');
        notify(data.message || `Updated status to ${status}.`);
        setRefreshSignal((n) => n + 1);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Status update failed.');
      }
    },
    [notify]
  );

  const handleRejectConfirm = useCallback(
    async (jobId: string, reason: string, detail: string) => {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed', reason, detail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dismiss job.');
      notify(data.message || 'Job dismissed and Jury trained.');
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
      }
      setRefreshSignal((n) => n + 1);
    },
    [notify, selectedJobId]
  );

  const handleConveneJury = useCallback(async (silentToast = false) => {
    setIsConvening(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/jury/convene', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Jury deliberation failed.');
      lastCycleAtRef.current = Date.now();
      if (!silentToast) {
        notify(data.message || 'Supreme Jury deliberation complete.');
      }
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to convene Jury.');
    } finally {
      setIsConvening(false);
    }
  }, [notify]);

  // Run fresh deliberation from scratch on every load/reload AND automatically every 24 hours
  useEffect(() => {
    if (!bootStartedRef.current) {
      bootStartedRef.current = true;
      handleConveneJury(true);
    }

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const check24hCycle = () => {
      if (Date.now() - lastCycleAtRef.current >= TWENTY_FOUR_HOURS_MS) {
        handleConveneJury(false);
      }
    };

    const intervalId = window.setInterval(check24hCycle, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        check24hCycle();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [handleConveneJury]);

  return (
    <div
      className={
        activeTab === 'jury'
          ? 'h-screen overflow-hidden flex flex-col bg-slate-950 text-slate-900'
          : 'min-h-screen flex flex-col bg-slate-50 text-slate-900'
      }
    >
      <TopNav
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onConveneJury={() => handleConveneJury(false)}
        isConvening={isConvening}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <main
        className={
          activeTab === 'jury'
            ? 'flex-1 w-full'
            : 'flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'
        }
      >
        {errorBanner && (
          <div className={activeTab === 'jury' ? 'p-4 m-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between gap-4 text-sm' : 'mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between gap-4 text-sm'}>
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-semibold hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewView
            data={dashboard}
            loading={dashboardLoading}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            livenessFilter={livenessFilter}
            searchInput={searchInput}
            page={page}
            isConvening={isConvening}
            onStatusFilterChange={(next) => {
              setStatusFilter(next);
              setPage(1);
            }}
            onSourceFilterChange={(next) => {
              setSourceFilter(next);
              setPage(1);
            }}
            onLivenessFilterChange={(next) => {
              setLivenessFilter(next);
              setPage(1);
            }}
            onSearchInputChange={setSearchInput}
            onPageChange={setPage}
            onSelectJob={handleSelectJob}
            onQuickStatus={handleStatusChange}
            onOpenReject={setRejectTarget}
            onOpenApplication={setApplicationJobId}
            onTrackClick={handleTrackClick}
            onConveneJury={() => handleConveneJury(false)}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'jury' && (
          <JuryRoomView
            onStatusChange={handleStatusChange}
            onOpenReject={setRejectTarget}
            onOpenApplication={setApplicationJobId}
            onTrackClick={handleTrackClick}
            onConveneJury={() => handleConveneJury(false)}
            isConvening={isConvening}
            refreshSignal={refreshSignal}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            onNotify={notify}
            onProfileSaved={() => setRefreshSignal((n) => n + 1)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            onConveneJury={() => handleConveneJury(false)}
            isConvening={isConvening}
            onNotify={notify}
            refreshSignal={refreshSignal}
          />
        )}
      </main>

      {activeTab !== 'jury' && (
        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>Adeena&apos;s Job Agent · Private Career Intelligence Workspace</span>
            <span>All submissions and decisions remain under manual candidate approval</span>
          </div>
        </footer>
      )}

      <JobDetailDrawer
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
        onStatusChange={handleStatusChange}
        onOpenReject={setRejectTarget}
        onOpenApplication={setApplicationJobId}
        onTrackClick={handleTrackClick}
      />

      <RejectModal
        job={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
      />

      <ApplicationModal
        jobId={applicationJobId}
        onClose={() => setApplicationJobId(null)}
        onNotify={notify}
      />
    </div>
  );
}
