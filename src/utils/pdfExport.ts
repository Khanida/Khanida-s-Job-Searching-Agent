import { jsPDF } from 'jspdf';

export interface ExportExperienceEntry {
  title: string;
  organization: string;
  dates: string;
  bullets: string[];
}

export interface ExportResumeData {
  fullName: string;
  subtitle: string;
  summary: string;
  skills: string[];
  education: string;
  entries: ExportExperienceEntry[];
}

export interface ExportCoverLetterData {
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

export type PdfTemplate = 'executive' | 'modern' | 'ats';

function safePdfText(input: string): string {
  return (input || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function triggerBlobDownload(doc: jsPDF, filename: string): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportResumeToPdf(
  resume: ExportResumeData,
  template: PdfTemplate,
  companyName?: string,
  customFilename?: string
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 612
  const pageHeight = doc.internal.pageSize.getHeight(); // 792

  if (template === 'modern') {
    const sidebarWidth = 192;
    const sidebarPad = 24;
    const sidebarInner = sidebarWidth - sidebarPad * 2;
    const mainX = sidebarWidth + 24;
    const mainWidth = pageWidth - mainX - 32;
    const bottomMargin = pageHeight - 40;

    // Draw dark slate sidebar background on page 1
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, sidebarWidth, pageHeight, 'F');

    let sy = 42;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    const nameLines = doc.splitTextToSize(safePdfText(resume.fullName || 'CANDIDATE NAME'), sidebarInner) as string[];
    doc.text(nameLines, sidebarPad, sy);
    sy += nameLines.length * 20;

    if (resume.subtitle.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225); // slate-300
      const subLines = doc.splitTextToSize(safePdfText(resume.subtitle), sidebarInner) as string[];
      doc.text(subLines, sidebarPad, sy + 2);
      sy += subLines.length * 12 + 10;
    }

    doc.setDrawColor(51, 65, 85); // slate-700
    doc.setLineWidth(0.75);
    doc.line(sidebarPad, sy, sidebarWidth - sidebarPad, sy);
    sy += 18;

    // Sidebar Skills
    const cleanSkills = resume.skills.map((s) => safePdfText(s)).filter(Boolean);
    if (cleanSkills.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(147, 197, 253); // blue-300
      doc.text('CORE SKILLS', sidebarPad, sy);
      sy += 6;
      doc.line(sidebarPad, sy, sidebarWidth - sidebarPad, sy);
      sy += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(241, 245, 249);
      for (const skill of cleanSkills) {
        if (sy > pageHeight - 130) break;
        doc.setFillColor(96, 165, 250);
        doc.circle(sidebarPad + 3, sy - 3, 1.6, 'F');
        const skillLines = doc.splitTextToSize(skill, sidebarInner - 12) as string[];
        doc.text(skillLines, sidebarPad + 11, sy);
        sy += skillLines.length * 12 + 3;
      }
      sy += 10;
    }

    // Sidebar Education
    if (resume.education.trim() && sy < pageHeight - 70) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(147, 197, 253);
      doc.text('EDUCATION', sidebarPad, sy);
      sy += 6;
      doc.line(sidebarPad, sy, sidebarWidth - sidebarPad, sy);
      sy += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(226, 232, 240);
      const eduLines = doc.splitTextToSize(safePdfText(resume.education), sidebarInner) as string[];
      doc.text(eduLines, sidebarPad, sy);
    }

    // Right Main Content Column
    let my = 44;
    let activeMainX = mainX;
    let activeMainWidth = mainWidth;

    const ensureMainSpace = (needed: number) => {
      if (my + needed > bottomMargin) {
        doc.addPage();
        // Continuation pages keep clean full-width or subtle sidebar tint
        doc.setFillColor(248, 250, 252);
        doc.rect(0, 0, sidebarWidth, pageHeight, 'F');
        my = 44;
      }
    };

    const drawMainSectionTitle = (label: string) => {
      ensureMainSpace(28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 58, 138); // blue-900
      doc.text(label, activeMainX, my);
      my += 5;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.75);
      doc.line(activeMainX, my, activeMainX + activeMainWidth, my);
      my += 15;
    };

