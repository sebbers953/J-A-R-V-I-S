# J.A.R.V.I.S. — Milestone 01

An Electron + TypeScript desktop HUD with an animated core, local clock/date, live CPU and memory telemetry, macOS battery status, persistent daily tasks, and opt-in microphone visualization.

## Run

Use Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run typecheck
npm run build
npm test
npm start
```

`npm run dev` builds and launches Electron. `npm run preview` serves the production renderer for browser inspection; native telemetry is available only in Electron. Escape toggles fullscreen, as does the upper-right button. Close the window or use the operating system's quit shortcut to exit.

The desktop begins fullscreen. Tasks are scoped to the local calendar date, with earlier days retained on disk. The Electron app stores tasks atomically in `app.getPath('userData')/tasks.json` (on macOS, normally `~/Library/Application Support/jarvis-hud/tasks.json`). Browser preview uses separate browser local storage. Storage read failures leave existing data untouched and disable edits. No account or API key is required.

Microphone capture begins only after pressing Enable Microphone and granting permission. The waveform uses real time-domain samples from the selected default input. Disable Microphone releases the device. Audio stays on-device: no recording, speech recognition, assistant responses, or network transmission is implemented in this milestone. macOS users may need to allow Electron in System Settings → Privacy & Security → Microphone. A packaged macOS distribution must include `NSMicrophoneUsageDescription` and signing/entitlements as appropriate; packaging is outside this milestone.

CPU is measured from interval deltas, memory from OS totals, and battery from macOS `pmset -g batt`. Battery-less Macs and non-macOS hosts show unavailable battery status; CPU/memory/uptime work across supported desktop platforms. Linux cloud metrics describe the cloud host, not your Mac.

## Structure

- `src/electron/main.ts`: isolated desktop window, OS metrics, validated IPC, atomic JSON persistence.
- `src/electron/preload.ts`: narrow typed bridge, with Node integration disabled in the renderer.
- `src/renderer/`: responsive HUD, daily objectives, waveform and clock.
- `src/shared.ts`: shared bridge types.
- `scripts/tasks.test.cjs`: persistence payload validation tests (run after build).

Build output is in `dist/`. The repository includes a frozen npm lockfile. Electron's binary download may require `ELECTRON_GET_USE_PROXY=1` in proxy-based environments. No secrets are required. A graphical desktop is required for the Electron window; cloud browser checks do not validate physical macOS microphone or battery behavior.

## Browser functional checks

After building, run `npm run preview -- --port 4173` in one terminal and `npm run test:smoke` in another. The smoke test uses system Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`) and a simulated audio device. It checks task creation, completion and persistence across reloads, deletion, clock updates, microphone start/stop, mobile overflow, and renderer errors. Its screenshot is written to `/workspace/jarvis-hud.png`. Physical microphone capture and macOS battery status require a real Mac; they cannot be certified from a Linux cloud instance.
