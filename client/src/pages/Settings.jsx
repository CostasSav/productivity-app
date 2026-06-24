import { useState, useEffect } from 'react';
import { useGratitude, useUpdateGratitudeSettings } from '../hooks/useGratitude';
import { Spinner } from '../components/ui/Spinner';

export function Settings() {
  const { settings: querySettings } = useGratitude();
  const updateSettingsMutation = useUpdateGratitudeSettings();
  const [settings, setSettings] = useState(null);
  const [savedLabel, setSavedLabel] = useState('');
  const [resetStep, setResetStep] = useState(0); // 0=idle, 1=confirm, 2=done

  // Populate local settings from cache on first load
  useEffect(() => {
    if (querySettings && !settings) setSettings(querySettings);
  }, [querySettings]);

  const saving = updateSettingsMutation.isPending;

  const save = async (updates) => {
    try {
      const updated = await updateSettingsMutation.mutateAsync(updates);
      setSettings(updated);
      setSavedLabel('Saved');
      setTimeout(() => setSavedLabel(''), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetConfirm = async () => {
    await save({ resetStreak: true });
    setResetStep(2);
    setTimeout(() => setResetStep(0), 3000);
  };

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Settings</h1>

      {/* Gratitude section */}
      <section className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl overflow-hidden mb-6">
        <div className="px-5 pt-5 pb-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Gratitude journal</p>
        </div>

        {/* Reminder toggle */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800/60">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Evening reminder</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Browser notification to start your gratitude ritual</p>
          </div>
          <button
            onClick={() => save({ reminderEnabled: !settings.reminderEnabled })}
            disabled={saving}
            aria-label={settings.reminderEnabled ? 'Disable reminder' : 'Enable reminder'}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 ${
              settings.reminderEnabled ? 'bg-teal-500' : 'bg-gray-200 dark:bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                settings.reminderEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Reminder time */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800/60 transition-opacity duration-200 ${
          settings.reminderEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Reminder time</p>
          <input
            type="time"
            value={settings.reminderTime}
            onChange={e => setSettings(s => ({ ...s, reminderTime: e.target.value }))}
            onBlur={e => save({ reminderTime: e.target.value })}
            className="text-sm font-mono bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded px-2.5 py-1.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800/60">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Current streak</p>
          <p className="text-sm font-semibold text-orange-500 dark:text-orange-400">
            {settings.currentStreak} {settings.currentStreak === 1 ? 'day' : 'days'} {settings.currentStreak > 0 ? '🔥' : ''}
          </p>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800/60">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Longest streak</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {settings.longestStreak} {settings.longestStreak === 1 ? 'day' : 'days'}
          </p>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800/60">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Total entries</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{settings.totalEntries}</p>
        </div>

        {/* Reset streak */}
        <div className="px-5 py-4">
          {resetStep === 0 && (
            <button
              onClick={() => setResetStep(1)}
              className="text-xs text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              Reset current streak
            </button>
          )}
          {resetStep === 1 && (
            <div className="flex items-center gap-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400">Reset streak to 0?</p>
              <button
                onClick={handleResetConfirm}
                disabled={saving}
                className="text-xs font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
              >
                Yes, reset
              </button>
              <button
                onClick={() => setResetStep(0)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          {resetStep === 2 && (
            <p className="text-xs text-teal-500 dark:text-teal-400">Streak reset to 0.</p>
          )}
        </div>
      </section>

      {/* Notification permission hint */}
      {'Notification' in window && Notification.permission === 'denied' && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 mb-6">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Notifications are blocked in your browser. To enable reminders, allow notifications for this site in your browser settings.
          </p>
        </div>
      )}

      {savedLabel && (
        <p className="text-xs text-center text-teal-500 dark:text-teal-400 mt-2">{savedLabel}</p>
      )}
    </div>
  );
}