    if (resume.summary.trim()) {
      drawMainSectionTitle('PROFESSIONAL SUMMARY');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.8);
      doc.setTextColor(30, 41, 59);
      const sumLines = doc.splitTextToSize(safePdfText(resume.summary), activeMainWidth) as string[];
      for (const line of sumLines) {
        ensureMainSpace(14);
        doc.text(line, activeMainX, my);
        my += 13.5;
      }
      my += 12;
    }

    if (resume.entries.length > 0) {
      drawMainSectionTitle('EXPERIENCE & PROJECTS');
      for (const entry of resume.entries) {
        ensureMainSpace(36);
        const title = safePdfText(entry.title || 'Experience / Project');
        const org = safePdfText(entry.organization);
        const dates = safePdfText(entry.dates);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        const dateWidth = dates ? doc.getTextWidth(dates) + 12 : 0;
        const titleMaxW = activeMainWidth - dateWidth;
        const headingText = org ? `${title} - ${org}` : title;
        const headingLines = doc.splitTextToSize(headingText, titleMaxW) as string[];
        doc.text(headingLines, activeMainX, my);

        if (dates) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text(dates, activeMainX + activeMainWidth, my, { align: 'right' });
        }
        my += headingLines.length * 13 + 3;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.4);
        doc.setTextColor(30, 41, 59);
        for (const bullet of entry.bullets) {
          const cleanB = safePdfText(bullet);
          if (!cleanB) continue;
          const bLines = doc.splitTextToSize(cleanB, activeMainWidth - 14) as string[];
          ensureMainSpace(bLines.length * 13 + 4);
          doc.setFillColor(71, 85, 105);
          doc.circle(activeMainX + 4, my - 3, 1.5, 'F');
          doc.text(bLines, activeMainX + 13, my);
          my += bLines.length * 13 + 3;
        }
        my += 8;
      }
    }
  } else {
    // EXECUTIVE & ATS SINGLE-COLUMN TEMPLATES
    const isAts = template === 'ats';
    const marginX = 46;
    const contentWidth = pageWidth - marginX * 2;
    const bottomMargin = pageHeight - 44;
    let y = 48;

    const ensureSpace = (needed: number) => {
      if (y + needed > bottomMargin) {
        doc.addPage();
        y = 46;
      }
    };

    const accentR = isAts ? 15 : 30;
    const accentG = isAts ? 23 : 58;
    const accentB = isAts ? 42 : 138;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    const nameLines = doc.splitTextToSize(safePdfText(resume.fullName || 'CANDIDATE NAME'), contentWidth) as string[];
    doc.text(nameLines, marginX, y);
    y += nameLines.length * 22;

    if (resume.subtitle.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(71, 85, 105);
      const subLines = doc.splitTextToSize(safePdfText(resume.subtitle), contentWidth) as string[];
      doc.text(subLines, marginX, y + 2);
      y += subLines.length * 13 + 6;
    }

    doc.setDrawColor(accentR, accentG, accentB);
    doc.setLineWidth(isAts ? 1 : 1.75);
    doc.line(marginX, y, marginX + contentWidth, y);
    y += 18;

    const drawSectionHeader = (title: string) => {
      ensureSpace(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(accentR, accentG, accentB);
      doc.text(title, marginX, y);
      y += 5;
      doc.setDrawColor(isAts ? 148 : 203, isAts ? 163 : 213, isAts ? 184 : 225);
      doc.setLineWidth(0.75);
      doc.line(marginX, y, marginX + contentWidth, y);
      y += 15;
    };

    // Professional Summary
    if (resume.summary.trim()) {
      drawSectionHeader('PROFESSIONAL SUMMARY');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      const sumLines = doc.splitTextToSize(safePdfText(resume.summary), contentWidth) as string[];
      for (const line of sumLines) {
        ensureSpace(15);
        doc.text(line, marginX, y);
        y += 14;
      }
      y += 10;
    }

    // Core Skills 2-Column Grid
    const cleanSkills = resume.skills.map((s) => safePdfText(s)).filter(Boolean);
    if (cleanSkills.length > 0) {
      drawSectionHeader('CORE SKILLS & COMPETENCIES');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 41, 59);
      const colGap = 20;
      const colW = (contentWidth - colGap) / 2;

      for (let i = 0; i < cleanSkills.length; i += 2) {
        const leftSkill = cleanSkills[i];
        const rightSkill = cleanSkills[i + 1];
        const leftLines = doc.splitTextToSize(leftSkill, colW - 14) as string[];
        const rightLines = rightSkill ? (doc.splitTextToSize(rightSkill, colW - 14) as string[]) : [];
        const rowLines = Math.max(leftLines.length, rightLines.length, 1);
        ensureSpace(rowLines * 13 + 4);

        doc.setFillColor(accentR, accentG, accentB);
        doc.circle(marginX + 3, y - 3, 1.5, 'F');
        doc.text(leftLines, marginX + 12, y);

        if (rightSkill) {
          doc.circle(marginX + colW + colGap + 3, y - 3, 1.5, 'F');
          doc.text(rightLines, marginX + colW + colGap + 12, y);
        }
        y += rowLines * 13 + 3;
      }
      y += 10;
    }

    // Education
    if (resume.education.trim()) {
      drawSectionHeader('EDUCATION');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(30, 41, 59);
      const eduLines = doc.splitTextToSize(safePdfText(resume.education), contentWidth) as string[];
      for (const line of eduLines) {
        ensureSpace(15);
        doc.text(line, marginX, y);
        y += 14;
      }
      y += 10;
    }

    // Experience & Projects
    if (resume.entries.length > 0) {
      drawSectionHeader('EXPERIENCE & PROJECTS');
      for (const entry of resume.entries) {
        ensureSpace(36);
        const title = safePdfText(entry.title || 'Experience / Project');
        const org = safePdfText(entry.organization);
        const dates = safePdfText(entry.dates);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        const dateWidth = dates ? doc.getTextWidth(dates) + 14 : 0;
        const headingText = org ? `${title} - ${org}` : title;
        const headingLines = doc.splitTextToSize(headingText, contentWidth - dateWidth) as string[];
        doc.text(headingLines, marginX, y);

        if (dates) {
          doc.setFont('courier', 'normal');
          doc.setFontSize(8.8);
          doc.setTextColor(100, 116, 139);
          doc.text(dates, marginX + contentWidth, y, { align: 'right' });
        }
        y += headingLines.length * 13.5 + 3;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.6);
        doc.setTextColor(30, 41, 59);
        for (const bullet of entry.bullets) {
          const cleanB = safePdfText(bullet);
          if (!cleanB) continue;
          const bLines = doc.splitTextToSize(cleanB, contentWidth - 15) as string[];
          ensureSpace(bLines.length * 13.5 + 4);
          doc.setFillColor(71, 85, 105);
          doc.circle(marginX + 4, y - 3, 1.5, 'F');
          doc.text(bLines, marginX + 14, y);
          y += bLines.length * 13.5 + 3;
        }
        y += 8;
      }
    }
  }

  const safeCompany = (companyName || 'company').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const filename = customFilename || `${safeCompany}_tailored_resume.pdf`;
  triggerBlobDownload(doc, filename);
  return filename;
}

