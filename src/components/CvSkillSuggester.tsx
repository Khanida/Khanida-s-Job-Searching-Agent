import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Sparkles } from 'lucide-react';
import type { GeminiSkillSuggestion } from '../types.ts';

interface CvSkillSuggesterProps {
  cvText: string;
  currentSkills: string;
  excludedSkills: string;
  targetRoles: string;
  onAddSkill: (skillName: string) => void;
  onAddAllSkills: (skillNames: string[]) => void;
}

export function CvSkillSuggester({
  cvText,
  currentSkills,
  excludedSkills,
  targetRoles,
  onAddSkill,
  onAddAllSkills,
}: CvSkillSuggesterProps) {
  const [suggestions, setSuggestions] = useState<GeminiSkillSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const normalizedExisting = useMemo(() => {
    return new Set(
      currentSkills
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
  }, [currentSkills]);

  const unaddedSkills = useMemo(() => {
    return suggestions
      .map((s) => s.name)
      .filter((name) => !normalizedExisting.has(name.toLowerCase()));
  }, [suggestions, normalizedExisting]);

  const hasEnoughCvText = cvText.trim().length >= 30;

  const handleAnalyzeCv = async () => {
    if (!hasEnoughCvText) {
      setError('Paste or upload at least a few lines of CV text first so Gemini can extract skills.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/suggest-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvText,
          existingSkills: currentSkills,
          excludedSkills,
          targetRoles,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        suggestions?: GeminiSkillSuggestion[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Gemini could not analyze your CV right now.');
      }
      setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 5) : []);
      setHasAnalyzed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to identify skills from CV.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
            <span>Gemini CV Skill Assistant</span>
          </div>
          <p className="text-xs text-slate-600">
            Parses your CV text below to recommend the top 5 relevant skills—click any skill to add it to Core Skills.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {unaddedSkills.length > 1 && (
            <button
              type="button"
              onClick={() => onAddAllSkills(unaddedSkills)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add All ({unaddedSkills.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleAnalyzeCv()}
            disabled={loading || !hasEnoughCvText}
            title={
              hasEnoughCvText
                ? 'Analyze CV text with Gemini for Top 5 skill suggestions'
                : 'Add at least 30 characters of CV text to enable Gemini parsing'
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{loading ? 'Parsing CV…' : hasAnalyzed ? 'Refresh Top 5' : 'Suggest Top 5 Skills'}</span>
          </button>
        </div>
      </div>

      {!hasEnoughCvText && (
        <p className="text-[11px] text-slate-500">
          Paste your resume text below or upload a CV file above to activate Gemini skill extraction.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          {error}
        </div>
      )}

      {loading && suggestions.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-16 rounded-lg bg-white border border-slate-200 animate-pulse p-3"
            />
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {suggestions.map((item) => {
            const isAdded = normalizedExisting.has(item.name.toLowerCase());
            return (
              <button
                key={item.name}
                type="button"
                disabled={isAdded}
                onClick={() => onAddSkill(item.name)}
                aria-label={isAdded ? `${item.name} already added` : `Add ${item.name} to Core Skills`}
                className={`text-left rounded-lg border p-3 transition-colors flex items-start justify-between gap-3 ${
                  isAdded
                    ? 'bg-emerald-50/70 border-emerald-200 cursor-default'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {item.name}
                    </span>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      · {item.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                    {item.reason}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold shrink-0 ${
                    isAdded
                      ? 'text-emerald-700 bg-emerald-100/80'
                      : 'text-blue-700 bg-blue-50 border border-blue-200'
                  }`}
                >
                  {isAdded ? (
                    <>
                      <Check className="w-3 h-3" aria-hidden="true" />
                      <span>Added</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hasAnalyzed && !loading && suggestions.length === 0 && !error && (
        <p className="text-xs text-slate-500">
          No additional skills identified beyond what is already in your CV summary.
        </p>
      )}
    </div>
  );
}
