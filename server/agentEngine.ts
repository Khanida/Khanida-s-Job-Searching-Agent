import type { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import type {
  CandidateProfile,
  CvAnalysis,
  JobItem,
} from '../src/types.ts';

export const EVENT_WEIGHTS: Record<string, number> = {
  click: 1.25,
  inspect: 1.25,
  open_link: 1.75,
  view_debate: 1.5,
  view_drafts: 2.0,
  shortlist: 3.5,
  apply: 6.0,
  dismiss: -3.5,
};

export const REJECTION_REASON_LABELS: Record<string, string> = {
  seniority: 'Too senior / too much experience required',
  skills: 'Skills or experience are not a good match',
  location: 'Location or relocation does not work for me',
  authorization: 'Work authorization or visa is unsuitable',
  compensation: 'Salary or benefits are not suitable',
  role_type: 'The role type is not what I want',
  company: 'I do not want to work for this company',
  other: 'Other reason',
};

const KNOWN_SKILLS = [
  'Python',
  'C++',
  'C#',
  '.NET',
  'C',
  'Java',
  'JavaScript',
  'TypeScript',
  'Flutter',
  'Dart',
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'Firebase',
  'Supabase',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'SQL',
  'SQLite',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'REST API',
  'GraphQL',
  'Embedded Systems',
  'Microcontrollers',
  'Arduino',
  'STM32',
  'ESP32',
  'Raspberry Pi',
  'RTOS',
  'Firmware',
  'Robotics',
  'ROS',
  'PCB Design',
  'QA',
  'Software Testing',
  'Selenium',
  'Playwright',
  'Cypress',
  'Jest',
  'Pytest',
  'JUnit',
  'CI/CD',
  'Linux',
  'Git',
  'GitHub',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'Machine Learning',
  'Deep Learning',
  'TensorFlow',
  'PyTorch',
  'OpenCV',
  'Computer Vision',
  'Graphic Design',
  'Figma',
  'UI/UX',
  'Adobe Photoshop',
  'Illustrator',
  'Canva',
  'MATLAB',
  'Simulink',
  'Verilog',
  'VHDL',
  'FPGA',
  'AutoCAD',
  'SolidWorks',
  'Agile',
  'Scrum',
  'Networking',
  'Cybersecurity',
];

const ROLE_PATTERNS: Array<{ role: string; keywords: string[] }> = [
  { role: 'Junior Embedded Systems Engineer', keywords: ['embedded', 'microcontroller', 'arduino', 'stm32', 'esp32', 'rtos', 'fpga', 'verilog', 'vhdl', 'firmware', 'robotics'] },
  { role: 'Junior Software Engineer', keywords: ['python', 'java', 'javascript', 'typescript', 'react', 'node.js', 'git', 'software', 'next.js'] },
  { role: 'QA Engineer', keywords: ['qa', 'software testing', 'selenium', 'playwright', 'cypress', 'pytest', 'junit', 'quality assurance'] },
  { role: 'Graduate Engineer', keywords: ['engineering', 'b.e.', 'b.s.', 'bachelor', 'graduate', 'computer systems', 'computer science'] },
  { role: 'IT Support & Cloud Engineer', keywords: ['linux', 'aws', 'azure', 'docker', 'kubernetes', 'troubleshooting', 'networking', 'hardware'] },
  { role: 'Flutter / Mobile Developer', keywords: ['flutter', 'dart', 'firebase', 'mobile', 'android', 'ios'] },
  { role: 'UI/UX & Graphic Designer', keywords: ['figma', 'ui/ux', 'graphic design', 'adobe photoshop', 'illustrator', 'canva', 'tailwind css'] },
];

const STOP_WORDS = new Set([
  'and', 'the', 'with', 'for', 'our', 'you', 'your', 'will', 'are', 'have', 'that', 'this',
  'from', 'work', 'join', 'team', 'looking', 'seeking', 'role', 'position', 'jobs', 'hire',
  'about', 'also', 'into', 'more', 'their', 'what', 'which', 'who', 'whom', 'not', 'very',
  'experience', 'years', 'year', 'candidate', 'candidates', 'ability', 'application',
]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasSkillMatch(text: string, skill: string): boolean {
  const token = (skill || '').trim();
  if (!token) return false;
  const escaped = escapeRegex(token);
  const rx = new RegExp(`(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#.])`, 'i');
  return rx.test(text);
}

export interface ParsedCvContent {
  detectedName: string;
  detectedLocation: string;
  detectedDegree: string;
  summary: string;
  extractedSkills: string[];
  education: string;
  experience: string;
}

export function sanitizeCvText(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    // Strip ASCII control chars, replacement chars, and private-use glyph codes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\uE000-\uF8FF]/g, ' ');

  const cleanedLines: string[] = [];
  for (const lineRaw of text.split(/\r?\n/)) {
    let line = lineRaw.replace(/\s+/g, ' ').trim();
    if (!line) {
      if (cleanedLines.length && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    // Re-collapse spaced uppercase letters e.g. "W O R K   E X P E R I E N C E"
    if (/^(?:[A-Z]\s+){3,}[A-Z]$/.test(line)) {
      line = line.replace(/\s+/g, '');
    }

    // Drop internal PDF operator noise lines
    if (
      /^(%PDF-|xref|trailer|startxref|endobj|endstream|obj\b|<<|>>|\/Type\b|\/Font\b|\/FlateDecode|CIDInit|begincmap|endcmap|beginbfchar|beginbfrange)/i.test(
        line
      )
    ) {
      continue;
    }

    // Check readable character density to eliminate garbled glyph runs
    const safeChars = (line.match(/[a-zA-Z0-9\s.,;:'"()\-–—/&+#@%*•·!?[\]]/g) || []).length;
    const alphaWords = (line.match(/[a-zA-Z]{2,}/g) || []).length;
    const ratio = safeChars / Math.max(1, line.length);
    const hasWeirdNoise = /[\u00C0-\u024F]{3,}|[^\x20-\x7E•·–—’“”°±™®©]{3,}/.test(line);

    if (ratio < 0.72 || alphaWords === 0 || (hasWeirdNoise && alphaWords < 3)) {
      continue;
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseCvSections(cvText: string): ParsedCvContent {
  const cleaned = sanitizeCvText(cvText || '');
  const rawLines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trimEnd());

  const buckets: Record<'header' | 'summary' | 'skills' | 'education' | 'experience', string[]> = {
    header: [],
    summary: [],
    skills: [],
    education: [],
    experience: [],
  };

  let currentSection: keyof typeof buckets = 'header';
  const headingRx = {
    summary: /^(professional\s+summary|executive\s+summary|career\s+summary|summary|profile|objective|about(\s+me)?)\s*:?$/i,
    skills: /^(core\s+skills(\s*&\s*competencies)?|technical\s+skills|skills(\s*&\s*(tools|technologies))?|competencies|tech\s+stack|technologies|tools)\s*:?$/i,
    education: /^(education|academic\s+background|academic\s+qualifications|qualifications|degrees?)\s*:?$/i,
    experience: /^(experience(\s*&\s*projects)?|work\s+experience|professional\s+experience|relevant\s+experience|engineering\s+experience|work\s+history|career\s+history|employment|internships?(\s*&\s*projects)?|projects|academic\s+projects|technical\s+projects|selected\s+projects|personal\s+projects|key\s+projects|project\s+portfolio|certifications?|achievements?|leadership(\s*&\s*activities)?)\s*:?$/i,
  };

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSection !== 'header') {
        buckets[currentSection].push('');
      }
      continue;
    }

    const cleanHeading = trimmed.replace(/^#+\s*/, '').replace(/[:\-–—]+$/, '').trim();
    if (headingRx.summary.test(cleanHeading)) {
      currentSection = 'summary';
      continue;
    }
    if (headingRx.skills.test(cleanHeading)) {
      currentSection = 'skills';
      continue;
    }
    if (headingRx.education.test(cleanHeading)) {
      currentSection = 'education';
      continue;
    }
    if (headingRx.experience.test(cleanHeading)) {
      currentSection = 'experience';
      continue;
    }

    // Inline labeled line like "Skills: Python, C++, Embedded Systems"
    const inlineSkillMatch = trimmed.match(/^(?:technical\s+)?skills\s*:\s*(.+)$/i);
    if (inlineSkillMatch) {
      buckets.skills.push(inlineSkillMatch[1]);
      continue;
    }
    const inlineEduMatch = trimmed.match(/^education\s*:\s*(.+)$/i);
    if (inlineEduMatch) {
      buckets.education.push(inlineEduMatch[1]);
      continue;
    }

    buckets[currentSection].push(trimmed);
  }

  // Known skills with word-boundary accuracy
  const knownDetected = KNOWN_SKILLS.filter((skill) => hasSkillMatch(cvText, skill));

  // Explicit items listed in user's Skills section (so custom words aren't dropped!)
  const explicitSkillTokens = buckets.skills
    .join('\n')
    .split(/[\n,|•;·/]+/)
    .map((s) => s.replace(/^[•\-*]\s*/, '').replace(/^[\w\s]+:\s*/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 36 && !/^(and|or|with|including|etc\.?)$/i.test(s));

  const seenSkillKeys = new Set<string>();
  const extractedSkills: string[] = [];
  for (const s of [...knownDetected, ...explicitSkillTokens]) {
    const k = s.toLowerCase();
    if (!seenSkillKeys.has(k)) {
      seenSkillKeys.add(k);
      extractedSkills.push(s);
    }
  }

  // Detect name from header line if it looks like a person name (2-4 words, not an email/URL/phone)
  const headerClean = buckets.header.filter(Boolean);
  let detectedName = '';
  if (
    headerClean[0] &&
    headerClean[0].length <= 48 &&
    !/[@/\\|]|\d{3}/.test(headerClean[0]) &&
    headerClean[0].split(/\s+/).length >= 2 &&
    headerClean[0].split(/\s+/).length <= 5
  ) {
    detectedName = headerClean[0];
  }

  const detectedDegree =
    buckets.education.find((l) => l.trim().length > 4) ||
    rawLines.find((l) => /\b(b\.?e\.?|b\.?s\.?|b\.?tech|m\.?s\.?|bachelor|master|university|institute|college)\b/i.test(l))?.trim() ||
    '';

  const detectedLocation =
    headerClean.find((l) => /,/.test(l) && !/@/.test(l) && l !== detectedName)?.split('|')[0]?.trim() || '';

  const fallbackExp =
    !buckets.experience.length && !buckets.summary.length && headerClean.length > 2
      ? headerClean.slice(2).join('\n')
      : '';

  return {
    detectedName,
    detectedLocation,
    detectedDegree,
    summary: buckets.summary.join('\n').trim(),
    extractedSkills: extractedSkills.slice(0, 24),
    education: buckets.education.join('\n').trim(),
    experience: (buckets.experience.join('\n').trim() || fallbackExp).trim(),
  };
}

export function googleCareersSearchUrl(profile: Partial<CandidateProfile>): string {
  const roles = (profile.target_roles || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 3);
  const terms = roles.length
    ? roles
    : (profile.skills || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
  const searchTerms = terms.length ? terms.map((t) => `"${t}"`).join(' OR ') : '"open jobs"';
  const location = (profile.residence || '').trim();
  const query = `(${searchTerms}) jobs ${location} (site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR inurl:careers)`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export interface LocationPriorityResult {
  tier: 1 | 2 | 3 | 4;
  label: string;
  scoreBonus: number;
  inCurrentCity: boolean;
  inCurrentCountry: boolean;
  isRemote: boolean;
  hasVisa: boolean;
  hasAccommodation: boolean;
}

export function evaluateLocationPriority(
  profile: Partial<CandidateProfile>,
  job: Partial<JobItem>
): LocationPriorityResult {
  const residenceParts = (profile.residence || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const currentCity = residenceParts[0] || '';
  const currentCountry = residenceParts.length > 1 ? residenceParts[residenceParts.length - 1] : '';

  const locLower = (job.location || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const visaEv = (job.visa_evidence || '').toLowerCase();
  const housingEv = (job.housing_evidence || '').toLowerCase();

  const inCurrentCity = Boolean(currentCity && locLower.includes(currentCity));
  const inCurrentCountry = Boolean(currentCountry && locLower.includes(currentCountry));
  const isRemote = /\b(remote|worldwide|anywhere|global)\b/i.test(locLower);

  const hasVisa =
    (!visaEv.includes('not verified') &&
      !visaEv.includes('not explicitly verified') &&
      (visaEv.includes('mentioned') ||
        visaEv.includes('visa') ||
        visaEv.includes('sponsor') ||
        visaEv.includes('work permit') ||
        visaEv.includes('work authorization') ||
        visaEv.includes('iqama'))) ||
    /\b(visa sponsorship|sponsor visa|work permit|iqama|relocation sponsorship)\b/i.test(descLower);

  const hasAccommodation =
    (/accommodation:\s*mentioned|relocation:\s*mentioned|housing\s*\/\s*relocation|accommodation\s*\/\s*relocation|accommodation terms mentioned/i.test(
      housingEv
    ) ||
      /\b(accommodation|housing allowance|housing provided|staff housing|company housing|temporary housing|furnished apartment|relocation package|relocation stipend|relocation assistance|relocation allowance)\b/i.test(
        descLower
      ));

  if (inCurrentCity) {
    return {
      tier: 1,
      label: `Current Location (${profile.residence?.split(',')[0]?.trim() || 'Local'})`,
      scoreBonus: 22,
      inCurrentCity,
      inCurrentCountry,
      isRemote,
      hasVisa,
      hasAccommodation,
    };
  }

  if (hasVisa && hasAccommodation) {
    return {
      tier: 2,
      label: inCurrentCountry ? 'Other City · Visa + Accommodation' : 'International · Visa + Accommodation',
      scoreBonus: inCurrentCountry ? 16 : 14,
      inCurrentCity,
      inCurrentCountry,
      isRemote,
      hasVisa,
      hasAccommodation,
    };
  }

  if (isRemote) {
    return {
      tier: 3,
      label: 'Remote Eligible',
      scoreBonus: 6,
      inCurrentCity,
      inCurrentCountry,
      isRemote,
      hasVisa,
      hasAccommodation,
    };
  }

  if (inCurrentCountry || hasVisa || hasAccommodation) {
    return {
      tier: 3,
      label: inCurrentCountry ? 'Same Country · Partial Support' : 'Partial Mobility Support',
      scoreBonus: 2,
      inCurrentCity,
      inCurrentCountry,
      isRemote,
      hasVisa,
      hasAccommodation,
    };
  }

  return {
    tier: 4,
    label: 'Other Location · No Visa/Accommodation',
    scoreBonus: -10,
    inCurrentCity,
    inCurrentCountry,
    isRemote,
    hasVisa,
    hasAccommodation,
  };
}

export function analyzeCv(cvText: string): CvAnalysis {
  const parsed = parseCvSections(cvText || '');
  const skills = parsed.extractedSkills;

  const roles = ROLE_PATTERNS.filter((entry) =>
    entry.keywords.some((kw) => hasSkillMatch(cvText || '', kw))
  ).map((entry) => entry.role);

  const summary = skills.length
    ? `Extracted ${skills.length} skills/keywords (${skills.slice(0, 5).join(', ')}${skills.length > 5 ? ', …' : ''}) across ${roles.length || 1} engineering tracks.`
    : 'Add CV details or upload a resume to detect skills and role tracks.';

  return {
    skills,
    roles: roles.length ? roles : ['Graduate Engineer', 'Junior Software Engineer'],
    summary,
  };
}

export function scoreCvMatch(
  profile: Partial<CandidateProfile>,
  job: Partial<JobItem>
): { score: number; matchedSkills: string[]; matchedRoles: string[] } {
  const hay = `${job.title || ''} ${job.description || ''}`;
  const profileSkills = (profile.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cvParsed = profile.cv_text ? parseCvSections(profile.cv_text) : null;
  const combinedSkillPool = Array.from(
    new Map(
      [...profileSkills, ...(cvParsed?.extractedSkills || [])].map((s) => [s.toLowerCase(), s])
    ).values()
  );

  const targetRoles = (profile.target_roles || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const matchedSkills = combinedSkillPool.filter((skill) => hasSkillMatch(hay, skill));

  const hayLower = hay.toLowerCase();
  const matchedRoles = targetRoles.filter((role) => {
    const tokens = role
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['junior', 'graduate', 'engineer'].includes(t));
    return tokens.some((t) => hayLower.includes(t));
  });

  let score = 28;
  score += Math.min(44, matchedSkills.length * 14);
  score += Math.min(20, matchedRoles.length * 10);
  if (/\b(junior|graduate|entry|intern|trainee)\b/i.test(hay)) {
    score += 8;
  }
  return {
    score: Math.min(100, Math.max(10, score)),
    matchedSkills,
    matchedRoles,
  };
}

export function extractJobFeatures(job: Partial<JobItem>): Array<[string, string]> {
  const features: Array<[string, string]> = [];
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const company = (job.company || '').toLowerCase().trim();
  const location = (job.location || '').toLowerCase().trim();
  const source = (job.source || '').toLowerCase().trim();

  if (company) features.push(['company', company]);
  if (source) features.push(['source', source]);
  if (location.includes('remote')) features.push(['location', 'remote']);
  else if (location) {
    const city = location.split(',')[0].trim();
    if (city) features.push(['location', city]);
  }

  for (const token of title.split(/[^a-z0-9+]+/)) {
    if (token.length >= 2 && !STOP_WORDS.has(token)) {
      features.push(['role_keyword', token]);
    }
  }

  const hay = `${title} ${desc}`;
  for (const skill of KNOWN_SKILLS) {
    const s = skill.toLowerCase();
    if (s.length >= 2 && hay.includes(s)) {
      features.push(['keyword', s]);
    }
  }

  if (/\b(senior|lead|staff|principal|architect|director|manager)\b/.test(title)) {
    features.push(['career_level', 'senior']);
  } else if (/\b(junior|graduate|entry|intern|trainee|associate)\b/.test(title)) {
    features.push(['career_level', 'entry']);
  }

  // Deduplicate
  const seen = new Set<string>();
  return features.filter(([t, v]) => {
    const key = `${t}::${v}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function computeLearnedBoost(
  db: DatabaseSync,
  job: Partial<JobItem>
): { boost: number; reasons: string[] } {
  const features = extractJobFeatures(job);
  if (!features.length) return { boost: 0, reasons: [] };

  const weightsRows = db
    .prepare('SELECT feature_type, feature_value, score_delta FROM learned_weights')
    .all() as Array<{ feature_type: string; feature_value: string; score_delta: number }>;

  const weightMap = new Map<string, number>();
  for (const row of weightsRows) {
    weightMap.set(`${row.feature_type}::${row.feature_value}`, row.score_delta);
  }

  let total = 0;
  const reasons: Array<{ abs: number; text: string }> = [];

  for (const [ftype, fval] of features) {
    const delta = weightMap.get(`${ftype}::${fval}`);
    if (delta && Math.abs(delta) >= 0.5) {
      total += delta;
      const sign = delta > 0 ? '+' : '';
      reasons.push({
        abs: Math.abs(delta),
        text: `${delta > 0 ? 'Trained match' : 'Learned penalty'} on '${fval}' (${sign}${Math.round(delta)})`,
      });
    }
  }

  reasons.sort((a, b) => b.abs - a.abs);
  const clamped = Math.max(-25, Math.min(25, Math.round(total)));
  return {
    boost: clamped,
    reasons: reasons.slice(0, 4).map((r) => r.text),
  };
}

export function recordInteraction(
  db: DatabaseSync,
  sessionId: string,
  jobId: string,
  eventType: string,
  job: Partial<JobItem>,
  reason?: string,
  detail?: string
): void {
  const nowIso = new Date().toISOString();
  const meta = JSON.stringify({ reason: reason || null, detail: detail || null });

  db.prepare(
    `INSERT INTO interaction_events (session_id, job_id, event_type, metadata, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, jobId, eventType, meta, nowIso);

  const baseWeight = EVENT_WEIGHTS[eventType] ?? 0;
  if (baseWeight === 0) return;

  const features = extractJobFeatures(job);
  const reasonPriorityType: Record<string, string> = {
    seniority: 'career_level',
    skills: 'keyword',
    location: 'location',
    authorization: 'eligibility',
    compensation: 'compensation',
    role_type: 'role_keyword',
    company: 'company',
  };

  if (detail && eventType === 'dismiss') {
    for (const token of detail.toLowerCase().split(/[^a-z0-9+]+/)) {
      if (token.length >= 3 && !STOP_WORDS.has(token)) {
        features.push(['keyword', token]);
      }
    }
  }

  const upsert = db.prepare(`
    INSERT INTO learned_weights (feature_type, feature_value, score_delta, positive_hits, negative_hits, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(feature_type, feature_value) DO UPDATE SET
      score_delta = MAX(-25, MIN(25, score_delta + excluded.score_delta)),
      positive_hits = positive_hits + excluded.positive_hits,
      negative_hits = negative_hits + excluded.negative_hits,
      updated_at = excluded.updated_at
  `);

  for (const [ftype, fval] of features) {
    let weight = baseWeight;
    if (reason && reasonPriorityType[reason] === ftype) {
      weight = baseWeight * 2.0;
    }
    const pos = weight > 0 ? 1 : 0;
    const neg = weight < 0 ? 1 : 0;
    upsert.run(ftype, fval, weight, pos, neg, nowIso);
  }
}

export function generateApplicationMaterials(
  profile: Partial<CandidateProfile>,
  job: Partial<JobItem>
): { tailored_cv: string; cover_letter: string } {
  const jobTitle = (job.title || 'the advertised role').trim();
  const company = (job.company || 'Hiring Organization').trim();
  const cvText = (profile.cv_text || '').trim();
  const parsedCv = parseCvSections(cvText);

  const name = (profile.name || parsedCv.detectedName || 'Candidate Name').trim();
  const residence = (profile.residence || parsedCv.detectedLocation || 'Available for Relocation').trim();
  const degree = (profile.degree || parsedCv.detectedDegree || '').trim();

  const match = scoreCvMatch(profile, job);
  const profileSkills = (profile.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const mergedSkills = Array.from(
    new Map(
      [...match.matchedSkills, ...parsedCv.extractedSkills, ...profileSkills].map((s) => [s.toLowerCase(), s])
    ).values()
  );
  const relevantSkills = mergedSkills.slice(0, 14);

  const summaryParts: string[] = [];
  if (parsedCv.summary) {
    summaryParts.push(parsedCv.summary);
    summaryParts.push(`Tailored specifically for ${jobTitle} at ${company}.`);
  } else {
    if (degree) {
      summaryParts.push(`${degree} graduate`);
    } else {
      summaryParts.push('Engineering candidate');
    }
    summaryParts.push(`targeting the ${jobTitle} opportunity at ${company}.`);
    if (relevantSkills.length) {
      summaryParts.push(
        `Core technical strengths include ${relevantSkills.slice(0, 6).join(', ')}.`
      );
    }
  }

  const resumeSections: string[] = [
    name.toUpperCase(),
    `${residence}  |  Target Role: ${jobTitle} — ${company}`,
    '',
    'PROFESSIONAL SUMMARY',
    summaryParts.join(' '),
  ];

  if (relevantSkills.length) {
    resumeSections.push(
      '',
      'CORE SKILLS & COMPETENCIES',
      ...relevantSkills.map((s) => `• ${s}`)
    );
  }

  const educationBlock = parsedCv.education || degree;
  if (educationBlock) {
    resumeSections.push('', 'EDUCATION', educationBlock);
  }

  const experienceSource = parsedCv.experience || '';
  const formattedCvLines = experienceSource
    ? experienceSource
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && /[a-zA-Z]{2,}/.test(line))
        .map((line) => (line.startsWith('-') ? `• ${line.slice(1).trim()}` : line))
    : ['• Add your work history, internships, or engineering projects using the Structured Experience & Projects editor below.'];

  resumeSections.push('', 'EXPERIENCE & PROJECTS', ...formattedCvLines);

  const tailored_cv = resumeSections.join('\n').trim();

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const skillPhrase = (match.matchedSkills.length ? match.matchedSkills : relevantSkills.slice(0, 5)).join(', ');
  const fitParagraph = skillPhrase
    ? `Through my academic training and hands-on engineering work, I have built practical depth in ${skillPhrase}, which aligns closely with the technical requirements outlined for this role.`
    : 'I am enthusiastic about the responsibilities outlined in your posting and look forward to contributing dependable engineering execution from day one.';
  const background = degree
    ? `With my background in ${degree}, I combine structured problem-solving with rapid adaptability across software, hardware, and quality workflows.`
    : '';

  const cover_letter = [
    name,
    residence,
    '',
    todayFormatted,
    '',
    'Hiring Team',
    company,
    `Re: Application for ${jobTitle}`,
    '',
    'Dear Hiring Team,',
    '',
    `I am writing to express my strong interest in the ${jobTitle} position at ${company}. ${background}`.trim(),
    '',
    fitParagraph,
    '',
    `Thank you for your time and consideration. I would welcome the opportunity to discuss how my skills and motivation can contribute to ${company}.`,
    '',
    'Sincerely,',
    name,
  ].join('\n');

  return { tailored_cv, cover_letter };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function buildDocxBuffer(content: string): Promise<Buffer> {
  const lines = (content || '').split(/\r?\n/);
  const paragraphsXml = lines
    .map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return '<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>';
      }

      const isTitle = idx === 0;
      const isSubtitle = idx === 1;
      const isSectionHeading =
        idx > 1 &&
        trimmed.length >= 3 &&
        trimmed.length <= 64 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed) &&
        !trimmed.startsWith('•') &&
        !trimmed.startsWith('-');
      const isSubjectLine = /^Re:\s/i.test(trimmed);
      const isBullet = trimmed.startsWith('•') || trimmed.startsWith('- ');

      if (isTitle) {
        return `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="1E3A8A"/></w:pBdr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
      }

      if (isSubtitle) {
        return `<w:p><w:pPr><w:spacing w:before="40" w:after="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/><w:color w:val="475569"/></w:rPr><w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
      }

      if (isSectionHeading) {
        return `<w:p><w:pPr><w:spacing w:before="200" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="CBD5E1"/></w:pBdr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="22"/><w:color w:val="1E3A8A"/></w:rPr><w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
      }

      if (isBullet) {
        const cleanBullet = trimmed.replace(/^[•-]\s*/, '• ');
        return `<w:p><w:pPr><w:spacing w:before="20" w:after="60" w:line="260" w:lineRule="auto"/><w:ind w:left="320" w:hanging="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:color w:val="1E293B"/></w:rPr><w:t xml:space="preserve">${escapeXml(cleanBullet)}</w:t></w:r></w:p>`;
      }

      const rPr = isSubjectLine
        ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="21"/><w:color w:val="0F172A"/></w:rPr>'
        : '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:color w:val="1E293B"/></w:rPr>';

      return `<w:p><w:pPr><w:spacing w:before="20" w:after="100" w:line="276" w:lineRule="auto"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
    })
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function runJuryDeliberation(
  db: DatabaseSync,
  profile: CandidateProfile
): { sessionId: string; crownedCount: number; reviewedCount: number } {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const sessionId = `${today.replace(/-/g, '')}_${nowIso.slice(11, 19).replace(/:/g, '')}_${Math.random().toString(16).slice(2, 8)}`;

  const jobs = db
    .prepare('SELECT * FROM jobs')
    .all() as unknown as JobItem[];

  const excludedSkills = (profile.excluded_skills || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const excludedTerms = (profile.excluded_job_terms || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const preferredCity = (profile.residence || '').split(',')[0].trim().toLowerCase();

  const updateJobStmt = db.prepare(
    `UPDATE jobs SET jury_score=?, score=?, is_daily_pick=?, advocate_agent=?, jury_verdict=?, location_priority_tier=? WHERE id=?`
  );
  const insertArgStmt = db.prepare(
    `INSERT INTO agent_arguments (deliberation_id, job_id, agent_name, agent_role, argument_type, statement, score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertVerdictStmt = db.prepare(
    `INSERT INTO jury_verdicts (deliberation_id, job_id, verdict, consensus_score, recommendation, is_selected, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  interface ScoredCandidate {
    job: JobItem;
    finalScore: number;
    locationTier: 1 | 2 | 3 | 4;
    advocate: string;
    verdict: string;
    recommendation: string;
    eligibleForDaily: boolean;
    args: Array<{
      agent_name: string;
      agent_role: string;
      argument_type: string;
      statement: string;
      score: number;
    }>;
  }

  const evaluated: ScoredCandidate[] = [];

  for (const job of jobs) {
    const titleLower = (job.title || '').toLowerCase();
    const descLower = (job.description || '').toLowerCase();
    const hay = `${titleLower} ${descLower}`;
    const isDismissed = job.status === 'dismissed';

    const cvMatch = scoreCvMatch(profile, job);
    const { boost, reasons } = computeLearnedBoost(db, job);

    const isSenior = /\b(senior|staff|principal|lead|director|architect|manager|head of)\b/.test(titleLower);
    const hasExcludedSkill = excludedSkills.some((s) => hasSkillMatch(hay, s));
    const hasExcludedTerm = excludedTerms.some((t) => titleLower.includes(t));
    const isSaudiOnly = hay.includes('saudi national') || hay.includes('saudization');

    let constraintPass = true;
    let constraintNote =
      "The listing does not conflict with the candidate's entry-level preference, stated skill exclusions, or avoided role types.";
    if (profile.experience_level === 'entry-level' && isSenior) {
      constraintPass = false;
      constraintNote = 'OBJECTION: Role title signals senior/leadership tier beyond entry-level target.';
    } else if (hasExcludedSkill) {
      constraintPass = false;
      constraintNote = 'OBJECTION: Posting references an excluded skill configured in the candidate profile.';
    } else if (hasExcludedTerm) {
      constraintPass = false;
      constraintNote = 'OBJECTION: Role title matches an excluded job track in candidate preferences.';
    } else if (isSaudiOnly) {
      constraintPass = false;
      constraintNote = 'OBJECTION: Listing restricts eligibility to Saudi nationals.';
    }

    const locPriority = evaluateLocationPriority(profile, job);
    const isLive = job.liveness_status === 'live';

    let rawScore = Math.round(
      cvMatch.score * 0.6 +
        (isLive ? 14 : 0) +
        (locPriority.hasVisa ? 6 : 0) +
        (locPriority.hasAccommodation ? 4 : 0) +
        locPriority.scoreBonus +
        boost
    );
    if (!constraintPass) rawScore = Math.max(15, rawScore - 28);
    if (isDismissed) rawScore = Math.max(10, rawScore - 18);
    const finalScore = Math.max(10, Math.min(98, rawScore));

    const eligibleForDaily = !isDismissed && isLive && constraintPass && job.authenticity_status !== 'suspicious';
    const advocate =
      locPriority.tier <= 2
        ? 'Visa & Relocation Advocate'
        : cvMatch.matchedSkills.length >= 2
          ? 'Software & Systems Agent'
          : 'Quality & Operations Agent';

    const verdict = isDismissed
      ? 'REJECTED BY CANDIDATE & JURY BENCH'
      : !isLive
        ? 'REJECTED — LINK UNAVAILABLE / UNVERIFIED'
        : !constraintPass
          ? 'REJECTED — CONSTRAINED BY PROFILE PREFERENCES'
          : finalScore >= 55
            ? 'APPROVED BY MAJORITY VOTE'
            : 'TOP CANDIDATE — REVIEW MATCH DETAILS';

    const recommendation = isDismissed
      ? 'Previously rejected/dismissed in your pipeline; kept in Jury memory as a negative training example.'
      : !constraintPass
        ? 'Eliminated during cross-examination because it violates your seniority, skill, or role-track exclusions.'
        : !isLive
          ? 'Posting reachability could not be confirmed today. Excluded from the top 5.'
          : locPriority.tier === 1
            ? `Priority Tier 1: Located in your current city (${profile.residence || preferredCity}). Ranked first.`
            : locPriority.tier === 2
              ? 'Priority Tier 2: Relocating city/country with both visa and accommodation/relocation support verified.'
              : locPriority.hasVisa
                ? 'Visa signals present, though accommodation is not explicitly confirmed.'
                : 'Other location without confirmed visa & accommodation; ranked behind local and full-relocation roles.';

    const args = [
      {
        agent_name: 'Listing Availability Examiner',
        agent_role: 'Posting Link & Availability Verification',
        argument_type: 'availability_check',
        statement: isLive
          ? 'The posting URL responded successfully and no closure message was detected. The page is reachable, though live intake should still be confirmed.'
          : 'The posting could not be verified as reachable today. The Jury excludes unverified links from the confirmed daily top 5.',
        score: isLive ? 100 : 0,
      },
      {
        agent_name: 'Employer Authenticity Examiner',
        agent_role: 'Employer Domain & Recruiting Platform Review',
        argument_type: 'authenticity_check',
        statement:
          job.authenticity_status === 'likely_official'
            ? `Positive domain signal: ${job.authenticity_evidence || 'Matched official employer or ATS platform.'}`
            : `Authenticity remains unverified: ${job.authenticity_evidence || 'Check official careers page before sharing sensitive documents.'}`,
        score: job.authenticity_status === 'likely_official' ? 100 : 50,
      },
      {
        agent_name: 'CV & Target Role Analyst',
        agent_role: 'Candidate Experience and Role Alignment',
        argument_type: 'cv_match',
        statement: `Candidate profile match is ${cvMatch.score}/100.${cvMatch.matchedSkills.length ? ` Matched CV skills: ${cvMatch.matchedSkills.join(', ')}.` : ' Limited direct skill keyword overlap; review posting scope.'}`,
        score: cvMatch.score,
      },
      {
        agent_name: 'Candidate Experience Fit Examiner',
        agent_role: 'Seniority, Skills & Role Preference Review',
        argument_type: 'candidate_constraints',
        statement: isDismissed ? `REJECTED: Previously dismissed by candidate; ${constraintNote}` : constraintNote,
        score: !isDismissed && constraintPass ? 100 : 20,
      },
      {
        agent_name: 'Visa & Relocation Advocate',
        agent_role: 'Immigration & Accommodation Counsel',
        argument_type: 'endorsement',
        statement:
          locPriority.hasVisa && locPriority.hasAccommodation
            ? `Both visa and accommodation/relocation support detected for ${job.company} (${job.visa_evidence}; ${job.housing_evidence}). Qualifies for Priority Tier 2.`
            : locPriority.hasVisa
              ? `Visa signals detected (${job.visa_evidence}), but accommodation/housing support is not explicitly stated (${job.housing_evidence || 'Not verified'}).`
              : `No confirmed visa & accommodation package in the scraped text (${job.visa_evidence || 'Not verified'}).`,
        score: locPriority.hasVisa && locPriority.hasAccommodation ? 95 : locPriority.hasVisa ? 68 : 35,
      },
      {
        agent_name: 'City Preference Examiner',
        agent_role: 'Location & Mobility Priority',
        argument_type: 'location_preference',
        statement:
          locPriority.tier === 1
            ? `Priority Tier 1: Listed in your current location (${profile.residence}). Ranked first ahead of relocating roles.`
            : locPriority.tier === 2
              ? `Priority Tier 2: Located in another city/country (${job.location}) and provides both visa and accommodation/relocation support.`
              : locPriority.isRemote
                ? 'Priority Tier 3: Remote-eligible role; ranked behind local and full visa+accommodation opportunities.'
                : `Priority Tier ${locPriority.tier}: Located outside ${profile.residence || 'current location'} without full visa & accommodation confirmation; ranked lower.`,
        score: locPriority.tier === 1 ? 100 : locPriority.tier === 2 ? 86 : locPriority.isRemote ? 68 : 38,
      },
    ];

    if (boost !== 0 && reasons.length) {
      args.push({
        agent_name: 'Agent Training Engine',
        agent_role: 'Behavioral Reinforcement Learner',
        argument_type: 'learned_preference',
        statement: `Trained on your clicks & selections: ${reasons.join('; ')} (Score delta: ${boost > 0 ? '+' : ''}${boost}).`,
        score: Math.max(10, Math.min(100, 60 + boost * 2)),
      });
    }

    evaluated.push({
      job,
      finalScore,
      locationTier: locPriority.tier,
      advocate,
      verdict,
      recommendation,
      eligibleForDaily,
      args,
    });
  }

  evaluated.sort((a, b) => {
    if (a.eligibleForDaily !== b.eligibleForDaily) return a.eligibleForDaily ? -1 : 1;
    if (a.locationTier !== b.locationTier) return a.locationTier - b.locationTier;
    return b.finalScore - a.finalScore;
  });

  const crownedIds = new Set(
    evaluated
      .filter((e) => e.eligibleForDaily)
      .slice(0, 5)
      .map((e) => e.job.id)
  );

  // Persist rich transcripts for top 35 approved/active + up to 20 rejected/dismissed/constrained roles
  const rejectedToPersist = new Set(
    evaluated
      .filter((e) => !e.eligibleForDaily)
      .slice(0, 20)
      .map((e) => e.job.id)
  );

  const summary = `Supreme Jury convened across ${evaluated.length} active & rejected vacancies. Crowned ${crownedIds.size} reachable openings matching ${profile.name}'s profile.`;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO deliberations (id, session_date, summary, top_picks_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, today, summary, crownedIds.size, nowIso);

    db.prepare('UPDATE jobs SET is_daily_pick = 0').run();

    for (let idx = 0; idx < evaluated.length; idx++) {
      const item = evaluated[idx];
      const isPick = crownedIds.has(item.job.id) ? 1 : 0;
      const finalVerdict = isPick && item.finalScore < 55 ? 'TOP 5 PICK — LOWER MATCH CONFIDENCE' : item.verdict;
      updateJobStmt.run(
        item.finalScore,
        item.finalScore,
        isPick,
        item.advocate,
        finalVerdict,
        item.locationTier,
        item.job.id
      );

      if (isPick || idx < 35 || rejectedToPersist.has(item.job.id)) {
        for (const arg of item.args) {
          insertArgStmt.run(
            sessionId,
            item.job.id,
            arg.agent_name,
            arg.agent_role,
            arg.argument_type,
            arg.statement,
            arg.score,
            nowIso
          );
        }
        insertVerdictStmt.run(
          sessionId,
          item.job.id,
          finalVerdict,
          item.finalScore,
          item.recommendation,
          isPick,
          nowIso
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    sessionId,
    crownedCount: crownedIds.size,
    reviewedCount: evaluated.length,
  };
}

/**
 * Fast real-time Jury recalibration executed after every user click, shortlist, apply, or dislike
 * so Today's Top Picks and match scores reflect learned user preferences immediately.
 */
export function recalibrateScoresFromWeights(
  db: DatabaseSync,
  profile: CandidateProfile
): { updatedCount: number; dailyPicksCount: number } {
  const jobs = db.prepare('SELECT * FROM jobs').all() as unknown as JobItem[];
  const excludedSkills = (profile.excluded_skills || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const excludedTerms = (profile.excluded_job_terms || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const preferredCity = (profile.residence || '').split(',')[0].trim().toLowerCase();

  const weightsRows = db
    .prepare('SELECT feature_type, feature_value, score_delta FROM learned_weights')
    .all() as Array<{ feature_type: string; feature_value: string; score_delta: number }>;
  const weightMap = new Map<string, number>();
  for (const row of weightsRows) {
    weightMap.set(`${row.feature_type}::${row.feature_value}`, row.score_delta);
  }

  const scored: Array<{ id: string; finalScore: number; locationTier: number; eligible: boolean }> = [];
  for (const job of jobs) {
    const titleLower = (job.title || '').toLowerCase();
    const descLower = (job.description || '').toLowerCase();
    const hay = `${titleLower} ${descLower}`;
    const isDismissed = job.status === 'dismissed';
    const cvMatch = scoreCvMatch(profile, job);

    let boostRaw = 0;
    for (const [ftype, fval] of extractJobFeatures(job)) {
      const delta = weightMap.get(`${ftype}::${fval}`);
      if (delta && Math.abs(delta) >= 0.5) boostRaw += delta;
    }
    const boost = Math.max(-25, Math.min(25, Math.round(boostRaw)));

    const isSenior = /\b(senior|staff|principal|lead|director|architect|manager|head of)\b/.test(titleLower);
    const hasExcludedSkill = excludedSkills.some((s) => hasSkillMatch(hay, s));
    const hasExcludedTerm = excludedTerms.some((t) => titleLower.includes(t));
    const isSaudiOnly = hay.includes('saudi national') || hay.includes('saudization');

    let constraintPass = true;
    if (profile.experience_level === 'entry-level' && isSenior) constraintPass = false;
    else if (hasExcludedSkill || hasExcludedTerm || isSaudiOnly) constraintPass = false;

    const locPriority = evaluateLocationPriority(profile, job);
    const isLive = job.liveness_status === 'live';

    let rawScore = Math.round(
      cvMatch.score * 0.6 +
        (isLive ? 14 : 0) +
        (locPriority.hasVisa ? 6 : 0) +
        (locPriority.hasAccommodation ? 4 : 0) +
        locPriority.scoreBonus +
        boost
    );
    if (!constraintPass) rawScore = Math.max(15, rawScore - 28);
    if (isDismissed) rawScore = Math.max(10, rawScore - 18);
    const finalScore = Math.max(10, Math.min(98, rawScore));

    const eligible = !isDismissed && isLive && constraintPass && job.authenticity_status !== 'suspicious';
    scored.push({ id: job.id, finalScore, locationTier: locPriority.tier, eligible });
  }

  scored.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.locationTier !== b.locationTier) return a.locationTier - b.locationTier;
    return b.finalScore - a.finalScore;
  });

  const pickIds = new Set(scored.filter((s) => s.eligible).slice(0, 5).map((s) => s.id));
  const updateStmt = db.prepare(
    'UPDATE jobs SET jury_score=?, score=?, is_daily_pick=?, location_priority_tier=? WHERE id=?'
  );

  db.exec('BEGIN');
  try {
    for (const s of scored) {
      updateStmt.run(s.finalScore, s.finalScore, pickIds.has(s.id) ? 1 : 0, s.locationTier, s.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { updatedCount: scored.length, dailyPicksCount: pickIds.size };
}

