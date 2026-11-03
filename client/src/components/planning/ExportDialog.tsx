import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Spinner } from '../ui/Spinner';
import { useExportPlanning, readExportLang, type ExportLang } from '../../hooks/usePlannings';

interface ExportDialogProps {
  planningId: number;
  owners: string[];
  /** Owner currently filtered in the view; preselected when it is a real owner. */
  initialOwner?: string;
  onError: (message: string) => void;
  onClose: () => void;
}

const ALL = '';
const fieldCls = 'w-full border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export function ExportDialog({ planningId, owners, initialOwner, onError, onClose }: ExportDialogProps) {
  const exportPlanning = useExportPlanning();
  const [lang, setLang] = useState<ExportLang>(readExportLang);
  const [owner, setOwner] = useState(initialOwner && owners.includes(initialOwner) ? initialOwner : ALL);
  const [includeDone, setIncludeDone] = useState(true);

  const download = async () => {
    try {
      await exportPlanning.mutateAsync({ id: planningId, options: { lang, owner: owner || undefined, includeDone } });
      onClose();
    } catch (e) {
      onError(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed');
    }
  };

  return (
    <Modal
      title="Export to Excel"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
          <button onClick={download} disabled={exportPlanning.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-70 cursor-pointer">
            {exportPlanning.isPending ? <Spinner size="sm" /> : <DownloadIcon />}
            {exportPlanning.isPending ? 'Preparing…' : 'Download'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className={labelCls}>Language</legend>
          <div className="flex gap-2">
            {([['fr', 'Français'], ['en', 'English']] as const).map(([value, label]) => (
              <label key={value}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer
                  ${lang === value ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300' : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}>
                <input type="radio" name="export-lang" value={value} checked={lang === value} onChange={() => setLang(value)} className="accent-teal-600" />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Month names and column headers.</p>
        </fieldset>

        <div>
          <label htmlFor="export-owner" className={labelCls}>Owner</label>
          <select id="export-owner" value={owner} onChange={e => setOwner(e.target.value)} className={fieldCls}>
            <option value={ALL}>All</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Include done items
        </label>
      </div>
    </Modal>
  );
}

export function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
    </svg>
  );
}
