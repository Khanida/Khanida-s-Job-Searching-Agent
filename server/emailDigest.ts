import type { CandidateProfile, DeliberationSession, JobItem } from '../src/types.ts';

const EMAIL_REGEX = /^[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[^\s@<>()[\],;:]{2,}$/;

export function isValidRecipientEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (/[\r\n\0]/.test(trimmed)) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function sanitizeHeaderValue(value: string, maxLen = 200): string {
  return String(value || '')
    .replace(/[\r\n\0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function encodeRfc2047Subject(subject: string): string {
  const clean = sanitizeHeaderValue(subject, 220);
  if (/^[\x20-\x7E]+$/.test(clean)) {
    return clean;
  }
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeHttpUrl(rawUrl: string | null | undefined): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

function formatSalaryLine(job: JobItem): string {
  const min = job.salary_min ?? null;
  const max = job.salary_max ?? null;
  if (!min && !max) return '';
  const symbol = job.salary_currency === 'EUR' ? '€' : job.salary_currency === 'GBP' ? '£' : '$';
  const fmt = (n: number) => `${symbol}${Math.round(n / 1000)}k`;
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`;
  return fmt(max || min || 0);
}

export interface DigestEmailPayload {
  subject: string;
  rawBase64Url: string;
  sentCount: number;
}

export function buildDailyJuryDigestEmail(params: {
  recipientEmail: string;
  dateLabel: string;
  profile: CandidateProfile;
  picks: JobItem[];
  deliberation: DeliberationSession | null;
  appUrl?: string;
}): DigestEmailPayload {
  const recipient = sanitizeHeaderValue(params.recipientEmail, 254);
  if (!isValidRecipientEmail(recipient)) {
    throw new Error('Invalid recipient email address.');
  }

  const picks = params.picks.slice(0, 5);
  const topTitle = picks[0]?.title ? ` — Top Pick: ${sanitizeHeaderValue(picks[0].title, 60)}` : '';
  const subject = sanitizeHeaderValue(
    `Adeena's Job Agent · Daily Jury Top ${picks.length} Picks (${params.dateLabel})${topTitle}`,
    220
  );

  const safeCandidate = escapeHtml(params.profile.name || 'Candidate');
  const safeResidence = escapeHtml(params.profile.residence || 'Global');
  const safeSummary = escapeHtml(
    params.deliberation?.summary ||
      'Supreme Jury evaluated live postings for CV alignment, entry-level fit, language suitability, location priority, and visa evidence.'
  );
  const safeAppUrl = safeHttpUrl(params.appUrl || '');

  const textLines: string[] = [
    `Adeena's Job Agent — Daily Top ${picks.length} Jury Picks (${params.dateLabel})`,
    `Candidate: ${params.profile.name || 'Candidate'} (${params.profile.residence || 'Global'})`,
    '',
    params.deliberation?.summary ||
      'Supreme Jury evaluated live postings for CV alignment, language suitability, and reachability.',
    '',
    '============================================================',
    '',
  ];

  const htmlCards = picks
    .map((job, idx) => {
      const score = Number(job.jury_score || job.score || 0);
      const salary = formatSalaryLine(job);
      const link = safeHttpUrl(job.url);
      const safeTitle = escapeHtml(job.title);
      const safeCompany = escapeHtml(job.company);
      const safeLocation = escapeHtml(job.location || 'Remote');
      const safeSource = escapeHtml(job.source || 'Job Board');
      const safeVisa = escapeHtml(job.visa_evidence || 'Check posting details');
      const safeHousing = escapeHtml(job.housing_evidence || 'Not stated');
      const safeTier = escapeHtml(job.location_priority_label || '');
      const safeVerdict = escapeHtml(
        job.jury_verdict || 'Approved by Supreme Jury multi-agent consensus.'
      );

      textLines.push(
        `#${idx + 1} [${score}/100] ${job.title}`,
        `Company: ${job.company} | Location: ${job.location || 'Remote'} | Board: ${job.source}${salary ? ` | Salary: ${salary}` : ''}`,
        job.location_priority_label ? `Location Priority: ${job.location_priority_label}` : '',
        `Visa: ${job.visa_evidence || 'Check posting'} | Housing: ${job.housing_evidence || 'Not stated'}`,
        `Jury Verdict: ${job.jury_verdict || 'Approved consensus pick'}`,
        link ? `Apply / View Posting: ${link}` : '',
        ''
      );

      return `
        <tr>
          <td style="padding: 0 0 16px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
              <tr>
                <td style="padding: 18px 20px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="font-size: 12px; color: #64748b; font-weight: 600;">
                        PICK #${idx + 1} &middot; ${safeSource}${salary ? ` &middot; ${escapeHtml(salary)}` : ''}
                      </td>
                      <td align="right" style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; font-weight: 700; color: #1d4ed8;">
                        ${score}/100
                      </td>
                    </tr>
                  </table>
                  <h2 style="margin: 8px 0 4px 0; font-size: 17px; line-height: 1.35; color: #0f172a; font-weight: 700;">
                    ${safeTitle}
                  </h2>
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #475569;">
                    <strong style="color: #1e293b;">${safeCompany}</strong> &middot; ${safeLocation}
                  </p>
                  ${
                    safeTier
                      ? `<p style="margin: 0 0 10px 0; font-size: 12px; color: #1d4ed8; font-weight: 600;">${safeTier}</p>`
                      : ''
                  }
                  <p style="margin: 0 0 10px 0; font-size: 12px; color: #475569; line-height: 1.5; background-color: #f8fafc; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #2563eb;">
                    ${safeVerdict}
                  </p>
                  <p style="margin: 0 0 14px 0; font-size: 12px; color: #64748b;">
                    <strong>Visa:</strong> ${safeVisa} &nbsp;&middot;&nbsp; <strong>Housing:</strong> ${safeHousing}
                  </p>
                  ${
                    link
                      ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 9px 16px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; border-radius: 6px;">View Job &amp; Apply &rarr;</a>`
                      : ''
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('\n');

  if (safeAppUrl) {
    textLines.push(`Open Workspace: ${safeAppUrl}`);
  }

  const plainBody = textLines.filter(Boolean).join('\r\n');
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width: 640px; width: 100%;">
          <tr>
            <td style="background-color: #0f172a; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #93c5fd; font-weight: 700;">
                Daily Supreme Jury Digest &middot; ${escapeHtml(params.dateLabel)}
              </div>
              <h1 style="margin: 8px 0 6px 0; font-size: 22px; font-weight: 700; color: #ffffff;">
                Top ${picks.length} Job Picks Curated for ${safeCandidate}
              </h1>
              <p style="margin: 0; font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                Targeting from ${safeResidence}. ${safeSummary}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${htmlCards}
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 8px;">
                <tr>
                  <td style="font-size: 12px; color: #64748b; line-height: 1.5;">
                    Sent only upon your confirmation via Adeena's Job Agent.
                    ${
                      safeAppUrl
                        ? `<a href="${escapeHtml(safeAppUrl)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; font-weight: 600; text-decoration: none;">Open Workspace &rarr;</a>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const boundary = `boundary_jury_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const mimeParts = [
    `To: ${recipient}`,
    `Subject: ${encodeRfc2047Subject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainBody, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ];

  const rawMime = mimeParts.join('\r\n');
  const rawBase64Url = Buffer.from(rawMime, 'utf8').toString('base64url');

  return {
    subject,
    rawBase64Url,
    sentCount: picks.length,
  };
}

export async function sendGmailRawMessage(params: {
  accessToken: string;
  rawBase64Url: string;
}): Promise<{ id: string; threadId?: string }> {
  const token = params.accessToken.trim();
  if (!token || /[\r\n\s]/.test(token)) {
    throw Object.assign(new Error('Invalid Gmail authorization token.'), { status: 401, needsReauth: true });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: params.rawBase64Url }),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      threadId?: string;
      error?: { message?: string; status?: string; code?: number };
    };

    if (!response.ok) {
      const apiMsg = data?.error?.message || `Gmail API responded with status ${response.status}.`;
      const isAuthIssue = response.status === 401 || response.status === 403;
      throw Object.assign(new Error(apiMsg), {
        status: response.status,
        needsReauth: isAuthIssue,
      });
    }

    return {
      id: String(data.id || 'sent'),
      threadId: data.threadId,
    };
  } finally {
    clearTimeout(timeout);
  }
}
