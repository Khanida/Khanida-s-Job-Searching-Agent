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
import { EmailDigestConfirmModal } from './components/EmailDigestConfirmModal.tsx';
import { OnboardingWalkthrough } from './components/OnboardingWalkthrough.tsx';
import { SALARY_SLIDER_MAX, SALARY_SLIDER_MIN } from './components/SalaryRangeSlider.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { syncJobActionToCloud, syncLearnedWeightsToCloud } from './firebase.ts';
import type { DashboardResponse, EmailDigestStatus, JobItem, JobStatus } from './types.ts';

const WALKTHROUGH_STORAGE_KEY = 'adeena_job_agent_tour_v1';

type ClickEventType = 'click' | 'inspect' | 'open_link' | 'view_debate' | 'view_drafts';

function AppWorkspace({
  refreshSignal,
  triggerRefresh,
}: {
  refreshSignal: number;
  triggerRefresh: () => void;
}) {
  const {
    user,
    cloudError,
    hasGmailPermission,
    gmailAccessToken,
    connectGmail,
    clearGmailToken,
    recordJurySnapshot,
    syncEmailPref,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('overview');

  // Overview state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [livenessFilter, setLivenessFilter] = useState('all');
  const [fitFilter, setFitFilter] = useState<'matched' | 'all'>('matched');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [minSalary, setMinSalary] = useState(SALARY_SLIDER_MIN);
  const [maxSalary, setMaxSalary] = useState(SALARY_SLIDER_MAX);
  const [debouncedSalaryRange, setDebouncedSalaryRange] = useState({
    min: SALARY_SLIDER_MIN,
    max: SALARY_SLIDER_MAX,
  });
  const [includeUndisclosed, setIncludeUndisclosed] = useState(false);
  const [page, setPage] = useState(1);

  // Shared modals & drawers
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<JobItem | null>(null);
  const [applicationJobId, setApplicationJobId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailDigestStatus | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // Global actions & feedback
  const [isConvening, setIsConvening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) !== 'done';
    } catch {
      return false;
    }
  });
  const lastCycleAtRef = useRef<number>(Date.now());
  const bootStartedRef = useRef(false);

  const closeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    try {
      window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, 'done');
    } catch {
      // Ignore storage failures
    }
  }, []);

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

  // Debounce salary range slider
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSalaryRange({ min: minSalary, max: maxSalary });
      setPage(1);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [minSalary, maxSalary]);

  const fetchDashboard = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setDashboardLoading(true);
      }
      setErrorBanner(null);
      try {
        const params = new URLSearchParams({
          status: statusFilter,
          source: sourceFilter,
          liveness: livenessFilter,
          fitFilter,
          q: debouncedQuery,
          minSalary: String(debouncedSalaryRange.min),
          maxSalary: String(debouncedSalaryRange.max),
          includeUndisclosed: String(includeUndisclosed),
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
        if (!quiet) {
          setDashboardLoading(false);
        }
      }
    },
    [
      statusFilter,
      sourceFilter,
      livenessFilter,
      fitFilter,
      debouncedQuery,
      debouncedSalaryRange,
      includeUndisclosed,
      page,
    ]
  );

  useEffect(() => {
    void fetchDashboard(false);
  }, [fetchDashboard, refreshSignal]);

  const fetchEmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/email/status');
      if (!res.ok) return;
      const payload = (await res.json()) as EmailDigestStatus;
      setEmailStatus(payload);
    } catch {
      // Ignore transient email status errors
    }
  }, []);

  useEffect(() => {
    void fetchEmailStatus();
  }, [fetchEmailStatus, refreshSignal, user?.uid]);

  const autoPromptedDateRef = useRef<string>('');
  useEffect(() => {
    if (
      emailStatus?.dueToday &&
      hasGmailPermission &&
      autoPromptedDateRef.current !== emailStatus.todayDate &&
      !emailModalOpen
    ) {
      autoPromptedDateRef.current = emailStatus.todayDate;
      setEmailModalOpen(true);
    }
  }, [emailModalOpen, emailStatus, hasGmailPermission]);

  const handleSaveEmailPreferences = useCallback(
    async (enabled: boolean, recipientEmail: string) => {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, recipientEmail }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to save email settings.');
      if (payload.status) {
        setEmailStatus(payload.status);
        if (user) {
          void syncEmailPref({
            enabled: payload.status.enabled,
            recipientEmail: payload.status.recipientEmail,
            lastSentDate: payload.status.lastSentDate,
            lastSubject: payload.status.lastSubject,
            lastSentCount: payload.status.lastSentCount,
          });
        }
      }
      notify(payload.message || 'Saved email preferences.');
    },
    [notify, syncEmailPref, user]
  );

  const handleConfirmSendDailyEmail = useCallback(
    async (recipientEmail: string) => {
      const token = gmailAccessToken || (await connectGmail());
      if (!token) {
        throw new Error('Google Gmail sign-in is required before sending.');
      }

      const res = await fetch('/api/email/send-daily-picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientEmail }),
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.needsReauth) {
          clearGmailToken();
        }
        throw new Error(payload.error || 'Unable to send daily Jury picks email.');
      }

      if (payload.status) {
        setEmailStatus(payload.status);
        if (user) {
          void syncEmailPref({
            enabled: payload.status.enabled,
            recipientEmail: payload.status.recipientEmail,
            lastSentDate: payload.status.lastSentDate,
            lastSubject: payload.status.lastSubject,
            lastSentCount: payload.status.lastSentCount,
          });
        }
      }
      notify(payload.message || `Sent daily Jury picks email to ${recipientEmail}.`);
    },
    [clearGmailToken, connectGmail, gmailAccessToken, notify, syncEmailPref, user]
  );

  const handleTrackClick = useCallback(
    (jobId: string, eventType: ClickEventType = 'click') => {
      fetch(`/api/jobs/${encodeURIComponent(jobId)}/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          void fetchDashboard(true);
          if (user && Array.isArray(data.weights)) {
            void syncLearnedWeightsToCloud(user.uid, data.weights);
          }
          if (data.jurySnapshot) {
            void recordJurySnapshot(data.jurySnapshot);
          }
        })
        .catch(() => {});
    },
    [fetchDashboard, recordJurySnapshot, user]
  );

  const handleSelectJob = useCallback(
    (job: JobItem, eventType: 'inspect' | 'view_debate' = 'view_debate') => {
      setSelectedJobId(job.id);
      handleTrackClick(job.id, eventType);
    },
    [handleTrackClick]
  );

  const handleOpenApplication = useCallback((jobId: string) => {
    setApplicationJobId(jobId);
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
        if (user) {
          void syncJobActionToCloud(user.uid, {
            jobId: job.id,
            status,
          });
          if (Array.isArray(data.weights)) {
            void syncLearnedWeightsToCloud(user.uid, data.weights);
          }
          if (data.jurySnapshot) {
            void recordJurySnapshot(data.jurySnapshot);
          }
        }
        notify(data.message || `Updated status to ${status}.`);
        triggerRefresh();
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Status update failed.');
      }
    },
    [notify, recordJurySnapshot, triggerRefresh, user]
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
      if (user) {
        void syncJobActionToCloud(user.uid, {
          jobId,
          status: 'dismissed',
          reason,
          detail,
        });
        if (Array.isArray(data.weights)) {
          void syncLearnedWeightsToCloud(user.uid, data.weights);
        }
        if (data.jurySnapshot) {
          void recordJurySnapshot(data.jurySnapshot);
        }
      }
      notify(data.message || 'Job disliked & Jury trained.');
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
      }
      triggerRefresh();
    },
    [notify, recordJurySnapshot, selectedJobId, triggerRefresh, user]
  );

  const handleConveneJury = useCallback(
    async (silentToast = false) => {
      setIsConvening(true);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/jury/convene', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Jury deliberation failed.');
        lastCycleAtRef.current = Date.now();
        if (data.jurySnapshot) {
          void recordJurySnapshot(data.jurySnapshot);
        }
        if (!silentToast) {
          notify(data.message || 'Supreme Jury deliberation complete.');
        }
        triggerRefresh();
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Unable to convene Jury.');
      } finally {
        setIsConvening(false);
      }
    },
    [notify, recordJurySnapshot, triggerRefresh]
  );

  // Run fresh deliberation from scratch on every load/reload AND automatically every 24 hours
  useEffect(() => {
    if (!bootStartedRef.current) {
      bootStartedRef.current = true;
      void handleConveneJury(true);
    }

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const check24hCycle = () => {
      if (Date.now() - lastCycleAtRef.current >= TWENTY_FOUR_HOURS_MS) {
        void handleConveneJury(false);
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

  // Global keyboard shortcuts: O (Overview), J (Jury Room), P (Profile), S (Settings), ? (Walkthrough)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setWalkthroughOpen((prev) => !prev);
        return;
      }

      if (walkthroughOpen || selectedJobId || rejectTarget || applicationJobId || emailModalOpen) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        setActiveTab('overview');
      } else if (key === 'j') {
        e.preventDefault();
        setActiveTab('jury');
      } else if (key === 'p') {
        e.preventDefault();
        setActiveTab('profile');
      } else if (key === 's') {
        e.preventDefault();
        setActiveTab('settings');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [walkthroughOpen, selectedJobId, rejectTarget, applicationJobId, emailModalOpen]);

  const activeError = errorBanner || cloudError;

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
        onConveneJury={() => void handleConveneJury(false)}
        isConvening={isConvening}
        onOpenWalkthrough={() => setWalkthroughOpen(true)}
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
        {activeError && (
          <div
            className={
              activeTab === 'jury'
                ? 'p-4 m-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between gap-4 text-sm'
                : 'mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center justify-between gap-4 text-sm'
            }
          >
            <span>{activeError}</span>
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
            fitFilter={fitFilter}
            searchInput={searchInput}
            minSalary={minSalary}
            maxSalary={maxSalary}
            includeUndisclosed={includeUndisclosed}
            page={page}
            isConvening={isConvening}
            onStatusFilterChange={(next) => {
              setStatusFilter(next);
              if (next === 'expired') {
                setLivenessFilter('all');
              }
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
            onFitFilterChange={(next) => {
              setFitFilter(next);
              setPage(1);
            }}
            onSearchInputChange={setSearchInput}
            onSalaryRangeChange={(nextMin, nextMax) => {
              setMinSalary(nextMin);
              setMaxSalary(nextMax);
            }}
            onIncludeUndisclosedChange={(next) => {
              setIncludeUndisclosed(next);
              setPage(1);
            }}
            onResetSalaryRange={() => {
              setMinSalary(SALARY_SLIDER_MIN);
              setMaxSalary(SALARY_SLIDER_MAX);
              setIncludeUndisclosed(false);
              setPage(1);
            }}
            onPageChange={setPage}
            onSelectJob={handleSelectJob}
            onQuickStatus={handleStatusChange}
            onOpenReject={setRejectTarget}
            onOpenApplication={handleOpenApplication}
            onTrackClick={handleTrackClick}
            onConveneJury={() => void handleConveneJury(false)}
            onNavigateTab={(tab) => setActiveTab(tab)}
            emailStatus={emailStatus}
            defaultEmail={user?.email || 'khanzadaaneeda@gmail.com'}
            hasGmailPermission={hasGmailPermission}
            onConnectGmail={connectGmail}
            onSaveEmailPreferences={handleSaveEmailPreferences}
            onRequestEmailModal={() => setEmailModalOpen(true)}
          />
        )}

        {activeTab === 'jury' && (
          <JuryRoomView
            onStatusChange={handleStatusChange}
            onOpenReject={setRejectTarget}
            onOpenApplication={(jobId) => {
              handleTrackClick(jobId, 'view_drafts');
              handleOpenApplication(jobId);
            }}
            onTrackClick={(jobId) => handleTrackClick(jobId, 'open_link')}
            onConveneJury={() => handleConveneJury(false)}
            isConvening={isConvening}
            refreshSignal={refreshSignal}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            onNotify={notify}
            onProfileSaved={triggerRefresh}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            onConveneJury={() => handleConveneJury(false)}
            isConvening={isConvening}
            onNotify={notify}
            refreshSignal={refreshSignal}
            emailStatus={emailStatus}
            defaultEmail={user?.email || 'khanzadaaneeda@gmail.com'}
            hasGmailPermission={hasGmailPermission}
            onConnectGmail={connectGmail}
            onSaveEmailPreferences={handleSaveEmailPreferences}
            onRequestEmailModal={() => setEmailModalOpen(true)}
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
        onOpenApplication={handleOpenApplication}
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

      <EmailDigestConfirmModal
        open={emailModalOpen}
        status={emailStatus}
        defaultEmail={user?.email || 'khanzadaaneeda@gmail.com'}
        hasGmailPermission={hasGmailPermission}
        onConnectGmail={connectGmail}
        onConfirmSend={handleConfirmSendDailyEmail}
        onClose={() => setEmailModalOpen(false)}
      />

      <OnboardingWalkthrough
        open={walkthroughOpen}
        onClose={closeWalkthrough}
        onNavigate={setActiveTab}
      />
    </div>
  );
}

export default function App() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  return (
    <AuthProvider onWorkspaceHydrated={triggerRefresh}>
      <AppWorkspace refreshSignal={refreshSignal} triggerRefresh={triggerRefresh} />
    </AuthProvider>
  );
}
