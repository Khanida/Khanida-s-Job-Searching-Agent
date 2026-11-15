import type { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import type {
  CandidateProfile,
  CvAnalysis,
  JobItem,
} from '../src/types.ts';

export const EVENT_WEIGHTS: Record<string, number> = {
  click: 1.0,
  view_debate: 1.5,
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
  'C',
  'Java',
  'JavaScript',
  'TypeScript',
  'Flutter',
  'Dart',
  'Firebase',
  'HTML',
  'CSS',
  'React',
  'Node.js',
  'SQL',
  'SQLite',
  'Embedded Systems',
  'Microcontrollers',
  'Arduino',
  'RTOS',
  'QA',
  'Testing',
  'Selenium',
  'Playwright',
  'Linux',
  'Git',
  'Docker',
  'Graphic Design',
  'Figma',
  'UI/UX',
  'MATLAB',
  'Verilog',
  'FPGA',
];

const ROLE_PATTERNS: Array<{ role: string; keywords: string[] }> = [
  { role: 'Junior Embedded Systems Engineer', keywords: ['embedded', 'microcontroller', 'arduino', 'rtos', 'fpga', 'verilog', 'c++', 'firmware'] },
  { role: 'Junior Software Engineer', keywords: ['python', 'java', 'javascript', 'typescript', 'git', 'software', 'react'] },
  { role: 'QA Engineer', keywords: ['qa', 'testing', 'selenium', 'playwright', 'quality'] },
  { role: 'Graduate Engineer', keywords: ['engineering', 'b.e.', 'graduate', 'computer systems'] },
  { role: 'IT Support Engineer', keywords: ['linux', 'support', 'troubleshooting', 'network', 'hardware'] },
  { role: 'Flutter / Mobile Developer', keywords: ['flutter', 'dart', 'firebase', 'mobile'] },
  { role: 'UI/UX & Graphic Designer', keywords: ['figma', 'ui/ux', 'graphic design', 'css', 'html'] },
];

const STOP_WORDS = new Set([
  'and', 'the', 'with', 'for', 'our', 'you', 'your', 'will', 'are', 'have', 'that', 'this',
  'from', 'work', 'join', 'team', 'looking', 'seeking', 'role', 'position', 'jobs', 'hire',
  'about', 'also', 'into', 'more', 'their', 'what', 'which', 'who', 'whom', 'not', 'very',
  'experience', 'years', 'year', 'candidate', 'candidates', 'ability', 'application',
]);

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

export function analyzeCv(cvText: string): CvAnalysis {
  const lower = (cvText || '').toLowerCase();
  const skills = KNOWN_SKILLS.filter((skill) => {
    const token = skill.toLowerCase();
    if (token === 'c') return /\bc\b/.test(lower);
    if (token === 'c++') return lower.includes('c++');
    return lower.includes(token);
  });

  const roles = ROLE_PATTERNS.filter((entry) =>
    entry.keywords.some((kw) => lower.includes(kw))
  ).map((entry) => entry.role);

  const summary = skills.length
    ? `Extracted ${skills.length} technical skills and recommended ${roles.length || 1} entry-level engineering tracks.`
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
  const hay = `${job.title || ''} ${job.description || ''}`.toLowerCase();
  const profileSkills = (profile.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const targetRoles = (profile.target_roles || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const matchedSkills = profileSkills.filter((skill) => {
    const s = skill.toLowerCase();
    if (s === 'c') return /\bc\b/.test(hay);
    return hay.includes(s);
  });

  const matchedRoles = targetRoles.filter((role) => {
    const tokens = role
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['junior', 'graduate', 'engineer'].includes(t));
    return tokens.some((t) => hay.includes(t));
  });

  let score = 28;
  score += Math.min(44, matchedSkills.length * 14);
  score += Math.min(20, matchedRoles.length * 10);
  if (hay.includes('junior') || hay.includes('graduate') || hay.includes('entry') || hay.includes('intern')) {
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
  const name = (profile.name || 'Candidate Name').trim();
  const residence = (profile.residence || 'Available for Relocation').trim();
  const degree = (profile.degree || '').trim();
  const cvText = (profile.cv_text || '').trim();

  const match = scoreCvMatch(profile, job);
  const profileSkills = (profile.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const relevantSkills = Array.from(
    new Set([...match.matchedSkills, ...profileSkills])
  ).slice(0, 12);

  const summaryParts: string[] = [];
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

  if (degree) {
    resumeSections.push('', 'EDUCATION', degree);
  }

  const formattedCvLines = cvText
    ? cvText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith('-') ? `• ${line.slice(1).trim()}` : line))
    : ['• Add academic projects, internships, or work experience in your Profile to populate this section.'];

  resumeSections.push('', 'EXPERIENCE & PROJECTS', ...formattedCvLines);

  const tailored_cv = resumeSections.join('\n').trim();

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const skillPhrase = (match.matchedSkills.length ? match.matchedSkills : relevantSkills.slice(0, 4)).join(', ');
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
    .prepare("SELECT * FROM jobs WHERE status != 'dismissed'")
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
    `UPDATE jobs SET jury_score=?, score=?, is_daily_pick=?, advocate_agent=?, jury_verdict=? WHERE id=?`
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

    const cvMatch = scoreCvMatch(profile, job);
    const { boost, reasons } = computeLearnedBoost(db, job);

    const isSenior = /\b(senior|staff|principal|lead|director|architect|manager|head of)\b/.test(titleLower);
    const hasExcludedSkill = excludedSkills.some((s) => hay.includes(s));
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

    const inPreferredCity = preferredCity && (job.location || '').toLowerCase().includes(preferredCity);
    const isRemote = (job.location || '').toLowerCase().includes('remote');
    const visaMentioned = (job.visa_evidence || '').toLowerCase().includes('mentioned');
    const isLive = job.liveness_status === 'live';

    let rawScore = Math.round(cvMatch.score * 0.65 + (isLive ? 15 : 0) + (visaMentioned ? 10 : 4) + (inPreferredCity ? 12 : isRemote ? 8 : 0) + boost);
    if (!constraintPass) rawScore = Math.max(15, rawScore - 28);
    const finalScore = Math.max(10, Math.min(98, rawScore));

    const eligibleForDaily = isLive && constraintPass && job.authenticity_status !== 'suspicious';
    const advocate =
      cvMatch.matchedSkills.length >= 2
        ? 'Software & Systems Agent'
        : visaMentioned
          ? 'Visa & Relocation Advocate'
          : 'Quality & Operations Agent';

    const verdict = !isLive
      ? 'DEFERRED BY JURY (AVAILABILITY UNVERIFIED)'
      : !constraintPass
        ? 'CONSTRAINED BY PROFILE PREFERENCES'
        : finalScore >= 55
          ? 'APPROVED BY MAJORITY VOTE'
          : 'TOP CANDIDATE — REVIEW MATCH DETAILS';

    const recommendation = !isLive
      ? 'Posting reachability could not be confirmed today. Verify directly on the employer site before investing time.'
      : visaMentioned
        ? 'Strong alignment with visa/mobility signals present. Prioritize for shortlist and tailored application.'
        : 'Suitable for your active pipeline. Confirm visa/relocation support during initial recruiter outreach.';

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
        statement: constraintNote,
        score: constraintPass ? 100 : 25,
      },
      {
        agent_name: 'Visa & Relocation Advocate',
        agent_role: 'Immigration & Mobility Counsel',
        argument_type: 'endorsement',
        statement: visaMentioned
          ? `Mobility signals detected for ${job.company}: ${job.visa_evidence}.`
          : `Proceed with clarity: ${job.company} does not explicitly advertise sponsorship in the scraped text (${job.visa_evidence || 'Not verified'}).`,
        score: visaMentioned ? 82 : 40,
      },
      {
        agent_name: 'City Preference Examiner',
        agent_role: 'Candidate Location Priority',
        argument_type: 'location_preference',
        statement: inPreferredCity
          ? `Listed in preferred city (${profile.residence}). Ranked with local priority.`
          : isRemote
            ? 'Remote-eligible role; remains fully eligible in cross-location pipeline.'
            : `Not listed in ${profile.residence || 'preferred city'}. Kept eligible as an international/relocation fallback.`,
        score: inPreferredCity ? 95 : isRemote ? 75 : 50,
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
      advocate,
      verdict,
      recommendation,
      eligibleForDaily,
      args,
    });
  }

  evaluated.sort((a, b) => {
    if (a.eligibleForDaily !== b.eligibleForDaily) return a.eligibleForDaily ? -1 : 1;
    return b.finalScore - a.finalScore;
  });

  const crownedIds = new Set(
    evaluated
      .filter((e) => e.eligibleForDaily)
      .slice(0, 5)
      .map((e) => e.job.id)
  );

  const summary = `Supreme Jury convened across ${evaluated.length} active vacancies. Crowned ${crownedIds.size} reachable openings matching ${profile.name}'s profile and learned behavioral weights.`;

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO deliberations (id, session_date, summary, top_picks_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, today, summary, crownedIds.size, nowIso);

    db.prepare('UPDATE jobs SET is_daily_pick = 0').run();

    for (const item of evaluated) {
      const isPick = crownedIds.has(item.job.id) ? 1 : 0;
      const finalVerdict = isPick && item.finalScore < 55 ? 'TOP 5 PICK — LOWER MATCH CONFIDENCE' : item.verdict;
      updateJobStmt.run(
        item.finalScore,
        item.finalScore,
        isPick,
        item.advocate,
        finalVerdict,
        item.job.id
      );

      // Persist arguments & verdicts for top 40 jobs to keep DB fast and rich
      if (isPick || evaluated.indexOf(item) < 40) {
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
