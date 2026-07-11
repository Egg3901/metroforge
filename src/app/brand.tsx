/**
 * MetroForge brand. The mark is a transit interchange — four lines in the game's
 * own mode colors (bus/tram/metro/rail) meeting at a white station node. It ties
 * the identity directly to what you build.
 */
import { MODE_COLOR } from '@render/palette';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export function Logo({ size = 40 }: { size?: number }): React.JSX.Element {
  const c = size / 2;
  const arms: [number, number, number][] = [
    [c - 14, c - 14, MODE_COLOR.rail], // NW
    [c + 14, c - 14, MODE_COLOR.tram], // NE
    [c + 14, c + 14, MODE_COLOR.bus], // SE
    [c - 14, c + 14, MODE_COLOR.metro], // SW
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {arms.map(([x, y, col], i) => (
        <line key={i} x1={c} y1={c} x2={x} y2={y} stroke={hex(col)} strokeWidth={size * 0.1} strokeLinecap="round" />
      ))}
      <circle cx={c} cy={c} r={size * 0.16} fill="#0b0d10" />
      <circle cx={c} cy={c} r={size * 0.16} fill="none" stroke="#f4f4f5" strokeWidth={size * 0.07} />
    </svg>
  );
}

/** Full lockup: mark + wordmark (matches storefront nav). */
export function Wordmark({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 select-none">
      <Logo size={size * 1.3} />
      <span className="font-display font-semibold tracking-tight text-[var(--mf-text,#f4f4f5)]" style={{ fontSize: size }}>
        MetroForge
      </span>
    </div>
  );
}

export const TAGLINE = 'Try the toy version in your browser — the full city runs in the desktop game.';
