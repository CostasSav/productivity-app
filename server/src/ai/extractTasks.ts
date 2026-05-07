import { anthropic } from './client';

const SYSTEM_PROMPT = `You are a task extraction engine for a personal productivity app.
Read a note and identify tasks, action items, and to-dos.

Return JSON in this exact shape:
{
  "tasks": [
    {
      "title": "short parent task title, max 80 chars",
      "priority": "low|medium|high",
      "deadline": "YYYY-MM-DD or null",
      "subtasks": ["subtask title 1", "subtask title 2"]
    }
  ]
}

Rules:
- Extract items the author needs to do
- Look for: "need to", "must", "should", "TODO", action verbs (call, email, review, fix, send, prepare, schedule, follow up)
- Infer deadlines from relative phrases ("by Friday", "end of month", "next week") using today's date provided in the message
- Priority: high=urgent language or near deadline, medium=default, low=vague or optional
- Grouping into subtasks: when multiple action items clearly belong to the same broader task, make the broader task the parent and list the specific steps as subtasks (2–5 subtasks max). Only group when there is a clear common goal.
- Simple standalone tasks have subtasks: []
- Do NOT invent tasks not implied by the text
- If no tasks found, return tasks: []
- JSON only, no markdown fences, no preamble`;

export interface ExtractedTask {
  title: string;
  priority: 'low' | 'medium' | 'high';
  deadline: string | null;
  subtasks: string[];
}

function logCacheStats(usage: { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null; input_tokens: number }, feature: string) {
  console.log(`[AI:${feature}] tokens — write:${usage.cache_creation_input_tokens ?? 0} read:${usage.cache_read_input_tokens ?? 0} uncached:${usage.input_tokens}`);
}

export async function extractTasksFromNote(noteContent: string): Promise<{ tasks: ExtractedTask[] }> {
  const today = new Date().toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Today's date: ${today}\n\nExtract tasks from this note:\n\n${noteContent}`,
      },
    ],
  });

  logCacheStats(response.usage, 'extract-tasks');

  const raw = response.content.find(b => b.type === 'text')?.text ?? '{"tasks":[]}';
  const text = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(text);
}
