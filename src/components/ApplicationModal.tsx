import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileCode2,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { ApplicationDraft, CandidateProfile, JobItem } from '../types.ts';

interface ApplicationModalProps {
  jobId: string | null;
  onClose: () => void;
  onNotify: (message: string) => void;
}

interface ParsedResume {
  fullName: string;
  subtitle: string;
  summary: string;
  skills: string[];
  education: string;
  experience: string;
}

interface ParsedCoverLetter {
  senderName: string;
  senderLocation: string;
  dateLine: string;
  recipientLine: string;
  companyLine: string;
  subjectLine: string;
  salutation: string;
  body: string;
  closing: string;
  signature: string;
}

function parseResumeText(raw: string, job: JobItem | null, profile: CandidateProfile | null): ParsedResume {
  const lines = (raw || '').split(/\r?\n/);
  const headingAliases: Array<{ key: keyof Omit<ParsedResume, 'fullName' | 'subtitle'>; patterns: string[] }> = [
    { key: 'summary', patterns: ['PROFESSIONAL SUMMARY', 'SUMMARY', 'PROFILE'] },
    { key: 'skills', patterns: ['CORE SKILLS & COMPETENCIES', 'RELEVANT SKILLS', 'SKILLS', 'TECHNICAL SKILLS'] },
    { key: 'education', patterns: ['EDUCATION', 'ACADEMIC BACKGROUND'] },
    { key: 'experience', patterns: ['EXPERIENCE & PROJECTS', 'EXPERIENCE', 'WORK EXPERIENCE', 'ORIGINAL CV DETAILS', 'PROJECTS'] },
  ];

  let fullName = '';
  let subtitle = '';
  const buckets: Record<string, string[]> = {
    header: [],
    summary: [],
    skills: [],
    education: [],
    experience: [],
  };

  let currentSection = 'header';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const upper = trimmed.toUpperCase();
    const matchedHeading = headingAliases.find((h) => h.patterns.includes(upper));
    if (matchedHeading) {
      currentSection = matchedHeading.key;
      continue;
    }
    buckets[currentSection].push(rawLine);
  }

  const headerLines = buckets.header.map((l) => l.trim()).filter(Boolean);
  fullName = headerLines[0] || (profile?.name || 'CANDIDATE NAME').toUpperCase();
  subtitle =
    headerLines.slice(1).join('  |  ') ||
    `${profile?.residence || 'Available for Relocation'}  |  Target Role: ${job?.title || 'Engineering Position'} — ${job?.company || 'Company'}`;

  const skillsList = buckets.skills
    .map((l) => l.trim().replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);

  return {
    fullName,
    subtitle,
    summary: buckets.summary.join('\n').trim(),
    skills: skillsList,
    education: buckets.education.join('\n').trim() || profile?.degree || '',
    experience: buckets.experience.join('\n').trim(),
  };
}

function serializeResume(doc: ParsedResume): string {
  const parts: string[] = [
    (doc.fullName || 'CANDIDATE NAME').trim(),
    (doc.subtitle || '').trim(),
  ];

  if (doc.summary.trim()) {
    parts.push('', 'PROFESSIONAL SUMMARY', doc.summary.trim());
  }
  const cleanSkills = doc.skills.map((s) => s.trim()).filter(Boolean);
  if (cleanSkills.length) {
    parts.push('', 'CORE SKILLS & COMPETENCIES', ...cleanSkills.map((s) => `• ${s}`));
  }
  if (doc.education.trim()) {
    parts.push('', 'EDUCATION', doc.education.trim());
  }
  if (doc.experience.trim()) {
    parts.push('', 'EXPERIENCE & PROJECTS', doc.experience.trim());
  }
  return parts.join('\n').trim();
}