export function buildExportResumeFromProfile(input: {
  name: string;
  residence: string;
  citizenship: string;
  degree: string;
  targetRoles: string;
  skills: string;
  cvText: string;
  summaryFallback?: string;
}): ExportResumeData {
  const cleaned = (input.cvText || '')
    .replace(/\uFFFD+/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentSection: 'header' | 'summary' | 'skills' | 'education' | 'experience' = 'header';
  const summaryLines: string[] = [];
  const eduLines: string[] = [];
  const expLines: string[] = [];

  for (const line of lines) {
    const upper = line.replace(/[:\-_=]+$/g, '').trim().toUpperCase();
    if (/^(PROFESSIONAL\s+)?SUMMARY|PROFILE|OBJECTIVE|ABOUT(\s+ME)?$/.test(upper)) {
      currentSection = 'summary';
      continue;
    }
    if (/^(CORE\s+)?SKILLS(\s*&\s*COMPETENCIES)?|TECHNICAL\s+SKILLS|TECHNOLOGIES|COMPETENCIES$/.test(upper)) {
      currentSection = 'skills';
      continue;
    }
    if (/^EDUCATION|ACADEMIC(\s+BACKGROUND)?$/.test(upper)) {
      currentSection = 'education';
      continue;
    }
    if (/^(WORK\s+)?EXPERIENCE|EMPLOYMENT|PROJECTS?|KEY\s+PROJECTS|EXPERIENCE\s*&\s*PROJECTS|INTERNSHIPS?$/.test(upper)) {
      currentSection = 'experience';
      continue;
    }

    if (currentSection === 'summary') {
      summaryLines.push(line);
    } else if (currentSection === 'education') {
      eduLines.push(line);
    } else if (currentSection === 'experience') {
      expLines.push(line);
    } else if (currentSection === 'header' && line.length > 45 && !/@|https?:\/\//i.test(line)) {
      // Unheaded descriptive lines go into experience/background if no section header matched
      expLines.push(line);
    }
  }

  const entries: ExportExperienceEntry[] = [];
  let activeEntry: ExportExperienceEntry | null = null;
  for (const line of expLines) {
    const isBullet = /^[•\-*]\s+/.test(line);
    const cleanLine = line.replace(/^[•\-*]\s*/, '').trim();
    if (!cleanLine) continue;

    if (!isBullet) {
      const headerMatch = cleanLine.match(/^([^|—–(]{3,}?)\s*(?:—|–|\|)\s*([^(\n]{2,}?)(?:\s*\(([^)]+)\))?$/);
      if (headerMatch) {
        activeEntry = {
          title: headerMatch[1].trim(),
          organization: headerMatch[2].trim(),
          dates: (headerMatch[3] || '').trim(),
          bullets: [],
        };
        entries.push(activeEntry);
        continue;
      }
      if (!activeEntry || (cleanLine.length < 85 && activeEntry.bullets.length > 0)) {
        activeEntry = {
          title: cleanLine,
          organization: '',
          dates: '',
          bullets: [],
        };
        entries.push(activeEntry);
        continue;
      }
    }

    if (!activeEntry) {
      activeEntry = {
        title: 'Experience & Technical Background',
        organization: '',
        dates: '',
        bullets: [],
      };
      entries.push(activeEntry);
    }
    activeEntry.bullets.push(cleanLine);
  }

  const parsedSkills = (input.skills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const primaryRole = (input.targetRoles || '')
    .split(',')
    .map((r) => r.trim())
    .find(Boolean);

  const subtitle = [input.residence.trim(), primaryRole, input.citizenship.trim()]
    .filter(Boolean)
    .join(' · ');

  const summary =
    summaryLines.join(' ').trim() ||
    (input.summaryFallback || '').trim() ||
    `${input.degree ? `${input.degree} graduate` : 'Candidate'} targeting ${
      input.targetRoles || 'Software & Engineering'
    } roles with hands-on strengths in ${parsedSkills.slice(0, 6).join(', ') || 'technical delivery'}.`;

  return {
    fullName: input.name.trim() || 'Candidate Name',
    subtitle,
    summary,
    skills: parsedSkills,
    education: eduLines.join(' · ').trim() || input.degree.trim(),
    entries,
  };
}

export function exportCoverLetterToPdf(
  letter: ExportCoverLetterData,
  companyName?: string
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const contentWidth = pageWidth - marginX * 2;
  const bottomMargin = pageHeight - 50;
  let y = 54;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomMargin) {
      doc.addPage();
      y = 54;
    }
  };

  // Sender Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(15, 23, 42);
  doc.text(safePdfText(letter.senderName || 'Candidate Name'), marginX, y);
  y += 18;

  if (letter.senderLocation.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(safePdfText(letter.senderLocation), marginX, y);
    y += 12;
  }

  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(1.5);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 24;

  // Date & Recipient
  if (letter.dateLine.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(safePdfText(letter.dateLine), marginX, y);
    y += 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  doc.text(safePdfText(letter.recipientLine || 'Hiring Team'), marginX, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.text(safePdfText(letter.companyLine || 'Company'), marginX, y);
  y += 22;

  if (letter.subjectLine.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 58, 138);
    const subjLines = doc.splitTextToSize(safePdfText(letter.subjectLine), contentWidth) as string[];
    doc.text(subjLines, marginX, y);
    y += subjLines.length * 14 + 12;
  }

  // Salutation
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(safePdfText(letter.salutation || 'Dear Hiring Team,'), marginX, y);
  y += 20;

  // Body paragraphs
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const paragraphs = safePdfText(letter.body).split(/\n\s*\n/);
  for (const para of paragraphs) {
    const cleanP = para.replace(/\s*\n\s*/g, ' ').trim();
    if (!cleanP) continue;
    const pLines = doc.splitTextToSize(cleanP, contentWidth) as string[];
    for (const line of pLines) {
      ensureSpace(16);
      doc.text(line, marginX, y);
      y += 16;
    }
    y += 10;
  }

  // Closing & Signature
  ensureSpace(45);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(safePdfText(letter.closing || 'Sincerely,'), marginX, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(safePdfText(letter.signature || letter.senderName || 'Candidate Name'), marginX, y);

  const safeCompany = (companyName || 'company').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const filename = `${safeCompany}_cover_letter.pdf`;
  triggerBlobDownload(doc, filename);
  return filename;
}
