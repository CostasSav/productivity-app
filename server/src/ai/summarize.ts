import { anthropic } from './client';
import { db } from '../db/database';

const BASE_SYSTEM_PROMPT = `You are a precise note summarizer for a personal productivity app.
Produce a JSON response with this exact shape:
{
  "summary": "1-3 sentence overview of the note",
  "keyPoints": ["bullet 1", "bullet 2", "bullet 3"]
}
Rules:
- summary must be concise and capture the main idea
- keyPoints: 3-5 items maximum, each under 80 characters
- Preserve any action items or deadlines mentioned in keyPoints
- Respond with JSON only, no markdown fences, no preamble`;

function buildSystemPrompt(): string {
  const titles = db.getNoteTitles();
  const noteList = titles.length > 0 ? titles.map(t => `- ${t}`).join('\n') : '(no notes yet)';
  return `${BASE_SYSTEM_PROMPT}

For reference, the user's existing notes are:
${noteList}`;
}

function logCacheStats(usage: { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; input_tokens: number }, feature: string) {
  console.log(`[AI:${feature}] tokens — write:${usage.cache_creation_input_tokens ?? 0} read:${usage.cache_read_input_tokens ?? 0} uncached:${usage.input_tokens}`);
}

export async function summarizeNote(noteContent: string): Promise<{ summary: string; keyPoints: string[] }> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Summarize this note:\n\n${noteContent}`,
      },
    ],
  });

  logCacheStats(response.usage, 'summarize');
  const raw = response.content.find(b => b.type === 'text')?.text ?? '{}';
  const text = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(text);
}
