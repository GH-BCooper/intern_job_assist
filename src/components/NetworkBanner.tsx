import { useEffect, useRef, useState } from 'react';
import { UploadCloud, RefreshCw, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { emitUi, toast } from '../lib/uiBus';
import { flush, onOutboxChange, type OutboxItem } from '../lib/outbox';

/**
 * Connection state and the offline write queue.
 *
 * The banner used to only warn that changes would not save. Now writes are
 * queued in IndexedDB instead of failing, so this reports how many are waiting
 * and offers to push them the moment the connection is back.
 */
export default function NetworkBanner() {
  const online = useOnlineStatus();
  const wasOffline = useRef(false);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => onOutboxChange(setPending), []);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast('Back online — refreshing your data…', 'success');
      emitUi({ type: 'refresh' });
    }
  }, [online]);

  const sync = async () => {
    setSyncing(true);
    const { sent, failed } = await flush();
    setSyncing(false);
    if (sent) {
      toast(`Synced ${sent} queued change${sent === 1 ? '' : 's'}.`, 'success');
      emitUi({ type: 'refresh' });
    }
    if (failed) toast(`${failed} change${failed === 1 ? '' : 's'} still waiting.`, 'error');
  };

  if (online && !pending.length) return null;

  if (!online) {
    return (
      <div
        role="status"
        className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-amber-500 text-white text-xs font-semibold shadow-lift animate-fade-in max-w-[min(92vw,22rem)]"
      >
        <WifiOff size={14} className="flex-shrink-0" />
        {pending.length
          ? `Offline — ${pending.length} change${pending.length === 1 ? '' : 's'} queued, they'll sync on reconnect`
          : "You're offline — changes are queued until you reconnect"}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 pl-3 pr-2 py-2 rounded-full bg-sky-600 text-white text-xs font-semibold shadow-lift animate-fade-in"
    >
      <UploadCloud size={14} className="flex-shrink-0" />
      {pending.length} change{pending.length === 1 ? '' : 's'} waiting to sync
      <button
        onClick={() => void sync()}
        disabled={syncing}
        className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors disabled:opacity-60"
      >
        <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing' : 'Sync now'}
      </button>
    </div>
  );
}
