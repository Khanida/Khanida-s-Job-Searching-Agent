import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import multer from 'multer';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import {
  analyzeCv,
  buildDocxBuffer,
  computeLearnedBoost,
  generateApplicationMaterials,
  googleCareersSearchUrl,
  REJECTION_REASON_LABELS,
  recordInteraction,
  runJuryDeliberation,
} from './server/agentEngine.ts';
import type {
  AgentArgument,
  ApplicationDraft,
  CandidateProfile,
  DeliberationSession,
  JobItem,
  JuryVerdict,
  LearnedWeight,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.resolve(process.cwd(), 'data', 'jobs.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, title TEXT, company TEXT, location TEXT,
      url TEXT, source TEXT, description TEXT, visa_evidence TEXT,
      housing_evidence TEXT, score INTEGER DEFAULT 0, jury_score INTEGER DEFAULT 0,
      is_daily_pick INTEGER DEFAULT 0, advocate_agent TEXT, jury_verdict TEXT,
      liveness_status TEXT DEFAULT 'unverified', liveness_checked_at TEXT,
      authenticity_status TEXT DEFAULT 'unverified', authenticity_evidence TEXT,
      posted_date TEXT DEFAULT 'Recently posted',
      status TEXT DEFAULT 'new', created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id=1), name TEXT, citizenship TEXT,
      residence TEXT, degree TEXT, skills TEXT, target_roles TEXT,
      cv_text TEXT, cv_filename TEXT, cv_uploaded_at TEXT, cv_analysis TEXT,
      experience_level TEXT DEFAULT 'entry-level',
      excluded_skills TEXT DEFAULT 'Rust',
      excluded_job_terms TEXT DEFAULT 'backend, back-end, full-stack, full stack',
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, status TEXT,
      tailored_cv TEXT, cover_letter TEXT, notes TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS deliberations (
      id TEXT PRIMARY KEY, session_date TEXT, summary TEXT, top_picks_count INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_arguments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, deliberation_id TEXT, job_id TEXT,
      agent_name TEXT, agent_role TEXT, argument_type TEXT, statement TEXT, score INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS jury_verdicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, deliberation_id TEXT, job_id TEXT,
      verdict TEXT, consensus_score INTEGER, strengths TEXT, risks TEXT,
      recommendation TEXT, is_selected INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS interaction_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, job_id TEXT,
      event_type TEXT, metadata TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS learned_weights (
      feature_type TEXT, feature_value TEXT, score_delta REAL DEFAULT 0,
      positive_hits INTEGER DEFAULT 0, negative_hits INTEGER DEFAULT 0, updated_at TEXT,
      PRIMARY KEY (feature_type, feature_value)
    );
  `);
}

ensureSchema();

function getProfileRow(): CandidateProfile {
  const row = db.prepare('SELECT * FROM profile WHERE id=1').get() as Record<string, unknown> | undefined;
  if (!row) {
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO profile (id, name, citizenship, residence, degree, skills, target_roles, cv_text, updated_at)
       VALUES (1, 'Adeena Khanzada', 'Pakistani', 'Jeddah, Saudi Arabia',
       'B.E. Computer Systems Engineering, MUET',
       'Python, C++, Java, Flutter, Firebase, HTML, CSS, JavaScript, QA, Embedded Systems, Graphic Design',
       'Junior Embedded Systems Engineer, Junior Software Engineer, QA Engineer, Graduate Engineer',
       '', ?)`
    ).run(nowIso);
    return getProfileRow();
  }

  let parsedAnalysis = null;
  if (typeof row.cv_analysis === 'string' && row.cv_analysis.trim()) {
    try {
      parsedAnalysis = JSON.parse(row.cv_analysis);
    } catch {
      parsedAnalysis = null;
    }
  }
  if (!parsedAnalysis && typeof row.cv_text === 'string' && row.cv_text.trim()) {
    parsedAnalysis = analyzeCv(row.cv_text);
  }

  return {
    id: Number(row.id),
    name: String(row.name || ''),
    citizenship: String(row.citizenship || ''),
    residence: String(row.residence || ''),
    degree: String(row.degree || ''),
    skills: String(row.skills || ''),
    target_roles: String(row.target_roles || ''),
    cv_text: String(row.cv_text || ''),
    cv_filename: row.cv_filename ? String(row.cv_filename) : null,
    cv_uploaded_at: row.cv_uploaded_at ? String(row.cv_uploaded_at) : null,
    cv_analysis: parsedAnalysis,
    experience_level: String(row.experience_level || 'entry-level'),
    excluded_skills: String(row.excluded_skills || ''),
    excluded_job_terms: String(row.excluded_job_terms || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function getStats() {
  const totalRaw = Number((db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c);
  const shortlistedCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='shortlisted'").get() as { c: number }).c);
  const appliedCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='applied'").get() as { c: number }).c);
  const newCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='new'").get() as { c: number }).c);
  const dismissedCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='dismissed'").get() as { c: number }).c);
  const dailyPicksCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE is_daily_pick=1 AND status != 'dismissed'").get() as { c: number }).c);
  const liveCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE liveness_status='live' AND status != 'dismissed'").get() as { c: number }).c);
  const sources = db
    .prepare("SELECT source, COUNT(*) as count FROM jobs WHERE status != 'dismissed' GROUP BY source ORDER BY count DESC")
    .all() as Array<{ source: string; count: number }>;

  return {
    totalRaw,
    activeCount: totalRaw - dismissedCount,
    dailyPicksCount,
    shortlistedCount,
    appliedCount,
    newCount,
    dismissedCount,
    liveCount,
    sources,
  };
}

function enrichJob(job: JobItem): JobItem {
  const { boost, reasons } = computeLearnedBoost(db, job);
  const appRow = db.prepare('SELECT id FROM applications WHERE job_id=? LIMIT 1').get(job.id);
  return {
    ...job,
    learned_boost: boost,
    learned_reasons: reasons,
    has_application: Boolean(appRow),
  };
}

function storeApplicationMaterials(job: JobItem, profile: CandidateProfile): ApplicationDraft {
  const { tailored_cv, cover_letter } = generateApplicationMaterials(profile, job);
  const existing = db
    .prepare('SELECT id FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(job.id) as { id: number } | undefined;
  const nowIso = new Date().toISOString();

  if (existing) {
    db.prepare(
      'UPDATE applications SET status=?, tailored_cv=?, cover_letter=? WHERE id=?'
    ).run(job.status || 'new', tailored_cv, cover_letter, existing.id);
    return db.prepare('SELECT * FROM applications WHERE id=?').get(existing.id) as unknown as ApplicationDraft;
  }

  const res = db
    .prepare(
      'INSERT INTO applications (job_id, status, tailored_cv, cover_letter, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(job.id, job.status || 'new', tailored_cv, cover_letter, nowIso);
  return db.prepare('SELECT * FROM applications WHERE id=?').get(res.lastInsertRowid) as unknown as ApplicationDraft;
}

const app = express();
app.use(express.json({ limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.get('/api/health', (_req: Request, res: Response) => {
  const stats = getStats();
  res.json({ ok: true, ...stats });
});

app.get('/api/dashboard', (req: Request, res: Response) => {
  const status = String(req.query.status || 'all');
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || 'all');
  const liveness = String(req.query.liveness || 'all');
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (status === 'all') {
    whereParts.push("status != 'dismissed'");
  } else if (['new', 'shortlisted', 'applied', 'dismissed'].includes(status)) {
    whereParts.push('status = ?');
    params.push(status);
  }

  if (source !== 'all') {
    whereParts.push('source = ?');
    params.push(source);
  }

  if (liveness === 'live') {
    whereParts.push("liveness_status = 'live'");
  } else if (liveness === 'unverified') {
    whereParts.push("liveness_status != 'live'");
  }

  if (q) {
    whereParts.push('(title LIKE ? OR company LIKE ? OR location LIKE ? OR description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as c FROM jobs ${whereClause}`)
    .get(...params) as { c: number };
  const totalMatching = Number(totalRow.c);

  const jobsRows = db
    .prepare(
      `SELECT * FROM jobs ${whereClause}
       ORDER BY is_daily_pick DESC, jury_score DESC, score DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as JobItem[];

  const dailyPickRows = db
    .prepare(
      `SELECT * FROM jobs WHERE is_daily_pick = 1 AND status != 'dismissed'
       ORDER BY jury_score DESC, score DESC LIMIT 5`
    )
    .all() as unknown as JobItem[];

  const latestDeliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  const profile = getProfileRow();

  res.json({
    stats: getStats(),
    dailyPicks: dailyPickRows.map(enrichJob),
    jobs: jobsRows.map(enrichJob),
    pagination: {
      page,
      limit,
      totalMatching,
      totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
    },
    profile,
    latestDeliberation,
    googleSearchUrl: googleCareersSearchUrl(profile),
  });
});

app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const jobRow = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!jobRow) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const latestDelib = db
    .prepare('SELECT id FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() as { id: string } | undefined;

  let args: AgentArgument[] = [];
  if (latestDelib) {
    args = db
      .prepare('SELECT * FROM agent_arguments WHERE job_id=? AND deliberation_id=? ORDER BY id ASC')
      .all(jobId, latestDelib.id) as unknown as AgentArgument[];
  }
  if (!args.length) {
    args = db
      .prepare('SELECT * FROM agent_arguments WHERE job_id=? ORDER BY id DESC LIMIT 12')
      .all(jobId) as unknown as AgentArgument[];
    args.reverse();
  }

  const verdict = (db
    .prepare('SELECT * FROM jury_verdicts WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) || null) as unknown as JuryVerdict | null;

  const application = (db
    .prepare('SELECT * FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) || null) as unknown as ApplicationDraft | null;

  res.json({
    job: enrichJob(jobRow),
    arguments: args,
    verdict,
    application,
  });
});

app.post('/api/jobs/:id/click', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const eventType = req.body?.eventType === 'view_debate' ? 'view_debate' : 'click';
  const jobRow = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!jobRow) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  recordInteraction(db, 'workspace_session', jobId, eventType, jobRow);
  res.json({ ok: true, job: enrichJob(jobRow) });
});

app.post('/api/jobs/:id/status', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const status = String(req.body?.status || '');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
  const detail = typeof req.body?.detail === 'string' ? req.body.detail : '';

  if (!['new', 'shortlisted', 'applied', 'dismissed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const jobRow = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!jobRow) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  db.prepare('UPDATE jobs SET status=? WHERE id=?').run(status, jobId);
  const updatedJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem;

  if (status === 'shortlisted') {
    recordInteraction(db, 'workspace_session', jobId, 'shortlist', updatedJob);
    const existingApp = db.prepare('SELECT id, tailored_cv, cover_letter FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1').get(jobId) as { id: number; tailored_cv: string | null; cover_letter: string | null } | undefined;
    if (!existingApp || !existingApp.tailored_cv || !existingApp.cover_letter) {
      storeApplicationMaterials(updatedJob, getProfileRow());
    }
  } else if (status === 'applied') {
    recordInteraction(db, 'workspace_session', jobId, 'apply', updatedJob);
  } else if (status === 'dismissed') {
    recordInteraction(db, 'workspace_session', jobId, 'dismiss', updatedJob, reason, detail);
  }

  const message =
    status === 'shortlisted'
      ? 'Job shortlisted and tailored resume & cover letter drafts prepared.'
      : status === 'dismissed' && reason && REJECTION_REASON_LABELS[reason]
        ? `Job dismissed; Jury trained on reason: ${REJECTION_REASON_LABELS[reason]}.`
        : `Job marked as ${status}.`;

  res.json({
    ok: true,
    message,
    job: enrichJob(updatedJob),
    stats: getStats(),
  });
});

app.get('/api/jury', (_req: Request, res: Response) => {
  const deliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  const jobs = db
    .prepare(
      `SELECT * FROM jobs WHERE status != 'dismissed'
       ORDER BY is_daily_pick DESC, jury_score DESC, score DESC
       LIMIT 25`
    )
    .all() as unknown as JobItem[];

  const items = jobs.map((job) => {
    let args: AgentArgument[] = [];
    if (deliberation) {
      args = db
        .prepare('SELECT * FROM agent_arguments WHERE job_id=? AND deliberation_id=? ORDER BY id ASC')
        .all(job.id, deliberation.id) as unknown as AgentArgument[];
    }
    if (!args.length) {
      args = db
        .prepare('SELECT * FROM agent_arguments WHERE job_id=? ORDER BY id DESC LIMIT 10')
        .all(job.id) as unknown as AgentArgument[];
      args.reverse();
    }
    const verdict = (db
      .prepare('SELECT * FROM jury_verdicts WHERE job_id=? ORDER BY id DESC LIMIT 1')
      .get(job.id) || null) as unknown as JuryVerdict | null;

    return {
      job: enrichJob(job),
      arguments: args,
      verdict,
    };
  });

  res.json({
    deliberation,
    items,
  });
});

app.post('/api/jury/convene', (_req: Request, res: Response) => {
  const profile = getProfileRow();
  const result = runJuryDeliberation(db, profile);
  res.json({
    ok: true,
    ...result,
    message: `Supreme Jury deliberated ${result.reviewedCount} roles and crowned ${result.crownedCount} daily picks.`,
  });
});

app.get('/api/jobs/:id/application', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  let application = (db
    .prepare('SELECT * FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) || null) as unknown as ApplicationDraft | null;

  if (!application || !application.tailored_cv || !application.cover_letter) {
    application = storeApplicationMaterials(job, getProfileRow());
  }

  res.json({
    job: enrichJob(job),
    application,
    profile: getProfileRow(),
  });
});

app.post('/api/jobs/:id/application/generate', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const application = storeApplicationMaterials(job, getProfileRow());
  res.json({
    ok: true,
    application,
    message: 'Tailored resume and cover letter regenerated from your saved profile.',
  });
});

app.post('/api/jobs/:id/application/save', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const tailored_cv = String(req.body?.tailored_cv || '').trim();
  const cover_letter = String(req.body?.cover_letter || '').trim();

  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) as { id: number } | undefined;
  const nowIso = new Date().toISOString();

  if (existing) {
    db.prepare('UPDATE applications SET tailored_cv=?, cover_letter=? WHERE id=?').run(
      tailored_cv,
      cover_letter,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO applications (job_id, status, tailored_cv, cover_letter, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(jobId, job.status || 'new', tailored_cv, cover_letter, nowIso);
  }

  const application = db
    .prepare('SELECT * FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) as unknown as ApplicationDraft;

  res.json({
    ok: true,
    application,
    message: 'Application drafts saved.',
  });
});

app.get('/api/jobs/:id/application/download/:docType', async (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const docType = String(req.params.docType);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  let application = db
    .prepare('SELECT * FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1')
    .get(jobId) as unknown as ApplicationDraft | undefined;

  if (!application || !application.tailored_cv || !application.cover_letter) {
    application = storeApplicationMaterials(job, getProfileRow());
  }

  const isResume = docType === 'resume';
  const content = isResume ? application.tailored_cv : application.cover_letter;
  const safeCompany = (job.company || 'company').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const filename = `${safeCompany}_${isResume ? 'tailored_resume' : 'cover_letter'}.docx`;

  const buffer = await buildDocxBuffer(content);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

app.get('/api/profile', (_req: Request, res: Response) => {
  res.json({ profile: getProfileRow() });
});

app.post('/api/profile', (req: Request, res: Response) => {
  const current = getProfileRow();
  const name = String(req.body?.name ?? current.name).trim();
  const citizenship = String(req.body?.citizenship ?? current.citizenship).trim();
  const residence = String(req.body?.residence ?? current.residence).trim();
  const degree = String(req.body?.degree ?? current.degree).trim();
  let skills = String(req.body?.skills ?? current.skills).trim();
  let target_roles = String(req.body?.target_roles ?? current.target_roles).trim();
  const experience_level = String(req.body?.experience_level ?? current.experience_level).trim();
  const excluded_skills = String(req.body?.excluded_skills ?? current.excluded_skills).trim();
  const excluded_job_terms = String(req.body?.excluded_job_terms ?? current.excluded_job_terms).trim();
  const cv_text = String(req.body?.cv_text ?? current.cv_text);

  let cvAnalysis = current.cv_analysis;
  const cvChanged = cv_text.trim() !== (current.cv_text || '').trim();
  if (cvChanged && cv_text.trim()) {
    cvAnalysis = analyzeCv(cv_text);
    if (cvAnalysis.roles.length && !req.body?.preserveRoles) {
      target_roles = cvAnalysis.roles.join(', ');
    }
    if (cvAnalysis.skills.length && !req.body?.preserveSkills) {
      skills = cvAnalysis.skills.join(', ');
    }
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE profile SET name=?, citizenship=?, residence=?, degree=?, skills=?,
     target_roles=?, cv_text=?, cv_analysis=?, experience_level=?,
     excluded_skills=?, excluded_job_terms=?, updated_at=? WHERE id=1`
  ).run(
    name,
    citizenship,
    residence,
    degree,
    skills,
    target_roles,
    cv_text,
    cvAnalysis ? JSON.stringify(cvAnalysis) : null,
    experience_level,
    excluded_skills,
    excluded_job_terms,
    nowIso
  );

  const updated = getProfileRow();
  const delib = runJuryDeliberation(db, updated);

  res.json({
    ok: true,
    profile: updated,
    deliberation: delib,
    message: `Profile saved and Supreme Jury re-convened (${delib.crownedCount} daily picks updated).`,
  });
});

app.post('/api/profile/upload-cv', upload.single('cv_file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No CV file provided' });
    return;
  }

  const filename = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ext = path.extname(filename).toLowerCase();
  let extractedText = '';

  try {
    if (ext === '.txt' || ext === '.md') {
      extractedText = file.buffer.toString('utf8');
    } else if (ext === '.docx') {
      const zip = await JSZip.loadAsync(file.buffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        extractedText = docXml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s+/g, '\n')
          .trim();
      }
    } else if (ext === '.pdf') {
      // Lightweight text extraction for uncompressed PDF text streams
      const raw = file.buffer.toString('latin1');
      const matches = raw.match(/\(([^()]{3,200})\)/g) || [];
      extractedText = matches
        .map((m) => m.slice(1, -1).replace(/\\([()\\])/g, '$1'))
        .filter((s) => /[a-zA-Z]{2,}/.test(s))
        .join(' ')
        .trim();
    }
  } catch {
    extractedText = '';
  }

  const current = getProfileRow();
  const cvTextToUse = extractedText || current.cv_text;
  const cvAnalysis = analyzeCv(cvTextToUse);
  const nowIso = new Date().toISOString();

  db.prepare(
    `UPDATE profile SET cv_filename=?, cv_uploaded_at=?, cv_text=?, cv_analysis=?, updated_at=? WHERE id=1`
  ).run(filename, nowIso, cvTextToUse, JSON.stringify(cvAnalysis), nowIso);

  const updated = getProfileRow();
  res.json({
    ok: true,
    profile: updated,
    extractedLength: extractedText.length,
    message: extractedText
      ? `Uploaded '${filename}' and extracted ${extractedText.length} characters for CV matching.`
      : `Uploaded '${filename}'. Paste text in the CV editor if PDF streams are compressed.`,
  });
});

app.get('/api/settings', (_req: Request, res: Response) => {
  const events = db
    .prepare('SELECT event_type, COUNT(*) as c FROM interaction_events GROUP BY event_type')
    .all() as Array<{ event_type: string; c: number }>;

  const counts: Record<string, number> = {};
  let totalEvents = 0;
  for (const e of events) {
    counts[e.event_type] = Number(e.c);
    totalEvents += Number(e.c);
  }

  const weights = db
    .prepare('SELECT * FROM learned_weights ORDER BY ABS(score_delta) DESC LIMIT 40')
    .all() as unknown as LearnedWeight[];

  const stage =
    totalEvents === 0
      ? 'Baseline Calibration'
      : totalEvents < 10
        ? 'Early Signal Collection'
        : totalEvents < 35
          ? 'Active Behavioral Adaptation'
          : 'Mature Preference Model';

  const stats = getStats();
  const latestDeliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  res.json({
    training: {
      stage,
      total_events: totalEvents,
      clicks: counts.click || 0,
      shortlists: counts.shortlist || 0,
      applies: counts.apply || 0,
      dismisses: counts.dismiss || 0,
      weights,
    },
    totalJobs: stats.totalRaw,
    liveCount: stats.liveCount,
    sources: stats.sources,
    latestDeliberation,
  });
});

app.post('/api/training/reset', (_req: Request, res: Response) => {
  db.exec('DELETE FROM interaction_events; DELETE FROM learned_weights;');
  res.json({
    ok: true,
    message: 'Learned agent memory reset to initial calibration.',
  });
});

function ensureDaily24hDeliberation() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const latest = db
    .prepare('SELECT created_at FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() as { created_at?: string } | undefined;
  const lastMs = latest?.created_at ? Date.parse(latest.created_at) : 0;
  if (!lastMs || Number.isNaN(lastMs) || Date.now() - lastMs >= TWENTY_FOUR_HOURS_MS) {
    runJuryDeliberation(db, getProfileRow());
  }
}

async function startServer() {
  ensureDaily24hDeliberation();
  setInterval(ensureDaily24hDeliberation, 15 * 60 * 1000);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*path', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
