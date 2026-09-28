import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, RotateCcw, X } from 'lucide-react';
import { onUi } from '../../lib/uiBus';
import { runUndo } from '../../lib/undo';

type Item = { id: number; level: 'info' | 'success' | 'error'; message: string; undoId?: string };

const STYLES = {
  info: 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100',
  success: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100',
  error: 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-100',
};

const ICONS = { info: Info, success: CheckCircle2, error: AlertCircle };

/** How long an undoable toast stays offering the undo. */
const UNDO_MS = 5000;

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  /** Mirrors every toast into a polite live region for screen readers. */
  const [announcement, setAnnouncement] = useState('');

  useEffect(
    () =>
      onUi(e => {
        if (e.type === 'announce') {
          setAnnouncement(e.message);
          return;
        }
        if (e.type !== 'toast') return;
        const id = Date.now() + Math.random();
        setItems(prev => [...prev.slice(-3), { id, level: e.level, message: e.message, undoId: e.undoId }]);
        setAnnouncement(e.message);
        const ttl = e.undoId ? UNDO_MS : e.level === 'error' ? 7000 : 4000;
        setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), ttl);
      }),
    [],
  );

  return (
    <>
      {/* Always mounted: a live region that appears only when a message arrives is not announced. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only-live">
        {announcement}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 w-[min(92vw,26rem)] pointer-events-none">
          {items.map(item => {
            const Icon = ICONS[item.level];
            return (
              <div
                key={item.id}
                role="status"
                className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lift animate-slide-up text-sm ${STYLES[item.level]}`}
              >
                <Icon size={16} className="mt-0.5 flex-shrink-0" />
                <p className="flex-1 leading-snug">{item.message}</p>
                {item.undoId && (
                  <button
                    onClick={() => {
                      const undoId = item.undoId;
                      setItems(prev => prev.filter(i => i.id !== item.id));
                      void runUndo(undoId);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 -my-0.5 rounded-lg font-semibold text-xs border border-current/30 hover:bg-current/10 transition-colors flex-shrink-0"
                  >
                    <RotateCcw size={11} /> Undo
                  </button>
                )}
                <button
                  onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
                  className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
