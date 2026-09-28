import { Check } from 'lucide-react';
import { ACCENTS } from '../../lib/accent';
import { useTheme } from '../../context/ThemeContext';

/** Swatch row for the runtime accent palettes. */
export default function AccentPicker({ compact = false }: { compact?: boolean }) {
  const { accent, setAccent } = useTheme();

  return (
    <div className="flex flex-wrap gap-2">
      {ACCENTS.map(preset => {
        const active = accent === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => setAccent(preset.id)}
            aria-pressed={active}
            title={preset.hint}
            className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all ${
              active
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/40 shadow-soft'
                : 'border-light-300 dark:border-dark-700 hover:border-primary-300'
            }`}
          >
            <span
              className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${preset.gradient[0]}, ${preset.gradient[1]} 60%, ${preset.gradient[2]})`,
              }}
            >
              {active && <Check size={13} strokeWidth={3} className="text-white drop-shadow" />}
            </span>
            {!compact && (
              <span className="text-left min-w-0">
                <span className="block text-xs font-semibold text-light-900 dark:text-white">{preset.label}</span>
                <span className="block text-[10px] text-light-500 dark:text-dark-400 truncate max-w-[9rem]">{preset.hint}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