function parseCoverLetterText(
  raw: string,
  job: JobItem | null,
  profile: CandidateProfile | null
): ParsedCoverLetter {
  const fallbackName = profile?.name || 'Candidate Name';
  const fallbackLoc = profile?.residence || 'Available for Relocation';
  const fallbackDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const fallbackCompany = job?.company || 'Hiring Organization';
  const fallbackSubject = `Re: Application for ${job?.title || 'the Open Position'}`;

  const lines = (raw || '').split(/\r?\n/);
  const salIdx = lines.findIndex((l) => /^(dear|hello|to)\b/i.test(l.trim()));
  const signIdx = lines.findIndex((l, i) => i > Math.max(0, salIdx) && /^(sincerely|best regards|regards|respectfully|warm regards),?$/i.test(l.trim()));

  // Check if structured letterhead exists before salutation
  const preSalLines = salIdx > 0 ? lines.slice(0, salIdx).map((l) => l.trim()).filter(Boolean) : [];
  const subjIdx = preSalLines.findIndex((l) => /^re:/i.test(l));

  let senderName = fallbackName;
  let senderLocation = fallbackLoc;
  let dateLine = fallbackDate;
  let recipientLine = 'Hiring Team';
  let companyLine = fallbackCompany;
  let subjectLine = fallbackSubject;

  if (preSalLines.length >= 4) {
    senderName = preSalLines[0] || fallbackName;
    senderLocation = preSalLines[1] || fallbackLoc;
    dateLine = preSalLines[2] || fallbackDate;
    if (subjIdx >= 3) {
      recipientLine = preSalLines[3] || 'Hiring Team';
      companyLine = preSalLines[4] && 4 < subjIdx ? preSalLines[4] : fallbackCompany;
      subjectLine = preSalLines[subjIdx];
    }
  }

  const salutation = salIdx >= 0 ? lines[salIdx].trim() : 'Dear Hiring Team,';
  const bodyStart = salIdx >= 0 ? salIdx + 1 : 0;
  const bodyEnd = signIdx >= 0 ? signIdx : lines.length;
  const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();

  const closing = signIdx >= 0 ? lines[signIdx].trim() : 'Sincerely,';
  const signature =
    signIdx >= 0
      ? lines
          .slice(signIdx + 1)
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' ') || fallbackName
      : fallbackName;

  return {
    senderName,
    senderLocation,
    dateLine,
    recipientLine,
    companyLine,
    subjectLine,
    salutation,
    body,
    closing,
    signature,
  };
}

