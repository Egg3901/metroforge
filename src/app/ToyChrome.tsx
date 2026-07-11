/**
 * Slim chrome for the Cleveland web toy — storefront identity, three tools,
 * speed, coach, and a non-blocking download CTA after two minutes of play.
 */
import { useEffect, useState } from 'react';
import { MODES } from '@core/constants';
import { Logo, Wordmark } from './brand';
import { BusIcon, PauseIcon, RouteIcon, StationIcon, TrackIcon } from './icons';
import { useStore, type Tool } from './store';
import {
  DOWNLOAD_HREF,
  TOY_BLURB,
  TOY_CITY_LABEL,
  TOY_CTA_AFTER_MS,
  TOY_HEADLINE,
  TOY_SUBLINE,
  TOY_TOOLS,
  type ToyTool,
} from './teaser';
import { TutorialCard } from './TutorialCard';

const TOOL_META: Record<ToyTool, { label: string; key: string; icon: (p: { size?: number }) => React.JSX.Element }> = {
  station: { label: 'Station', key: 'S', icon: StationIcon },
  track: { label: 'Track', key: 'T', icon: TrackIcon },
  route: { label: 'Route', key: 'R', icon: RouteIcon },
};

const SPEEDS = [0, 1, 10, 60] as const;

function ToyHint(): React.JSX.Element | null {
  const tutorialActive = useStore((s) => s.tutorialActive);
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const trackFrom = useStore((s) => s.trackFrom);
  const trackCostEstimate = useStore((s) => s.trackCostEstimate);
  const routeStops = useStore((s) => s.routeStops);
  if (tutorialActive) return null;
  if (tool === 'station') {
    return (
      <p className="text-xs text-[var(--mf-text-dim)] leading-relaxed">
        Tap the map to place a <span className="text-[var(--mf-text)]">{MODES[mode].label}</span> station
        <span className="text-[var(--mf-orange)]"> ${(MODES[mode].stationCost / 1000).toFixed(0)}K</span>.
        Build on the amber density glow.
      </p>
    );
  }
  if (tool === 'track') {
    return (
      <p className="text-xs text-[var(--mf-text-dim)] leading-relaxed">
        {trackFrom === null ? 'Tap a station to start the track.' : 'Tap the destination station.'}
        {trackCostEstimate !== null && (
          <span className="block text-[var(--mf-orange)] mt-0.5">Est. ${(trackCostEstimate / 1e6).toFixed(2)}M</span>
        )}
      </p>
    );
  }
  if (tool === 'route') {
    return (
      <p className="text-xs text-[var(--mf-text-dim)] leading-relaxed">
        Tap stations in order ({routeStops.length} picked), then re-tap the last stop or press Enter.
      </p>
    );
  }
  return null;
}

