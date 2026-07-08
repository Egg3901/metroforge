/**
 * Floating tutorial coach card. Auto-advances when step.done(ui) flips true,
 * auto-selects the right tool/overlay, and can be skipped permanently.
 */
import { useEffect, useRef } from 'react';
import { getRenderer } from './rendererBridge';
import { useStore } from './store';
import { TUTORIAL_STEPS, tutorialFocus } from './tutorial';

export function TutorialCard(): React.JSX.Element | null {
  const active = useStore((s) => s.tutorialActive);
  const stepIdx = useStore((s) => s.tutorialStep);
  const ui = useStore((s) => s.ui);
  const advanceTutorial = useStore((s) => s.advanceTutorial);
  const skipTutorial = useStore((s) => s.skipTutorial);
  const setTool = useStore((s) => s.setTool);
  const setOverlay = useStore((s) => s.setOverlay);
  const setSpeed = useStore((s) => s.setSpeed);
  const speed = useStore((s) => s.speed);
  const applied = useRef<number>(-1);

  const step = TUTORIAL_STEPS[stepIdx];
  const total = TUTORIAL_STEPS.length;

  // apply tool/overlay when the step changes (once per step index)
  useEffect(() => {
    if (!active || !step) return;
    if (applied.current === stepIdx) return;
    applied.current = stepIdx;
    setTool(step.tool);
    setOverlay(step.overlay);
    // riders step: nudge the player to speed up if paused/slow
    if (step.id === 'riders' && speed < 2) setSpeed(4);
    const focus = tutorialFocus(ui, step.id);
    if (focus) getRenderer()?.focusOn(focus.x, focus.y, focus.scale);
  }, [active, stepIdx, step, setTool, setOverlay, setSpeed, speed, ui]);

  // auto-advance when the live condition is met
  useEffect(() => {
    if (!active || !step) return;
    if (step.id === 'density') return; // manual Continue
    if (step.done(ui)) advanceTutorial();
  }, [active, step, ui, advanceTutorial]);

  if (!active || !step) return null;

  const isLast = stepIdx >= total - 1;
  const canContinue = step.id === 'density' || step.done(ui);
  const pct = ((stepIdx + (step.done(ui) ? 1 : 0.35)) / total) * 100;

  return (
    <div className="absolute bottom-28 md:bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,26rem)] pointer-events-auto animate-[tutIn_280ms_ease-out]">
      <style>{`@keyframes tutIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="rounded-2xl border border-amber-500/35 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/40 overflow-hidden">
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-amber-400 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="px-4 pt-3 pb-3.5">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-400/90 font-semibold">
              Lesson {stepIdx + 1} of {total}
            </div>
            <button
              onClick={skipTutorial}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Skip
            </button>
          </div>
          <h3 className="font-display text-lg text-zinc-50 tracking-tight leading-snug">{step.title}</h3>
          <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{step.body}</p>
          <p className="text-xs text-amber-300/90 mt-2 font-medium">{step.action}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-mono tabular-nums text-zinc-500">{step.progress(ui)}</span>
            {(canContinue || step.id === 'density') && (
              <button
                onClick={advanceTutorial}
                className="shrink-0 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-colors"
              >
                {step.id === 'density' ? 'Got it' : isLast && step.done(ui) ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
