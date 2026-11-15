import type { AgentArgument, JuryRoomItem } from '../types.ts';
import type { ScoutDepartmentInfo } from './jobDepartment.ts';

export interface CourtroomDialogue {
  scoutDiscoverLine: string;
  scoutSubmitLine: string;
  proponent: { name: string; role: string; statement: string; score: number };
  opponent: { name: string; role: string; statement: string; score: number };
  examiner: { name: string; role: string; statement: string; score: number };
  juryComment: string;
}

function pickVariant<T>(list: T[], seed: number): T {
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}

function hashJobSeed(id: string, extraSalt: number): number {
  let h = 2166136261 + extraSalt * 101;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function extractMatchedSkillsFromArgs(args: AgentArgument[], rawStatement?: string): string {
  const text =
    args.find((a) => a.argument_type === 'cv_match')?.statement || rawStatement || '';
  const match = text.match(/Matched CV skills:\s*([^.]+)/i);
  if (match && match[1]) {
    return match[1].split(',').slice(0, 3).map((s) => s.trim()).join(', ');
  }
  return 'core engineering stack';
}

export function buildCourtroomDialogue(
  item: JuryRoomItem,
  dept: ScoutDepartmentInfo,
  caseIndex: number,
  salt = 0
): CourtroomDialogue {
  const { job, arguments: args, verdict } = item;
  const seed = hashJobSeed(job.id, salt + caseIndex * 7);

  const swArg =
    args.find((a) => a.agent_name.includes('Software')) ||
    args.find((a) => a.argument_type === 'cv_match');
  const visaArg =
    args.find((a) => a.agent_name.includes('Visa')) ||
    args.find((a) => a.argument_type === 'relocation_accommodation') ||
    args.find((a) => a.argument_type === 'location_preference');
  const qaArg =
    args.find((a) => a.agent_name.includes('Quality')) ||
    args.find((a) => a.argument_type === 'candidate_constraints') ||
    args.find((a) => a.argument_type === 'availability_check');

  const swScore = swArg?.score ?? job.jury_score ?? job.score ?? 50;
  const visaScore = visaArg?.score ?? 45;
  const qaScore = qaArg?.score ?? 75;

  const company = job.company || 'the employer';
  const title = job.title || 'this role';
  const location = job.location || 'Remote / Global';
  const source = job.source || 'Job Board';
  const skills = extractMatchedSkillsFromArgs(args, swArg?.statement);
  const visaEvidence = (job.visa_evidence || '').trim();
  const hasVisaMention = visaEvidence.toLowerCase().includes('mentioned');
  const isRemote = location.toLowerCase().includes('remote');
  const isLive = job.liveness_status === 'live';
  const isOfficial = job.authenticity_status === 'likely_official';
  const hasConstraintWarning =
    Boolean(qaArg?.statement.includes('OBJECTION')) ||
    (job.jury_verdict || '').includes('CONSTRAINED');

  // 1. Varied Department Scout Discover & Handoff Lines
  const scoutDiscoverLine = pickVariant(
    [
      `Spotted a live ${dept.shortLabel} opening at ${company}: "${title}" on ${source}.`,
      `Pulling "${title}" at ${company} from our ${dept.shortLabel} feed—metrics look promising.`,
      `New ${dept.shortLabel} docket alert: "${title}" in ${location} just surfaced on ${source}.`,
      `Scanning ${source} for ${dept.shortLabel}; locking onto "${title}" with ${company}.`,
    ],
    seed + 1
  );

  const scoutSubmitLine = pickVariant(
    [
      `Dropping the ${dept.shortLabel} brief on Counsel's desk—let the cross-examination begin.`,
      `File stamped for ${company}; Counsel can argue over this one now.`,
      `Dossier delivered to the well; handing "${title}" to our legal sub-agents.`,
      `Submitted! Now let's hear whether the lawyers back ${company} or roast the fine print.`,
    ],
    seed + 2
  );

  // 2. Proponent Counsel (Witty/Sarcastic One-Sentence, Poised Courtroom Slang)
  let proponentStatement: string;
  if (swScore >= 65) {
    proponentStatement = pickVariant(
      [
        `Your Honor, ${company} matching her ${skills} stack this closely feels suspiciously tailor-made, low-key.`,
        `At ${swScore}/100 overlap on ${skills}, ${company} is practically manifestation-posting for her CV, no cap.`,
        `Counsel submits "${title}" checks enough technical boxes that ignoring it would just be unserious.`,
        `With ${skills} lining up at ${swScore}/100, this docket practically argues for itself unless HR moves sluggish.`,
      ],
      seed + 3
    );
  } else if (swScore >= 48) {
    proponentStatement = pickVariant(
      [
        `Score sits at ${swScore}/100 for ${company}—not an instant flex, yet easily solid enough to clear round one.`,
        `Technical overlap on ${skills} holds water at ${swScore}/100, provided the team isn't expecting a miracle hire.`,
        `Counsel notes respectable ${dept.shortLabel} alignment here; cautious optimism rather than blind hype, Your Honor.`,
        `${company} offers genuine runway on ${skills}, even if recruiters wrote the spec with mild ambiguity.`,
      ],
      seed + 5
    );
  } else {
    proponentStatement = pickVariant(
      [
        `Only ${swScore}/100 keyword overlap at ${company}, though sharper candidates have finesse-applied with thinner receipts.`,
        `Calling this a wildcard match for ${title}—stretch territory technically, yet surprisingly readable engineering scope.`,
        `Technical alignment sits lean at ${swScore}/100, meaning her project fundamentals will have to carry the main flex.`,
      ],
      seed + 7
    );
  }

  // 3. Cross-Examining Visa & Mobility Advocate (Witty/Sarcastic One-Sentence)
  let opponentStatement: string;
  if (hasVisaMention) {
    opponentStatement = pickVariant(
      [
        `Plot twist: ${company} actually acknowledged visa logistics exist, which is already elite tier for corporate postings.`,
        `Rare win on mobility—${company} left actual visa evidence on the record in ${location}, assuming HR honors it.`,
        `For once a posting isn't ghosting sponsorship questions; ${location} mobility signals pass cross-exam.`,
      ],
      seed + 11
    );
  } else if (isRemote) {
    opponentStatement = pickVariant(
      [
        `Remote eligibility spares us relocation drama, though ${company} still stays quiet on contract tax receipts.`,
        `Zero commute tax here since ${company} embraces remote—let's just make sure "remote" doesn't quietly mean one time zone.`,
        `Location hurdles are mid thanks to remote access, leaving only timezone alignment to negotiate.`,
      ],
      seed + 13
    );
  } else {
    opponentStatement = pickVariant(
      [
        `${company} completely ghosted sponsorship details for ${location}, which is peak hiring ambiguity until an email clears it.`,
        `Zero visa paperwork clues in ${location}—bold of ${company} to assume candidates spawn with work permits.`,
        `Classic corporate cliffhanger in ${location}: crisp engineering title, zero clarity on relocation support.`,
        `Sponsorship remains an unverified plot hole in ${location}, so confirm permit terms before getting invested.`,
      ],
      seed + 17
    );
  }

  // 4. Quality & Operations Examiner (Witty/Sarcastic One-Sentence)
  let examinerStatement: string;
  if (hasConstraintWarning) {
    examinerStatement = pickVariant(
      [
        `Flag on the play—title signals senior or excluded scope, so Counsel recommends zero illusions here.`,
        `Compliance check says slow down: ${title} drifts toward restricted seniority or excluded track territory.`,
      ],
      seed + 19
    );
  } else if (isLive && isOfficial) {
    examinerStatement = pickVariant(
      [
        `Receipts verified: ${company}'s official link on ${source} is genuinely live, already beating half the ghost jobs online.`,
        `Domain and liveness checks passed cleanly—an authentic open req instead of another phantom career page.`,
        `Zero broken links or sketchy redirects on ${source}, meaning this posting actually respects candidates' time.`,
      ],
      seed + 23
    );
  } else if (isLive) {
    examinerStatement = pickVariant(
      [
        `The ${source} URL responds live right now, though prudence says verify directly on ${company}'s careers portal.`,
        `Link availability holds up today, even if third-party boards love keeping stale seats warm longer than advertised.`,
        `Operational pulse is live on ${source}; double-check official intake before pouring hours into custom edits.`,
      ],
      seed + 29
    );
  } else {
    examinerStatement = pickVariant(
      [
        `Liveness remains unverified on ${source}—confirm ${company} didn't quietly sunset this seat before drafting anything.`,
        `Availability ping came back inconclusive, so verify the portal is still taking resumes before chasing it.`,
      ],
      seed + 31
    );
  }

  // 5. Supreme Jury Final Verdict Comment (Poised Judicial Summary Specific to Job Situation)
  const finalScore = job.jury_score || job.score;
  let juryComment: string;
  if (!isLive) {
    juryComment = pickVariant(
      [
        `Bench cannot confirm live intake for "${title}" on ${source}; verify the employer URL directly before investing tailoring time.`,
        `With unverified link availability at ${company}, confirm the requisition remains open before advancing to full application.`,
      ],
      seed + 37
    );
  } else if (hasConstraintWarning) {
    juryComment = pickVariant(
      [
        `Hold for manual review: "${title}" triggers a seniority or track preference flag despite solid ${company} credentials.`,
        `Proceed selectively—verify the role's actual experience band with ${company} before committing tailored materials.`,
      ],
      seed + 41
    );
  } else if (finalScore >= 55 && hasVisaMention) {
    juryComment = pickVariant(
      [
        `Priority shortlist approved: strong ${finalScore}/100 alignment with explicit mobility signals at ${company}—generate tailored docs now.`,
        `Clear consensus win for ${company}; combine CV highlights with early confirmation of the noted visa pathway.`,
      ],
      seed + 43
    );
  } else if (finalScore >= 50) {
    juryComment = pickVariant(
      [
        `Advancing "${title}" at ${finalScore}/100—lead with your strongest ${skills} work and clarify ${location} sponsorship on outreach.`,
        `Cleared for your active shortlist at ${company}; use tailored resume edits to sharpen alignment on ${skills}.`,
      ],
      seed + 47
    );
  } else {
    juryComment = pickVariant(
      [
        `Retained as a ${dept.shortLabel} watchlist pick at ${finalScore}/100—tailor your ${skills} bullets closely before applying to ${company}.`,
        `Moderate score for ${company}, yet live intake justifies a targeted application if ${location} logistics align.`,
      ],
      seed + 53
    );
  }

  return {
    scoutDiscoverLine,
    scoutSubmitLine,
    proponent: {
      name: swArg?.agent_name || 'Software & Systems Counsel',
      role: swArg?.agent_role || 'Lead Engineering Screener',
      statement: proponentStatement,
      score: swScore,
    },
    opponent: {
      name: visaArg?.agent_name || 'Visa & Relocation Advocate',
      role: visaArg?.agent_role || 'Immigration & Mobility Counsel',
      statement: opponentStatement,
      score: visaScore,
    },
    examiner: {
      name: qaArg?.agent_name || 'Quality & Operations Counsel',
      role: qaArg?.agent_role || 'Posting Availability & Fit Examiner',
      statement: examinerStatement,
      score: qaScore,
    },
    juryComment,
  };
}
