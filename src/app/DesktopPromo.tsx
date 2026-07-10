/**
 * Storefront promo for the native 3D desktop client. High-contrast card
 * (near-white on near-black) so it reads as its own product next to the
 * game's dark UI, tied back in with the same mode colors as the logo.
 */
import { MODE_COLOR } from '@render/palette';
import { DESKTOP_RELEASES_URL, SHOW_DESKTOP_PROMO } from './desktopPromo';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function WindowIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke={color} strokeWidth="2" />
      <path d="M3 9h18" stroke={color} strokeWidth="2" />
      <circle cx="6.5" cy="6.5" r="0.75" fill={color} />
    </svg>
  );
}

type Platform = { label: string; mode: keyof typeof MODE_COLOR };

const PLATFORMS: Platform[] = [
  { label: 'Windows', mode: 'tram' },
  { label: 'macOS', mode: 'metro' },
  { label: 'Linux', mode: 'rail' },
];

export function DesktopPromo(): React.JSX.Element | null {
  if (!SHOW_DESKTOP_PROMO) return null;
  return (
    <div className="mt-6 rounded-2xl bg-zinc-50 text-zinc-950 p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.05)]">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Now in development</div>
      <h3 className="font-display text-2xl font-bold mt-1">MetroForge Desktop</h3>
      <p className="text-sm text-zinc-700 mt-1.5">
        The full 3D experience. Bigger cities, built native, no browser needed.
      </p>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {PLATFORMS.map((p) => {
          const color = hex(MODE_COLOR[p.mode]);
          return (
            <a
              key={p.label}
              href={DESKTOP_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-xl bg-zinc-950 py-3 text-zinc-50 hover:bg-zinc-900 transition-colors border-t-2"
              style={{ borderTopColor: color }}
            >
              <WindowIcon color={color} />
              <span className="text-xs font-semibold">{p.label}</span>
            </a>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500 mt-3 text-center">Releases post here first.</p>
    </div>
  );
}
