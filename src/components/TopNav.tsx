import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cloud, HelpCircle, Loader2, LogIn, LogOut, Scale } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

export type NavTab = 'overview' | 'jury' | 'profile' | 'settings';

interface TopNavProps {
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onConveneJury: () => void;
  isConvening: boolean;
  onOpenWalkthrough?: () => void;
}

const NAV_ITEMS: Array<{ key: NavTab; label: string; shortcut: string }> = [
  { key: 'overview', label: 'Overview', shortcut: 'O' },
  { key: 'jury', label: 'Jury Room', shortcut: 'J' },
  { key: 'profile', label: 'Profile', shortcut: 'P' },
  { key: 'settings', label: 'Settings', shortcut: 'S' },
];

export function TopNav({
  activeTab,
  onNavigate,
  onConveneJury,
  isConvening,
  onOpenWalkthrough,
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
                  title={`${item.label} (Shortcut: ${item.shortcut})`}
                  className={`relative py-2 inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                    active
                      ? 'text-blue-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{item.label}</span>
                  <kbd
                    className={`hidden lg:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                      active
                        ? 'text-blue-600 bg-blue-50 border-blue-200'
                        : 'text-slate-400 bg-slate-50 border-slate-200'
                    }`}
                  >
                    {item.shortcut}
                  </kbd>
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
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-3.5 h-3.5 shrink-0 block"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              )
            )}

            {onOpenWalkthrough && (
              <button
                type="button"
                onClick={onOpenWalkthrough}
                title="App walkthrough & keyboard shortcuts (?)"
                aria-label="Open walkthrough and keyboard shortcuts"
                className="p-2 text-slate-500 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
              </button>
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
