import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useSections } from '../../hooks/useSections';
import { useTasksContext } from '../../context/TasksContext';
import { useCreatePlanning } from '../../hooks/usePlannings';
import { formatPlanningDate, mondayOf } from '../../utils/planning';
import { localDateStr } from '../../utils/habitStats';

const inputCls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const hintCls = 'text-xs text-gray-400 dark:text-gray-500 mt-1';

interface NewPlanningModalProps {
  initialSectionId?: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function NewPlanningModal({ initialSectionId = null, onClose, onCreated }: NewPlanningModalProps) {
  const { sections } = useSections();
  const { tasks } = useTasksContext();
  const createPlanning = useCreatePlanning();
  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState<number | null>(initialSectionId);
  const [startDate, setStartDate] = useState(() => localDateStr());
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState('');

  // Mirrors the server import: every task of the section, active and done.
  const sectionTasks = sectionId == null ? [] : tasks.filter(t => t.section_id === sectionId);
  const withoutDeadline = sectionTasks.filter(t => !t.deadline).length;
  const monday = startDate ? mondayOf(startDate) : null;

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!startDate) { setError('Start date is required'); return; }
    setError('');
    try {
      const planning = await createPlanning.mutateAsync({
        name: name.trim(), sectionId, startDate, targetDate: targetDate || null,
      });
      onCreated(planning.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the planning');
    }
  };

  return (
    <Modal
      title="New Planning"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-3 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
          <button onClick={handleSubmit} disabled={createPlanning.isPending} className="px-4 py-3 min-h-[44px] bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 cursor-pointer active:opacity-90">
            {createPlanning.isPending ? 'Creating...' : 'Create Planning'}
          </button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void handleSubmit(); }}>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <div>
          <label htmlFor="planning-name" className={labelCls}>Name *</label>
          <input id="planning-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={200}
            className={inputCls} placeholder="e.g. Q1 roadmap" />
        </div>

        <div>
          <label htmlFor="planning-source" className={labelCls}>Source</label>
          <select id="planning-source" value={sectionId ?? ''} className={inputCls}
            onChange={e => setSectionId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">No section (start empty)</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {sectionId != null && (
            <p className="text-xs text-teal-700 dark:text-teal-400 mt-1">
              {sectionTasks.length === 0
                ? 'This section has no tasks yet. The planning will start empty.'
                : `${plural(sectionTasks.length, 'task')} will be imported${withoutDeadline ? ` (${withoutDeadline} without deadline)` : ''}`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="planning-start" className={labelCls}>Start date *</label>
            <input id="planning-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
            <p className={hintCls}>
              {monday && monday !== startDate ? `Snaps to Monday ${formatPlanningDate(monday)}` : 'Weeks start on Monday'}
            </p>
          </div>
          <div>
            <label htmlFor="planning-target" className={labelCls}>Target date</label>
            <input id="planning-target" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={inputCls} />
            <p className={hintCls}>Optional. Weeks are labelled S-n until this date</p>
          </div>
        </div>
        {/* Lets Enter submit from any field */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
