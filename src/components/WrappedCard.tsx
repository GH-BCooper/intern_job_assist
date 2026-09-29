import { useCallback, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { Download, Flame, Share2, Sparkles, TrendingUp, Trophy, X } from 'lucide-react';
import type { Wrapped } from '../lib/insights';
import { fmtDate } from '../lib/format';
import { toast } from '../lib/uiBus';

/**
 * The shareable week in review — a Wrapped-style card rendered to PNG with the
 * html2canvas already in the stack, so "share your progress" needs no service.
 */
export default function WrappedCard({ data, onClose }: { data: Wrapped; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  useEscapeKey(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const toPng = useCallback(async (): Promise<Blob | null> => {
    const node = cardRef.current;
    if (!node) return null;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(node, {
      // The card is painted with explicit colours below precisely so the
      // snapshot doesn't depend on the page theme.
      backgroundColor: '#1B170E',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await toPng();
      if (!blob) throw new Error('Could not render the card.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `interntrack-week-${data.from}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Saved your week as an image.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the image.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await toPng();
      if (!blob) throw new Error('Could not render the card.');
      const file = new File([blob], `interntrack-week-${data.from}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'My week in review', text: data.headline });
      } else {
        await download();
      }
    } catch (e) {
      // A cancelled share rejects; that is not worth a red toast.
      if (e instanceof Error && e.name !== 'AbortError') toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const stats: { label: string; value: string | number; icon: typeof Flame }[] = [
    { label: 'Applications', value: data.applications, icon: Sparkles },
    { label: 'Interviews', value: data.interviews, icon: TrendingUp },
    { label: 'Offers', value: data.offers, icon: Trophy },
    { label: 'Day streak', value: data.streak, icon: Flame },
  ];

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Week in review"
    >
      <div className="w-full max-w-sm animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Explicit colours, not theme classes: this element becomes an image. */}
        <div
          ref={cardRef}
          style={{
            background: 'linear-gradient(150deg, #2A2417 0%, #1B170E 55%, #451D0B 100%)',
            color: '#F7F1E8',
            borderRadius: 24,
            padding: 28,
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FFB245', fontWeight: 700 }}>
            Week in review
          </p>
          <p style={{ fontSize: 12, color: '#A9A0A0', marginTop: 2 }}>
            {fmtDate(data.from, { month: 'short', day: 'numeric' })} – {fmtDate(data.to, { month: 'short', day: 'numeric' })}
          </p>

          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 26,
              lineHeight: 1.15,
              margin: '18px 0 20px',
              letterSpacing: '-.01em',
            }}
          >
            {data.headline}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {stats.map(s => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.1)',
                  borderRadius: 14,
                  padding: '12px 14px',
                }}
              >
                <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: '#A9A0A0', marginTop: 4 }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.bestPlatform && (
              <p style={{ fontSize: 12, color: '#DED4D0' }}>
                Best converting platform:{' '}
                <b style={{ color: '#FFB245' }}>
                  {data.bestPlatform.platform} ({data.bestPlatform.rate}%)
                </b>
              </p>
            )}
            {data.topRole && (
              <p style={{ fontSize: 12, color: '#DED4D0' }}>
                Most applied role: <b style={{ color: '#FFB245' }}>{data.topRole}</b>
              </p>
            )}
            <p style={{ fontSize: 12, color: '#DED4D0' }}>
              Momentum score: <b style={{ color: '#FFB245' }}>{data.momentum}/100</b>
              {data.delta !== 0 && (
                <span style={{ color: data.delta > 0 ? '#34D399' : '#FF7E7E' }}>
                  {'  '}
                  {data.delta > 0 ? '▲' : '▼'} {Math.abs(data.delta)} vs last week
                </span>
              )}
            </p>
          </div>

          <p style={{ marginTop: 22, fontSize: 10, color: '#8C8380', letterSpacing: '.05em' }}>
            TRACKED WITH INTERNTRACK
          </p>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => void share()} disabled={busy} className="btn-primary flex-1">
            <Share2 size={14} /> {busy ? 'Rendering…' : 'Share'}
          </button>
          <button onClick={() => void download()} disabled={busy} className="btn-secondary">
            <Download size={14} /> PNG
          </button>
          <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
