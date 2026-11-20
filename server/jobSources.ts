import type { DatabaseSync } from 'node:sqlite';

interface NormalizedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  visa_evidence: string;
  housing_evidence: string;
  liveness_status: string;
  liveness_checked_at: string;
  authenticity_status: string;
  authenticity_evidence: string;
  posted_date: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

export interface SalaryInfo {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

function normalizeCurrencyCode(raw?: unknown): string | null {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  if (s === '$' || s === 'USD' || s === 'US$') return 'USD';
  if (s === '€' || s === 'EUR') return 'EUR';
  if (s === '£' || s === 'GBP') return 'GBP';
  if (s === 'CAD' || s === 'C$') return 'CAD';
  if (s === 'AUD' || s === 'A$') return 'AUD';
  if (/^[A-Z]{3}$/.test(s)) return s;
  return null;
}

function parseSalaryToken(rawToken?: string): number | null {
  if (!rawToken) return null;
  const cleaned = rawToken.trim().toLowerCase();
  const hasK = cleaned.endsWith('k');
  const numStr = cleaned.replace(/k$/i, '').replace(/,/g, '');
  // Handle European thousand separator like 70.000
  const normalized = /^\d{2,3}\.\d{3}$/.test(numStr) ? numStr.replace('.', '') : numStr;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  const scaled = hasK ? num * 1000 : num;
  if (scaled < 15000 || scaled > 500000) return null;
  return Math.round(scaled);
}

export function extractSalaryInfo(
  text: string,
  hints?: { min?: unknown; max?: unknown; currency?: unknown; salaryText?: unknown }
): SalaryInfo {
  const hintCurr = normalizeCurrencyCode(hints?.currency);
  const rawMin = Number(hints?.min);
  const rawMax = Number(hints?.max);

  if (Number.isFinite(rawMin) && rawMin >= 15000 && rawMin <= 500000) {
    const min = Math.round(rawMin);
    const max =
      Number.isFinite(rawMax) && rawMax >= min && rawMax <= 500000
        ? Math.round(rawMax)
        : min;
    return {
      salary_min: min,
      salary_max: max,
      salary_currency: hintCurr || 'USD',
    };
  }

  if (Number.isFinite(rawMax) && rawMax >= 15000 && rawMax <= 500000) {
    const max = Math.round(rawMax);
    return {
      salary_min: max,
      salary_max: max,
      salary_currency: hintCurr || 'USD',
    };
  }

  const combined = `${hints?.salaryText ? `${String(hints.salaryText)} ` : ''}${text || ''}`;

  const currencyPrefixRx =
    /(USD|EUR|GBP|CAD|AUD|\$|€|£)\s?(\d{2,3}(?:[,.]\d{3})+|\d{2,3}\s?[kK])(?:\s*(?:-|–|—|to)\s*(?:USD|EUR|GBP|CAD|AUD|\$|€|£)?\s*(\d{2,3}(?:[,.]\d{3})+|\d{2,3}\s?[kK]))?(?!\s?(?:M|B|million|billion|mn|bn)\b)/i;
  const m1 = combined.match(currencyPrefixRx);
  if (m1) {
    const curr = normalizeCurrencyCode(m1[1]) || hintCurr || 'USD';
    const v1 = parseSalaryToken(m1[2]);
    const v2 = parseSalaryToken(m1[3]);
    if (v1 !== null) {
      const min = v2 !== null ? Math.min(v1, v2) : v1;
      const max = v2 !== null ? Math.max(v1, v2) : v1;
      return { salary_min: min, salary_max: max, salary_currency: curr };
    }
  }

  const suffixRx =
    /(?:salary|compensation|pay|base|ote|gross|brutto)[^.\n]{0,35}?(\d{2,3}\s?[kK])\s*(?:-|–|—|to)\s*(\d{2,3}\s?[kK])\s*(USD|EUR|GBP|CAD|AUD|\$|€|£)?/i;
  const m2 = combined.match(suffixRx);
  if (m2) {
    const v1 = parseSalaryToken(m2[1]);
    const v2 = parseSalaryToken(m2[2]);
    const curr = normalizeCurrencyCode(m2[3]) || hintCurr || 'USD';
    if (v1 !== null) {
      const min = v2 !== null ? Math.min(v1, v2) : v1;
      const max = v2 !== null ? Math.max(v1, v2) : v1;
      return { salary_min: min, salary_max: max, salary_currency: curr };
    }
  }

  return { salary_min: null, salary_max: null, salary_currency: null };
}

const FETCH_TIMEOUT_MS = 5000;

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function detectVisaEvidence(text: string): string {
  const lower = (text || '').toLowerCase();
  if (/visa sponsorship|sponsor visa|work permit sponsorship|relocation assistance|relocation support|relocation package/i.test(lower)) {
    return 'Visa / relocation support mentioned in posting';
  }
  if (/visa|relocation|work authorization|iqama|transferable/i.test(lower)) {
    return 'Work authorization or relocation terms mentioned';
  }
  return 'Not explicitly verified';
}

function detectHousingEvidence(text: string): string {
  const lower = (text || '').toLowerCase();
  if (/housing allowance|housing provided|accommodation provided|staff accommodation|company accommodation|furnished apartment|temporary housing|relocation stipend|relocation package|relocation assistance|relocation allowance|relocation support/i.test(lower)) {
    return 'Accommodation / relocation package mentioned';
  }
  if (/accommodation|housing/i.test(lower)) {
    return 'Accommodation terms mentioned';
  }
  return 'Standard compensation only';
}

function formatPostedDate(raw?: string | number): string {
  if (!raw) return 'Recently posted';
  const d = typeof raw === 'number'
    ? new Date(raw > 1e12 ? raw : raw * 1000)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Recently posted';
  return d.toISOString().slice(0, 10);
}

function isRelevantTechOrGradRole(title: string): boolean {
  return /software|engineer|developer|qa|quality|test|embedded|firmware|hardware|robot|product|frontend|front-end|mobile|flutter|react|typescript|python|java|c\+\+|security|cloud|devops|data|ai|ml|graduate|junior|associate|intern|support|design|ui|ux/i.test(
    title
  );
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AdeenaJobAgent/1.0 (+careers-aggregator)',
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; AdeenaJobAgent/1.0)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchGoogleCareers(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const urls = [
    'https://www.google.com/about/careers/applications/jobs/results/?q=Software+Engineer&target_level=EARLY',
    'https://www.google.com/about/careers/applications/jobs/results/?q=QA+OR+Embedded+Engineer&target_level=EARLY',
  ];

  const out: NormalizedJob[] = [];
  const seen = new Set<string>();

  for (const pageUrl of urls) {
    try {
      const html = await fetchText(pageUrl);
      const match = html.match(/AF_initDataCallback\(\{key:\s*'ds:1'[\s\S]*?data:([\s\S]*?),\s*sideChannel:/);
      if (!match || !match[1]) continue;
      const parsed = JSON.parse(match[1]) as unknown[];
      const rows = Array.isArray(parsed?.[0]) ? (parsed[0] as unknown[][]) : [];

      for (const item of rows.slice(0, 15)) {
        const rawId = String(item?.[0] || '').trim();
        const title = String(item?.[1] || '').trim();
        const link = String(item?.[2] || '').trim();
        if (!rawId || !title || !link || seen.has(rawId)) continue;
        seen.add(rawId);

        const company = String(item?.[7] || 'Google').trim();
        const locList = Array.isArray(item?.[9])
          ? (item[9] as unknown[])
              .map((l) => (Array.isArray(l) ? String(l[0] || '') : ''))
              .filter(Boolean)
          : [];
        const location = locList.slice(0, 3).join(' / ') || 'Global / Multiple Locations';
        const respHtml = Array.isArray(item?.[3]) ? String(item[3][1] || '') : '';
        const qualHtml = Array.isArray(item?.[4]) ? String(item[4][1] || '') : '';
        const descHtml = Array.isArray(item?.[10]) ? String(item[10][1] || '') : '';
        const description = stripHtml(`${descHtml} ${respHtml} ${qualHtml}`).slice(0, 1800) || `${title} at ${company}`;

        out.push({
          id: `google_${rawId}`,
          title,
          company,
          location,
          url: link,
          source: 'Google Careers',
          description,
          visa_evidence: detectVisaEvidence(description),
          housing_evidence: detectHousingEvidence(description),
          liveness_status: 'live',
          liveness_checked_at: nowIso,
          authenticity_status: 'likely_official',
          authenticity_evidence: 'Direct official Google Careers requisition feed.',
          posted_date: formatPostedDate(nowIso),
          ...extractSalaryInfo(description),
        });
      }
    } catch {
      // Skip if unreachable
    }
  }
  return out;
}

async function fetchHimalayas(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
    'https://himalayas.app/jobs/api?limit=30'
  );
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  return rows
    .filter((j) => j.title && (j.applicationLink || j.guid))
    .slice(0, 25)
    .map((j, idx) => {
      const title = String(j.title).trim();
      const company = String(j.companyName || 'Himalayas Employer').trim();
      const locs = Array.isArray(j.locationRestrictions) && j.locationRestrictions.length
        ? (j.locationRestrictions as string[]).slice(0, 3).join(', ')
        : 'Remote';
      const desc = stripHtml(String(j.description || j.excerpt || title)).slice(0, 1800);
      const guid = String(j.guid || j.applicationLink || idx).replace(/[^a-zA-Z0-9_-]/g, '_').slice(-40);
      return {
        id: `himalayas_${guid}`,
        title,
        company,
        location: locs,
        url: String(j.applicationLink || j.guid),
        source: 'Himalayas',
        description: desc,
        visa_evidence: detectVisaEvidence(`${locs} ${desc}`),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from Himalayas Remote Job Feed.',
        posted_date: formatPostedDate(j.pubDate as string | number | undefined),
        ...extractSalaryInfo(desc, {
          min: j.minSalary,
          max: j.maxSalary,
          currency: j.currency,
        }),
      };
    });
}

async function fetchJobicy(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
    'https://jobicy.com/api/v2/remote-jobs?count=30'
  );
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  return rows
    .filter((j) => j.jobTitle && j.url)
    .slice(0, 25)
    .map((j) => {
      const title = stripHtml(String(j.jobTitle));
      const company = stripHtml(String(j.companyName || 'Remote Employer'));
      const loc = stripHtml(String(j.jobGeo || 'Anywhere / Remote')) || 'Remote';
      const desc = stripHtml(String(j.jobDescription || j.jobExcerpt || title)).slice(0, 1800);
      return {
        id: `jobicy_${String(j.id || Math.random().toString(16).slice(2, 8))}`,
        title,
        company,
        location: loc,
        url: String(j.url),
        source: 'Jobicy',
        description: desc,
        visa_evidence: detectVisaEvidence(`${loc} ${desc}`),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from Jobicy Remote API.',
        posted_date: formatPostedDate(j.pubDate as string | undefined),
        ...extractSalaryInfo(desc, {
          min: j.annualSalaryMin,
          max: j.annualSalaryMax,
          currency: j.salaryCurrency,
        }),
      };
    });
}

async function fetchRemoteOK(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const raw = await fetchJson<Array<Record<string, unknown>>>('https://remoteok.com/api');
  const rows = Array.isArray(raw) ? raw.slice(1) : [];
  return rows
    .filter((j) => j.position && (j.apply_url || j.url) && isRelevantTechOrGradRole(String(j.position)))
    .slice(0, 25)
    .map((j) => {
      const title = stripHtml(String(j.position));
      const company = stripHtml(String(j.company || 'RemoteOK Employer'));
      const loc = stripHtml(String(j.location || 'Worldwide Remote')) || 'Remote';
      const tags = Array.isArray(j.tags) ? (j.tags as string[]).join(', ') : '';
      const desc = `${tags ? `Tags: ${tags}. ` : ''}${stripHtml(String(j.description || title))}`.slice(0, 1800);
      return {
        id: `remoteok_${String(j.id || j.slug || '')}`.slice(0, 64),
        title,
        company,
        location: loc,
        url: String(j.apply_url || j.url),
        source: 'RemoteOK',
        description: desc,
        visa_evidence: detectVisaEvidence(desc),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from RemoteOK Live API.',
        posted_date: formatPostedDate(j.date as string | undefined),
        ...extractSalaryInfo(desc, {
          min: j.salary_min,
          max: j.salary_max,
          currency: 'USD',
        }),
      };
    });
}

async function fetchWorkingNomads(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const rows = await fetchJson<Array<Record<string, unknown>>>(
    'https://www.workingnomads.com/api/exposed_jobs/'
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((j) => j.title && j.url && isRelevantTechOrGradRole(String(j.title)))
    .slice(0, 25)
    .map((j, idx) => {
      const title = stripHtml(String(j.title));
      const company = stripHtml(String(j.company_name || 'WorkingNomads Employer'));
      const loc = stripHtml(String(j.location || 'Remote')) || 'Remote';
      const tags = String(j.tags || '');
      const desc = `${tags ? `Skills: ${tags}. ` : ''}${stripHtml(String(j.description || title))}`.slice(0, 1800);
      const idSlug = String(j.url).replace(/[^a-zA-Z0-9]/g, '').slice(-24) || String(idx);
      return {
        id: `wn_${idSlug}`,
        title,
        company,
        location: loc,
        url: String(j.url),
        source: 'WorkingNomads',
        description: desc,
        visa_evidence: detectVisaEvidence(desc),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from WorkingNomads Exposed Jobs API.',
        posted_date: formatPostedDate(j.pub_date as string | undefined),
        ...extractSalaryInfo(desc),
      };
    });
}

async function fetchGreenhouseBoards(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const boards = [
    { slug: 'cloudflare', company: 'Cloudflare' },
    { slug: 'canonical', company: 'Canonical' },
    { slug: 'stripe', company: 'Stripe' },
  ];

  const results = await Promise.allSettled(
    boards.map(async (b) => {
      const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
        `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`
      );
      const rows = Array.isArray(data?.jobs) ? data.jobs : [];
      return rows
        .filter((j) => j.title && j.absolute_url && isRelevantTechOrGradRole(String(j.title)))
        .slice(0, 10)
        .map((j) => {
          const title = String(j.title).trim();
          const loc = String((j.location as { name?: string } | undefined)?.name || 'Global / Remote');
          const desc = stripHtml(String(j.content || title)).slice(0, 1800);
          return {
            id: `gh_${b.slug}_${String(j.id)}`,
            title,
            company: b.company,
            location: loc,
            url: String(j.absolute_url),
            source: 'Greenhouse',
            description: desc,
            visa_evidence: detectVisaEvidence(desc),
            housing_evidence: detectHousingEvidence(desc),
            liveness_status: 'live',
            liveness_checked_at: nowIso,
            authenticity_status: 'likely_official',
            authenticity_evidence: `Direct ${b.company} Greenhouse ATS careers board.`,
            posted_date: formatPostedDate(j.updated_at as string | undefined),
            ...extractSalaryInfo(desc),
          } satisfies NormalizedJob;
        });
    })
  );

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchAshbyBoards(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const boards = [
    { slug: 'linear', company: 'Linear' },
    { slug: 'notion', company: 'Notion' },
    { slug: 'ramp', company: 'Ramp' },
  ];

  const results = await Promise.allSettled(
    boards.map(async (b) => {
      const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
        `https://api.ashbyhq.com/posting-api/job-board/${b.slug}`
      );
      const rows = Array.isArray(data?.jobs) ? data.jobs : [];
      return rows
        .filter((j) => j.title && j.jobUrl && isRelevantTechOrGradRole(String(j.title)))
        .slice(0, 10)
        .map((j) => {
          const title = String(j.title).trim();
          const loc = `${String(j.location || 'Remote')}${j.isRemote ? ' (Remote)' : ''}`;
          const desc = stripHtml(String(j.descriptionPlain || j.descriptionHtml || title)).slice(0, 1800);
          return {
            id: `ashby_${b.slug}_${String(j.id).slice(0, 24)}`,
            title,
            company: b.company,
            location: loc,
            url: String(j.jobUrl),
            source: 'Ashby',
            description: desc,
            visa_evidence: detectVisaEvidence(desc),
            housing_evidence: detectHousingEvidence(desc),
            liveness_status: 'live',
            liveness_checked_at: nowIso,
            authenticity_status: 'likely_official',
            authenticity_evidence: `Direct ${b.company} Ashby HQ ATS board.`,
            posted_date: formatPostedDate(j.publishedAt as string | undefined),
            ...extractSalaryInfo(desc),
          } satisfies NormalizedJob;
        });
    })
  );

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchArbeitnow(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const data = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
    'https://www.arbeitnow.com/api/job-board-api'
  );
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .filter((j) => j.title && j.url && isRelevantTechOrGradRole(String(j.title)))
    .slice(0, 25)
    .map((j) => {
      const title = stripHtml(String(j.title));
      const company = stripHtml(String(j.company_name || 'Arbeitnow Employer'));
      const loc = `${stripHtml(String(j.location || 'Europe'))}${j.remote ? ' (Remote)' : ''}`;
      const desc = stripHtml(String(j.description || title)).slice(0, 1800);
      return {
        id: `arbeitnow_${String(j.slug || Math.random().toString(16).slice(2, 8))}`.slice(0, 72),
        title,
        company,
        location: loc,
        url: String(j.url),
        source: 'Arbeitnow',
        description: desc,
        visa_evidence: detectVisaEvidence(`${j.visa_sponsorship ? 'visa sponsorship ' : ''}${desc}`),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from Arbeitnow Live Job Board API.',
        posted_date: formatPostedDate(j.created_at as number | string | undefined),
        ...extractSalaryInfo(desc),
      };
    });
}

async function fetchRemotive(): Promise<NormalizedJob[]> {
  const nowIso = new Date().toISOString();
  const data = await fetchJson<{ jobs?: Array<Record<string, unknown>> }>(
    'https://remotive.com/api/remote-jobs?limit=30'
  );
  const rows = Array.isArray(data?.jobs) ? data.jobs : [];
  return rows
    .filter((j) => j.title && j.url)
    .slice(0, 25)
    .map((j) => {
      const title = stripHtml(String(j.title));
      const company = stripHtml(String(j.company_name || 'Remotive Employer'));
      const loc = stripHtml(String(j.candidate_required_location || 'Remote')) || 'Remote';
      const desc = stripHtml(String(j.description || title)).slice(0, 1800);
      return {
        id: `remotive_${String(j.id)}`,
        title,
        company,
        location: loc,
        url: String(j.url),
        source: 'Remotive',
        description: desc,
        visa_evidence: detectVisaEvidence(desc),
        housing_evidence: detectHousingEvidence(desc),
        liveness_status: 'live',
        liveness_checked_at: nowIso,
        authenticity_status: 'unverified',
        authenticity_evidence: 'Indexed from Remotive Remote Jobs API.',
        posted_date: formatPostedDate(j.publication_date as string | undefined),
        ...extractSalaryInfo(desc, { salaryText: j.salary }),
      };
    });
}

export interface SourceSyncSummary {
  fetchedTotal: number;
  upsertedTotal: number;
  bySource: Record<string, number>;
  syncedAt: string;
}

export async function syncAllJobSources(db: DatabaseSync): Promise<SourceSyncSummary> {
  const fetchers = [
    fetchGoogleCareers(),
    fetchGreenhouseBoards(),
    fetchAshbyBoards(),
    fetchHimalayas(),
    fetchJobicy(),
    fetchRemoteOK(),
    fetchWorkingNomads(),
    fetchArbeitnow(),
    fetchRemotive(),
  ];

  const settled = await Promise.allSettled(fetchers);
  const collected: NormalizedJob[] = settled.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );

