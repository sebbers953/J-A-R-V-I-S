# J.A.R.V.I.S. — Voice Assistant

An Electron + TypeScript desktop HUD with an animated core, local clock/date, live CPU and memory telemetry, storage usage, macOS battery status, persistent daily tasks, and an explicit-capture OpenAI voice assistant.

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

The desktop begins fullscreen. Tasks are scoped to the local calendar date, with earlier days retained on disk. The Electron app stores tasks atomically in `app.getPath('userData')/tasks.json` (on macOS, normally `~/Library/Application Support/jarvis-hud/tasks.json`). Browser preview uses separate browser local storage. Storage read failures leave existing data untouched and disable edits. Tasks and telemetry work without an API key; voice AI requires your own local OpenAI API key.

Microphone capture begins only after clicking the microphone and granting permission. The waveform uses real time-domain samples from the selected default input. The circular microphone button toggles capture and releases the device when muted. IDLE means capture has not started, LISTENING means capture is active, and MUTED means capture has stopped. Permission failures are shown explicitly. Audio is captured in memory, then sent to OpenAI only when you click Send (or reach the 45-second capture limit). Muting before Send discards the capture. macOS users may need to allow Electron in System Settings → Privacy & Security → Microphone. A packaged macOS distribution must include `NSMicrophoneUsageDescription` and signing/entitlements as appropriate; packaging is outside this milestone.

CPU is measured from interval deltas, memory from OS totals, storage from filesystem statistics for the home volume, and battery from macOS `pmset -g batt`. Battery-less Macs and non-macOS hosts show unavailable battery status; CPU/memory/uptime work across supported desktop platforms. Linux cloud metrics describe the cloud host, not your Mac.

## Structure

- `src/electron/main.ts`: isolated desktop window, OS metrics, validated IPC, atomic JSON persistence.
- `src/electron/preload.ts`: narrow typed bridge, with Node integration disabled in the renderer.
- `src/renderer/`: responsive HUD, daily objectives, waveform and clock.
- `src/shared.ts`: shared bridge types.
- `scripts/tasks.test.cjs`: persistence payload validation tests (run after build).

Build output is in `dist/`. The repository includes a frozen npm lockfile. Electron's binary download may require `ELECTRON_GET_USE_PROXY=1` in proxy-based environments. No secret is required to launch; configure the local key to enable voice AI. A graphical desktop is required for the Electron window; cloud browser checks do not validate physical macOS microphone or battery behavior.

## Browser functional checks

After building, run `npm run preview -- --port 4173` in one terminal and `npm run test:smoke` in another. The smoke test uses system Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`) and a simulated audio device. It checks task creation, completion and persistence across reloads, deletion, clock updates, microphone start/stop, mobile overflow, and renderer errors. Its screenshot is written to `/workspace/jarvis-hud.png`. Physical microphone capture and macOS battery status require a real Mac; they cannot be certified from a Linux cloud instance.


## Reference HUD

The interface uses independent CSS/SVG ring layers, a procedural SVG energy sphere, scanning and orbiting particle layers, and a live Canvas audio waveform. No background image or remote visual asset is used. Daily Tasks sits above System on the right; microphone controls sit below the central core. The UI adapts to MacBook desktop sizes and stacks on narrow screens. Reduced-motion preferences disable decorative animations, hidden pages pause them, and the audio canvas is capped at 30 FPS. GPU/temperature/fan readings, weather, app shortcuts, and media controls are not fabricated or included. The compact conversation area displays up to three recent exchanges without changing the HUD layout.

System storage shows used/total space for the home volume (APFS may share its capacity with other volumes). Unavailable readings remain marked unavailable. Smoke tests additionally cover telemetry presentation with a controlled host fixture, permission denial, reduced motion, and 1280/1440/1512-pixel MacBook layouts. These fixtures verify UI mapping, not physical Mac hardware; CPU, RAM, storage, battery, and microphone hardware access should be checked on macOS.


## Local voice AI setup on macOS

From the cloned `J-A-R-V-I-S` directory:

```sh
git pull --ff-only origin main
npm ci
cp -n .env.example .env
chmod 600 .env
open -e .env
```

In that local `.env` file replace the placeholder in `OPENAI_API_KEY=your_key_here` with your own key, save, then run:

```sh
npm run typecheck
npm run build
npm test
npm start
```

For example, if cloned into `~/J-A-R-V-I-S`, the exact file is `~/J-A-R-V-I-S/.env`, beside `package.json`. The app loads this project-root file regardless of your terminal working directory. An exported `OPENAI_API_KEY` takes precedence. Restart after changing the key. `.env`, `.env.local`, `.env.*`, and `*.env` are ignored; only `.env.example` contains a placeholder and is tracked. Never paste your key into source, chat, or a Git commit. Credentials are read in the main process and are never sent through preload/IPC. The key is also removed from the inherited process environment before creating a renderer.

Without a key, the HUD displays **CONFIGURATION REQUIRED**, logs a safe setup explanation, and keeps tasks, telemetry, clock, and animation running. Browser preview has no native bridge, so voice AI is unavailable there.

Click the microphone to start **LISTENING**, speak, and click **Send utterance**. The microphone is released before **THINKING** (transcription and response generation). The exact response text is shown and converted to AI-generated speech; playback uses the default Mac speaker/output device in **SPEAKING**. The core and waveform react to actual playback samples. Capture remains off during playback to prevent feedback. After playback the assistant returns to **IDLE**; click the microphone for another question. The microphone button also cancels a pending turn or playback and enters **MUTED**. There is no always-on listening or wake-word detection yet; capture initiation is separate from the turn service so a future wake phrase can trigger it.

Voice requests use the official `openai` Node SDK exclusively in Electron main: `gpt-4o-mini-transcribe`, `gpt-4.1-mini` via Responses API, and `gpt-4o-mini-tts` with the `onyx` voice. Your account needs access and API billing for these models. Only submitted audio and the current session's conversation context are sent to OpenAI. Up to ten recent exchanges are retained in memory, cleared on app restart; only three are visible. Responses use `store: false`; provider audio/data handling still follows OpenAI's API policies. No conversation or recording is written to the task database. No computer-control tools are enabled, and the assistant is instructed not to claim actions it has not performed.

Permission failures show **MICROPHONE PERMISSION REQUIRED**. Network, authentication, quota, and audio errors are sanitized; the app remains open and returns to IDLE. If speech generation fails after a text response, that response is still displayed. Requests have timeouts and capture is capped at 45 seconds / 8 MB.

`npm test` covers state transitions, missing-key behavior, the transcription/Responses/speech contract, history, error redaction, cancellation, overlapping turns, and task persistence validation. `npm run test:smoke` uses a controlled provider bridge and WAV microphone fixture to exercise the renderer, full voice states, playback, echo prevention, existing tasks, clock and telemetry presentation. `npm run test:electron` checks real unconfigured Electron startup and native IPC; run it only on an unconfigured checkout without a `.env` key, with a display available (Xvfb on Linux). Live paid API calls and physical Mac microphone/speakers require local validation.
