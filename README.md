# J.A.R.V.I.S. — Voice Assistant

An Electron + TypeScript desktop HUD with an animated core, local clock/date, live CPU and memory telemetry, storage usage, macOS battery status, persistent daily tasks, and an explicit-capture Grok + Fish Audio voice assistant.

## Run

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run typecheck
npm run build
npm test
npm start
```

`npm run dev` builds and launches Electron. `npm run preview` serves the production renderer for browser inspection; native telemetry is available only in Electron. Escape toggles fullscreen, as does the upper-right button. Close the window or use the operating system's quit shortcut to exit.

The desktop begins fullscreen. Tasks are scoped to the local calendar date, with earlier days retained on disk. The Electron app stores tasks atomically in `app.getPath('userData')/tasks.json` (on macOS, normally `~/Library/Application Support/jarvis-hud/tasks.json`). Browser preview uses separate browser local storage. Storage read failures leave existing data untouched and disable edits. Tasks and telemetry work without an API key; voice AI requires your own local Grok and Fish Audio API keys.

Microphone capture begins only after clicking the microphone and granting permission. The waveform uses real time-domain samples from the selected default input. The circular microphone button toggles capture and releases the device when muted. IDLE means capture has not started, LISTENING means capture is active, and MUTED means capture has stopped. Permission failures are shown explicitly. Audio is captured in memory, then sent to Fish Audio only when you click Send (or reach the 45-second capture limit). Muting before Send discards the capture. macOS users may need to allow Electron in System Settings → Privacy & Security → Microphone. A packaged macOS distribution must include `NSMicrophoneUsageDescription` and signing/entitlements as appropriate; packaging is outside this milestone.

CPU is measured from interval deltas, memory from OS totals, storage from filesystem statistics for the home volume, and battery from macOS `pmset -g batt`. Battery-less Macs and non-macOS hosts show unavailable battery status; CPU/memory/uptime work across supported desktop platforms. Linux cloud metrics describe the cloud host, not your Mac.

## Structure

- `src/electron/main.ts`: isolated desktop window, OS metrics, validated IPC, atomic JSON persistence.
- `src/electron/preload.ts`: narrow typed bridge, with Node integration disabled in the renderer.
- `src/renderer/`: responsive HUD, daily objectives, waveform and clock.
- `src/shared.ts`: shared bridge types.
- `scripts/tasks.test.cjs`: persistence payload validation tests (run after build).

Build output is in `dist/`. The repository includes a frozen npm lockfile. Electron's binary download may require `ELECTRON_GET_USE_PROXY=1` in proxy-based environments. No secret is required to launch; configure the two local keys to enable voice AI. A graphical desktop is required for the Electron window; cloud browser checks do not validate physical macOS microphone or battery behavior.

## Browser functional checks

After building, run `npm run preview -- --port 4173` in one terminal and `npm run test:smoke` in another. The smoke test uses system Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`) and a simulated audio device. It checks task creation, completion and persistence across reloads, deletion, clock updates, microphone start/stop, mobile overflow, and renderer errors. Its screenshot is written to `/workspace/jarvis-hud.png`. Physical microphone capture and macOS battery status require a real Mac; they cannot be certified from a Linux cloud instance.


## Reference HUD

The interface uses independent CSS/SVG ring layers, a procedural SVG energy sphere, scanning and orbiting particle layers, and a live Canvas audio waveform. No background image or remote visual asset is used. Daily Tasks sits above System on the right; microphone controls sit below the central core. The UI adapts to MacBook desktop sizes and stacks on narrow screens. Reduced-motion preferences disable decorative animations, hidden pages pause them, and the audio canvas is capped at 30 FPS. GPU/temperature/fan readings, weather, app shortcuts, and media controls are not fabricated or included. The compact conversation area displays up to three recent exchanges without changing the HUD layout.

System storage shows used/total space for the home volume (APFS may share its capacity with other volumes). Unavailable readings remain marked unavailable. Smoke tests additionally cover telemetry presentation with a controlled host fixture, permission denial, reduced motion, and 1280/1440/1512-pixel MacBook layouts. These fixtures verify UI mapping, not physical Mac hardware; CPU, RAM, storage, battery, and microphone hardware access should be checked on macOS.


## Local voice AI setup on macOS

From your existing cloned `J-A-R-V-I-S` directory, using Node 24 LTS:

```sh
git pull --ff-only origin main
npm ci
cp -n .env.example .env
chmod 600 .env
open -e .env
```

Edit that local `.env` (beside `package.json`) to contain these two names with your own credentials replacing the placeholders:

```dotenv
GROK_API_KEY=your_grok_key_here
FISH_AUDIO_API_KEY=your_fish_audio_key_here
```