function serializeCoverLetter(doc: ParsedCoverLetter): string {
  return [
    doc.senderName.trim(),
    doc.senderLocation.trim(),
    '',
    doc.dateLine.trim(),
    '',
    doc.recipientLine.trim(),
    doc.companyLine.trim(),
    doc.subjectLine.trim(),
    '',
    doc.salutation.trim(),
    '',
    doc.body.trim(),
    '',
    doc.closing.trim(),
    doc.signature.trim(),
  ].join('\n');
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none overflow-hidden bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none ${className}`}
    />
  );
}

export function ApplicationModal({ jobId, onClose, onNotify }: ApplicationModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState<'resume' | 'cover' | null>(null);
  const [job, setJob] = useState<JobItem | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [tailoredCv, setTailoredCv] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState({ cv: '', cl: '' });
  const [activeDoc, setActiveDoc] = useState<'resume' | 'cover'>('resume');
  const [editMode, setEditMode] = useState<'formatted' | 'raw'>('formatted');
  const [newSkill, setNewSkill] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/application`)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load application drafts.');
        return res.json();
      })
      .then((data: { job: JobItem; application: ApplicationDraft; profile?: CandidateProfile }) => {
        if (!active) return;
        const cv = data.application?.tailored_cv || '';
        const cl = data.application?.cover_letter || '';
        setJob(data.job);
        setProfile(data.profile || null);
        setTailoredCv(cv);
        setCoverLetter(cl);
        setSavedSnapshot({ cv, cl });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load drafts.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [jobId]);

  const parsedResume = useMemo(
    () => parseResumeText(tailoredCv, job, profile),
    [tailoredCv, job, profile]
  );
  const parsedCover = useMemo(
    () => parseCoverLetterText(coverLetter, job, profile),
    [coverLetter, job, profile]
  );

  if (!jobId) return null;

  const isDirty = tailoredCv !== savedSnapshot.cv || coverLetter !== savedSnapshot.cl;

  const updateResumeDoc = (patch: Partial<ParsedResume>) => {
    const next = { ...parsedResume, ...patch };
    setTailoredCv(serializeResume(next));
  };

  const updateCoverDoc = (patch: Partial<ParsedCoverLetter>) => {
    const next = { ...parsedCover, ...patch };
    setCoverLetter(serializeCoverLetter(next));
  };

  const persistDrafts = async (silent = false): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/application/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tailored_cv: tailoredCv, cover_letter: coverLetter }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save edits.');
      setSavedSnapshot({ cv: tailoredCv, cl: coverLetter });
      if (!silent) {
        onNotify(data.message || 'Formatted resume and cover letter saved.');
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistDrafts(false);
  };

  const handleDownloadDocx = async (docType: 'resume' | 'cover-letter') => {
    const flag = docType === 'resume' ? 'resume' : 'cover';
    setDownloading(flag);
    if (isDirty) {
      const ok = await persistDrafts(true);
      if (!ok) {
        setDownloading(null);
        return;
      }
    }
    const anchor = document.createElement('a');
    anchor.href = `/api/jobs/${encodeURIComponent(jobId)}/application/download/${docType}`;
    anchor.click();
    setDownloading(null);
    onNotify(`Downloaded formatted ${docType === 'resume' ? 'Resume' : 'Cover Letter'} (.docx).`);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/application/generate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate drafts.');
      const cv = data.application?.tailored_cv || '';
      const cl = data.application?.cover_letter || '';
      setTailoredCv(cv);
      setCoverLetter(cl);
      setSavedSnapshot({ cv, cl });
      onNotify(data.message || 'Regenerated standard-formatted documents from saved profile.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    updateResumeDoc({ skills: [...parsedResume.skills, trimmed] });
    setNewSkill('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-studio-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        {/* Studio Header */}
        <div className="print-hide px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="app-studio-title" className="font-display text-base font-bold text-slate-900 truncate">
                Application Document Studio
              </h2>
              {isDirty ? (
                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  Unsaved edits
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check className="w-3 h-3" />
                  Synced
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {job ? `${job.title} · ${job.company}` : 'Loading position…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document studio"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document Toolbar */}
        <div className="print-hide px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Switch Document Type */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveDoc('resume')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeDoc === 'resume'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tailored Resume
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc('cover')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeDoc === 'cover'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cover Letter
              </button>
            </div>

            {/* Switch Editor Mode */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => setEditMode('formatted')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  editMode === 'formatted'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Formatted Sheet
              </button>
              <button
                type="button"
                onClick={() => setEditMode('raw')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  editMode === 'raw'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Plain Text
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / PDF
            </button>
            <button
              type="button"
              disabled={loading || downloading !== null}
              onClick={() => handleDownloadDocx(activeDoc === 'resume' ? 'resume' : 'cover-letter')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              {downloading ? 'Preparing…' : `Download ${activeDoc === 'resume' ? 'Resume' : 'Letter'} .docx`}
            </button>
          </div>
        </div>

        {/* Desk Surface + Printable Standard Paper Sheet */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-8 space-y-4">
            {error && (
              <div className="print-hide max-w-[780px] mx-auto p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            {loading ? (
              <div className="max-w-[780px] mx-auto bg-white rounded border border-slate-300 p-10 space-y-4 animate-pulse">
                <div className="h-7 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
                <div className="h-64 bg-slate-100 rounded" />
              </div>
            ) : editMode === 'raw' ? (
              <div className="max-w-[780px] mx-auto bg-white shadow-md border border-slate-300 rounded-sm p-6 sm:p-10">
                <div className="text-xs font-semibold text-slate-500 mb-2">
                  Plain Text Source ({activeDoc === 'resume' ? 'Resume' : 'Cover Letter'}) — edits sync directly to the Formatted Sheet
                </div>
                <textarea
                  rows={22}
                  value={activeDoc === 'resume' ? tailoredCv : coverLetter}
                  onChange={(e) =>
                    activeDoc === 'resume'
                      ? setTailoredCv(e.target.value)
                      : setCoverLetter(e.target.value)
                  }
                  className="w-full p-4 text-sm font-mono leading-relaxed text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            ) : activeDoc === 'resume' ? (
              /* STANDARD FORMATTED EXECUTIVELY STYLED EDITABLE RESUME SHEET */
              <div
                aria-label="Editable formatted resume document"
                className="printable-document-sheet max-w-[780px] mx-auto bg-white shadow-lg border border-slate-300/90 px-7 sm:px-12 py-9 sm:py-11 text-slate-900 space-y-5"
              >
                {/* Header & Executive Contact Rule */}
                <header className="border-b-2 border-blue-900 pb-3">
                  <input
                    type="text"
                    aria-label="Candidate full name"
                    value={parsedResume.fullName}
                    onChange={(e) => updateResumeDoc({ fullName: e.target.value })}
                    className="w-full font-display text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="Location and target role line"
                    value={parsedResume.subtitle}
                    onChange={(e) => updateResumeDoc({ subtitle: e.target.value })}
                    className="w-full text-xs sm:text-[13px] font-medium text-slate-600 mt-1 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                </header>

                {/* Section 1: Professional Summary */}
                <section>
                  <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900 border-b border-slate-300 pb-1 mb-2">
                    Professional Summary
                  </h3>
                  <AutoTextarea
                    ariaLabel="Professional summary"
                    value={parsedResume.summary}
                    onChange={(val) => updateResumeDoc({ summary: val })}
                    placeholder="Write a concise 2–3 sentence summary aligned with this job posting..."
                    className="text-[13.5px] leading-relaxed text-slate-800"
                  />
                </section>

                {/* Section 2: Core Skills & Competencies (2-Column Bullet Grid) */}
                <section>
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-2.5">
                    <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900">
                      Core Skills &amp; Competencies
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {parsedResume.skills.map((skill, idx) => (
                      <div key={idx} className="group flex items-center gap-1.5 text-[13px] text-slate-800">
                        <span className="text-blue-900 font-bold select-none">•</span>
                        <input
                          type="text"
                          aria-label={`Skill ${idx + 1}`}
                          value={skill}
                          onChange={(e) => {
                            const next = [...parsedResume.skills];
                            next[idx] = e.target.value;
                            updateResumeDoc({ skills: next });
                          }}
                          className="flex-1 bg-transparent border border-transparent rounded px-1 py-0.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateResumeDoc({
                              skills: parsedResume.skills.filter((_, i) => i !== idx),
                            })
                          }
                          aria-label={`Remove skill ${skill}`}
                          className="print-hide opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Quick Add Skill Input */}
                  <div className="print-hide mt-2.5 flex items-center gap-2 max-w-xs">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSkill();
                        }
                      }}
                      placeholder="Add skill or competency..."
                      className="flex-1 text-xs px-2.5 py-1 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </section>

                {/* Section 3: Education */}
                <section>
                  <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900 border-b border-slate-300 pb-1 mb-2">
                    Education
                  </h3>
                  <AutoTextarea
                    ariaLabel="Education"
                    value={parsedResume.education}
                    onChange={(val) => updateResumeDoc({ education: val })}
                    placeholder="Degree, University, Graduation Year & Honors"
                    className="text-[13.5px] font-medium leading-relaxed text-slate-800"
                  />
                </section>

                {/* Section 4: Experience & Projects */}
                <section>
                  <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900 border-b border-slate-300 pb-1 mb-2">
                    Experience &amp; Projects
                  </h3>
                  <AutoTextarea
                    ariaLabel="Experience and projects"
                    value={parsedResume.experience}
                    onChange={(val) => updateResumeDoc({ experience: val })}
                    placeholder="• Role / Project Title — Company (Dates)&#10;• Key technical achievement or deliverable..."
                    className="text-[13.5px] leading-relaxed text-slate-800 whitespace-pre-wrap"
                  />
                </section>
              </div>
            ) : (
              /* STANDARD FORMAL BUSINESS COVER LETTER SHEET */
              <div
                aria-label="Editable formatted cover letter document"
                className="printable-document-sheet max-w-[780px] mx-auto bg-white shadow-lg border border-slate-300/90 px-8 sm:px-14 py-10 sm:py-12 text-slate-900 space-y-5"
              >
                {/* Sender Letterhead */}
                <header className="border-b-2 border-blue-900 pb-3">
                  <input
                    type="text"
                    aria-label="Sender name"
                    value={parsedCover.senderName}
                    onChange={(e) => updateCoverDoc({ senderName: e.target.value })}
                    className="w-full font-display text-2xl font-bold tracking-tight text-slate-900 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="Sender location"
                    value={parsedCover.senderLocation}
                    onChange={(e) => updateCoverDoc({ senderLocation: e.target.value })}
                    className="w-full text-xs sm:text-[13px] text-slate-600 mt-0.5 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                </header>

                {/* Date & Inside Recipient Address Block */}
                <div className="space-y-2.5 text-[13.5px] text-slate-700 pt-1">
                  <input
                    type="text"
                    aria-label="Letter date"
                    value={parsedCover.dateLine}
                    onChange={(e) => updateCoverDoc({ dateLine: e.target.value })}
                    className="w-full text-xs font-medium text-slate-500 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />

                  <div className="space-y-0.5">
                    <input
                      type="text"
                      aria-label="Recipient"
                      value={parsedCover.recipientLine}
                      onChange={(e) => updateCoverDoc({ recipientLine: e.target.value })}
                      className="w-full font-semibold text-slate-800 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                    />
                    <input
                      type="text"
                      aria-label="Company name"
                      value={parsedCover.companyLine}
                      onChange={(e) => updateCoverDoc({ companyLine: e.target.value })}
                      className="w-full text-slate-700 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                    />
                  </div>

                  <input
                    type="text"
                    aria-label="Subject line"
                    value={parsedCover.subjectLine}
                    onChange={(e) => updateCoverDoc({ subjectLine: e.target.value })}
                    className="w-full font-bold text-blue-900 bg-transparent border border-transparent rounded px-1.5 py-1 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                </div>

                {/* Salutation */}
                <div>
                  <input
                    type="text"
                    aria-label="Salutation"
                    value={parsedCover.salutation}
                    onChange={(e) => updateCoverDoc({ salutation: e.target.value })}
                    className="w-full text-[14px] font-semibold text-slate-900 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                </div>

                {/* Letter Body */}
                <div>
                  <AutoTextarea
                    ariaLabel="Cover letter body"
                    value={parsedCover.body}
                    onChange={(val) => updateCoverDoc({ body: val })}
                    placeholder="Write your tailored opening, technical alignment paragraph, and closing..."
                    className="text-[14px] leading-[1.72] text-slate-800 whitespace-pre-wrap"
                  />
                </div>

                {/* Sign-off & Signature */}
                <footer className="pt-3 space-y-1">
                  <input
                    type="text"
                    aria-label="Closing phrase"
                    value={parsedCover.closing}
                    onChange={(e) => updateCoverDoc({ closing: e.target.value })}
                    className="w-full text-[14px] text-slate-800 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                  <input
                    type="text"
                    aria-label="Signature"
                    value={parsedCover.signature}
                    onChange={(e) => updateCoverDoc({ signature: e.target.value })}
                    className="w-full font-display text-base font-bold text-slate-900 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                  />
                </footer>
              </div>
            )}
          </div>

          {/* Studio Footer */}
          <div className="print-hide px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Click any line on the document sheet to edit directly before saving or exporting.
            </span>
            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Document'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
