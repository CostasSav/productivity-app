import { useState } from 'react';
import type { Task, Priority, TaskStatus, RecurrenceType, Section } from '../../types';
import { Modal } from '../ui/Modal';
import { SectionSelector } from '../sections/SectionSelector';

interface TaskFormProps {
  initial?: Partial<Task>;
  sections: Section[];
  onSave: (data: Partial<Task>) => Promise<unknown>;
  onClose: () => void;
  onCreateSection: (name: string, color: string) => Promise<Section>;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function nextWeekdayDate(dayIndex: number): string {
  const today = new Date();
  const todayJs = today.getDay();
  const targetJs = dayIndex === 6 ? 0 : dayIndex + 1;
  let diff = (targetJs - todayJs + 7) % 7;
  if (diff === 0) diff = 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

const inputCls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export function TaskForm({ initial, sections, onSave, onClose, onCreateSection }: TaskFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [sectionId, setSectionId] = useState<number | null>(initial?.section_id ?? null);
  const [recurrence, setRecurrence] = useState<RecurrenceType | ''>(initial?.recurrence ?? '');
  const [recurrenceDay, setRecurrenceDay] = useState<number | null>(initial?.recurrence_day ?? null);
  const [recurrenceTime, setRecurrenceTime] = useState(initial?.recurrence_time ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecurrenceTypeChange = (type: RecurrenceType | '') => {
    setRecurrence(type);
    if (type === 'weekly') {
      const day = recurrenceDay ?? 4;
      setRecurrenceDay(day);
      if (!deadline) setDeadline(nextWeekdayDate(day));
    } else if (type === 'monthly') {
      setRecurrenceDay(recurrenceDay ?? 1);
    } else {
      setRecurrenceDay(null);
    }
  };

  const handleDayClick = (i: number) => {
    setRecurrenceDay(i);
    setDeadline(nextWeekdayDate(i));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    if (recurrence && !deadline) { setError('A deadline is required for recurring tasks'); return; }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        deadline: deadline || null,
        section_id: sectionId,
        recurrence: recurrence || null,
        recurrence_day: recurrenceDay,
        recurrence_time: recurrenceTime.trim() || null,
      });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!initial?.id;

  return (
    <Modal
      title={isEdit ? 'Edit Task' : 'New Task'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-3 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-3 min-h-[44px] bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 cursor-pointer active:opacity-90">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Task'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <div>
          <label className={labelCls}>Title *</label>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="What needs to be done?" />
        </div>

        <div>
          <label className={labelCls}>Section</label>
          <SectionSelector sections={sections} value={sectionId} onChange={setSectionId} onCreateSection={onCreateSection} />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Optional details..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)} className={inputCls}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} className={inputCls}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>{recurrence ? 'First deadline' : 'Deadline'}</label>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} />
        </div>

        <div className="border border-gray-200 dark:border-gray-600 rounded p-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Recurrence</label>
            <span className="text-xs text-gray-400 dark:text-gray-500">auto-renews when done</span>
          </div>
          <div className="flex gap-2">
            {(['', 'daily', 'weekly', 'monthly'] as const).map(t => (
              <button key={t} type="button" onClick={() => handleRecurrenceTypeChange(t as RecurrenceType | '')}
                className={`px-3 py-2.5 min-h-[44px] rounded-md text-xs font-medium capitalize transition-colors active:scale-95
                  ${recurrence === t ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
                {t === '' ? 'None' : t}
              </button>
            ))}
          </div>
          {recurrence === 'weekly' && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Repeat on</p>
              <div className="flex gap-1.5">
                {DAYS.map((day, i) => (
                  <button key={day} type="button" onClick={() => handleDayClick(i)}
                    className={`w-11 h-11 rounded-full text-xs font-medium transition-colors active:scale-95
                      ${recurrenceDay === i ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
          {recurrence === 'monthly' && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Day of month</p>
              <input type="number" min={1} max={31} value={recurrenceDay ?? 1}
                onChange={e => setRecurrenceDay(Number(e.target.value))}
                className="w-20 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
            </div>
          )}
          {recurrence && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Time of day (optional)</p>
              <input value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)}
                className={inputCls}
                placeholder='e.g. "afternoon" or "09:00"' />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

