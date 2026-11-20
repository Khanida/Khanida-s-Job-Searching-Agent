import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ChevronLeft,
  FileText,
  Keyboard,
  Radar,
  Scale,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import type { NavTab } from './TopNav.tsx';

interface OnboardingWalkthroughProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (tab: NavTab) => void;
}

interface WalkthroughStep {
  id: string;
  badge: string;
  title: string;
  description: string;
  shortcutKey: string;
  shortcutLabel: string;
  targetTab: NavTab;
  highlights: string[];
  icon: typeof Radar;
  accentBg: string;
  accentText: string;
}

const STEPS: WalkthroughStep[] = [
  {
    id: 'radar',
    badge: 'Step 1 of 4 · Career Radar',
    title: "Welcome to Adeena's Job Agent",
    description:
      'Your multi-agent workspace continuously scans 10 job boards, verifies live links, and ranks your top reachable daily picks right on Overview.',
    shortcutKey: 'O',
    shortcutLabel: 'Jump to Overview',
    targetTab: 'overview',
    highlights: [
      'Today’s Top 5 Jury Selections appear first with live link status & visa signals',
      'Every click, inspect, shortlist, or dislike trains Jury scoring immediately',
    ],
    icon: Radar,
    accentBg: 'bg-blue-50 border-blue-200',
    accentText: 'text-blue-600',
  },
  {
    id: 'jury',
    badge: 'Step 2 of 4 · Deliberation',
    title: 'Inside the Supreme Jury Room',
    description:
      'Watch Scouts submit batches of vacancies while specialist Sub-Agents debate skills, seniority fit, and link reachability one case at a time.',
    shortcutKey: 'J',
    shortcutLabel: 'Open Jury Room',
    targetTab: 'jury',
    highlights: [
      'Inspect case-by-case arguments from Technical, Visa, and Availability examiners',
      'Shortlist winners or reject mismatches directly from the courtroom stage',
    ],
    icon: Scale,
    accentBg: 'bg-indigo-50 border-indigo-200',
    accentText: 'text-indigo-600',
  },
  {
    id: 'profile',
    badge: 'Step 3 of 4 · Profile & CV Studio',
    title: 'One-Time CV Sync & Tailored PDFs',
    description:
      'Upload your CV once to extract skills cleanly, sync across devices with Google Sign-In, and generate ATS-checked resumes downloadable as PDF or DOCX.',
    shortcutKey: 'P',
    shortcutLabel: 'Open Profile',
    targetTab: 'profile',
    highlights: [
      'Clean PDF/DOCX extraction with missing JD keyword quick-add pills',
      'Sign in with Google to save your CV, shortlists, and Jury history permanently',
    ],
    icon: UserCheck,
    accentBg: 'bg-emerald-50 border-emerald-200',
    accentText: 'text-emerald-600',
  },
  {
    id: 'shortcuts',
    badge: 'Step 4 of 4 · Learning & Speed',
    title: 'Match Trends & Instant Shortcuts',
    description:
      'Track your Jury Match Trend chart in Settings and switch between any view effortlessly from your keyboard.',
    shortcutKey: 'S',
    shortcutLabel: 'Open Settings',
    targetTab: 'settings',
    highlights: [
      'Press O (Overview), J (Jury Room), P (Profile), or S (Settings) anytime',
      'Press ? anytime to reopen this walkthrough guide',
    ],
    icon: Keyboard,
    accentBg: 'bg-violet-50 border-violet-200',
    accentText: 'text-violet-600',
  },
];

export function OnboardingWalkthrough({
  open,
  onClose,
  onNavigate,
}: OnboardingWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStepIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const step = STEPS[stepIndex];
  const Icon = step.icon;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="walkthrough-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkthrough-title"
        >
          <motion.div
            key="walkthrough-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Animated Top Progress Strip */}
            <div className="h-1.5 w-full bg-slate-100">
              <motion.div
                className="h-full bg-blue-600"
                initial={false}
                animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              />
            </div>

            {/* Header Row */}
            <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>{step.badge}</span>
              </span>

              <button
                type="button"
                onClick={onClose}
                aria-label="Skip walkthrough"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <span>Skip</span>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* Animated Step Body */}
            <div className="px-6 pb-6 min-h-[290px] flex flex-col justify-between">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="space-y-5"
                >
                  <div className="flex items-start gap-4">
                    <motion.div
                      initial={{ scale: 0.85, rotate: -6 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${step.accentBg} ${step.accentText}`}
                    >
                      <Icon className="w-6 h-6" aria-hidden="true" />
                    </motion.div>

                    <div className="space-y-1.5 min-w-0">
                      <h2
                        id="walkthrough-title"
                        className="font-display text-xl font-bold text-slate-900"
                      >
                        {step.title}
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Key Highlights */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-2.5">
                    {step.highlights.map((item, idx) => (
                      <motion.div
                        key={item}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.06 * (idx + 1), duration: 0.2 }}
                        className="flex items-start gap-2.5 text-xs text-slate-700 leading-relaxed"
                      >
                        <FileText
                          className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Keyboard Shortcut Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Quick shortcut:</span>
                      <kbd className="px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded shadow-2xs">
                        {step.shortcutKey}
                      </kbd>
                      <span>{step.shortcutLabel}</span>
                    </div>

                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(step.targetTab);
                          onClose();
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Try this view →
                      </button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Footer Controls */}
              <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                {/* Step Dots */}
                <div className="flex items-center gap-1.5" aria-label="Walkthrough steps">
                  {STEPS.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStepIndex(idx)}
                      aria-label={`Go to step ${idx + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        idx === stepIndex
                          ? 'w-6 bg-blue-600'
                          : 'w-2 bg-slate-200 hover:bg-slate-300'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                      className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Back</span>
                    </button>
                  )}

                  {isLast ? (
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <span>Start Exploring</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
