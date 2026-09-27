import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CalendarClock, Check, CheckCheck, ClipboardList, Clock, Sparkles } from 'lucide-react';
import { useAlerts, requestNotificationPermission } from '../hooks/useAlerts';
import { usePreferences } from '../hooks/useStore';
import { savePreferences, updateReminder } from '../lib/store';
import { emitUi, toast } from '../lib/uiBus';
import { fmtDateTime, relative } from '../lib/format';

const KIND_ICON = {
  reminder: Clock,
  interview: CalendarClock,
  stale: Bell,
  task: ClipboardList,
  goal: Sparkles,
};

export default function NotificationCenter() {
  const { alerts, unread } = useAlerts();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const enableBrowser = async () => {
    const granted = await requestNotificationPermission();
    savePreferences({ notificationsEnabled: granted });
    toast(
      granted ? 'Browser notifications on — reminders will pop up when due.' : 'Permission denied by the browser.',
      granted ? 'success' : 'error',
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn-ghost btn-icon relative"
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} urgent` : ''}`}
      >
        <Bell size={18} />
        {alerts.length > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white ${
              unread ? 'bg-accent-500' : 'bg-light-500 dark:bg-dark-600'
            }`}
          >
            {alerts.length > 9 ? '9+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] card !bg-light-100 dark:!bg-dark-950 shadow-lift overflow-hidden animate-scale-in z-[100]">
          <div className="flex items-center justify-between px-4 h-12 border-b border-light-300 dark:border-dark-800">
            <p className="text-sm font-semibold text-light-900 dark:text-white">Notifications</p>
            {!prefs.notificationsEnabled && (
              <button onClick={enableBrowser} className="btn-ghost btn-sm !px-2 text-primary-600 dark:text-primary-400">
                <BellOff size={12} /> Enable
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-light-300 dark:divide-dark-800">
            {alerts.length === 0 && (
              <div className="px-4 py-10 text-center">
                <CheckCheck size={26} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm text-light-700 dark:text-dark-200 font-medium">All clear</p>
                <p className="text-xs text-light-500 dark:text-dark-400 mt-1">
                  No due reminders, imminent interviews or quiet applications.
                </p>
              </div>
            )}

            {alerts.map(a => {
              const Icon = KIND_ICON[a.kind];
              return (
                <div key={a.id} className="flex items-start gap-2.5 px-4 py-3 hover:bg-light-200/60 dark:hover:bg-dark-900/60 transition-colors">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      a.urgent ? 'bg-accent-100 dark:bg-accent-950/60 text-accent-600 dark:text-accent-400' : 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300'
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      if (a.applicationId) {
                        emitUi({ type: 'navigate', to: '/dashboard' });
                        emitUi({ type: 'open-application', id: a.applicationId });
                      }
                      setOpen(false);
                    }}
                  >
                    <p className="text-sm font-medium text-light-900 dark:text-white leading-snug">{a.title}</p>
                    <p className="text-xs text-light-600 dark:text-dark-300 leading-snug mt-0.5">{a.detail}</p>
                    <p className="text-[10px] text-light-500 dark:text-dark-500 mt-1" title={fmtDateTime(a.at)}>
                      {relative(a.at)}
                    </p>
                  </button>
                  {a.reminderId && (
                    <button
                      onClick={() => {
                        updateReminder(a.reminderId as string, { done: true });
                        toast('Reminder completed.', 'success');
                      }}
                      className="btn-ghost btn-icon !p-1.5 text-emerald-600 dark:text-emerald-400"
                      title="Mark done"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {alerts.length > 0 && (
            <button
              onClick={() => {
                emitUi({
                  type: 'open-assistant',
                  prompt: 'Look at everything that needs my attention right now and give me a prioritised plan for today.',
                });
                setOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 h-11 border-t border-light-300 dark:border-dark-800 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-colors"
            >
              <Sparkles size={13} /> Ask Scout to prioritise these
            </button>
          )}
        </div>
      )}
    </div>
  );
}
