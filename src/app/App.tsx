import { useEffect } from 'react';
import { GameCanvas } from './GameCanvas';
import { useStore } from './store';
import {
  ToyCoach,
  ToyDownloadBanner,
  ToySplash,
  ToyToasts,
  ToyToolbar,
  ToyTopBar,
  useToyCta,
} from './ToyChrome';

/**
 * Storefront web toy: Cleveland only — place stations, draw one route, watch
 * vehicles. Campaign / daily / multi-city free play are desktop-only.
 */
export function App(): React.JSX.Element {
  const started = useStore((s) => s.started);
  const startToy = useStore((s) => s.startToy);
  const { showCta, dismissCta } = useToyCta(started);

  // Restrict keyboard tools while the toy is active (GameCanvas still listens).
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      // Block bulldoze / panel shortcuts that the toy does not expose.
      if (e.key === 'b' || e.key === 'B' || e.key === 'f' || e.key === 'F' || e.key === ',' || e.key === '?') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
      // Modes 2–4 stay locked; swallow so setMode is not called with locked modes.
      if (e.key === '2' || e.key === '3' || e.key === '4') {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [started]);

  return (
    <div className="fixed inset-0" style={{ background: 'var(--mf-bg)' }} data-testid="toy-app">
      <GameCanvas />
      {started && <ToyTopBar />}
      {started && <ToyToolbar />}
      {started && <ToyCoach />}
      {started && <ToyDownloadBanner visible={showCta} onDismiss={dismissCta} />}
      <ToyToasts />
      {!started && <ToySplash onStart={startToy} />}
    </div>
  );
}
