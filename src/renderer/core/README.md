# Celestial centerpiece

Self-contained visual component: `JarvisCore` uses one 2D canvas plus stationary HTML lettering. The moon's seeded crater height map is generated once; projected surface texture updates at most twice a second. Stars render at most 30 fps with four inclined orbital families, alternate directions, depth sorting, cached glow sprites and faint short trails. There are no visible orbital paths, permanent mechanical rings, network assets, WebGL dependencies or inference calls.

The component is mounted in the red/black V2 HOME view. It uses the existing assistant state and amplitude without controlling the voice pipeline. The other five sections hide the HOME view, stopping offscreen core animation. Integration:

```ts
import { connectCoreToHud } from './core/state-bridge';
const visual = connectCoreToHud(centerpieceElement, window.jarvis?.onWindowVisibility);
// Dispose on actual component removal, not merely on temporary window hiding:
// visual.destroy();
```

The host must have `position:relative` and an existing square size. The adapter observes the current `body.dataset.voice` state (`processing` maps to `thinking`) and reads the existing inline `--audio-level`. It never changes the voice state or starts audio. To signal a completed approved action, emit `jarvis-action-complete` from the frontend **only after** its validated execution returns success, not when a proposal is created or cancelled. The existing controls dispatcher emits this event only after an approved confirmation returns success; proposals, cancellations and failed actions do not trigger it.

The reusable class also accepts `setState('idle' | 'listening' | 'thinking' | 'speaking' | 'action' | 'error')`, `pulseAction()` and an `audioLevel` callback. Muted/interrupted states map to calm idle visuals. Error tint/flicker fades after two seconds; action contraction/pulse fades after 1.2 seconds. Motion is stopped under reduced-motion preferences, document hiding, page hiding and offscreen intersection. Pass a narrow preload subscription for native window visibility: main-process `hide`/`minimize` events send false, and `show`/`restore` send true. The subscription forwards only a validated boolean and returns an unsubscribe callback, never exposing ipcRenderer. This explicit signal is needed because native hiding does not always update Chromium document visibility (observed in the cloud test). The existing secure preload now exposes this boolean-only subscription, and main forwards visibility for its own HUD window. The component exposes `setWindowVisible(boolean)` and independently respects document/page visibility and offscreen intersection.

Validation:

```bash
npm run typecheck
npm run build
npm test
node scripts/core-smoke.cjs
# Linux cloud display (or omit DISPLAY on a local desktop):
DISPLAY=:99 CORE_ELECTRON_SMOKE=1 node scripts/core-smoke.cjs
```

The smoke script builds a temporary isolated fixture, not a replacement HUD. It checks state mappings, stable text, frame/surface budgets, reduced motion, lifecycle pause/resume, component disposal and optionally real Electron hide/show. Its screenshot defaults to `jarvis-moon-core.png` in the OS temporary folder (`CORE_SCREENSHOT_PATH` overrides it). Set `CHROMIUM_PATH` if Chromium/Chrome is installed elsewhere. CPU measurements use Chromium's renderer task duration over four seconds; they do not measure physical GPU utilization. Linux software-rendering results are not Apple M4 performance claims. Real Mac idle CPU/GPU and minimization should be checked on the user's Mac after installation.
