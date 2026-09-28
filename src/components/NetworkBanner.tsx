import { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { emitUi, toast } from '../lib/uiBus';

/** Persistent pill warning when the browser has no connection, since writes fail silently otherwise. */
export default function NetworkBanner() {
  const online = useOnlineStatus();
  const wasOffline = useRef(false);

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

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-amber-500 text-white text-xs font-semibold shadow-lift animate-fade-in"
    >
      <WifiOff size={14} />
      You&apos;re offline — changes won&apos;t save until you reconnect
    </div>
  );
}