export function ToySplash({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 z-40 overflow-y-auto"
      style={{ background: 'var(--mf-bg)' }}
      data-testid="toy-splash"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 40% at 50% 0%, rgba(126,242,154,0.07), transparent 60%), radial-gradient(40% 35% at 85% 20%, rgba(84,208,255,0.06), transparent 55%), radial-gradient(35% 30% at 15% 70%, rgba(255,182,61,0.05), transparent 50%)',
        }}
      />
      <nav className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-[var(--mf-panel-border)]">
        <a href={DOWNLOAD_HREF} className="flex items-center gap-2 no-underline text-[var(--mf-text)]">
          <Logo size={28} />
          <span className="font-semibold text-[1.05rem]">MetroForge</span>
        </a>
        <a
          href={DOWNLOAD_HREF}
          className="text-sm text-[var(--mf-text-dim)] hover:text-[var(--mf-text)] no-underline transition-colors"
        >
          Download
        </a>
      </nav>
      <div className="relative z-10 w-full max-w-md mx-auto px-5 py-14 flex flex-col items-center text-center min-h-[calc(100%-4rem)]">
        <div className="toy-spoke-pulse mb-6">
          <Logo size={72} />
        </div>
        <Wordmark size={32} />
        <h1 className="font-display text-2xl sm:text-3xl text-[var(--mf-text)] mt-6 leading-tight tracking-tight">
          {TOY_HEADLINE}
        </h1>
        <p className="text-[var(--mf-text-dim)] text-base mt-3 leading-relaxed">{TOY_SUBLINE}</p>
        <p className="text-sm text-[var(--mf-text-dim)] mt-5 max-w-sm leading-relaxed">{TOY_BLURB}</p>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          <span className="toy-badge">{TOY_CITY_LABEL}</span>
          <span className="toy-badge">Bus only</span>
          <span className="toy-badge">~2 minutes</span>
        </div>
        <button
          type="button"
          onClick={onStart}
          data-testid="toy-start"
          className="mt-8 w-full max-w-xs py-3.5 rounded-xl bg-[var(--mf-accent)] hover:brightness-110 text-[var(--mf-bg)] font-bold text-base transition-[filter] toy-cta-in"
        >
          Start building
        </button>
        <a
          href={DOWNLOAD_HREF}
          className="mt-4 text-sm text-[var(--mf-accent)] hover:underline underline-offset-2"
        >
          Get the full game for desktop
        </a>
        <p className="text-[11px] text-[var(--mf-text-dim)]/70 mt-auto pt-10">
          Keys: S station · T track · R route · Enter finish · Space pause
        </p>
        <a
          href="https://lakesidegames.net"
          className="mt-4 flex items-center gap-2 text-[11px] text-[var(--mf-text-dim)]/70 hover:text-[var(--mf-text-dim)] no-underline transition-colors"
        >
          <img src="./lakeside-mark.svg" alt="Lakeside Games mark" width={18} height={18} />
          <span>by Lakeside Games</span>
        </a>
      </div>
    </div>
  );
}

