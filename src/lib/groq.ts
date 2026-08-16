// Groq's chat completions API is OpenAI-compatible, so a plain fetch is all
// that's needed — no SDK dependency for a single call site.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile is decommissioned on Groq as of 2026-08-16 — moved
// to gpt-oss-20b (cheaper and faster than gpt-oss-120b, same family already
// proven for the harder resume-scoring task in Recruitment-Portal).
const GROQ_MODEL = 'openai/gpt-oss-20b';

export interface MoMStructured {
  agenda: string[];
  discussion: { title: string; points: string[] }[];
}

const SYSTEM_PROMPT = `You write Minutes of Meeting for a college tech club (AWS Student Builder Group). You will be given raw, messy notes/transcript from a meeting (a "scribe") and must extract a clean structure from it.

Return ONLY valid JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "agenda": ["short agenda item", ...],
  "discussion": [
    { "title": "Short Section Title", "points": ["key point discussed", "decision or deadline mentioned", ...] },
    ...
  ]
}

Rules:
- "agenda" is a short list (3-8 items) of what the meeting was meant to cover, inferred from the notes.
- "discussion" breaks the notes into 2-6 logical sections (e.g. by topic/agenda item). Each section has a short title and 2-6 bullet points capturing decisions, action items, deadlines, and key discussion — written in clear, formal, third-person minutes style, not copied verbatim from casual notes.
- Never invent attendee names, dates, or facts not present in the notes.
- If the notes are too sparse for a section, omit it rather than padding with filler.

Sometimes, instead of raw notes, you'll be given a JSON object: { "scribeNotes": "...", "currentDraft": { ...same shape as your output... }, "requestedChanges": "..." }. In that case, revise "currentDraft" according to "requestedChanges", staying grounded in "scribeNotes" — don't invent anything the changes didn't ask for and the notes don't support. Still return only the same { agenda, discussion } JSON shape.`;

function parseGroqResponse(content: string): MoMStructured {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Groq returned malformed JSON');
  }
  return {
    agenda: Array.isArray(parsed.agenda) ? parsed.agenda.filter(Boolean) : [],
    discussion: Array.isArray(parsed.discussion)
      ? parsed.discussion
          .filter((d: any) => d && d.title)
          .map((d: any) => ({ title: String(d.title), points: Array.isArray(d.points) ? d.points.filter(Boolean).map(String) : [] }))
      : [],
  };
}

async function callGroq(userContent: string): Promise<MoMStructured> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response');
  return parseGroqResponse(content);
}

export async function generateMoMStructure(scribeRaw: string): Promise<MoMStructured> {
  return callGroq(scribeRaw);
}

// Second+ pass: re-runs the same prompt with the previous draft and the
// user's requested edits, instead of starting over from raw notes — keeps
// revisions grounded in what's already been generated.
export async function reviseMoMStructure(scribeRaw: string, currentDraft: MoMStructured, requestedChanges: string): Promise<MoMStructured> {
  return callGroq(JSON.stringify({ scribeNotes: scribeRaw, currentDraft, requestedChanges }));
}
