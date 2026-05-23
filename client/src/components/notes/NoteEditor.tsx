import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Note, ExtractedTask, SummaryResult, Priority, Section } from '../../types';
import { api } from '../../api';
import { Spinner } from '../ui/Spinner';
import { Modal } from '../ui/Modal';
import { SectionSelector } from '../sections/SectionSelector';

interface NoteEditorProps {
  note: Note;
  sections: Section[];
  onUpdate: (id: number, data: Partial<Note>) => Promise<Note>;
  onTasksAdded: () => void;
  onNoteUpdated: (id: number, updates: { title: string; summary: string | null; section_id: number | null }) => void;
  onCreateSection: (name: string, color: string) => Promise<Section>;
}

function ExtractedTasksModal({ tasks, onConfirm, onClose }: {
  tasks: ExtractedTask[];
  onConfirm: (tasks: ExtractedTask[]) => Promise<void>;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(tasks.map(() => true));
  const [editable, setEditable] = useState<ExtractedTask[]>(tasks.map(t => ({ ...t, subtasks: [...(t.subtasks ?? [])] })));
  const [saving, setSaving] = useState(false);

  const updateTask = (i: number, patch: Partial<ExtractedTask>) =>
    setEditable(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  const handleConfirm = async () => {
    const toAdd = editable.filter((_, i) => checked[i]);
    if (toAdd.length === 0) { onClose(); return; }
    setSaving(true);
    try { await onConfirm(toAdd); } finally { setSaving(false); }
  };

  if (tasks.length === 0) {
    return (
      <Modal title="Extract Tasks" onClose={onClose} footer={<button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600">Close</button>}>
        <p className="text-gray-500 dark:text-gray-400 text-center py-4">No tasks detected in this note.</p>
      </Modal>
    );
  }

  const inputCls = 'border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:bg-zinc-800 dark:border-gray-600 dark:text-gray-100';

  return (
    <Modal
      title={`Found ${tasks.length} task${tasks.length > 1 ? 's' : ''} in this note`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
          <button onClick={handleConfirm} disabled={saving || checked.every(c => !c)} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Adding...' : `Add ${checked.filter(Boolean).length} Task${checked.filter(Boolean).length !== 1 ? 's' : ''}`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {editable.map((task, i) => (
          <div key={i} className={`p-3 rounded border transition-colors
            ${checked[i] ? 'border-teal-200 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-zinc-800/30'}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={checked[i]} onChange={() => setChecked(prev => prev.map((c, idx) => idx === i ? !c : c))} className="mt-1 accent-teal-600 cursor-pointer" />
              <div className="flex-1 space-y-2">
                <input value={task.title} onChange={e => updateTask(i, { title: e.target.value })}
                  className={`w-full text-sm ${inputCls}`} />
                <div className="flex gap-2">
                  <select value={task.priority} onChange={e => updateTask(i, { priority: e.target.value as Priority })}
                    className={`text-xs ${inputCls}`}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <input type="date" value={task.deadline ?? ''} onChange={e => updateTask(i, { deadline: e.target.value || null })}
                    className={`text-xs ${inputCls}`} />
                </div>
                {task.subtasks.length > 0 && (
                  <div className="pl-2 border-l-2 border-teal-200 dark:border-teal-700 space-y-1">
                    {task.subtasks.map((sub, si) => (
                      <div key={si} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-300 dark:bg-teal-500 flex-shrink-0" />
                        <input
                          value={sub}
                          onChange={e => {
                            const subs = [...task.subtasks];
                            subs[si] = e.target.value;
                            updateTask(i, { subtasks: subs });
                          }}
                          className={`flex-1 text-xs ${inputCls}`}
                        />
                        <button onClick={() => updateTask(i, { subtasks: task.subtasks.filter((_, j) => j !== si) })}
                          className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function nodeToMarkdown(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'ul' || tag === 'ol') {
    const indent = '  '.repeat(depth);
    let result = '';
    let itemIndex = 1;
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() !== 'li') continue;
      const prefix = tag === 'ol' ? `${itemIndex}. ` : '- ';
      let lineText = '';
      let nested = '';
      for (const n of Array.from(child.childNodes)) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const t = (n as Element).tagName.toLowerCase();
          if (t === 'ul' || t === 'ol') nested += nodeToMarkdown(n, depth + 1);
          else lineText += n.textContent ?? '';
        } else {
          lineText += n.textContent ?? '';
        }
      }
      lineText = lineText.trim();
      if (lineText) result += `${indent}${prefix}${lineText}\n`;
      if (nested) result += nested;
      itemIndex++;
    }
    return result;
  }

  const children = Array.from(node.childNodes).map(n => nodeToMarkdown(n, depth)).join('');
  if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag)) {
    const trimmed = children.trim();
    return trimmed ? trimmed + '\n' : '';
  }
  if (tag === 'br') return '\n';
  return children;
}

export function NoteEditor({ note, sections, onUpdate, onTasksAdded, onNoteUpdated, onCreateSection }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [sectionId, setSectionId] = useState<number | null>(note.section_id);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setSectionId(note.section_id);
    if (note.summary) {
      try { setSummaryResult(JSON.parse(note.summary)); } catch { setSummaryResult(null); }
    } else {
      setSummaryResult(null);
    }
    setAiError(null);
  }, [note.id]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const save = useCallback(async (newTitle: string, newContent: string, newSectionId: number | null) => {
    setSaving(true);
    try {
      const updated = await onUpdate(note.id, { title: newTitle, content: newContent, section_id: newSectionId });
      onNoteUpdated(note.id, { title: updated.title, summary: updated.summary, section_id: updated.section_id });
      if (updated.summary === null && summaryResult !== null) setSummaryResult(null);
    } finally {
      setSaving(false);
    }
  }, [note.id, onUpdate, onNoteUpdated, summaryResult]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (title !== note.title || content !== note.content) save(title, content, sectionId);
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content]);

  const handleSectionChange = (newSectionId: number | null) => {
    setSectionId(newSectionId);
    save(title, content, newSectionId);
  };

  const handleSummarize = async () => {
    setAiError(null);
    setSummarizing(true);
    try {
      const result = await api.ai.summarize(note.id);
      setSummaryResult(result);
      onNoteUpdated(note.id, { title, summary: JSON.stringify(result), section_id: sectionId });
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setSummarizing(false);
    }
  };

  const handleExtract = async () => {
    setAiError(null);
    setExtracting(true);
    try {
      const result = await api.ai.extractTasks(note.id);
      setExtractedTasks(result.tasks);
    } catch (e: any) {
      setAiError(e.message);
      setExtractedTasks(null);
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmTasks = async (tasks: ExtractedTask[]) => {
    await api.ai.confirmTasks(note.id, tasks);
    setExtractedTasks(null);
    onTasksAdded();
    showToast(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} added`);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('ul, ol')) return;

    e.preventDefault();
    const markdown = nodeToMarkdown(doc.body, 0).trim();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = content.slice(0, start) + markdown + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + markdown.length;
    });
  }, [content]);

  const contentTooShort = content.trim().length < 50;

  return (
    <div className="flex flex-col h-full relative">
      {toast && (
        <div className="absolute top-4 right-4 z-40 bg-green-600 text-white px-4 py-2 rounded shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="px-6 pt-5 pb-2 flex items-start gap-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-xl font-bold text-gray-900 dark:text-gray-100 border-none outline-none bg-transparent"
          placeholder="Note title..."
        />
      </div>

      <div className="px-6 pb-2">
        <SectionSelector sections={sections} value={sectionId} onChange={handleSectionChange} onCreateSection={onCreateSection} />
      </div>

      <div className="flex items-center gap-1 px-6 pb-2 border-b border-gray-200 dark:border-zinc-800/60">
        <button onClick={() => setTab('edit')} className={`px-3 py-1 text-sm rounded-md font-medium ${tab === 'edit' ? 'bg-gray-200 text-gray-800 dark:bg-zinc-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>Edit</button>
        <button onClick={() => setTab('preview')} className={`px-3 py-1 text-sm rounded-md font-medium ${tab === 'preview' ? 'bg-gray-200 text-gray-800 dark:bg-zinc-800 dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>Preview</button>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{saving ? 'Saving...' : 'Auto-saved'}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'edit' ? (
          <textarea value={content} onChange={e => setContent(e.target.value)} onPaste={handlePaste}
            className="w-full h-full min-h-64 text-sm text-gray-700 dark:text-gray-200 border-none outline-none resize-none font-mono leading-relaxed bg-transparent"
            placeholder="Write your note here... (Markdown supported)" />
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {content ? <ReactMarkdown>{content}</ReactMarkdown> : <p className="text-gray-400 dark:text-gray-500 italic">Nothing to preview.</p>}
          </div>
        )}
      </div>

      {aiError && (
        <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">{aiError}</div>
      )}

      {summaryResult && (
        <div className="mx-6 mb-3 p-4 bg-teal-50 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-800 rounded">
          <h4 className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase mb-1">AI Summary</h4>
          <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">{summaryResult.summary}</p>
          <ul className="space-y-0.5">
            {summaryResult.keyPoints.map((kp, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex gap-1"><span className="text-teal-400">â€¢</span>{kp}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-6 pb-4 flex gap-2 border-t border-gray-200 dark:border-zinc-800/60 pt-3">
        <button onClick={handleSummarize} disabled={summarizing || contentTooShort}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40"
          title={contentTooShort ? 'Note too short to summarize' : undefined}>
          {summarizing ? <Spinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          )}
          {summaryResult ? 'Re-summarize' : 'Summarize'}
        </button>
        <button onClick={handleExtract} disabled={extracting || contentTooShort}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          title={contentTooShort ? 'Note too short for task extraction' : undefined}>
          {extracting ? <Spinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          )}
          Extract Tasks
        </button>
      </div>

      {extractedTasks !== null && (
        <ExtractedTasksModal tasks={extractedTasks} onConfirm={handleConfirmTasks} onClose={() => setExtractedTasks(null)} />
      )}
    </div>
  );
}

