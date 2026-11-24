import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import multer from 'multer';
import JSZip from 'jszip';
import { extractText, getDocumentProxy } from 'unpdf';
import { createServer as createViteServer } from 'vite';
import {
  analyzeCv,
  buildDocxBuffer,
  collectHandledJobSignatures,
  computeLearnedBoost,
  evaluateLocationPriority,
  generateApplicationMaterials,
  googleCareersSearchUrl,
  jobDedupeKeys,
  parseCvSections,
  REJECTION_REASON_LABELS,
  recalibrateScoresFromWeights,
  recordInteraction,
  runJuryDeliberation,
  sanitizeCvText,
} from './server/agentEngine.ts';
import { extractSalaryInfo, syncAllJobSources } from './server/jobSources.ts';
import {
  buildDailyJuryDigestEmail,
  isValidRecipientEmail,
  sanitizeHeaderValue,
  sendGmailRawMessage,
} from './server/emailDigest.ts';
import { suggestTopSkillsFromCv } from './server/geminiClient.ts';
import type {
  AgentArgument,
  ApplicationDraft,
  CandidateProfile,
  DeliberationSession,
  EmailDigestStatus,
  JobItem,
  JuryVerdict,
  LearnedWeight,
  UserEmailPreference,
} from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.resolve(process.cwd(), 'data', 'jobs.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA journal_mode = TRUNCATE;');
db.exec('PRAGMA synchronous = FULL;');

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
    CREATE TABLE IF NOT EXISTS email_preferences (
      id INTEGER PRIMARY KEY CHECK(id=1),
      enabled INTEGER DEFAULT 0,
      recipient_email TEXT DEFAULT '',
      last_sent_date TEXT DEFAULT '',
      last_sent_at TEXT DEFAULT '',
      last_sent_count INTEGER DEFAULT 0,
      last_subject TEXT DEFAULT '',
      last_error TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
  `);

  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (!existingCols.has('salary_min')) {
    db.exec('ALTER TABLE jobs ADD COLUMN salary_min INTEGER;');
  }
  if (!existingCols.has('salary_max')) {
    db.exec('ALTER TABLE jobs ADD COLUMN salary_max INTEGER;');
  }
  if (!existingCols.has('salary_currency')) {
    db.exec('ALTER TABLE jobs ADD COLUMN salary_currency TEXT;');
  }
  if (!existingCols.has('location_priority_tier')) {
    db.exec('ALTER TABLE jobs ADD COLUMN location_priority_tier INTEGER DEFAULT 4;');
  }
  if (!existingCols.has('cv_score')) {
    db.exec('ALTER TABLE jobs ADD COLUMN cv_score INTEGER DEFAULT 0;');
  }
  if (!existingCols.has('seniority_blocked')) {
    db.exec('ALTER TABLE jobs ADD COLUMN seniority_blocked INTEGER DEFAULT 0;');
  }
}

ensureSchema();

function backfillJobSalaries() {
  const rows = db
    .prepare('SELECT id, description FROM jobs WHERE salary_min IS NULL AND salary_max IS NULL')
    .all() as Array<{ id: string; description: string | null }>;
  if (!rows.length) return;
  const stmt = db.prepare('UPDATE jobs SET salary_min=?, salary_max=?, salary_currency=? WHERE id=?');
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const sal = extractSalaryInfo(r.description || '');
      if (sal.salary_min !== null || sal.salary_max !== null) {
        stmt.run(sal.salary_min, sal.salary_max, sal.salary_currency, r.id);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

backfillJobSalaries();

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
    cv_text: sanitizeCvText(String(row.cv_text || '')),
    cv_filename: row.cv_filename ? String(row.cv_filename) : null,
    cv_uploaded_at: row.cv_uploaded_at ? String(row.cv_uploaded_at) : null,
    cv_analysis: parsedAnalysis,
    experience_level: String(row.experience_level || 'entry-level'),
    excluded_skills: String(row.excluded_skills || ''),
    excluded_job_terms: String(row.excluded_job_terms || ''),
    updated_at: String(row.updated_at || ''),
  };
}

const EXPIRED_LIVENESS_SQL = "liveness_status IN ('expired', 'unavailable')";
const NOT_EXPIRED_LIVENESS_SQL = "(liveness_status IS NULL OR liveness_status NOT IN ('expired', 'unavailable'))";

function getStats() {
  const totalRaw = Number((db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c);
  const shortlistedCount = Number(
    (
      db
        .prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='shortlisted' AND ${NOT_EXPIRED_LIVENESS_SQL}`)
        .get() as { c: number }
    ).c
  );
  const appliedCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='applied'").get() as { c: number }).c);
  const newCount = Number(
    (
      db
        .prepare(`SELECT COUNT(*) as c FROM jobs WHERE status='new' AND ${NOT_EXPIRED_LIVENESS_SQL}`)
        .get() as { c: number }
    ).c
  );
  const expiredCount = Number(
    (
      db
        .prepare(`SELECT COUNT(*) as c FROM jobs WHERE status NOT IN ('dismissed', 'applied') AND ${EXPIRED_LIVENESS_SQL}`)
        .get() as { c: number }
    ).c
  );
  const dismissedCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='dismissed'").get() as { c: number }).c);
  const activeCount = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM jobs WHERE status != 'dismissed' AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL})`
        )
        .get() as { c: number }
    ).c
  );
  const dailyPicksCount = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM jobs WHERE is_daily_pick=1 AND status = 'new' AND ${NOT_EXPIRED_LIVENESS_SQL}`
        )
        .get() as { c: number }
    ).c
  );
  const liveCount = Number((db.prepare("SELECT COUNT(*) as c FROM jobs WHERE liveness_status='live' AND status != 'dismissed'").get() as { c: number }).c);
  const matchedCount = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM jobs
           WHERE status != 'dismissed'
             AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL})
             AND COALESCE(seniority_blocked, 0) = 0
             AND COALESCE(cv_score, 0) >= 35`
        )
        .get() as { c: number }
    ).c
  );
  const seniorFilteredCount = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM jobs
           WHERE status != 'dismissed'
             AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL})
             AND COALESCE(seniority_blocked, 0) = 1`
        )
        .get() as { c: number }
    ).c
  );
  const sources = db
    .prepare(
      `SELECT source, COUNT(*) as count FROM jobs WHERE status != 'dismissed' AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL}) GROUP BY source ORDER BY count DESC`
    )
    .all() as Array<{ source: string; count: number }>;

  return {
    totalRaw,
    activeCount,
    dailyPicksCount,
    shortlistedCount,
    appliedCount,
    newCount,
    expiredCount,
    dismissedCount,
    liveCount,
    matchedCount,
    seniorFilteredCount,
    sources,
  };
}

