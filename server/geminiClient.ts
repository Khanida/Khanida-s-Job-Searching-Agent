import { GoogleGenAI, Type } from '@google/genai';
import type { GeminiSkillSuggestion } from '../src/types.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error('Gemini API key is missing or not configured in Settings > Secrets.'),
      { status: 503 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'Gemini request failed.');
  const upper = raw.toUpperCase();
  const statusProp = (err as { status?: number })?.status;

  if (statusProp === 503 && raw.includes('Settings > Secrets')) {
    return { status: 503, message: raw };
  }
  if (upper.includes('API_KEY_INVALID') || upper.includes('PERMISSION_DENIED') || statusProp === 403 || statusProp === 400) {
    return {
      status: statusProp || 400,
      message: 'Gemini rejected the request or API key. Check your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (upper.includes('RESOURCE_EXHAUSTED') || statusProp === 429) {
    return {
      status: 429,
      message: 'Gemini rate limit reached. Please wait a moment and try again.',
    };
  }
  if (upper.includes('NOT_FOUND') || statusProp === 404) {
    return {
      status: 502,
      message: 'Configured Gemini model was not found.',
    };
  }
  return {
    status: typeof statusProp === 'number' && statusProp >= 400 ? statusProp : 502,
    message: raw.slice(0, 260) || 'Unable to parse CV skills with Gemini.',
  };
}

export async function suggestTopSkillsFromCv(params: {
  cvText: string;
  existingSkills: string;
  excludedSkills?: string;
  targetRoles?: string;
}): Promise<GeminiSkillSuggestion[]> {
  const cleanCv = params.cvText.trim().slice(0, 35000);
  if (cleanCv.length < 30) {
    throw Object.assign(
      new Error('Please paste or upload at least a few lines of CV text before requesting Gemini skill suggestions.'),
      { status: 400 }
    );
  }

  const ai = getGeminiClient();

  const existingList = params.existingSkills
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedList = (params.excludedSkills || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const prompt = [
    'Analyze the candidate CV text below and extract the TOP 5 most relevant, concrete technical or domain skills evidenced in the CV.',
    existingList.length
      ? `The candidate already lists these skills on their profile: ${existingList.join(', ')}. Prioritize high-value skills explicitly evidenced in the CV that are MISSING from that list first; if fewer than 5 missing skills exist, include the strongest remaining CV skills to reach 5 items.`
      : 'Return the 5 strongest, most specific skills explicitly evidenced in the CV.',
    excludedList.length ? `Do NOT suggest any of these excluded skills: ${excludedList.join(', ')}.` : '',
    params.targetRoles ? `Target roles context: ${params.targetRoles}` : '',
    'Keep each skill name concise (1 to 4 words, e.g. "Embedded C", "STM32", "RTOS", "PCB Design", "Unit Testing").',
    'Provide a 1-sentence factual reason grounded strictly in the CV text.',
    '',
    '=== CANDIDATE CV TEXT ===',
    cleanCv,
  ]
    .filter(Boolean)
    .join('\n');

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert technical recruiter extracting concise, canonical resume skills grounded strictly in candidate CV text. Never invent unmentioned skills.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: 'Concise canonical skill name (1-4 words).',
                },
                category: {
                  type: Type.STRING,
                  description: 'Short category label such as Language, Embedded, Framework, Tooling, or Domain.',
                },
                reason: {
                  type: Type.STRING,
                  description: 'Short factual sentence citing where this skill appears in the CV.',
                },
              },
              required: ['name', 'category', 'reason'],
            },
          },
        },
      });

      const rawJson = (response.text ?? '[]').trim();
      const parsed = JSON.parse(rawJson) as Array<{
        name?: unknown;
        category?: unknown;
        reason?: unknown;
      }>;

      if (!Array.isArray(parsed)) {
        throw new Error('Unexpected Gemini response format.');
      }

      const excludedSet = new Set(excludedList.map((s) => s.toLowerCase()));
      const seen = new Set<string>();
      const cleaned: GeminiSkillSuggestion[] = [];

      for (const item of parsed) {
        const name = String(item?.name || '').trim().replace(/[,\n\r]+/g, ' ').slice(0, 60);
        if (!name) continue;
        const lower = name.toLowerCase();
        if (seen.has(lower) || excludedSet.has(lower)) continue;
        seen.add(lower);

        cleaned.push({
          name,
          category: String(item?.category || 'Skill').trim().slice(0, 32) || 'Skill',
          reason:
            String(item?.reason || 'Identified from CV experience and projects.')
              .trim()
              .slice(0, 220),
        });
        if (cleaned.length >= 5) break;
      }

      return cleaned;
    } catch (err) {
      lastErr = err;
      const mapped = formatGeminiError(err);
      if (mapped.status === 400 || mapped.status === 403 || mapped.status === 404 || mapped.status === 503) {
        throw Object.assign(new Error(mapped.message), { status: mapped.status });
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  const mapped = formatGeminiError(lastErr);
  throw Object.assign(new Error(mapped.message), { status: mapped.status });
}