`cp -n` preserves an existing `.env`; if you are upgrading, manually add/replace these two lines in it. The old provider key is no longer used and can be removed locally. For a clone at `~/J-A-R-V-I-S`, the exact file is `~/J-A-R-V-I-S/.env`. Never put credentials in source, chat, screenshots, or commits. Both providers require API access/billing; consumer chat subscriptions may not include API credits. No third provider credential is needed.

Save the file, then run:

```sh
npm run typecheck
npm run build
npm test
npm start
```

The app loads `.env` from the project root regardless of terminal working directory. Exported `GROK_API_KEY` and `FISH_AUDIO_API_KEY` take precedence over the corresponding file entries. Restart after editing. `.env`, `.env.local`, `.env.*`, and `*.env` remain Git-ignored; only the placeholder `.env.example` is tracked. Credentials are read only in Electron main, removed from the inherited environment before opening the renderer, and never returned through IPC. SDK debug request logging is disabled. The renderer has no provider client, credential access, or external API requests.

If either key is missing or still a placeholder, the HUD displays **CONFIGURATION REQUIRED**, the main console gives safe setup instructions, and the application stays usable for tasks, telemetry, clock, and animations. Browser preview has no native provider bridge.

Click the microphone to start **LISTENING**, speak, then click **Send utterance**. Muting before sending discards the capture; capture is also capped at 45 seconds. The renderer converts the recording to standard mono PCM16 WAV in memory. Electron main sends it to Fish Audio for transcription, sends the transcript and session context to Grok in **THINKING**, then sends Grok's exact response text to Fish Audio for speech. The transcript and answer remain visible. Playback uses the default Mac output device in **SPEAKING**; core and waveform react to playback samples. Microphone tracks stop before processing and remain off during playback, preventing self-transcription. Playback completion returns to **IDLE**. Clicking the microphone during processing/playback cancels and enters **MUTED**. No always-on listening or wake word is enabled; capture initiation remains separate from the turn service for future wake-word support.

## Provider implementation

- **Grok reasoning:** official `@xai-official/sdk` (currently 0.2.5), Responses API at `https://api.x.ai/v1/responses`, model `grok-4.7`, low reasoning effort, no tools, and `store: false`. The existing JARVIS personality and ten-exchange in-memory conversation window are preserved; only three recent exchanges appear on the HUD.
- **Fish transcription:** official HTTP endpoint `POST https://api.fish.audio/v1/asr`, multipart `audio` file plus `ignore_timestamps=true`.
- **Fish voice:** official HTTP endpoint `POST https://api.fish.audio/v1/tts`, MessagePack body containing the exact response `text` and `format: wav`, with `model: s2.1-pro`. This uses the provider's default voice; no cloning, reference recording, or extra voice ID is required.

The Fish request contracts match the current official TypeScript SDK; HTTP is used directly to retain explicit cancellation, size limits, and sanitized errors. There is no OpenAI package, endpoint, transcription fallback, or API-key requirement. No transcripts or audio are saved to the task database. Audio goes to Fish Audio; conversation text/context goes to xAI. Each provider's API data policies apply. No computer-control capabilities are enabled.

Official sources checked for these contracts:

- [xAI TypeScript SDK](https://github.com/xai-org/xai-sdk-ts) and [official cookbook](https://github.com/xai-org/xai-cookbook/tree/main/examples/meeting-to-action-items/typescript)
- [Fish Audio TypeScript SDK](https://github.com/fishaudio/fish-audio-typescript), especially its `speechToText` and `textToSpeech` clients
- [xAI API documentation](https://docs.x.ai/) and [Fish Audio API documentation](https://docs.fish.audio/)

Permission failures show **MICROPHONE PERMISSION REQUIRED**. Provider/authentication/network errors are sanitized and return to IDLE. If Fish speech generation fails after Grok succeeds, the Grok text and history remain available and the HUD shows **Fish Audio voice unavailable**. Both provider requests and audio response sizes are bounded; input is limited to 8 MB. Cancellation aborts in-flight requests and discards late replies.

## Assistant validation

`npm test` covers all state transitions, missing credentials, WAV conversion, session history/personality, exact response-to-speech matching, API errors, TTS fallback, cancellation, overlapping turns, and the official provider wire contracts using in-memory HTTP mocks (no paid requests). `npm run test:smoke` uses a controlled provider bridge and WAV microphone fixture to exercise the full renderer voice turn, echo prevention, tasks, clock, telemetry, permission errors, and responsive layout. Start the preview server first as described above.

`npm run test:electron` verifies real unconfigured Electron startup, native telemetry and isolated task persistence. Run it on an unconfigured checkout with no local provider keys and with a display (Xvfb on Linux). Paid live provider access and physical Mac microphone/speakers still require local validation.
