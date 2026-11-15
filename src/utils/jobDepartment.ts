import type { JobItem } from '../types.ts';

export interface ScoutDepartmentInfo {
  index: number;
  department: string;
  scoutTitle: string;
  shortLabel: string;
  hexColor: number;
  cssBadgeText: string;
  cssBorderColor: string;
  specialtyNote: string;
}

export const SCOUT_DEPARTMENTS: ScoutDepartmentInfo[] = [
  {
    index: 0,
    department: 'Software & AI Engineering',
    scoutTitle: 'Software & AI Scout',
    shortLabel: 'Software & AI',
    hexColor: 0x3b82f6,
    cssBadgeText: 'text-blue-400',
    cssBorderColor: 'border-blue-500',
    specialtyNote: 'AI agents, full-cycle software, simulation & enterprise code',
  },
  {
    index: 1,
    department: 'Embedded, Robotics & Systems',
    scoutTitle: 'Embedded & Robotics Scout',
    shortLabel: 'Embedded & Systems',
    hexColor: 0x10b981,
    cssBadgeText: 'text-emerald-400',
    cssBorderColor: 'border-emerald-500',
    specialtyNote: 'UGV, firmware, microcontrollers, C/C++, Linux & hardware provisioning',
  },
  {
    index: 2,
    department: 'Product, Program & Design',
    scoutTitle: 'Product & Program Scout',
    shortLabel: 'Product & TPM',
    hexColor: 0x8b5cf6,
    cssBadgeText: 'text-violet-400',
    cssBorderColor: 'border-violet-500',
    specialtyNote: 'Product engineering, technical program management, DevRel & UI/UX',
  },
  {
    index: 3,
    department: 'QA, Security & Cloud Ops',
    scoutTitle: 'QA & Security Scout',
    shortLabel: 'QA, Sec & Ops',
    hexColor: 0xf59e0b,
    cssBadgeText: 'text-amber-400',
    cssBorderColor: 'border-amber-500',
    specialtyNote: 'Quality assurance, test automation, cybersecurity, SRE & DevOps',
  },
];

export function classifyJobDepartment(job: Pick<JobItem, 'title' | 'description'>): ScoutDepartmentInfo {
  const title = (job.title || '').toLowerCase();
  const hay = `${title} ${(job.description || '').slice(0, 600).toLowerCase()}`;

  // 1. Embedded, Robotics, Hardware, UGV & Systems
  if (
    /\b(embedded|firmware|robotics|robot|ugv|hardware|microcontroller|fpga|verilog|rtos|provisioning technician|systems engineer|iot)\b/.test(
      title
    ) ||
    (/\b(embedded|firmware|ugv|microcontroller|fpga|pcb)\b/.test(hay) && !/\bprogram manager\b/.test(title))
  ) {
    return SCOUT_DEPARTMENTS[1];
  }

  // 2. QA, Security, Testing, DevOps
  if (
    /\b(qa|quality|test engineer|testing|selenium|playwright|cyber|security|devsecops|devops|sre|it support|reliability)\b/.test(
      title
    )
  ) {
    return SCOUT_DEPARTMENTS[3];
  }

  // 3. Product, Program Manager, DevRel, Design
  if (
    /\b(product|program manager|project manager|tpm|designer|ui\/ux|ux|ui|graphic|developer relations|devrel|analyst)\b/.test(
      title
    )
  ) {
    return SCOUT_DEPARTMENTS[2];
  }

  // 4. Default: Software & AI Engineering
  return SCOUT_DEPARTMENTS[0];
}