  const bySource: Record<string, number> = {};
  const nowIso = new Date().toISOString();

  const upsertStmt = db.prepare(`
    INSERT INTO jobs (
      id, title, company, location, url, source, description,
      visa_evidence, housing_evidence, liveness_status, liveness_checked_at,
      authenticity_status, authenticity_evidence, posted_date,
      salary_min, salary_max, salary_currency, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      url = excluded.url,
      source = excluded.source,
      description = excluded.description,
      visa_evidence = excluded.visa_evidence,
      housing_evidence = excluded.housing_evidence,
      liveness_status = excluded.liveness_status,
      liveness_checked_at = excluded.liveness_checked_at,
      authenticity_status = excluded.authenticity_status,
      authenticity_evidence = excluded.authenticity_evidence,
      posted_date = excluded.posted_date,
      salary_min = COALESCE(excluded.salary_min, jobs.salary_min),
      salary_max = COALESCE(excluded.salary_max, jobs.salary_max),
      salary_currency = COALESCE(excluded.salary_currency, jobs.salary_currency)
  `);

  let upsertedTotal = 0;
  db.exec('BEGIN');
  try {
    for (const job of collected) {
      upsertStmt.run(
        job.id,
        job.title,
        job.company,
        job.location,
        job.url,
        job.source,
        job.description,
        job.visa_evidence,
        job.housing_evidence,
        job.liveness_status,
        job.liveness_checked_at,
        job.authenticity_status,
        job.authenticity_evidence,
        job.posted_date,
        job.salary_min,
        job.salary_max,
        job.salary_currency,
        nowIso
      );
      bySource[job.source] = (bySource[job.source] || 0) + 1;
      upsertedTotal += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    fetchedTotal: collected.length,
    upsertedTotal,
    bySource,
    syncedAt: nowIso,
  };
}
