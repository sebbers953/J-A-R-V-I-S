# J.A.R.V.I.S.

Electron + TypeScript desktop HUD with animated rings, live clock/date, native CPU/RAM/storage/battery/uptime, persistent Daily Tasks, and an explicit-capture voice assistant.

**Voice pipeline: microphone → local whisper.cpp → Grok/xAI → local Kokoro ONNX → speakers.** Fish Audio, paid speech services, and speech API credentials are not used. Grok remains remote and its normal API charges apply. Only transcript text and session conversation context go to xAI; microphone audio and synthesized voice stay on-device.

## macOS installation / upgrade

Requires macOS with [Homebrew](https://brew.sh) on PATH and Node.js 24 LTS (minimum 22.13). Apple Silicon is recommended. Keep your existing local `.env` and `GROK_API_KEY` unchanged.

From your existing clone:

```bash
git pull --ff-only origin main
npm ci
npm run setup:voice
npm run typecheck
npm run build
npm test
npm start
```

If Homebrew is not installed, install it using its official instructions at https://brew.sh first, then open a new Terminal. The setup command reports this prerequisite rather than silently installing a package manager. Homebrew may ask you to install Apple Command Line Tools or approve system installation steps.

`npm run setup:voice`:

1. Installs Homebrew `whisper.cpp`, `ffmpeg`, and `python@3.12`.
2. Creates an isolated Python environment and installs `kokoro-onnx==0.6.1` (ONNX Runtime, not PyTorch).
3. Downloads the English Whisper `base.en` model, Kokoro v1.0 ONNX weights, and Kokoro voices. The model downloads total roughly 500 MB; allow at least 2 GB of free disk space plus any additional Homebrew dependencies.
4. Verifies every model against `scripts/local-voice/models.json`: Whisper's published SHA-1 and Kokoro's published GitHub-release SHA-256 digests. TLS/checksum verification stays enabled. Incomplete downloads are removed, verified existing files are reused, and failed verification stops setup.
5. Synthesizes a fixed test sentence with Kokoro and transcribes it with Whisper, with no API calls. It writes `runtime.json` only after this local round-trip succeeds.

The installer never reads or rewrites `.env`, API keys, or task data. It excludes known API keys from child-process environments. Internet is needed for installation/model downloads; both speech stages work offline afterward. Rerun setup to repair tools or models. On Apple Silicon, whisper.cpp uses its normal Metal acceleration; Kokoro runs on CPU with up to four threads to keep resource use reasonable. Voice models are retained between launches. Runtime model files are not part of Git.

Default installation directory:

```text
~/Library/Application Support/JARVIS/speech/
  models/ggml-base.en.bin
  models/kokoro-v1.0.onnx
  models/voices-v1.0.bin
  venv/
  runtime.json
```

The first speech turn may take several seconds to load local models. Models are loaded per turn so no separate speech server is required and memory is released afterward. Speech processes time out after three minutes and are terminated when you cancel. This version uses English transcription.

## Local configuration

The only required API setting is your existing `GROK_API_KEY`, in `.env` beside `package.json` (for example `~/J-A-R-V-I-S/.env`). Nothing in setup modifies that file or key. Old `FISH_AUDIO_API_KEY` and `FISH_AUDIO_MODEL_ID` entries are ignored; they are not required and may be left untouched.

For a new checkout only, copy the placeholder template with `cp -n .env.example .env`, enter your Grok key privately using an editor, and use `chmod 600 .env`. Never put credentials in source, chat, screenshots, or Git. `.env`, `.env.local`, `.env.*`, and other environment files are ignored; only `.env.example` is tracked. Exported nonempty settings take precedence over `.env`.

Optional settings:

```dotenv
JARVIS_TTS_VOICE=bm_george
# JARVIS_SPEECH_DIR=/absolute/path/to/local/speech
```

`bm_george` is Kokoro's built-in British male preset, delivered at 0.92 speed for a measured, calm assistant tone. `bm_lewis` is another supported British male preset. Neither setup nor runtime uses voice cloning, reference recordings, or prompts targeting an actor. Perceived depth and style depend on the preset; no claim of matching a real person's voice is made.

If overriding `JARVIS_SPEECH_DIR`, export it in the same Terminal **before both setup and launch**, so the installer and app agree:

```bash
export JARVIS_SPEECH_DIR="$HOME/my-local-jarvis-speech"
npm run setup:voice
npm run build
npm start
```

Restart JARVIS after editing settings. Credentials are read only in Electron main, removed from the inherited environment before the renderer starts, and are not forwarded to local speech processes. No key, transcript, reply, audio, subprocess output, or raw provider error is logged. ONNX telemetry is disabled and runtime cloud-model fetching is disabled. Setup downloads public model artifacts; it does not send user audio to any endpoint.

## Using the HUD

Click the microphone to begin **LISTENING**, speak, then click **Send utterance**. Clicking the microphone before sending discards the capture and enters **MUTED**. Capture is capped at 45 seconds / 8 MB. The input is encoded as WAV in memory; FFmpeg converts it to 16 kHz mono PCM16 for local Whisper.

States: **IDLE → LISTENING → PROCESSING → SPEAKING → IDLE**. PROCESSING covers local transcription and Grok's response. Input tracks stop before processing and stay off throughout playback, preventing self-transcription. Clicking the microphone while processing or speaking cancels the turn and mutes. The existing waveform uses real microphone samples and then real playback samples; the existing core pulses with output audio. No always-on listening or wake phrase is enabled.

The exact Grok response text is displayed and passed to local Kokoro, whose WAV plays through your default Mac output device. Three recent exchanges stay visible; ten exchanges remain in session memory and clear on restart. Grok uses the official `@xai-official/sdk`, the xAI Responses API with `grok-4.20-0309-non-reasoning` preferred, `store: false`, and the existing concise JARVIS personality. No computer-control tools are enabled.

Microphone permission failure shows **MICROPHONE PERMISSION REQUIRED**. Allow Electron in System Settings → Privacy & Security → Microphone. Missing Grok credentials show **CONFIGURATION REQUIRED**, without breaking the rest of the HUD. Missing local tools/models show **Local speech-to-text** or **Local text-to-speech** setup errors directing you to `npm run setup:voice`. Grok failures are separately labeled. A TTS failure retains Grok's visible text and conversation context. Safe terminal logs contain stage, engine, timing and normalized error category only.

Temporary audio/transcript files live in private OS temporary directories and are deleted after success, cancellation or failure. They are never added to the Daily Tasks database. Text goes to Kokoro over stdin, not in process arguments. Local programs run without a shell; their raw output is discarded. Forced app termination/power loss may leave an OS temporary directory, which can be removed normally.

The HUD layout, panels, cyan styling, animations, task checkboxes, telemetry and clock are preserved. Only voice status labels/protocol labels reflect the local pipeline. Escape/header button toggles fullscreen; ⌘Q quits. `npm start` launches the existing production build; `npm run dev` builds then launches.

## Tasks and system data

Tasks are scoped to local calendar dates; prior days are retained in `app.getPath('userData')/tasks.json` (normally `~/Library/Application Support/jarvis-hud/tasks.json` on macOS). Saves are atomic and validated. Read failures leave existing data intact and disable editing. CPU is measured from OS interval deltas, memory from OS totals, storage from home-volume statistics, uptime from the OS, and battery from macOS `pmset`. Unavailable readings are marked unavailable. Linux telemetry describes the cloud host, not your Mac.

## Tests

```bash
npm run typecheck
npm run build
npm test
```

Tests cover state transitions, session context/personality, cancellation, error redaction, Grok-only HTTP routing, local child-process contracts, private stdin/environment handling, missing models, WAV encoding and Daily Tasks persistence validation. Process fixtures exercise the adapters without requiring every contributor to download models. The installer separately runs a real local synthesis/transcription round-trip.

Renderer checks: run `npm run preview -- --port 4173` in one terminal, then `npm run test:smoke` in another. These use system Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`), a simulated microphone and a mock assistant bridge to check tasks, clock, telemetry mapping, waveform, voice transitions/playback, echo prevention and responsive MacBook/mobile layouts. Browser preview has no native speech/Grok bridge. The test screenshot is `/workspace/jarvis-hud.png` in cloud.

`npm run test:electron` checks real unconfigured Electron startup, isolated task persistence and native metrics on a machine with a display (Xvfb on Linux). No API key is needed for that check. Physical Mac permissions, speakers, Apple Silicon performance and your paid Grok API access need local validation.

## Sources / licenses

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and [published model checksums](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md), MIT.
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), MIT; [v1.0 model assets and digests](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1); Kokoro model Apache 2.0.
- [xAI official TypeScript SDK](https://github.com/xai-org/xai-sdk-ts). Only Grok requires an online API account; no Fish or other speech subscription/API key is used.

A packaged/signable macOS distribution is outside this setup; it needs microphone usage descriptions and appropriate signing/entitlements. This repository runs from the source checkout with `npm start`.


## Grok model compatibility

The previous request pinned `grok-4.7` and sent `reasoning.effort=low` unconditionally. The preferred chat model is now `grok-4.20-0309-non-reasoning`, listed in the official SDK model catalog and [xAI cookbook](https://github.com/xai-org/xai-cookbook/tree/main/examples/reviews-to-themes). Requests omit the optional reasoning control entirely. The endpoint remains `https://api.x.ai/v1/responses`; personality, session history, output limit, `store:false`, and local speech are unchanged.

On the first response in a session, the app reads `/v1/models` with the existing key and selects the first listed chat model in this order: `grok-4.20-0309-non-reasoning`, `grok-4.3`, `grok-4.6`, `grok-4.7`. The selection is cached for that session. If none is listed, it reports model access clearly instead of guessing another model. A key whose catalog access is denied (403/404) can still attempt inference with the preferred/configured model; other catalog failures remain visible. No automatic repeated inference or paid fallback calls are made.

Optional `GROK_MODEL` in the local `.env` selects a specific account-listed model without modifying the key or source. It is not required; keep your existing `.env` unchanged to use automatic selection. Model availability in a catalog is not proof of remaining account credits or inference permission: the authenticated response call on your Mac is the final access check. Logs contain only selection status, never credentials or account catalog contents.
