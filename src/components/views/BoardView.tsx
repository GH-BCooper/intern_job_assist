import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Application, InterviewDate } from '../../lib/supabase';
import { STAGES, STAGE_META, stageOf, stagePatch, type Stage } from '../../lib/insights';
import { setStage } from '../../lib/store';
import { useStore } from '../../hooks/useStore';
import { useData } from '../../context/DataContext';
import { toast } from '../../lib/uiBus';
import ApplicationCard from '../ApplicationCard';

type Props = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onOpen: (app: Application) => void;
  onAdd: () => void;
};

export default function BoardView({ applications, interviewsMap, onOpen, onAdd }: Props) {
  const store = useStore();
  const { updateApplication } = useData();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  const columns = STAGES.map(stage => ({
    stage,
    items: applications.filter(a => stageOf(a, store.stageOverrides) === stage),
  }));

  const drop = async (stage: Stage) => {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (!id) return;
    const app = applications.find(a => a.id === id);
    if (!app || stageOf(app, store.stageOverrides) === stage) return;
    setStage(id, stage);
    try {
      await updateApplication(id, stagePatch(stage, app));
      toast(`${app.company_name} → ${stage}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the move.', 'error');
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x">
      {columns.map(({ stage, items }) => (
        <section
          key={stage}
          onDragOver={e => {
            e.preventDefault();
            setOverStage(stage);
          }}
          onDragLeave={() => setOverStage(s => (s === stage ? null : s))}
          onDrop={() => void drop(stage)}
          className={`flex-shrink-0 w-[19rem] snap-start rounded-2xl border transition-colors ${
            overStage === stage
              ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-950/20'
              : 'border-light-300 dark:border-dark-800 bg-light-100/60 dark:bg-dark-900/40'
          }`}
        >
          <header className="flex items-center gap-2 px-3.5 h-12 border-b border-light-300 dark:border-dark-800">
            <span className={`w-2 h-2 rounded-full ${STAGE_META[stage].dot}`} />
            <h3 className="text-sm font-semibold text-light-900 dark:text-white">{stage}</h3>
            <span className="badge bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300">{items.length}</span>
            {stage === 'Wishlist' && (
              <button onClick={onAdd} className="ml-auto btn-ghost btn-icon !p-1" title="Add application">
                <Plus size={14} />
              </button>
            )}
          </header>

          <div className="p-2.5 space-y-2.5 min-h-[8rem] max-h-[calc(100vh-20rem)] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-[11px] text-light-500 dark:text-dark-500 px-1.5 py-6 text-center leading-relaxed">
                {STAGE_META[stage].hint}
                <br />
                <span className="opacity-70">Drag cards here.</span>
              </p>
            ) : (
              items.map(app => (
                <div
                  key={app.id}
                  draggable
                  onDragStart={() => setDragId(app.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  className={`transition-opacity ${dragId === app.id ? 'opacity-40' : ''}`}
                >
                  <ApplicationCard
                    application={app}
                    interviews={interviewsMap[app.id] || []}
                    onClick={() => onOpen(app)}
                    compact
                  />
                </div>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
