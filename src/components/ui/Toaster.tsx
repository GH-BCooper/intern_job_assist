import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { onUi } from '../../lib/uiBus';

type Item = { id: number; level: 'info' | 'success' | 'error'; message: string };

const STYLES = {
  info: 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-100',
  success: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100',
  error: 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/60 text-red-900 dark:text-red-100',
};

const ICONS = { info: Info, success: CheckCircle2, error: AlertCircle };

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(
    () =>
      onUi(e => {
        if (e.type !== 'toast') return;
        const id = Date.now() + Math.random();
        setItems(prev => [...prev.slice(-3), { id, level: e.level, message: e.message }]);
        setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), e.level === 'error' ? 7000 : 4000);
      }),
    [],
  );

  if (!items.length) return null;

  return (
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
            <button
              onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
