import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  FileCode2,
  FileText,
  LayoutTemplate,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ApplicationDraft, CandidateProfile, JobItem } from '../types.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { syncApplicationToCloud, syncProfileToCloud } from '../firebase.ts';
import { exportCoverLetterToPdf, exportResumeToPdf } from '../utils/pdfExport.ts';

interface ApplicationModalProps {
  jobId: string | null;
  onClose: () => void;
  onNotify: (message: string) => void;
}

export type ResumeTemplate = 'executive' | 'modern' | 'ats';

interface ExperienceEntry {
  id: string;
  title: string;
  organization: string;
  dates: string;
  bullets: string[];
}

interface ParsedResume {
  fullName: string;
  subtitle: string;
  summary: string;
  skills: string[];
  education: string;
  entries: ExperienceEntry[];
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

const KNOWN_TECH_KEYWORDS = [
  'Python', 'C++', 'C', 'C#', 'Java', 'JavaScript', 'TypeScript', 'React', 'Next.js',
  'Node.js', 'Flutter', 'Dart', 'Firebase', 'SQL', 'PostgreSQL', 'MongoDB', 'Git',
  'Docker', 'Kubernetes', 'Linux', 'AWS', 'Azure', 'GCP', 'CI/CD', 'REST API',
  'GraphQL', 'Embedded Systems', 'Firmware', 'RTOS', 'Verilog', 'FPGA', 'QA',
  'Test Automation', 'Selenium', 'Playwright', 'Unit Testing', 'Agile', 'Scrum',
  'HTML', 'CSS', 'Tailwind CSS', 'Machine Learning', 'Data Analysis', 'Microservices',
  'FastAPI', 'Django', 'Spring Boot', 'Go', 'PHP', 'Ruby', 'Swift', 'Kotlin',
];

const IMPACT_BULLET_TEMPLATES = [
  'Designed and delivered a scalable feature using core stack technologies, improving reliability and reducing manual rework.',
  'Built automated test coverage and CI validation checks, cutting regression defects across release cycles.',
  'Collaborated with cross-functional engineers to optimize system latency and document clean technical workflows.',
];

function cleanResumeText(raw: string): string {
  return (raw || '')
    .replace(/\uFFFD+/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/[^\x20-\x7E\n\r\t•–—’‘“”]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^\/(?:FlateDecode|FontDescriptor|Type|Filter)\b/.test(trimmed)) return false;
      if (/^(?:endobj|endstream|xref|trailer)\b/.test(trimmed)) return false;
      const letters = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
      const weird = (trimmed.match(/[^a-zA-Z0-9\s.,;:'"()\-/+&•@#%|?!–—]/g) || []).length;
      if (trimmed.length > 6 && weird > letters) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function parseExperienceEntries(rawExp: string): ExperienceEntry[] {
  const cleaned = cleanResumeText(rawExp);
  if (!cleaned) return [];

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  let seq = 1;

  const isBullet = (line: string) => /^[•\-*]\s+/.test(line);
  const stripBullet = (line: string) => line.replace(/^[•\-*]\s*/, '').trim();

  const headerPattern = /^([^|—–(]{3,}?)\s*(?:—|–|\|)\s*([^(\n]{2,}?)(?:\s*\(([^)]+)\))?$/;
  const dateHeaderPattern = /^(.{4,}?)\s*\(([^)]{4,})\)$/;

  for (const line of lines) {
    if (!isBullet(line)) {
      const hm = line.match(headerPattern);
      if (hm) {
        current = {
          id: `exp_${seq++}`,
          title: hm[1].trim(),
          organization: hm[2].trim(),
          dates: (hm[3] || '').trim(),
          bullets: [],
        };
        entries.push(current);
        continue;
      }

      const dm = line.match(dateHeaderPattern);
      if (dm && line.length < 95) {
        current = {
          id: `exp_${seq++}`,
          title: dm[1].trim(),
          organization: '',
          dates: dm[2].trim(),
          bullets: [],
        };
        entries.push(current);
        continue;
      }

      // If line is short and looks like a standalone project/role title without period at end
      if (line.length <= 72 && !/[.!?]$/.test(line) && (!current || current.bullets.length > 0)) {
        current = {
          id: `exp_${seq++}`,
          title: line,
          organization: '',
          dates: '',
          bullets: [],
        };
        entries.push(current);
        continue;
      }
    }

    const bulletText = stripBullet(line);
    if (!bulletText || !/[a-zA-Z]{2,}/.test(bulletText)) continue;

    if (!current) {
      current = {
        id: `exp_${seq++}`,
        title: 'Engineering Experience & Technical Projects',
        organization: '',
        dates: '',
        bullets: [],
      };
      entries.push(current);
    }
    current.bullets.push(bulletText);
  }

  return entries;
}

function serializeExperienceEntries(entries: ExperienceEntry[]): string {
  const blocks: string[] = [];
  for (const entry of entries) {
    const title = entry.title.trim();
    const org = entry.organization.trim();
    const dates = entry.dates.trim();
    const cleanBullets = entry.bullets.map((b) => b.trim()).filter(Boolean);
    if (!title && !org && cleanBullets.length === 0) continue;

    let heading = title || 'Experience / Project';
    if (org) heading += ` — ${org}`;
    if (dates) heading += ` (${dates})`;

    const lines = [heading, ...cleanBullets.map((b) => `• ${b}`)];
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}

function parseResumeText(raw: string, job: JobItem | null, profile: CandidateProfile | null): ParsedResume {
  const cleaned = cleanResumeText(raw);
  const lines = cleaned.split(/\r?\n/);
  const headingAliases: Array<{ key: 'summary' | 'skills' | 'education' | 'experience'; patterns: string[] }> = [
    { key: 'summary', patterns: ['PROFESSIONAL SUMMARY', 'EXECUTIVE SUMMARY', 'CAREER SUMMARY', 'SUMMARY', 'PROFILE', 'OBJECTIVE', 'ABOUT'] },
    { key: 'skills', patterns: ['CORE SKILLS & COMPETENCIES', 'RELEVANT SKILLS', 'TECHNICAL SKILLS', 'SKILLS & TOOLS', 'SKILLS', 'COMPETENCIES', 'TECH STACK', 'TECHNOLOGIES'] },
    { key: 'education', patterns: ['EDUCATION', 'ACADEMIC BACKGROUND', 'ACADEMIC QUALIFICATIONS', 'QUALIFICATIONS'] },
    { key: 'experience', patterns: ['EXPERIENCE & PROJECTS', 'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'WORK HISTORY', 'INTERNSHIPS', 'ORIGINAL CV DETAILS', 'PROJECTS', 'TECHNICAL PROJECTS', 'SELECTED PROJECTS', 'ACADEMIC PROJECTS', 'CERTIFICATIONS'] },
  ];

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
    const upper = trimmed.replace(/^#+\s*/, '').replace(/[:\-–—]+$/, '').trim().toUpperCase();
    const matchedHeading = headingAliases.find((h) => h.patterns.includes(upper));
    if (matchedHeading) {
      currentSection = matchedHeading.key;
      continue;
    }
    const inlineSkills = trimmed.match(/^(?:technical\s+)?skills\s*:\s*(.+)$/i);
    if (inlineSkills) {
      buckets.skills.push(inlineSkills[1]);
      continue;
    }
    buckets[currentSection].push(rawLine);
  }

  const headerLines = buckets.header.map((l) => l.trim()).filter(Boolean);
  const fullName = headerLines[0] || (profile?.name || 'CANDIDATE NAME').toUpperCase();
  const subtitle =
    headerLines.slice(1).join('  |  ') ||
    `${profile?.residence || 'Available for Relocation'}  |  Target Role: ${job?.title || 'Engineering Position'} — ${job?.company || 'Company'}`;

  const rawSkillTokens = buckets.skills
    .join('\n')
    .split(/[\n,|•;·]+/)
    .map((l) => l.trim().replace(/^[•\-*]\s*/, '').trim())
    .filter((s) => Boolean(s) && /[a-zA-Z0-9]{1,}/.test(s));

  const skillsList = Array.from(
    new Map(rawSkillTokens.map((s) => [s.toLowerCase(), s])).values()
  );

  return {
    fullName,
    subtitle,
    summary: buckets.summary.join('\n').trim(),
    skills: skillsList,
    education: buckets.education.join('\n').trim() || profile?.degree || '',
    entries: parseExperienceEntries(buckets.experience.join('\n')),
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
  const serializedExp = serializeExperienceEntries(doc.entries);
  if (serializedExp.trim()) {
    parts.push('', 'EXPERIENCE & PROJECTS', serializedExp);
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

  const lines = cleanResumeText(raw).split(/\r?\n/);
  const salIdx = lines.findIndex((l) => /^(dear|hello|to)\b/i.test(l.trim()));
  const signIdx = lines.findIndex(
    (l, i) => i > Math.max(0, salIdx) && /^(sincerely|best regards|regards|respectfully|warm regards),?$/i.test(l.trim())
  );

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

function extractJobKeywords(job: JobItem | null): string[] {
  if (!job) return [];
  const plainDesc = (job.description || '').replace(/<[^>]+>/g, ' ');
  const text = `${job.title || ''} ${plainDesc}`;
  const lower = text.toLowerCase();

  const found: string[] = [];
  for (const kw of KNOWN_TECH_KEYWORDS) {
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i');
    if (rx.test(lower)) {
      found.push(kw);
    }
  }

  // Fallback important role nouns if description is sparse
  const domainFallback = [
    'Engineering', 'Architecture', 'Debugging', 'Scalability', 'Performance',
    'Documentation', 'Collaboration', 'Backend', 'Frontend', 'Full-Stack',
    'Security', 'Cloud', 'Networking', 'Database', 'UI/UX', 'Automation',
  ];
  for (const term of domainFallback) {
    if (found.length >= 16) break;
    if (lower.includes(term.toLowerCase()) && !found.some((f) => f.toLowerCase() === term.toLowerCase())) {
      found.push(term);
    }
  }

  return found.slice(0, 16);
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
    el.style.height = `${Math.max(el.scrollHeight, 26)}px`;
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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [downloading, setDownloading] = useState<'resume' | 'cover' | 'resume-pdf' | 'cover-pdf' | null>(null);
  const [job, setJob] = useState<JobItem | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [tailoredCv, setTailoredCv] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState({ cv: '', cl: '' });
  const [activeDoc, setActiveDoc] = useState<'resume' | 'cover'>('resume');
  const [editMode, setEditMode] = useState<'formatted' | 'raw'>('formatted');
  const [template, setTemplate] = useState<ResumeTemplate>('modern');
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
        const cv = cleanResumeText(data.application?.tailored_cv || '');
        const cl = cleanResumeText(data.application?.cover_letter || '');
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

  const atsAnalysis = useMemo(() => {
    const jdKeywords = extractJobKeywords(job);
    const cvLower = tailoredCv.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];

    for (const kw of jdKeywords) {
      const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i');
      if (rx.test(cvLower)) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    }

    // Score weighs JD keyword coverage (70%) + structure completeness (30%)
    const keywordScore = jdKeywords.length > 0 ? (matched.length / jdKeywords.length) * 70 : 52;
    const structureScore =
      (parsedResume.summary.trim().length >= 40 ? 10 : 0) +
      (parsedResume.skills.length >= 4 ? 10 : parsedResume.skills.length * 2) +
      (parsedResume.entries.length >= 1 && parsedResume.entries[0].bullets.length >= 1 ? 10 : 0);

    const score = Math.min(99, Math.max(12, Math.round(keywordScore + structureScore)));
    return { score, jdKeywords, matched, missing };
  }, [job, tailoredCv, parsedResume]);

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
      const cleanedCv = cleanResumeText(tailoredCv);
      const cleanedCl = cleanResumeText(coverLetter);
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/application/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tailored_cv: cleanedCv, cover_letter: cleanedCl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save edits.');
      setTailoredCv(cleanedCv);
      setCoverLetter(cleanedCl);
      setSavedSnapshot({ cv: cleanedCv, cl: cleanedCl });
      if (user) {
        void syncApplicationToCloud(user.uid, {
          jobId,
          tailored_cv: cleanedCv,
          cover_letter: cleanedCl,
          template,
        });
      }
      if (!silent) {
        onNotify(
          user
            ? 'Resume & cover letter saved to workspace and synced to cloud.'
            : data.message || 'Formatted resume and cover letter saved.'
        );
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

  const handleDownloadPdf = async (docType: 'resume' | 'cover-letter') => {
    const flag = docType === 'resume' ? 'resume-pdf' : 'cover-pdf';
    setDownloading(flag);
    try {
      if (isDirty) {
        const ok = await persistDrafts(true);
        if (!ok) {
          setDownloading(null);
          return;
        }
      }
      const filename =
        docType === 'resume'
          ? exportResumeToPdf(parsedResume, template, job?.company)
          : exportCoverLetterToPdf(parsedCover, job?.company);
      onNotify(`Downloaded ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setDownloading(null);
    }
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
      const cv = cleanResumeText(data.application?.tailored_cv || '');
      const cl = cleanResumeText(data.application?.cover_letter || '');
      setTailoredCv(cv);
      setCoverLetter(cl);
      setSavedSnapshot({ cv, cl });
      if (user) {
        void syncApplicationToCloud(user.uid, {
          jobId,
          tailored_cv: cv,
          cover_letter: cl,
          template,
        });
      }
      onNotify(data.message || 'Regenerated standard-formatted documents from saved profile.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAddSkillValue = (skillName: string) => {
    const trimmed = skillName.trim();
    if (!trimmed) return;
    if (parsedResume.skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    updateResumeDoc({ skills: [...parsedResume.skills, trimmed] });
  };

  const handleAddSkill = () => {
    handleAddSkillValue(newSkill);
    setNewSkill('');
  };

  const handleTailorTopMissing = () => {
    const topMissing = atsAnalysis.missing.slice(0, 4);
    if (!topMissing.length) {
      onNotify('All extracted job keywords are already present in your resume!');
      return;
    }
    const mergedSkills = Array.from(
      new Map([...parsedResume.skills, ...topMissing].map((s) => [s.toLowerCase(), s])).values()
    );
    updateResumeDoc({ skills: mergedSkills });
    onNotify(`Added ${topMissing.length} JD keywords (${topMissing.join(', ')}) to Core Skills.`);
  };

  const handleAddEntry = () => {
    const nextEntry: ExperienceEntry = {
      id: `exp_${Date.now()}`,
      title: 'Role or Technical Project Title',
      organization: 'Organization / Lab',
      dates: '2024 – Present',
      bullets: ['Delivered key engineering milestone with measurable results.'],
    };
    updateResumeDoc({ entries: [...parsedResume.entries, nextEntry] });
  };

  const handleUpdateEntry = (idx: number, patch: Partial<ExperienceEntry>) => {
    const next = parsedResume.entries.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry));
    updateResumeDoc({ entries: next });
  };

  const handleDeleteEntry = (idx: number) => {
    updateResumeDoc({ entries: parsedResume.entries.filter((_, i) => i !== idx) });
  };

  const handleCvUploadInStudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !jobId) return;
    setUploadingCv(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('cv_file', file);
      formData.append('jobId', jobId);
      const res = await fetch('/api/profile/upload-cv', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CV upload failed.');
      if (data.profile) {
        setProfile(data.profile);
        if (user) void syncProfileToCloud(user.uid, data.profile);
      }
      if (data.application) {
        const cv = cleanResumeText(data.application.tailored_cv || '');
        const cl = cleanResumeText(data.application.cover_letter || '');
        setTailoredCv(cv);
        setCoverLetter(cl);
        setSavedSnapshot({ cv, cl });
        if (user) {
          void syncApplicationToCloud(user.uid, {
            jobId,
            tailored_cv: cv,
            cover_letter: cl,
            template,
          });
        }
      }
      onNotify(data.message || 'CV uploaded and resume rebuilt cleanly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CV upload error.');
    } finally {
      setUploadingCv(false);
      e.target.value = '';
    }
  };

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - atsAnalysis.score / 100);
  const ringColorClass =
    atsAnalysis.score >= 75
      ? 'text-emerald-600'
      : atsAnalysis.score >= 50
        ? 'text-blue-600'
        : 'text-amber-600';

  const isModern = template === 'modern';
  const isAts = template === 'ats';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-studio-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-7xl w-full h-[94vh] flex flex-col overflow-hidden">
        {/* Studio Header */}
        <div className="print-hide px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 id="app-studio-title" className="font-display text-base font-bold text-slate-900 truncate">
                Resume &amp; JD Optimizer Studio
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
                Formatted Builder
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
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer transition-colors whitespace-nowrap">
              <Upload className={`w-3.5 h-3.5 ${uploadingCv ? 'animate-pulse' : ''}`} />
              <span>{uploadingCv ? 'Extracting CV…' : 'Upload CV'}</span>
              <input
                type="file"
                accept=".txt,.md,.docx,.pdf"
                onChange={handleCvUploadInStudio}
                disabled={uploadingCv || loading}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || uploadingCv || loading}
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
              Print
            </button>
            <button
              type="button"
              disabled={loading || downloading !== null}
              onClick={() => handleDownloadPdf(activeDoc === 'resume' ? 'resume' : 'cover-letter')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              {downloading === 'resume-pdf' || downloading === 'cover-pdf'
                ? 'Generating PDF…'
                : `Download ${activeDoc === 'resume' ? 'Resume' : 'Letter'} .pdf`}
            </button>
            <button
              type="button"
              disabled={loading || downloading !== null}
              onClick={() => handleDownloadDocx(activeDoc === 'resume' ? 'resume' : 'cover-letter')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              {downloading === 'resume' || downloading === 'cover'
                ? 'Preparing…'
                : `Download ${activeDoc === 'resume' ? 'Resume' : 'Letter'} .docx`}
            </button>
          </div>
        </div>

        {/* Main Split Studio Workbench */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* LEFT SIDEBAR: JobOwl / CV-BY-JD ATS Match & Template Controls */}
            <aside className="print-hide w-full lg:w-80 xl:w-[340px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto p-4 space-y-5 shrink-0">
              {/* ATS JD Match Gauge */}
              <section className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                        <circle
                          cx="32"
                          cy="32"
                          r={ringRadius}
                          fill="none"
                          strokeWidth="6"
                          className="stroke-slate-200"
                        />
                        <circle
                          cx="32"
                          cy="32"
                          r={ringRadius}
                          fill="none"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringOffset}
                          className={`stroke-current transition-all duration-300 ${ringColorClass}`}
                        />
                      </svg>
                      <span className="absolute font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {atsAnalysis.score}%
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-900">
                        <Target className="w-3.5 h-3.5 text-blue-600" />
                        <span>ATS JD Match</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {atsAnalysis.matched.length} of {atsAnalysis.jdKeywords.length || 0} JD terms matched
                      </p>
                    </div>
                  </div>
                </div>

                {atsAnalysis.missing.length > 0 && (
                  <button
                    type="button"
                    onClick={handleTailorTopMissing}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Add Top Missing JD Keywords</span>
                  </button>
                )}
              </section>

              {/* Template Selector (Kickresume-style) */}
              {activeDoc === 'resume' && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <LayoutTemplate className="w-3.5 h-3.5 text-blue-600" />
                    <span>Resume Template</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'modern', label: 'Two-Column' },
                        { id: 'executive', label: 'Executive' },
                        { id: 'ats', label: 'ATS Plain' },
                      ] as const
                    ).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTemplate(tpl.id)}
                        className={`px-2 py-2 text-[11px] font-semibold rounded-lg border transition-colors ${
                          template === tpl.id
                            ? 'bg-blue-50 text-blue-700 border-blue-400'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Missing Keywords (1-click Add) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700">
                    Missing JD Keywords ({atsAnalysis.missing.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">Click to add</span>
                </div>
                {atsAnalysis.missing.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {atsAnalysis.missing.map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => {
                          handleAddSkillValue(kw);
                          onNotify(`Added "${kw}" to Core Skills.`);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{kw}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
                    Strong match: all key terms from the job description are covered.
                  </p>
                )}
              </section>

              {/* Matched Keywords */}
              {atsAnalysis.matched.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-700">
                    Matched in Resume ({atsAnalysis.matched.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {atsAnalysis.matched.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{kw}</span>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </aside>

            {/* RIGHT PANE: Paper Desk & Structured Editable Document */}
            <div className="flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-7 space-y-4">
              {error && (
                <div className="print-hide max-w-[820px] mx-auto p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="max-w-[820px] mx-auto bg-white rounded border border-slate-300 p-10 space-y-4 animate-pulse">
                  <div className="h-7 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-2/3" />
                  <div className="h-64 bg-slate-100 rounded" />
                </div>
              ) : editMode === 'raw' ? (
                <div className="max-w-[820px] mx-auto bg-white shadow-md border border-slate-300 rounded-sm p-6 sm:p-8">
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    Plain Text Source ({activeDoc === 'resume' ? 'Resume' : 'Cover Letter'}) — syncs cleanly with Builder
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
                /* EDITABLE STRUCTURED RESUME PAPER SHEET */
                <div
                  aria-label="Editable formatted resume document"
                  className={`printable-document-sheet max-w-[820px] mx-auto bg-white shadow-lg border border-slate-300/90 text-slate-900 overflow-hidden ${
                    isModern ? 'grid grid-cols-1 md:grid-cols-12' : 'px-7 sm:px-11 py-8 sm:py-10 space-y-5'
                  }`}
                >
                  {isModern ? (
                    <>
                      {/* MODERN TWO-COLUMN LEFT SIDEBAR */}
                      <div className="md:col-span-4 bg-slate-900 text-slate-100 p-6 sm:p-7 space-y-6">
                        <header className="border-b border-slate-700 pb-4">
                          <input
                            type="text"
                            aria-label="Candidate full name"
                            value={parsedResume.fullName}
                            onChange={(e) => updateResumeDoc({ fullName: e.target.value })}
                            className="w-full font-display text-xl font-bold tracking-tight text-white bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:bg-slate-800 focus:bg-slate-800 focus:border-blue-400 focus:outline-none"
                          />
                          <textarea
                            rows={2}
                            aria-label="Location and target role line"
                            value={parsedResume.subtitle}
                            onChange={(e) => updateResumeDoc({ subtitle: e.target.value })}
                            className="w-full text-xs text-slate-300 mt-1.5 resize-none bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:bg-slate-800 focus:bg-slate-800 focus:border-blue-400 focus:outline-none"
                          />
                        </header>

                        {/* Core Skills inside Modern Sidebar */}
                        <section className="space-y-2">
                          <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-300 border-b border-slate-700 pb-1">
                            Core Skills
                          </h3>
                          <div className="space-y-1">
                            {parsedResume.skills.map((skill, idx) => (
                              <div key={idx} className="group flex items-center gap-1.5 text-xs text-slate-100">
                                <span className="text-blue-400 select-none">•</span>
                                <input
                                  type="text"
                                  aria-label={`Skill ${idx + 1}`}
                                  value={skill}
                                  onChange={(e) => {
                                    const next = [...parsedResume.skills];
                                    next[idx] = e.target.value;
                                    updateResumeDoc({ skills: next });
                                  }}
                                  className="flex-1 min-w-0 bg-transparent border border-transparent rounded px-1 py-0.5 hover:bg-slate-800 focus:bg-slate-800 focus:border-blue-400 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateResumeDoc({
                                      skills: parsedResume.skills.filter((_, i) => i !== idx),
                                    })
                                  }
                                  aria-label={`Remove skill ${skill}`}
                                  className="print-hide opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-slate-400 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="print-hide pt-1 flex items-center gap-1.5">
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
                              placeholder="Add skill..."
                              className="flex-1 min-w-0 text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button
                              type="button"
                              onClick={handleAddSkill}
                              aria-label="Add skill"
                              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </section>

                        {/* Education inside Modern Sidebar */}
                        <section className="space-y-1.5">
                          <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-300 border-b border-slate-700 pb-1">
                            Education
                          </h3>
                          <textarea
                            rows={3}
                            aria-label="Education"
                            value={parsedResume.education}
                            onChange={(e) => updateResumeDoc({ education: e.target.value })}
                            placeholder="Degree, University & Year"
                            className="w-full text-xs leading-relaxed text-slate-200 resize-none bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:bg-slate-800 focus:bg-slate-800 focus:border-blue-400 focus:outline-none"
                          />
                        </section>
                      </div>

                      {/* MODERN TWO-COLUMN RIGHT MAIN BODY */}
                      <div className="md:col-span-8 p-6 sm:p-8 space-y-6">
                        <section>
                          <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900 border-b border-slate-300 pb-1 mb-2">
                            Professional Summary
                          </h3>
                          <AutoTextarea
                            ariaLabel="Professional summary"
                            value={parsedResume.summary}
                            onChange={(val) => updateResumeDoc({ summary: val })}
                            placeholder="Write a crisp 2–3 sentence summary aligned with this role..."
                            className="text-[13.5px] leading-relaxed text-slate-800"
                          />
                        </section>

                        <section className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                            <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue-900">
                              Experience &amp; Projects
                            </h3>
                            <button
                              type="button"
                              onClick={handleAddEntry}
                              className="print-hide inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              Add Entry
                            </button>
                          </div>

                          <ExperienceEntriesEditor
                            entries={parsedResume.entries}
                            onUpdateEntry={handleUpdateEntry}
                            onDeleteEntry={handleDeleteEntry}
                            onAddEntry={handleAddEntry}
                          />
                        </section>
                      </div>
                    </>
                  ) : (
                    /* EXECUTIVE & ATS SINGLE-COLUMN TEMPLATES */
                    <>
                      <header className={isAts ? 'border-b border-slate-900 pb-2.5' : 'border-b-2 border-blue-900 pb-3'}>
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

                      <section>
                        <h3
                          className={`text-[11px] font-bold tracking-[0.14em] uppercase border-b pb-1 mb-2 ${
                            isAts ? 'text-slate-900 border-slate-400' : 'text-blue-900 border-slate-300'
                          }`}
                        >
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

                      <section>
                        <h3
                          className={`text-[11px] font-bold tracking-[0.14em] uppercase border-b pb-1 mb-2.5 ${
                            isAts ? 'text-slate-900 border-slate-400' : 'text-blue-900 border-slate-300'
                          }`}
                        >
                          Core Skills &amp; Competencies
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                          {parsedResume.skills.map((skill, idx) => (
                            <div key={idx} className="group flex items-center gap-1.5 text-[13px] text-slate-800">
                              <span className={`${isAts ? 'text-slate-900' : 'text-blue-900'} font-bold select-none`}>•</span>
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

                      <section>
                        <h3
                          className={`text-[11px] font-bold tracking-[0.14em] uppercase border-b pb-1 mb-2 ${
                            isAts ? 'text-slate-900 border-slate-400' : 'text-blue-900 border-slate-300'
                          }`}
                        >
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

                      <section className="space-y-3">
                        <div className={`flex items-center justify-between border-b pb-1 ${isAts ? 'border-slate-400' : 'border-slate-300'}`}>
                          <h3
                            className={`text-[11px] font-bold tracking-[0.14em] uppercase ${
                              isAts ? 'text-slate-900' : 'text-blue-900'
                            }`}
                          >
                            Experience &amp; Projects
                          </h3>
                          <button
                            type="button"
                            onClick={handleAddEntry}
                            className="print-hide inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                          >
                            <Plus className="w-3 h-3" />
                            Add Entry
                          </button>
                        </div>

                        <ExperienceEntriesEditor
                          entries={parsedResume.entries}
                          onUpdateEntry={handleUpdateEntry}
                          onDeleteEntry={handleDeleteEntry}
                          onAddEntry={handleAddEntry}
                        />
                      </section>
                    </>
                  )}
                </div>
              ) : (
                /* STANDARD FORMAL BUSINESS COVER LETTER SHEET */
                <div
                  aria-label="Editable formatted cover letter document"
                  className="printable-document-sheet max-w-[820px] mx-auto bg-white shadow-lg border border-slate-300/90 px-8 sm:px-14 py-10 sm:py-12 text-slate-900 space-y-5"
                >
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

                  <div>
                    <input
                      type="text"
                      aria-label="Salutation"
                      value={parsedCover.salutation}
                      onChange={(e) => updateCoverDoc({ salutation: e.target.value })}
                      className="w-full text-[14px] font-semibold text-slate-900 bg-transparent border border-transparent rounded px-1.5 py-0.5 -mx-1.5 hover:bg-blue-50/45 focus:bg-blue-50/55 focus:border-blue-300 focus:outline-none"
                    />
                  </div>

                  <div>
                    <AutoTextarea
                      ariaLabel="Cover letter body"
                      value={parsedCover.body}
                      onChange={(val) => updateCoverDoc({ body: val })}
                      placeholder="Write your tailored opening, technical alignment paragraph, and closing..."
                      className="text-[14px] leading-[1.72] text-slate-800 whitespace-pre-wrap"
                    />
                  </div>

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
          </div>

          {/* Studio Footer */}
          <div className="print-hide px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Click any field, keyword pill, or experience bullet to edit &amp; match against the job description.
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

function ExperienceEntriesEditor({
  entries,
  onUpdateEntry,
  onDeleteEntry,
  onAddEntry,
}: {
  entries: ExperienceEntry[];
  onUpdateEntry: (idx: number, patch: Partial<ExperienceEntry>) => void;
  onDeleteEntry: (idx: number) => void;
  onAddEntry: () => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="p-4 border border-dashed border-slate-300 rounded-lg text-center space-y-2">
        <p className="text-xs text-slate-500">
          No experience or projects added yet. Add a role, internship, or academic engineering project.
        </p>
        <button
          type="button"
          onClick={onAddEntry}
          className="print-hide inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Experience or Project
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry, idx) => (
        <div
          key={entry.id}
          className="group/card relative rounded-lg p-1.5 -m-1.5 hover:bg-slate-50/70 transition-colors space-y-1"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex-1 min-w-[200px] flex flex-wrap items-baseline gap-1.5">
              <input
                type="text"
                aria-label={`Experience title ${idx + 1}`}
                value={entry.title}
                onChange={(e) => onUpdateEntry(idx, { title: e.target.value })}
                placeholder="Role / Project Title"
                className="font-display text-[14px] font-bold text-slate-900 bg-transparent border border-transparent rounded px-1 py-0.5 -mx-1 hover:bg-blue-50/50 focus:bg-blue-50/60 focus:border-blue-300 focus:outline-none min-w-[160px]"
              />
              {(entry.organization || entries.length > 0) && (
                <input
                  type="text"
                  aria-label={`Organization ${idx + 1}`}
                  value={entry.organization}
                  onChange={(e) => onUpdateEntry(idx, { organization: e.target.value })}
                  placeholder="Company / Context"
                  className="text-[13px] font-medium text-slate-600 bg-transparent border border-transparent rounded px-1 py-0.5 hover:bg-blue-50/50 focus:bg-blue-50/60 focus:border-blue-300 focus:outline-none"
                />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                aria-label={`Dates ${idx + 1}`}
                value={entry.dates}
                onChange={(e) => onUpdateEntry(idx, { dates: e.target.value })}
                placeholder="Dates"
                className="w-28 text-right font-mono text-xs text-slate-500 bg-transparent border border-transparent rounded px-1 py-0.5 hover:bg-blue-50/50 focus:bg-blue-50/60 focus:border-blue-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onDeleteEntry(idx)}
                aria-label={`Remove entry ${entry.title}`}
                className="print-hide opacity-0 group-hover/card:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1 pl-1">
            {entry.bullets.map((bullet, bIdx) => (
              <div key={bIdx} className="group/bullet flex items-start gap-1.5">
                <span className="text-slate-500 font-bold text-xs mt-1 select-none">•</span>
                <AutoTextarea
                  ariaLabel={`Achievement bullet ${bIdx + 1}`}
                  value={bullet}
                  onChange={(val) => {
                    const nextBullets = [...entry.bullets];
                    nextBullets[bIdx] = val;
                    onUpdateEntry(idx, { bullets: nextBullets });
                  }}
                  placeholder="Describe technical impact, tools, and measurable outcome..."
                  className="text-[13px] leading-relaxed text-slate-800"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateEntry(idx, {
                      bullets: entry.bullets.filter((_, i) => i !== bIdx),
                    })
                  }
                  aria-label="Delete bullet"
                  className="print-hide opacity-0 group-hover/bullet:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="print-hide pl-4 pt-0.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onUpdateEntry(idx, {
                  bullets: [
                    ...entry.bullets,
                    IMPACT_BULLET_TEMPLATES[entry.bullets.length % IMPACT_BULLET_TEMPLATES.length],
                  ],
                })
              }
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
            >
              <Plus className="w-3 h-3" />
              Add Achievement Bullet
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