function formatShortLabel(isoOrDate: string, fallbackIndex?: number): string {
  const parsed = Date.parse(isoOrDate);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const mon = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const hm = d.toTimeString().slice(0, 5);
    return `${mon} ${hm}`;
  }
  return fallbackIndex ? `Round ${fallbackIndex}` : String(isoOrDate).slice(0, 16) || 'Latest';
}

function getJuryDecisionSnapshot() {
  const stats = getStats();
  const latest = (db
    .prepare('SELECT id, session_date, created_at FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as { id: string; session_date: string; created_at: string } | null;

  const matchRow = db
    .prepare(
      `SELECT COUNT(*) as c, COALESCE(AVG(jury_score), 0) as avgScore, COALESCE(MAX(jury_score), 0) as topScore
       FROM jobs
       WHERE status != 'dismissed' AND ${NOT_EXPIRED_LIVENESS_SQL} AND jury_score >= 55`
    )
    .get() as { c: number; avgScore: number; topScore: number };

  const fallbackRow = db
    .prepare(
      `SELECT COALESCE(AVG(jury_score), 0) as avgScore, COALESCE(MAX(jury_score), 0) as topScore
       FROM (
         SELECT jury_score FROM jobs
         WHERE status != 'dismissed' AND ${NOT_EXPIRED_LIVENESS_SQL}
         ORDER BY jury_score DESC LIMIT 20
       )`
    )
    .get() as { avgScore: number; topScore: number };

  const avgScore = Math.round(Number(matchRow.c > 0 ? matchRow.avgScore : fallbackRow.avgScore || 0));
  const topScore = Math.round(Number(matchRow.c > 0 ? matchRow.topScore : fallbackRow.topScore || 0));
  const sessionId = (latest?.id || `session_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const sessionDate = latest?.session_date || new Date().toISOString().slice(0, 10);
  const label = formatShortLabel(latest?.created_at || new Date().toISOString());

  return {
    sessionId,
    sessionDate,
    label,
    reviewedCount: stats.activeCount + stats.dismissedCount,
    matchedCount: Number(matchRow.c || 0),
    dailyPicksCount: stats.dailyPicksCount,
    shortlistedCount: stats.shortlistedCount,
    dismissedCount: stats.dismissedCount,
    avgMatchScore: Math.max(0, Math.min(100, avgScore)),
    topMatchScore: Math.max(0, Math.min(100, topScore)),
  };
}

function getJuryDecisionHistory() {
  const stats = getStats();
  const rows = db
    .prepare(
      `SELECT d.id, d.session_date, d.top_picks_count, d.created_at,
              COUNT(v.id) as reviewed_count,
              SUM(CASE WHEN v.consensus_score >= 55 THEN 1 ELSE 0 END) as matched_count,
              COALESCE(AVG(CASE WHEN v.consensus_score >= 55 THEN v.consensus_score END), AVG(v.consensus_score), 0) as avg_score,
              COALESCE(MAX(v.consensus_score), 0) as top_score
       FROM deliberations d
       LEFT JOIN jury_verdicts v ON v.deliberation_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at ASC
       LIMIT 24`
    )
    .all() as Array<{
    id: string;
    session_date: string;
    top_picks_count: number;
    created_at: string;
    reviewed_count: number;
    matched_count: number;
    avg_score: number;
    top_score: number;
  }>;

  if (!rows.length) {
    return [getJuryDecisionSnapshot()];
  }

  return rows.map((r, idx) => ({
    sessionId: String(r.id).replace(/[^a-zA-Z0-9_-]/g, '_'),
    sessionDate: String(r.session_date || new Date().toISOString().slice(0, 10)),
    label: formatShortLabel(r.created_at || r.session_date, idx + 1),
    reviewedCount: Number(r.reviewed_count || stats.activeCount),
    matchedCount: Number(r.matched_count || 0),
    dailyPicksCount: Number(r.top_picks_count || stats.dailyPicksCount),
    shortlistedCount: stats.shortlistedCount,
    dismissedCount: stats.dismissedCount,
    avgMatchScore: Math.max(0, Math.min(100, Math.round(Number(r.avg_score || 0)))),
    topMatchScore: Math.max(0, Math.min(100, Math.round(Number(r.top_score || 0)))),
  }));
}

function getDailyDigest() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const recentDelibs = db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 10')
    .all() as unknown as DeliberationSession[];

  const nowMs = Date.now();
  const within24h = recentDelibs.filter((d) => {
    const t = Date.parse(d.created_at);
    return !Number.isNaN(t) && nowMs - t <= TWENTY_FOUR_HOURS_MS;
  });

  const targetDelibs = within24h.length > 0 ? within24h : recentDelibs.slice(0, 1);
  const primaryDelib = targetDelibs[0] || null;
  const delibIds = targetDelibs.map((d) => d.id);

  let reviewedCount = 0;
  let digestRows: Array<{
    job: JobItem;
    consensus_score: number;
    verdict: string;
    strengths: string | null;
    recommendation: string | null;
  }> = [];

  const handledRows = db
    .prepare("SELECT id, title, company, url, status FROM jobs WHERE status IN ('dismissed', 'shortlisted', 'applied')")
    .all() as unknown as JobItem[];
  const { handledTitleCompanyKeys, handledUrlKeys } = collectHandledJobSignatures(handledRows);
  const seenKeys = new Set<string>(handledTitleCompanyKeys);
  const seenUrls = new Set<string>(handledUrlKeys);

  const primaryDelibId = primaryDelib?.id || null;
  if (primaryDelibId && delibIds.length > 0) {
    const placeholders = delibIds.map(() => '?').join(',');
    const countRow = db
      .prepare(`SELECT COUNT(DISTINCT job_id) as c FROM jury_verdicts WHERE deliberation_id IN (${placeholders})`)
      .get(...delibIds) as { c: number };
    reviewedCount = Number(countRow?.c || 0);

    const joined = db
      .prepare(
        `SELECT j.*, v.consensus_score as v_consensus_score, v.verdict as v_verdict,
                v.strengths as v_strengths, v.recommendation as v_recommendation,
                v.deliberation_id as v_delib_id
         FROM jury_verdicts v
         INNER JOIN jobs j ON j.id = v.job_id
         WHERE v.deliberation_id IN (${placeholders})
           AND j.status = 'new'
           AND ${NOT_EXPIRED_LIVENESS_SQL}
           AND COALESCE(j.seniority_blocked, 0) = 0
           AND COALESCE(j.cv_score, 0) >= 35
         ORDER BY CASE WHEN v.deliberation_id = ? THEN 0 ELSE 1 END ASC,
                  j.is_daily_pick DESC,
                  COALESCE(j.location_priority_tier, 4) ASC,
                  j.jury_score DESC,
                  v.consensus_score DESC,
                  v.id DESC`
      )
      .all(...delibIds, primaryDelibId) as unknown as Array<
      JobItem & {
        v_consensus_score: number;
        v_verdict: string;
        v_strengths: string | null;
        v_recommendation: string | null;
        v_delib_id: string;
      }
    >;

    const seenJobs = new Set<string>();
    for (const row of joined) {
      if (seenJobs.has(row.id)) continue;
      const keys = jobDedupeKeys(row);
      if (seenKeys.has(keys.titleCompanyKey)) continue;
      if (keys.urlKey && seenUrls.has(keys.urlKey)) continue;
      seenJobs.add(row.id);
      seenKeys.add(keys.titleCompanyKey);
      if (keys.urlKey) seenUrls.add(keys.urlKey);

      const { v_consensus_score, v_verdict, v_strengths, v_recommendation, v_delib_id: _d, ...jobFields } = row;
      digestRows.push({
        job: jobFields as JobItem,
        consensus_score: Number(jobFields.jury_score || v_consensus_score || jobFields.score || 0),
        verdict: String(v_verdict || jobFields.jury_verdict || 'APPROVED'),
        strengths: v_strengths || null,
        recommendation: v_recommendation || null,
      });
      if (digestRows.length >= 3) break;
    }
  }

  if (digestRows.length < 3) {
    const excludeIds = new Set(digestRows.map((d) => d.job.id));
    const fallbackJobs = db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'new'
           AND ${NOT_EXPIRED_LIVENESS_SQL}
           AND COALESCE(seniority_blocked, 0) = 0
           AND COALESCE(cv_score, 0) >= 35
         ORDER BY is_daily_pick DESC, COALESCE(location_priority_tier, 4) ASC, jury_score DESC, score DESC
         LIMIT 25`
      )
      .all() as unknown as JobItem[];

    for (const fj of fallbackJobs) {
      if (excludeIds.has(fj.id)) continue;
      const keys = jobDedupeKeys(fj);
      if (seenKeys.has(keys.titleCompanyKey)) continue;
      if (keys.urlKey && seenUrls.has(keys.urlKey)) continue;
      excludeIds.add(fj.id);
      seenKeys.add(keys.titleCompanyKey);
      if (keys.urlKey) seenUrls.add(keys.urlKey);
      digestRows.push({
        job: fj,
        consensus_score: Number(fj.jury_score || fj.score || 0),
        verdict: fj.jury_verdict || 'HIGH AFFINITY',
        strengths: null,
        recommendation: null,
      });
      if (digestRows.length >= 3) break;
    }
  }

  const argStmt = db.prepare(
    `SELECT agent_name, agent_role, statement
     FROM agent_arguments
     WHERE job_id = ?
     ORDER BY score DESC, id DESC
     LIMIT 1`
  );

  const digestProfile = getProfileRow();
  const items = digestRows
    .map((entry) => {
      const enriched = enrichJob(entry.job, digestProfile);
      const arg = argStmt.get(enriched.id) as
        | { agent_name?: string; agent_role?: string; statement?: string }
        | undefined;

      return {
        job: enriched,
        consensusScore: entry.consensus_score,
        verdict: entry.verdict,
        strengths: entry.strengths,
        recommendation: entry.recommendation,
        advocateName: arg?.agent_name || enriched.advocate_agent || 'Supreme Jury',
        advocateRole: arg?.agent_role || 'Multi-Agent Consensus',
        advocateStatement:
          arg?.statement ||
          entry.strengths ||
          'High profile & skill alignment verified across active postings.',
      };
    })
    .sort((a, b) => {
      const pickDiff = (b.job.is_daily_pick ? 1 : 0) - (a.job.is_daily_pick ? 1 : 0);
      if (pickDiff !== 0) return pickDiff;
      const tierA = (a.job.location_priority_tier ?? 4) <= 2 ? (a.job.location_priority_tier ?? 4) : 3;
      const tierB = (b.job.location_priority_tier ?? 4) <= 2 ? (b.job.location_priority_tier ?? 4) : 3;
      if (tierA !== tierB) return tierA - tierB;
      return b.consensusScore - a.consensusScore;
    });

  return {
    cycleDate: primaryDelib?.session_date || new Date().toISOString().slice(0, 10),
    cycleTimestamp: primaryDelib?.created_at || new Date().toISOString(),
    withinLast24Hours: within24h.length > 0,
    reviewedCount: reviewedCount || getStats().activeCount,
    cycleSummary:
      primaryDelib?.summary ||
      'Agents evaluated active postings for technical alignment, reachability, and visa evidence.',
    items,
  };
}

function enrichJob(job: JobItem, profileArg?: CandidateProfile): JobItem {
  const { boost, reasons } = computeLearnedBoost(db, job);
  const appRow = db.prepare('SELECT id FROM applications WHERE job_id=? LIMIT 1').get(job.id);
  const locPriority = evaluateLocationPriority(profileArg || getProfileRow(), job);
  return {
    ...job,
    location_priority_tier: locPriority.tier,
    location_priority_label: locPriority.label,
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

const SALARY_SLIDER_MAX = 250000;

app.get('/api/dashboard', (req: Request, res: Response) => {
  const status = String(req.query.status || 'all');
  const q = String(req.query.q || '').trim();
  const source = String(req.query.source || 'all');
  const liveness = String(req.query.liveness || 'all');
  const fitFilter = String(req.query.fitFilter || 'matched');
  const minSalary = Math.max(0, Number(req.query.minSalary || 0) || 0);
  const rawMax = Number(req.query.maxSalary);
  const maxSalary = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(SALARY_SLIDER_MAX, rawMax) : SALARY_SLIDER_MAX;
  const includeUndisclosed = String(req.query.includeUndisclosed || 'false') === 'true';
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  const whereParts: string[] = [];
  const params: Array<string | number> = [];

  if (status === 'all') {
    whereParts.push(`status != 'dismissed' AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL})`);
  } else if (status === 'expired') {
    whereParts.push(`status NOT IN ('dismissed', 'applied') AND ${EXPIRED_LIVENESS_SQL}`);
  } else if (status === 'new' || status === 'shortlisted') {
    whereParts.push(`status = ? AND ${NOT_EXPIRED_LIVENESS_SQL}`);
    params.push(status);
  } else if (status === 'applied' || status === 'dismissed') {
    whereParts.push('status = ?');
    params.push(status);
  }

  if (fitFilter === 'matched' && (status === 'all' || status === 'new')) {
    whereParts.push("COALESCE(seniority_blocked, 0) = 0 AND COALESCE(cv_score, 0) >= 35");
  }

  if (source !== 'all') {
    whereParts.push('source = ?');
    params.push(source);
  }

  if (status !== 'expired') {
    if (liveness === 'live') {
      whereParts.push("liveness_status = 'live'");
    } else if (liveness === 'unverified') {
      whereParts.push("liveness_status != 'live'");
    }
  }

  if (q) {
    whereParts.push('(title LIKE ? OR company LIKE ? OR location LIKE ? OR description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const salaryActive = minSalary > 0 || maxSalary < SALARY_SLIDER_MAX;
  if (salaryActive) {
    const overlapParts: string[] = [];
    if (minSalary > 0) {
      overlapParts.push('salary_max >= ?');
      params.push(minSalary);
    }
    if (maxSalary < SALARY_SLIDER_MAX) {
      overlapParts.push('salary_min <= ?');
      params.push(maxSalary);
    }
    const overlapExpr = `(${overlapParts.join(' AND ')})`;
    if (includeUndisclosed) {
      whereParts.push(`((salary_min IS NULL AND salary_max IS NULL) OR (salary_min IS NOT NULL AND ${overlapExpr}))`);
    } else {
      whereParts.push(`(salary_min IS NOT NULL AND ${overlapExpr})`);
    }
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as c FROM jobs ${whereClause}`)
    .get(...params) as { c: number };
  const totalMatching = Number(totalRow.c);

  const jobsRows = db
    .prepare(
      `SELECT * FROM jobs ${whereClause}
       ORDER BY is_daily_pick DESC,
                CASE WHEN COALESCE(location_priority_tier, 4) <= 2 THEN COALESCE(location_priority_tier, 4) ELSE 3 END ASC,
                jury_score DESC,
                cv_score DESC,
                score DESC,
                created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as JobItem[];

  const dailyPickRows = db
    .prepare(
      `SELECT * FROM jobs WHERE is_daily_pick = 1 AND status = 'new' AND ${NOT_EXPIRED_LIVENESS_SQL}
       ORDER BY CASE WHEN COALESCE(location_priority_tier, 4) <= 2 THEN COALESCE(location_priority_tier, 4) ELSE 3 END ASC,
                jury_score DESC,
                cv_score DESC,
                score DESC
       LIMIT 15`
    )
    .all() as unknown as JobItem[];

  const latestDeliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  const salaryAgg = db
    .prepare(
      `SELECT COUNT(*) as disclosedCount,
              COALESCE(MIN(salary_min), 0) as minAvailable,
              COALESCE(MAX(salary_max), 250000) as maxAvailable
       FROM jobs
       WHERE status != 'dismissed' AND (status = 'applied' OR ${NOT_EXPIRED_LIVENESS_SQL}) AND salary_min IS NOT NULL`
    )
    .get() as { disclosedCount: number; minAvailable: number; maxAvailable: number };

  const handledForPicks = db
    .prepare("SELECT id, title, company, url, status FROM jobs WHERE status IN ('dismissed', 'shortlisted', 'applied')")
    .all() as unknown as JobItem[];
  const { handledTitleCompanyKeys: pickHandledKeys, handledUrlKeys: pickHandledUrls } =
    collectHandledJobSignatures(handledForPicks);
  const seenDailyKeys = new Set<string>(pickHandledKeys);
  const seenDailyUrls = new Set<string>(pickHandledUrls);

  const profile = getProfileRow();
  const enrichedDailyPicks = dailyPickRows
    .filter((job) => {
      const keys = jobDedupeKeys(job);
      if (seenDailyKeys.has(keys.titleCompanyKey)) return false;
      if (keys.urlKey && seenDailyUrls.has(keys.urlKey)) return false;
      seenDailyKeys.add(keys.titleCompanyKey);
      if (keys.urlKey) seenDailyUrls.add(keys.urlKey);
      return true;
    })
    .slice(0, 5)
    .map((job) => enrichJob(job, profile))
    .sort((a, b) => {
      const tierA = (a.location_priority_tier ?? 4) <= 2 ? (a.location_priority_tier ?? 4) : 3;
      const tierB = (b.location_priority_tier ?? 4) <= 2 ? (b.location_priority_tier ?? 4) : 3;
      if (tierA !== tierB) return tierA - tierB;
      return (b.jury_score || 0) - (a.jury_score || 0);
    });

  res.json({
    stats: getStats(),
    salaryStats: {
      disclosedCount: Number(salaryAgg.disclosedCount || 0),
      minAvailable: Number(salaryAgg.minAvailable || 0),
      maxAvailable: Number(salaryAgg.maxAvailable || 250000),
    },
    dailyPicks: enrichedDailyPicks,
    dailyDigest: getDailyDigest(),
    jobs: jobsRows.map((job) => enrichJob(job, profile)),
    pagination: {
      page,
      limit,
      totalMatching,
      totalPages: Math.max(1, Math.ceil(totalMatching / limit)),
    },
    profile,
    latestDeliberation,
    jurySnapshot: getJuryDecisionSnapshot(),
    juryHistory: getJuryDecisionHistory(),
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

const ALLOWED_CLICK_EVENTS = new Set([
  'click',
  'inspect',
  'open_link',
  'view_debate',
  'view_drafts',
]);

app.post('/api/jobs/:id/click', (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const rawType = typeof req.body?.eventType === 'string' ? req.body.eventType : 'click';
  const eventType = ALLOWED_CLICK_EVENTS.has(rawType) ? rawType : 'click';
  const jobRow = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
  if (!jobRow) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  recordInteraction(db, 'workspace_session', jobId, eventType, jobRow);
  const cal = recalibrateScoresFromWeights(db, getProfileRow());
  const updatedJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem;
  const weights = db.prepare('SELECT * FROM learned_weights ORDER BY ABS(score_delta) DESC LIMIT 60').all() as unknown as LearnedWeight[];

  res.json({
    ok: true,
    recalibrated: cal.updatedCount,
    job: enrichJob(updatedJob),
    weights,
    stats: getStats(),
    jurySnapshot: getJuryDecisionSnapshot(),
  });
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
  let updatedJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem;

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

  recalibrateScoresFromWeights(db, getProfileRow());
  updatedJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem;
  const weights = db.prepare('SELECT * FROM learned_weights ORDER BY ABS(score_delta) DESC LIMIT 60').all() as unknown as LearnedWeight[];

  const message =
    status === 'shortlisted'
      ? 'Job shortlisted, tailored drafts prepared & Jury trained.'
      : status === 'dismissed' && reason && REJECTION_REASON_LABELS[reason]
        ? `Disliked & hidden; Jury trained on reason: ${REJECTION_REASON_LABELS[reason]}.`
        : status === 'dismissed'
          ? 'Job disliked & hidden; Jury re-trained and next top pick promoted.'
          : `Job marked as ${status} & Jury updated.`;

  res.json({
    ok: true,
    message,
    job: enrichJob(updatedJob),
    weights,
    stats: getStats(),
    jurySnapshot: getJuryDecisionSnapshot(),
  });
});

app.get('/api/jury', (_req: Request, res: Response) => {
  const deliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  const activeJobs = db
    .prepare(
      `SELECT * FROM jobs WHERE status = 'new'
       ORDER BY is_daily_pick DESC, jury_score DESC, score DESC
       LIMIT 24`
    )
    .all() as unknown as JobItem[];

  const dismissedJobs = db
    .prepare(
      `SELECT * FROM jobs WHERE status = 'dismissed'
       ORDER BY created_at DESC LIMIT 6`
    )
    .all() as unknown as JobItem[];

  const languageRejectedJobs = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status != 'dismissed'
         AND jury_verdict LIKE 'REJECTED — LANGUAGE%'
       ORDER BY cv_score DESC, created_at DESC
       LIMIT 6`
    )
    .all() as unknown as JobItem[];

  const otherRejectedJobs = db
    .prepare(
      `SELECT * FROM jobs
       WHERE status != 'dismissed'
         AND (jury_verdict LIKE 'REJECTED%' OR jury_verdict LIKE 'CONSTRAINED%' OR jury_verdict LIKE 'DEFERRED%')
         AND COALESCE(jury_verdict, '') NOT LIKE 'REJECTED — LANGUAGE%'
       ORDER BY jury_score DESC, created_at DESC
       LIMIT 8`
    )
    .all() as unknown as JobItem[];

  const rejectedJobs = [...dismissedJobs, ...languageRejectedJobs, ...otherRejectedJobs];

  const seenIds = new Set<string>();
  const combinedJobs: JobItem[] = [];
  for (const j of [...activeJobs, ...rejectedJobs]) {
    if (!seenIds.has(j.id)) {
      seenIds.add(j.id);
      combinedJobs.push(j);
    }
  }

  const items = combinedJobs.map((job) => {
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

let lastSourceSyncMs = 0;

app.post('/api/sources/sync', async (_req: Request, res: Response) => {
  try {
    const syncResult = await syncAllJobSources(db);
    lastSourceSyncMs = Date.now();
    const delib = runJuryDeliberation(db, getProfileRow());
    res.json({
      ok: true,
      sync: syncResult,
      deliberation: delib,
      sources: getStats().sources,
      message: `Synced ${syncResult.upsertedTotal} live roles across ${Object.keys(syncResult.bySource).length} job boards and re-convened Supreme Jury.`,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to sync job boards.',
    });
  }
});

app.post('/api/jury/convene', (_req: Request, res: Response) => {
  const profile = getProfileRow();
  const result = runJuryDeliberation(db, profile);
  if (Date.now() - lastSourceSyncMs > 2 * 60 * 60 * 1000) {
    lastSourceSyncMs = Date.now();
    syncAllJobSources(db)
      .then(() => runJuryDeliberation(db, getProfileRow()))
      .catch(() => {});
  }
  res.json({
    ok: true,
    ...result,
    jurySnapshot: getJuryDecisionSnapshot(),
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

  const hasPdfGarbage = (txt: string | null | undefined) =>
    !txt ||
    /\/(?:FlateDecode|Type\s+\/Page|FontDescriptor)|endobj|endstream|\uFFFD/.test(txt);

  if (!application || !application.tailored_cv || !application.cover_letter || hasPdfGarbage(application.tailored_cv)) {
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
  const cv_text = sanitizeCvText(String(req.body?.cv_text ?? current.cv_text));

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
    jurySnapshot: getJuryDecisionSnapshot(),
    message: `Profile saved and Supreme Jury re-convened (${delib.crownedCount} daily picks updated).`,
  });
});

app.post('/api/profile/suggest-skills', async (req: Request, res: Response) => {
  const current = getProfileRow();
  const rawCvText = typeof req.body?.cvText === 'string' ? req.body.cvText : current.cv_text;
  const existingSkills =
    typeof req.body?.existingSkills === 'string' ? req.body.existingSkills : current.skills;
  const excludedSkills =
    typeof req.body?.excludedSkills === 'string'
      ? req.body.excludedSkills
      : current.excluded_skills;
  const targetRoles =
    typeof req.body?.targetRoles === 'string' ? req.body.targetRoles : current.target_roles;

  const cvText = sanitizeCvText(rawCvText || '');

  try {
    const suggestions = await suggestTopSkillsFromCv({
      cvText,
      existingSkills: existingSkills || '',
      excludedSkills: excludedSkills || '',
      targetRoles: targetRoles || '',
    });
    res.json({
      ok: true,
      suggestions,
    });
  } catch (err) {
    const statusProp = (err as { status?: number })?.status;
    const httpStatus =
      typeof statusProp === 'number' && statusProp >= 400 && statusProp < 600 ? statusProp : 502;
    res.status(httpStatus).json({
      error: err instanceof Error ? err.message : 'Unable to identify CV skills with Gemini.',
    });
  }
});

function decodePdfStreamText(source: string): string[] {
  const chunks: string[] = [];
  const literalRx = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")/g;
  let m: RegExpExecArray | null;
  while ((m = literalRx.exec(source)) !== null) {
    const cleaned = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(/\\([()\\])/g, '$1')
      .replace(/\\\d{3}/g, ' ')
      .trim();
    if (cleaned) chunks.push(cleaned);
  }

  // Also check TJ arrays like [(Hello ) -10 (World)] TJ
  const arrayRx = /\[([^\]]+)\]\s*TJ/g;
  while ((m = arrayRx.exec(source)) !== null) {
    const innerMatches = m[1].match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
    if (innerMatches) {
      const joined = innerMatches
        .map((part) =>
          part
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\n')
            .replace(/\\t/g, ' ')
            .replace(/\\([()\\])/g, '$1')
        )
        .join('')
        .trim();
      if (joined) chunks.push(joined);
    }
  }
  return chunks;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = sanitizeCvText(typeof text === 'string' ? text : '');
    if (cleaned.length >= 20) {
      return cleaned;
    }
  } catch {
    // Fallback to FlateDecode plain ASCII stream scan below
  }

  const raw = buffer.toString('latin1');
  const pieces: string[] = [];
  const streamRx = /stream\r?\n([\s\S]*?)\r?\n?endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRx.exec(raw)) !== null) {
    const streamBytes = Buffer.from(match[1], 'latin1');
    let decoded = match[1];
    try {
      decoded = zlib.inflateSync(streamBytes).toString('latin1');
    } catch {
      try {
        decoded = zlib.inflateRawSync(streamBytes).toString('latin1');
      } catch {
        // Keep raw uncompressed stream if not zlib-deflated
      }
    }
    pieces.push(...decodePdfStreamText(decoded));
  }

  return sanitizeCvText(pieces.join('\n'));
}

app.post('/api/profile/upload-cv', upload.single('cv_file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No CV file provided' });
    return;
  }

  const filename = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ext = path.extname(filename).toLowerCase();
  const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId.trim() : '';
  let extractedText = '';

  try {
    if (ext === '.txt' || ext === '.md' || ext === '.csv') {
      extractedText = sanitizeCvText(file.buffer.toString('utf8'));
    } else if (ext === '.docx') {
      const zip = await JSZip.loadAsync(file.buffer);
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const xmlText = docXml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<\/w:tr>/g, '\n')
          .replace(/<w:tab\/>/g, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        extractedText = sanitizeCvText(xmlText);
      }
    } else if (ext === '.pdf') {
      extractedText = await extractPdfText(file.buffer);
    } else {
      extractedText = sanitizeCvText(file.buffer.toString('utf8'));
    }
  } catch {
    extractedText = '';
  }

  const current = getProfileRow();
  const cvTextToUse = extractedText || sanitizeCvText(current.cv_text);
  const cvAnalysis = analyzeCv(cvTextToUse);
  const parsedCv = parseCvSections(cvTextToUse);
  const nowIso = new Date().toISOString();

  // Merge newly extracted CV skills with current skills if detected
  let updatedSkills = current.skills;
  if (cvAnalysis.skills.length > 0) {
    const existingSkills = current.skills.split(',').map((s) => s.trim()).filter(Boolean);
    const merged = Array.from(
      new Map([...cvAnalysis.skills, ...existingSkills].map((s) => [s.toLowerCase(), s])).values()
    );
    updatedSkills = merged.join(', ');
  }

  let updatedRoles = current.target_roles;
  if (cvAnalysis.roles.length > 0) {
    const existingRoles = current.target_roles.split(',').map((r) => r.trim()).filter(Boolean);
    const mergedRoles = Array.from(
      new Map([...cvAnalysis.roles, ...existingRoles].map((r) => [r.toLowerCase(), r])).values()
    );
    updatedRoles = mergedRoles.join(', ');
  }

  const updatedName = parsedCv.detectedName || current.name;
  const updatedDegree = parsedCv.detectedDegree || current.degree;
  const updatedResidence = parsedCv.detectedLocation || current.residence;

  db.prepare(
    `UPDATE profile
     SET name=?, residence=?, degree=?, skills=?, target_roles=?,
         cv_filename=?, cv_uploaded_at=?, cv_text=?, cv_analysis=?, updated_at=?
     WHERE id=1`
  ).run(
    updatedName,
    updatedResidence,
    updatedDegree,
    updatedSkills,
    updatedRoles,
    filename,
    nowIso,
    cvTextToUse,
    JSON.stringify(cvAnalysis),
    nowIso
  );

  const updated = getProfileRow();
  let application: ApplicationDraft | null = null;
  if (jobId) {
    const targetJob = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as unknown as JobItem | undefined;
    if (targetJob) {
      application = storeApplicationMaterials(targetJob, updated);
    }
  }

  res.json({
    ok: true,
    profile: updated,
    application,
    extractedLength: extractedText.length,
    detectedSkills: cvAnalysis.skills,
    message: extractedText
      ? `Uploaded '${filename}': extracted ${cvAnalysis.skills.length} skills/keywords (${extractedText.length} clean chars) into your profile${application ? ' and rebuilt this resume' : ''}.`
      : `Uploaded '${filename}'. If image-only/scanned PDF, paste plain text in Profile CV editor to extract skills.`,
  });
});

app.post('/api/workspace/hydrate', (req: Request, res: Response) => {
  const cloudProfile = req.body?.profile as Partial<CandidateProfile> | undefined;
  const cloudActions = Array.isArray(req.body?.jobActions)
    ? (req.body.jobActions as Array<{ jobId: string; status: string }>)
    : [];
  const cloudApps = Array.isArray(req.body?.applications)
    ? (req.body.applications as Array<{ jobId: string; tailored_cv: string; cover_letter: string }>)
    : [];
    const cloudWeights = Array.isArray(req.body?.learnedWeights)
    ? (req.body.learnedWeights as Array<{
        feature_type: string;
        feature_value: string;
        score_delta: number;
        positive_hits: number;
        negative_hits: number;
      }>)
    : [];
  const cloudEmailPref = req.body?.emailPreference as Partial<UserEmailPreference> | null | undefined;

  const nowIso = new Date().toISOString();

  db.exec('BEGIN');
  try {
    if (cloudProfile) {
      const current = getProfileRow();
      const cleanedCv = cloudProfile.cv_text ? sanitizeCvText(cloudProfile.cv_text) : current.cv_text;
      const cvAnalysis = cleanedCv ? analyzeCv(cleanedCv) : current.cv_analysis;
      db.prepare(
        `UPDATE profile SET
           name=?, citizenship=?, residence=?, degree=?, skills=?, target_roles=?,
           cv_text=?, cv_filename=?, cv_analysis=?, experience_level=?,
           excluded_skills=?, excluded_job_terms=?, updated_at=?
         WHERE id=1`
      ).run(
        cloudProfile.name ?? current.name,
        cloudProfile.citizenship ?? current.citizenship,
        cloudProfile.residence ?? current.residence,
        cloudProfile.degree ?? current.degree,
        cloudProfile.skills ?? current.skills,
        cloudProfile.target_roles ?? current.target_roles,
        cleanedCv,
        cloudProfile.cv_filename ?? current.cv_filename ?? null,
        cvAnalysis ? JSON.stringify(cvAnalysis) : null,
        cloudProfile.experience_level ?? current.experience_level,
        cloudProfile.excluded_skills ?? current.excluded_skills,
        cloudProfile.excluded_job_terms ?? current.excluded_job_terms,
        nowIso
      );
    }

    const updateJobStatus = db.prepare('UPDATE jobs SET status=? WHERE id=?');
    for (const act of cloudActions) {
      if (act?.jobId && ['new', 'shortlisted', 'applied', 'dismissed'].includes(act.status)) {
        updateJobStatus.run(act.status, act.jobId);
      }
    }

    const findApp = db.prepare('SELECT id FROM applications WHERE job_id=? ORDER BY id DESC LIMIT 1');
    const updateApp = db.prepare('UPDATE applications SET tailored_cv=?, cover_letter=? WHERE id=?');
    const insertApp = db.prepare(
      'INSERT INTO applications (job_id, status, tailored_cv, cover_letter, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const appDoc of cloudApps) {
      if (!appDoc?.jobId) continue;
      const existing = findApp.get(appDoc.jobId) as { id: number } | undefined;
      if (existing) {
        updateApp.run(appDoc.tailored_cv || '', appDoc.cover_letter || '', existing.id);
      } else {
        insertApp.run(appDoc.jobId, 'shortlisted', appDoc.tailored_cv || '', appDoc.cover_letter || '', nowIso);
      }
    }

    const upsertWeight = db.prepare(`
      INSERT INTO learned_weights (feature_type, feature_value, score_delta, positive_hits, negative_hits, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(feature_type, feature_value) DO UPDATE SET
        score_delta = excluded.score_delta,
        positive_hits = excluded.positive_hits,
        negative_hits = excluded.negative_hits,
        updated_at = excluded.updated_at
    `);
    for (const w of cloudWeights) {
      if (w?.feature_type && w?.feature_value) {
        upsertWeight.run(
          w.feature_type,
          w.feature_value,
          Number(w.score_delta || 0),
          Number(w.positive_hits || 0),
          Number(w.negative_hits || 0),
          nowIso
        );
      }
    }

    if (cloudEmailPref && typeof cloudEmailPref === 'object') {
      const cleanEmail = sanitizeHeaderValue(cloudEmailPref.recipientEmail || '', 254);
      const validOrEmptyEmail = !cleanEmail || isValidRecipientEmail(cleanEmail) ? cleanEmail : '';
      db.prepare(`
        INSERT INTO email_preferences (
          id, enabled, recipient_email, last_sent_date, last_sent_at,
          last_sent_count, last_subject, last_error, updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, '', ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          recipient_email = CASE WHEN excluded.recipient_email != '' THEN excluded.recipient_email ELSE email_preferences.recipient_email END,
          last_sent_date = CASE WHEN excluded.last_sent_date != '' THEN excluded.last_sent_date ELSE email_preferences.last_sent_date END,
          last_sent_count = CASE WHEN excluded.last_sent_count > 0 THEN excluded.last_sent_count ELSE email_preferences.last_sent_count END,
          last_subject = CASE WHEN excluded.last_subject != '' THEN excluded.last_subject ELSE email_preferences.last_subject END,
          updated_at = excluded.updated_at
      `).run(
        cloudEmailPref.enabled ? 1 : 0,
        validOrEmptyEmail,
        sanitizeHeaderValue(cloudEmailPref.lastSentDate || '', 32),
        '',
        Math.max(0, Math.min(25, Number(cloudEmailPref.lastSentCount || 0))),
        sanitizeHeaderValue(cloudEmailPref.lastSubject || '', 240),
        nowIso
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updatedProfile = getProfileRow();
  const delib = runJuryDeliberation(db, updatedProfile);
  res.json({
    ok: true,
    profile: updatedProfile,
    deliberation: delib,
    stats: getStats(),
    jurySnapshot: getJuryDecisionSnapshot(),
    juryHistory: getJuryDecisionHistory(),
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
      clicks:
        (counts.click || 0) +
        (counts.inspect || 0) +
        (counts.open_link || 0) +
        (counts.view_debate || 0) +
        (counts.view_drafts || 0),
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

function getEmailPreferenceRow(): {
  enabled: number;
  recipient_email: string;
  last_sent_date: string;
  last_sent_at: string;
  last_sent_count: number;
  last_subject: string;
  last_error: string;
  updated_at: string;
} {
  let row = db.prepare('SELECT * FROM email_preferences WHERE id=1').get() as
    | {
        enabled: number;
        recipient_email: string;
        last_sent_date: string;
        last_sent_at: string;
        last_sent_count: number;
        last_subject: string;
        last_error: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO email_preferences (
         id, enabled, recipient_email, last_sent_date, last_sent_at,
         last_sent_count, last_subject, last_error, updated_at
       ) VALUES (1, 0, '', '', '', 0, '', '', ?)`
    ).run(nowIso);
    row = db.prepare('SELECT * FROM email_preferences WHERE id=1').get() as typeof row;
  }
  return row!;
}

function getTopEmailPicks(profile: CandidateProfile): JobItem[] {
  const handledRows = db
    .prepare("SELECT id, title, company, url, status FROM jobs WHERE status IN ('dismissed', 'shortlisted', 'applied')")
    .all() as unknown as JobItem[];
  const { handledTitleCompanyKeys, handledUrlKeys } = collectHandledJobSignatures(handledRows);
  const seenKeys = new Set<string>(handledTitleCompanyKeys);
  const seenUrls = new Set<string>(handledUrlKeys);
  const seenIds = new Set<string>();

  const dailyRows = db
    .prepare(
      `SELECT * FROM jobs
       WHERE is_daily_pick = 1 AND status = 'new' AND ${NOT_EXPIRED_LIVENESS_SQL}
       ORDER BY CASE WHEN COALESCE(location_priority_tier, 4) <= 2 THEN COALESCE(location_priority_tier, 4) ELSE 3 END ASC,
                jury_score DESC, cv_score DESC, score DESC
       LIMIT 15`
    )
    .all() as unknown as JobItem[];

  const combined: JobItem[] = [];
  for (const row of dailyRows) {
    if (seenIds.has(row.id)) continue;
    const keys = jobDedupeKeys(row);
    if (seenKeys.has(keys.titleCompanyKey)) continue;
    if (keys.urlKey && seenUrls.has(keys.urlKey)) continue;
    seenIds.add(row.id);
    seenKeys.add(keys.titleCompanyKey);
    if (keys.urlKey) seenUrls.add(keys.urlKey);
    combined.push(row);
    if (combined.length >= 5) break;
  }

  if (combined.length < 5) {
    const extras = db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'new'
           AND ${NOT_EXPIRED_LIVENESS_SQL}
           AND COALESCE(seniority_blocked, 0) = 0
           AND COALESCE(cv_score, 0) >= 35
         ORDER BY CASE WHEN COALESCE(location_priority_tier, 4) <= 2 THEN COALESCE(location_priority_tier, 4) ELSE 3 END ASC,
                  jury_score DESC, cv_score DESC, score DESC
         LIMIT 30`
      )
      .all() as unknown as JobItem[];

    for (const row of extras) {
      if (seenIds.has(row.id)) continue;
      const keys = jobDedupeKeys(row);
      if (seenKeys.has(keys.titleCompanyKey)) continue;
      if (keys.urlKey && seenUrls.has(keys.urlKey)) continue;
      seenIds.add(row.id);
      seenKeys.add(keys.titleCompanyKey);
      if (keys.urlKey) seenUrls.add(keys.urlKey);
      combined.push(row);
      if (combined.length >= 5) break;
    }
  }

  return combined.map((job) => enrichJob(job, profile));
}

function getEmailStatusPayload(): EmailDigestStatus {
  const row = getEmailPreferenceRow();
  const profile = getProfileRow();
  const topPicks = getTopEmailPicks(profile);
  const todayDate = new Date().toISOString().slice(0, 10);
  const enabled = Boolean(row.enabled);
  const topTitle = topPicks[0]?.title ? ` — Top Pick: ${sanitizeHeaderValue(topPicks[0].title, 60)}` : '';
  const previewSubject = sanitizeHeaderValue(
    `Adeena's Job Agent · Daily Jury Top ${topPicks.length} Picks (${todayDate})${topTitle}`,
    220
  );

  return {
    enabled,
    recipientEmail: row.recipient_email || '',
    lastSentDate: row.last_sent_date || '',
    lastSentAt: row.last_sent_at || '',
    lastSentCount: Number(row.last_sent_count || 0),
    lastSubject: row.last_subject || '',
    lastError: row.last_error || '',
    todayDate,
    dueToday: enabled && Boolean(row.recipient_email) && row.last_sent_date !== todayDate && topPicks.length > 0,
    previewSubject,
    topPicks,
  };
}

app.get('/api/email/status', (_req: Request, res: Response) => {
  res.json(getEmailStatusPayload());
});

app.post('/api/email/preferences', (req: Request, res: Response) => {
  const enabled = Boolean(req.body?.enabled);
  const rawEmail = typeof req.body?.recipientEmail === 'string' ? req.body.recipientEmail.trim() : '';

  if (rawEmail && !isValidRecipientEmail(rawEmail)) {
    res.status(400).json({ error: 'Please provide a valid recipient email address.' });
    return;
  }
  if (enabled && !isValidRecipientEmail(rawEmail)) {
    res.status(400).json({ error: 'A valid recipient email address is required to enable daily email alerts.' });
    return;
  }

  const nowIso = new Date().toISOString();
  getEmailPreferenceRow();
  db.prepare(
    `UPDATE email_preferences
     SET enabled=?, recipient_email=?, last_error='', updated_at=?
     WHERE id=1`
  ).run(enabled ? 1 : 0, sanitizeHeaderValue(rawEmail, 254), nowIso);

  const status = getEmailStatusPayload();
  res.json({
    ok: true,
    status,
    message: enabled
      ? `Daily Jury email digest enabled for ${rawEmail}.`
      : 'Daily Jury email digest paused.',
  });
});

app.post('/api/email/send-daily-picks', async (req: Request, res: Response) => {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const accessToken = bearerMatch?.[1]?.trim() || '';

  if (!accessToken || /[\r\n\s]/.test(accessToken)) {
    res.status(401).json({
      error: 'Google Gmail sign-in is required to send your daily Jury picks email.',
      needsReauth: true,
    });
    return;
  }

  const prefRow = getEmailPreferenceRow();
  const requestedEmail =
    typeof req.body?.recipientEmail === 'string' && req.body.recipientEmail.trim()
      ? req.body.recipientEmail.trim()
      : prefRow.recipient_email;

  if (!isValidRecipientEmail(requestedEmail)) {
    res.status(400).json({
      error: 'Please enter a valid recipient email address before sending.',
    });
    return;
  }

  const profile = getProfileRow();
  const topPicks = getTopEmailPicks(profile);
  if (topPicks.length === 0) {
    res.status(400).json({
      error: 'No eligible Jury job picks are currently available to email. Try convening the Jury first.',
    });
    return;
  }

  const latestDeliberation = (db
    .prepare('SELECT * FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() || null) as unknown as DeliberationSession | null;

  const todayDate = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const appOrigin =
    typeof req.headers.origin === 'string' && /^https?:\/\//i.test(req.headers.origin)
      ? req.headers.origin
      : undefined;

  try {
    const built = buildDailyJuryDigestEmail({
      recipientEmail: requestedEmail,
      dateLabel: todayDate,
      profile,
      picks: topPicks,
      deliberation: latestDeliberation,
      appUrl: appOrigin,
    });

    const gmailResult = await sendGmailRawMessage({
      accessToken,
      rawBase64Url: built.rawBase64Url,
    });

    db.prepare(
      `UPDATE email_preferences
       SET recipient_email=?, last_sent_date=?, last_sent_at=?, last_sent_count=?, last_subject=?, last_error='', updated_at=?
       WHERE id=1`
    ).run(
      sanitizeHeaderValue(requestedEmail, 254),
      todayDate,
      nowIso,
      built.sentCount,
      built.subject,
      nowIso
    );

    const status = getEmailStatusPayload();
    res.json({
      ok: true,
      messageId: gmailResult.id,
      recipientEmail: requestedEmail,
      subject: built.subject,
      sentCount: built.sentCount,
      sentAt: nowIso,
      status,
      message: `Sent Top ${built.sentCount} Jury Job Picks email to ${requestedEmail}.`,
    });
  } catch (err) {
    const errObj = err as { status?: number; needsReauth?: boolean; message?: string };
    const httpStatus = errObj?.status === 401 || errObj?.status === 403 ? errObj.status : 502;
    const message = sanitizeHeaderValue(
      errObj?.message || 'Unable to send email through Gmail.',
      240
    );

    db.prepare('UPDATE email_preferences SET last_error=?, updated_at=? WHERE id=1').run(message, nowIso);
    res.status(httpStatus).json({
      error: errObj?.needsReauth
        ? 'Your Gmail session needs fresh permission. Click "Sign in with Google" to reconnect Gmail and retry.'
        : message,
      needsReauth: Boolean(errObj?.needsReauth),
    });
  }
});

function ensureDaily24hDeliberation() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const latest = db
    .prepare('SELECT created_at FROM deliberations ORDER BY created_at DESC LIMIT 1')
    .get() as { created_at?: string } | undefined;
  const lastMs = latest?.created_at ? Date.parse(latest.created_at) : 0;
  if (!lastMs || Number.isNaN(lastMs) || Date.now() - lastMs >= TWENTY_FOUR_HOURS_MS) {
    lastSourceSyncMs = Date.now();
    syncAllJobSources(db)
      .catch(() => {})
      .finally(() => {
        runJuryDeliberation(db, getProfileRow());
      });
  }
}

async function startServer() {
  recalibrateScoresFromWeights(db, getProfileRow());
  const verdictsCount = Number((db.prepare('SELECT COUNT(*) as c FROM jury_verdicts').get() as { c: number }).c);
  if (verdictsCount === 0) {
    runJuryDeliberation(db, getProfileRow());
  }
  ensureDaily24hDeliberation();
  // Kick off initial background source sync if only a few boards are present
  const sourceCount = Number((db.prepare('SELECT COUNT(DISTINCT source) as c FROM jobs').get() as { c: number }).c);
  if (sourceCount < 6) {
    lastSourceSyncMs = Date.now();
    syncAllJobSources(db)
      .then(() => runJuryDeliberation(db, getProfileRow()))
      .catch(() => {});
  }
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

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    httpServer.close(() => {
      try {
        db.close();
      } catch {}
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

startServer();
