/**
 * @vitest-environment jsdom
 *
 * Mount-path smoke for the storefront Cleveland toy.
 * Stubs Pixi canvas + Worker (see docs/WEB_TOY.md for untestable seams).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  DOWNLOAD_HREF,
  TOY_CITY_KEY,
  TOY_CTA_AFTER_MS,
  TOY_HEADLINE,
  TOY_SEED,
  TOY_SUBLINE,
} from '../src/app/teaser';

vi.mock('../src/app/GameCanvas', () => ({
  GameCanvas: (): React.JSX.Element => <div data-testid="game-canvas-stub" />,
}));

vi.mock('../src/app/audio', () => ({
  unlockAudio: vi.fn(),
  sfxFail: vi.fn(),
  sfxGood: vi.fn(),
  sfxRoute: vi.fn(),
  sfxStation: vi.fn(),
  sfxTrack: vi.fn(),
  sfxWarn: vi.fn(),
  isMuted: () => true,
  toggleMute: vi.fn(),
}));

const initMock = vi.fn();
const setSpeedMock = vi.fn();

vi.mock('../src/host/client', () => ({
  SimClient: class {
    events: Record<string, unknown> = {};
    init = initMock;
    setSpeed = setSpeedMock;
    command = vi.fn(async () => ({ ok: true }));
    trackCost = vi.fn(async () => 0);
    requestSave = vi.fn();
    loadSave = vi.fn();
    requestReplay = vi.fn(async () => ({ seed: 0, commands: [] }));
  },
}));

describe('web toy mount smoke', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    // React 18+ act() needs this flag under vitest/jsdom.
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    initMock.mockClear();
    setSpeedMock.mockClear();
    // Fresh store module per test so started/toyMode reset.
    vi.resetModules();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('mounts the splash with storefront framing and download link', async () => {
    const { App } = await import('../src/app/App');
    await act(async () => {
      root.render(<App />);
    });

    const splash = container.querySelector('[data-testid="toy-splash"]');
    expect(splash).toBeTruthy();
    expect(splash!.textContent).toContain(TOY_HEADLINE);
    expect(splash!.textContent).toContain(TOY_SUBLINE);
    expect(splash!.textContent).toContain('Cleveland');

    const start = container.querySelector('[data-testid="toy-start"]') as HTMLButtonElement | null;
    expect(start).toBeTruthy();

    const downloadLinks = [...container.querySelectorAll(`a[href="${DOWNLOAD_HREF}"]`)];
    expect(downloadLinks.length).toBeGreaterThan(0);
  });

  it('startToy boots Cleveland bus-locked and shows toy chrome', async () => {
    const { App } = await import('../src/app/App');
    const { useStore } = await import('../src/app/store');

    await act(async () => {
      root.render(<App />);
    });

    await act(async () => {
      (container.querySelector('[data-testid="toy-start"]') as HTMLButtonElement).click();
    });

    expect(initMock).toHaveBeenCalledWith(
      TOY_SEED,
      'easy',
      expect.objectContaining({
        presetKey: TOY_CITY_KEY,
        rules: expect.objectContaining({ startingModes: ['bus'], lockModes: true }),
      }),
    );

    const st = useStore.getState();
    expect(st.started).toBe(true);
    expect(st.toyMode).toBe(true);
    expect(st.tutorialActive).toBe(true);
    expect(st.mode).toBe('bus');
    expect(st.runSeed).toBe(TOY_SEED);

    expect(container.querySelector('[data-testid="toy-splash"]')).toBeNull();
    expect(container.querySelector('[data-testid="toy-toolbar"]') || container.querySelector('[data-testid="toy-tool-station"]')).toBeTruthy();
  });

  it('shows a dismissible download CTA after two minutes of play', async () => {
    vi.useFakeTimers();
    try {
      const { App } = await import('../src/app/App');
      const { useStore } = await import('../src/app/store');

      await act(async () => {
        root.render(<App />);
      });

      await act(async () => {
        useStore.getState().startToy();
      });

      expect(container.querySelector('[data-testid="toy-download-banner"]')).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(TOY_CTA_AFTER_MS);
      });

      const banner = container.querySelector('[data-testid="toy-download-banner"]');
      expect(banner).toBeTruthy();
      expect(banner!.textContent).toContain(TOY_HEADLINE);
      expect(banner!.querySelector(`a[href="${DOWNLOAD_HREF}"]`)).toBeTruthy();

      await act(async () => {
        (banner!.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
      });
      expect(container.querySelector('[data-testid="toy-download-banner"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
