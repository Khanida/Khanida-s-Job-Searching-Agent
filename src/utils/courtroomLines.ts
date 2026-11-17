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
  const isDismissed = job.status === 'dismissed';
  const isRejectedVerdict =
    isDismissed ||
    Boolean(job.jury_verdict && /^(REJECTED|CONSTRAINED|DEFERRED)/i.test(job.jury_verdict)) ||
    job.is_daily_pick === 0;
  const hasConstraintWarning =
    Boolean(qaArg?.statement.includes('OBJECTION')) ||
    Boolean(job.jury_verdict && /(CONSTRAINED|REJECTED)/i.test(job.jury_verdict));

  // 1. Varied Department Scout Discover & Lawyer Case-Select Lines
  const scoutDiscoverLine = pickVariant(
    [
      `All 4 Scouts hauled in a full stack across ${source} & partner boards—dumping the whole batch on Counsel's desk now!`,
      `Dropping today's scraped job batch (including risky & rejected leads) onto the Counsel table at once!`,
      `Fresh ${dept.shortLabel} & multi-board bundle delivered—let's see what survives Counsel's cross-exam!`,
    ],
    seed + 1
  );

  const scoutSubmitLine = isRejectedVerdict
    ? pickVariant(
        [
          `Counsel pulling "${title}" at ${company} off the stack—brace yourselves for red flags.`,
          `Next file up from the batch: "${title}" (${company})—already looking suspicious on paper.`,
          `Placing "${title}" on the lectern—let's see if Counsel defends or bins it.`,
        ],
        seed + 2
      )
    : pickVariant(
        [
          `Counsel selecting "${title}" at ${company} from the batch stack for oral argument.`,
          `Pulling "${title}" (${source}) onto the center stand—starting case review now.`,
          `Next up from the desk pile: "${title}" at ${company}. Counsel is ready to argue.`,
        ],
        seed + 2
      );

  // 2. Proponent Counsel (Witty/Sarcastic One-Sentence, Poised Courtroom Slang)
  let proponentStatement: string;
  if (isRejectedVerdict) {
    proponentStatement = pickVariant(
      [
        `Your Honor, even I can barely spin "${title}" at ${company} at ${swScore}/100, though the title looked cute on paper.`,
        `Look, ${company} slid into the batch with ${swScore}/100 overlap—consider me playing devil's advocate strictly for completeness.`,
        `Not gonna lie, ${company} brings weak ${skills} alignment here, so Counsel submits this mostly to get it roasted cleanly.`,
      ],
      seed + 3
    );
  } else if (swScore >= 65) {
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
  if (isDismissed) {
    opponentStatement = pickVariant(
      [
        `Objection sustained automatically—the candidate already kicked ${company} off the island, and HR didn't help with visa clues.`,
        `The candidate dismissed this seat for a reason, and ${company}'s silence in ${location} certainly isn't changing anyone's mind.`,
      ],
      seed + 11
    );
  } else if (hasVisaMention) {
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
  if (isDismissed) {
    examinerStatement = pickVariant(
      [
        `Binning it cleanly—"${title}" took a rejection veto and our behavioral weights have officially moved on.`,
        `Closing the file on ${company}; dismissed by the candidate and penalized by the Jury calibration engine.`,
      ],
      seed + 19
    );
  } else if (hasConstraintWarning) {
    examinerStatement = pickVariant(
      [
        `Flag on the play—"${title}" violates seniority or excluded track rules, so it goes straight to the rejected rail.`,
        `Compliance check says rejected: "${title}" drifts into restricted seniority or excluded skill territory.`,
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
        `Liveness failed on ${source}—${company}'s portal isn't verified live, so the Jury rejects it from today's top 5.`,
        `Availability ping came back unverified—sending "${title}" to the rejected rail instead of wasting shortlist space.`,
      ],
      seed + 31
    );
  }

  // 5. Supreme Jury Final Verdict Comment (Poised Judicial Summary Specific to Approved vs Rejected)
  const finalScore = job.jury_score || job.score;
  let juryComment: string;
  if (isDismissed) {
    juryComment = pickVariant(
      [
        `Overruled and dismissed: "${title}" at ${company} is sent to the Rejected Rail in accordance with candidate feedback.`,
        `Gavel down—${company} stays rejected; preference weights updated to avoid similar roles.`,
      ],
      seed + 35
    );
  } else if (!isLive) {
    juryComment = pickVariant(
      [
        `Rejected from top 5: bench cannot confirm live intake for "${title}" on ${source}.`,
        `Sent to the Rejected Rail—unverified link availability at ${company} disqualifies it today.`,
      ],
      seed + 37
    );
  } else if (hasConstraintWarning || isRejectedVerdict) {
    juryComment = pickVariant(
      [
        `Motion denied—"${title}" triggers a seniority, exclusion, or score cutoff rejection and is moved to the Rejected Rail.`,
        `Rejected from today's Top 5 at ${finalScore}/100: ${company} does not outrank today's strongest matches.`,
      ],
      seed + 41
    );
  } else if (finalScore >= 55 && hasVisaMention) {
    juryComment = pickVariant(
      [
        `Priority shortlist approved: strong ${finalScore}/100 alignment with explicit mobility signals at ${company}—placed on pedestal!`,
        `Clear consensus win for ${company}; combine CV highlights with early confirmation of the noted visa pathway.`,
      ],
      seed + 43
    );
  } else if (finalScore >= 50) {
    juryComment = pickVariant(
      [
        `Advancing "${title}" at ${finalScore}/100 to the Top 5 Pedestal—lead with your ${skills} strengths.`,
        `Cleared for your active shortlist at ${company}; use tailored resume edits to sharpen alignment on ${skills}.`,
      ],
      seed + 47
    );
  } else {
    juryComment = pickVariant(
      [
        `Crowned for review at ${finalScore}/100—tailor your ${skills} bullets closely before applying to ${company}.`,
        `Selected for today's slate at ${company}; verify ${location} logistics while customizing your cover letter.`,
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