export function ToyTopBar(): React.JSX.Element {
  const ui = useStore((s) => s.ui);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);

  return (
    <div
      className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-3 py-2 select-none"
      style={{
        background: 'rgba(10, 15, 20, 0.88)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--mf-panel-border)',
      }}
      data-testid="toy-topbar"
    >
      <a href={DOWNLOAD_HREF} className="flex items-center gap-2 no-underline shrink-0" title="MetroForge download">
        <Logo size={24} />
        <span className="hidden sm:inline font-semibold text-sm text-[var(--mf-text)]">MetroForge</span>
      </a>
      <span className="hidden md:inline text-xs text-[var(--mf-text-dim)] truncate">
        {TOY_CITY_LABEL} toy · {TOY_SUBLINE}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-[var(--mf-text-dim)] tabular-nums mr-1" title="Day">
          Day {ui?.day ?? 1}
        </span>
        <span className="flex items-center gap-1 text-xs text-[var(--mf-orange)] tabular-nums mr-2" title="Daily transit trips">
          <BusIcon size={14} />
          {Math.round(ui?.dailyTransitTrips ?? 0).toLocaleString()}
        </span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`min-w-[2.25rem] px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
              speed === s
                ? 'bg-[var(--mf-accent)] text-[var(--mf-bg)]'
                : 'bg-[var(--mf-panel)] text-[var(--mf-text-dim)] hover:text-[var(--mf-text)] border border-[var(--mf-panel-border)]'
            }`}
            title={s === 0 ? 'Pause' : `${s}× speed`}
          >
            {s === 0 ? <PauseIcon size={12} /> : `${s}×`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToyToolbar(): React.JSX.Element {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  const buttons = (compact: boolean): React.JSX.Element[] =>
    TOY_TOOLS.map((id) => {
      const meta = TOOL_META[id];
      const Icon = meta.icon;
      const active = tool === id;
      return (
        <button
          key={id}
          type="button"
          onClick={() => setTool(id as Tool)}
          title={`${meta.label} (${meta.key})`}
          data-testid={`toy-tool-${id}`}
          className={`flex items-center gap-2 rounded-lg transition-colors ${
            compact ? 'p-2.5 justify-center' : 'px-2.5 py-2 w-full'
          } ${
            active
              ? 'bg-[var(--mf-accent)] text-[var(--mf-bg)] ring-2 ring-[var(--mf-accent)]/40'
              : 'text-[var(--mf-text-dim)] hover:bg-[var(--mf-panel)] hover:text-[var(--mf-text)]'
          }`}
        >
          <Icon size={compact ? 20 : 16} />
          {!compact && <span className="text-xs font-medium flex-1 text-left">{meta.label}</span>}
          {!compact && (
            <span className={`text-[10px] ${active ? 'text-[var(--mf-bg)]/70' : 'text-[var(--mf-text-dim)]/60'}`}>
              {meta.key}
            </span>
          )}
        </button>
      );
    });

  return (
    <>
      <div
        className="hidden md:flex absolute left-3 top-14 w-52 flex-col gap-2 z-10 select-none"
        data-testid="toy-toolbar"
      >
        <div
          className="rounded-xl p-2 flex flex-col gap-0.5"
          style={{ background: 'rgba(10,15,20,0.88)', border: '1px solid var(--mf-panel-border)', backdropFilter: 'blur(10px)' }}
        >
          {buttons(false)}
          <div className="px-1 pt-1.5 empty:hidden">
            <ToyHint />
          </div>
        </div>
      </div>
      <div className="md:hidden absolute bottom-0 inset-x-0 z-10 select-none pb-[env(safe-area-inset-bottom)]" data-testid="toy-toolbar-mobile">
        <div
          className="mx-2 mb-1 empty:hidden rounded-lg px-3 py-1.5"
          style={{ background: 'rgba(10,15,20,0.92)', border: '1px solid var(--mf-panel-border)' }}
        >
          <ToyHint />
        </div>
        <div
          className="px-2 py-1.5 flex items-center justify-center gap-1"
          style={{ background: 'rgba(10,15,20,0.92)', borderTop: '1px solid var(--mf-panel-border)' }}
        >
          {buttons(true)}
        </div>
      </div>
    </>
  );
}

export function ToyDownloadBanner({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <div
      className="absolute top-14 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,28rem)] pointer-events-auto toy-cta-in"
      data-testid="toy-download-banner"
      role="status"
    >
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3 shadow-lg shadow-black/40"
        style={{
          background: 'rgba(17, 27, 38, 0.96)',
          border: '1px solid var(--mf-panel-border)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Logo size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--mf-text)] leading-snug">{TOY_HEADLINE}</p>
          <p className="text-xs text-[var(--mf-text-dim)] mt-0.5">{TOY_SUBLINE}</p>
          <a
            href={DOWNLOAD_HREF}
            className="inline-flex mt-2.5 px-3.5 py-1.5 rounded-lg bg-[var(--mf-accent)] hover:brightness-110 text-[var(--mf-bg)] text-xs font-bold no-underline transition-[filter]"
          >
            Download the desktop game
          </a>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[var(--mf-text-dim)] hover:text-[var(--mf-text)] text-lg leading-none px-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToyToasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const tutorialActive = useStore((s) => s.tutorialActive);
  const pos = tutorialActive
    ? 'absolute top-14 right-2 md:right-4'
    : 'absolute bottom-28 md:bottom-4 right-2 md:right-4';
  return (
    <div className={`${pos} flex flex-col gap-2 z-30 max-w-[85vw] md:max-w-sm`}>
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`text-left text-xs rounded px-3 py-2 text-[var(--mf-text)] shadow-lg border-l-4 ${
            t.tone === 'warn'
              ? 'border-[var(--mf-red)]'
              : t.tone === 'good'
                ? 'border-[var(--mf-green)]'
                : 'border-[var(--mf-panel-border)]'
          }`}
          style={{ background: 'rgba(17, 27, 38, 0.95)' }}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

export function ToyCoach(): React.JSX.Element | null {
  return <TutorialCard />;
}

/** Hook: show download CTA after TOY_CTA_AFTER_MS of wall-clock play. */
export function useToyCta(started: boolean): { showCta: boolean; dismissCta: () => void } {
  const [showCta, setShowCta] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!started || dismissed) return;
    const id = window.setTimeout(() => setShowCta(true), TOY_CTA_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [started, dismissed]);

  return {
    showCta: showCta && !dismissed,
    dismissCta: () => {
      setDismissed(true);
      setShowCta(false);
    },
  };
}
