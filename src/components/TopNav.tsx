import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cloud, Loader2, LogIn, LogOut, Scale } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

export type NavTab = 'overview' | 'jury' | 'profile' | 'settings';

interface TopNavProps {
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onConveneJury: () => void;
  isConvening: boolean;
}

const NAV_ITEMS: Array<{ key: NavTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'jury', label: 'Jury Room' },
  { key: 'profile', label: 'Profile' },
  { key: 'settings', label: 'Settings' },
];

export function TopNav({
  activeTab,
  onNavigate,
  onConveneJury,
  isConvening,
}: TopNavProps) {
  const { user, authReady, syncingCloud, signInWithGoogle, signOut } = useAuth();
  const isJuryFullscreen = activeTab === 'jury';
  const [navRevealed, setNavRevealed] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const revealNav = () => {
    clearHideTimer();
    setNavRevealed(true);
  };

  const scheduleHideNav = (delay = 350) => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setNavRevealed(false);
    }, delay);
  };

  useEffect(() => {
    if (!isJuryFullscreen) {
      clearHideTimer();
      setNavRevealed(false);
      return;
    }

    // Briefly show on entering Jury Room, then auto-hide to yield full 100vh
    setNavRevealed(false);

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= 18) {
        revealNav();
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      clearHideTimer();
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isJuryFullscreen]);

  const headerClass = isJuryFullscreen
    ? `fixed top-0 inset-x-0 z-40 bg-white border-b border-slate-200 shadow-lg transition-transform duration-200 ease-out ${
        navRevealed ? 'translate-y-0' : '-translate-y-full pointer-events-none'
      }`
    : 'sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200';

  return (
    <>
      {isJuryFullscreen && !navRevealed && (
        <button
          type="button"
          onClick={revealNav}
          onMouseEnter={revealNav}
          aria-label="Show navigation bar"
          className="fixed top-0 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium text-slate-200 bg-slate-950/92 hover:bg-slate-900 border border-t-0 border-slate-700/80 rounded-b-lg shadow-md transition-colors"
        >
          <span>Menu</span>
          <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />
        </button>
      )}

      <header
        onMouseEnter={() => {
          if (isJuryFullscreen) revealNav();
        }}
        onMouseLeave={() => {
          if (isJuryFullscreen) scheduleHideNav(300);
        }}
        onFocusCapture={() => {
          if (isJuryFullscreen) revealNav();
        }}
        className={headerClass}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-blue-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            Adeena&apos;s Job Agent
          </button>

          {/* Zone 2: Clean Typography Nav Links */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-7">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                    active
                      ? 'text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-blue-600"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Cloud Account & Convene Jury */}
          <div className="flex items-center gap-2.5 shrink-0">
            {authReady && (
              user ? (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Account avatar'}
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </span>
                  )}
                  <span className="hidden lg:inline text-xs font-medium text-slate-700 max-w-[110px] truncate">
                    {user.displayName?.split(' ')[0] || 'Saved'}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 whitespace-nowrap"
                    title={syncingCloud ? 'Syncing with cloud database…' : 'Profile, CV, and Jury memory saved to cloud'}
                  >
                    {syncingCloud ? (
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" aria-hidden="true" />
                    ) : (
                      <Cloud className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">{syncingCloud ? 'Syncing' : 'Synced'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    title="Sign out"
                    aria-label="Sign out"
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
                  <span>Sign in to Save</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={onConveneJury}
              disabled={isConvening}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Scale className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{isConvening ? 'Deliberating…' : 'Convene Jury'}</span>
            </button>
          </div>
        </div>

        {/* Compact Mobile Navigation Row */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-100 px-4 py-1.5 flex items-center gap-4 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`py-1.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>
    </>
  );
}
