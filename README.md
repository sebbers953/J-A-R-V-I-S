# J.A.R.V.I.S.

Electron + TypeScript desktop HUD with animated rings, live clock/date, native CPU/RAM/storage/battery/uptime, persistent Daily Tasks, and an explicit-capture voice assistant.

**Voice pipeline: microphone → local whisper.cpp → local Ollama (Llama 3.1 8B) → local Kokoro ONNX → speakers.** All inference stays on your Mac after the one-time downloads. No cloud AI API calls, API keys or paid speech services are used.

## macOS installation / upgrade — Apple M4, 24 GB

The initial model is **Llama 3.1 8B**, Ollama tag **`llama3.1:8b`**, as requested for your confirmed M4 MacBook with 24 GB unified memory. Its quantized download is roughly 5 GB, with additional RAM needed for runtime/context. This leaves room for the existing Whisper/Kokoro engines and normal macOS use. Ollama automatically uses Apple Silicon acceleration. Context is bounded to 4096 tokens, output to 512 tokens; the model remains warm for five minutes to reduce repeated startup latency. First inference can take longer while the model loads.

Requires Node 24 LTS (minimum 22.13) and a macOS version supported by the current Ollama release (currently macOS Sonoma 14 or later). Homebrew is used below for installation. Keep your existing `.env`, Whisper installation, Kokoro installation and voice settings untouched.

In Terminal 1, from your existing checkout:

```bash
git pull --ff-only origin main
npm ci
npm run build
brew install ollama
npm run start:ollama
```

Leave that Terminal running. `start:ollama` runs `ollama serve` bound to `127.0.0.1:11434` with `OLLAMA_NO_CLOUD=1`. It does not forward API keys to the daemon. If another Ollama app/service already owns port 11434, quit that app or stop the service you started, then rerun this command. JARVIS does not kill unrelated services automatically.

In Terminal 2, from the same checkout:

```bash
ollama pull llama3.1:8b
npm run typecheck
npm test
npm run diagnose:ollama
npm start
```

`ollama pull` is the one-time public model download; it needs internet and sufficient free disk space. It does not send conversation/audio. `diagnose:ollama` sends a fixed test sentence to the local model and prints a success message only after a completed chat response is actually received. It does not use the microphone or change voice configuration. Once the models are downloaded, the complete voice pipeline works offline. No account, API key, paid inference, cloud fallback, or speech subscription is required.

On subsequent launches, start Ollama in Terminal 1 if it is not already running (`npm run start:ollama`), then run `npm start` in Terminal 2. Rebuild after source updates. The standard `npm start` workflow remains unchanged.

### Existing Whisper/Kokoro setup

**Do not reinstall working speech engines.** `npm run setup:voice` remains available only for a new installation or repair. It installs Homebrew `whisper.cpp`, FFmpeg and an isolated Python/Kokoro environment, downloads roughly 500 MB of speech models with published checksum verification, and runs a local synthesis/transcription self-test. It does not install Ollama or edit `.env`/task files.

Existing default speech directory:

```text
~/Library/Application Support/JARVIS/speech/
```

Whisper remains English `base.en`; Kokoro remains the existing British male preset (`bm_george`, or your existing `JARVIS_TTS_VOICE`). Its 0.92 speaking speed, audio generation/playback path and voice models have not changed. There is no voice cloning or actor impersonation.

## Local configuration

No API key is required. Existing `GROK_API_KEY`, `GROK_MODEL`, Fish or OpenAI entries in your local `.env` are ignored and left untouched. No migration command deletes or rewrites `.env`. The app reads only its Ollama model and existing speech configuration from that file. `.env`, `.env.local` and other environment files remain Git-ignored.

The defaults require no `.env` edits. Optional non-secret settings (beside `package.json`):

```dotenv
OLLAMA_MODEL=llama3.1:8b
JARVIS_TTS_VOICE=bm_george
# JARVIS_SPEECH_DIR=/your/existing/speech/directory
```

An exported setting takes precedence over the corresponding `.env` entry. Restart JARVIS after edits. If you choose another local model, download that exact tag with `ollama pull` first. There is deliberately no remote URL override: the application only connects to `http://127.0.0.1:11434`. Model names containing cloud tags or remote URL namespaces are rejected. Each turn checks `/api/show`; models with `remote_host`/`remote_model` metadata are blocked before inference, including aliases. A local GGUF chat model is required. There is no fallback to Grok, Fish, OpenAI, Ollama cloud, web search or external tools.

Run the daemon with `OLLAMA_NO_CLOUD=1` as `start:ollama` does, so the service also disallows cloud inference. Running the Ollama GUI with its own settings is a different service lifecycle; setting this variable only on JARVIS does not reconfigure an already-running daemon. See [Ollama's local-only documentation](https://github.com/ollama/ollama/blob/main/docs/faq.mdx#how-do-i-disable-ollamas-cloud-features).

The current Whisper/Kokoro paths are preserved. API-key values and raw daemon errors, transcripts and replies are not logged by the app. The model's visible answer and local diagnostic answer are intentionally displayed. Speech processes retain their private stdin/environment handling and temporary-file cleanup.

## Using the HUD

Click the microphone to begin **LISTENING**, speak, then click **Send utterance**. Clicking the microphone before sending discards the capture and enters **MUTED**. Capture is capped at 45 seconds / 8 MB. The input is encoded as WAV in memory; FFmpeg converts it to 16 kHz mono PCM16 for local Whisper.

States: **IDLE → LISTENING → PROCESSING → SPEAKING → IDLE**. PROCESSING covers local transcription and Ollama's response. Input tracks stop before processing and stay off throughout playback, preventing self-transcription. Clicking the microphone while processing or speaking cancels the turn and mutes. The existing waveform uses real microphone samples and then real playback samples; the existing core pulses with output audio. No always-on listening or wake phrase is enabled.

The exact local model response text is displayed and passed to local Kokoro, whose WAV plays through your default Mac output device. Three recent exchanges stay visible; ten exchanges remain in session memory and clear on restart. Ollama receives the existing JARVIS personality plus session messages through its native `/api/chat` endpoint with `stream:false`. No computer-control tools are enabled. The assistant is instructed never to claim it performed an action: it cannot control your computer.

Microphone permission failure shows **MICROPHONE PERMISSION REQUIRED**. Allow Electron in System Settings → Privacy & Security → Microphone. Ollama needs no credentials. A stopped service reports that Ollama must be started; a missing model reports the appropriate `ollama pull` setup action. Cloud models, insufficient memory, malformed responses and timeouts have separate safe errors. Missing local tools/models show **Local speech-to-text** or **Local text-to-speech** setup errors directing you to `npm run setup:voice`. Ollama failures are separately labeled. A TTS failure retains the local model's visible text and conversation context. Terminal logs contain normalized stage/engine/timing/failure metadata only; no raw server body is printed.

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

Tests cover state transitions, session context/personality, cancellation, error redaction, loopback-only Ollama HTTP routing, cloud model blocking, local child-process contracts, private stdin/environment handling, missing models, WAV encoding and Daily Tasks persistence validation. Process fixtures exercise the adapters without requiring every contributor to download models. The installer separately runs a real local synthesis/transcription round-trip.

Renderer checks: run `npm run preview -- --port 4173` in one terminal, then `npm run test:smoke` in another. These use system Chromium (`CHROMIUM_PATH` overrides `/usr/bin/chromium`), a simulated microphone and a mock assistant bridge to check tasks, clock, telemetry mapping, waveform, voice transitions/playback, echo prevention and responsive MacBook/mobile layouts. Browser preview has no native speech/Ollama bridge. The test screenshot is `/workspace/jarvis-hud.png` in cloud.

`npm run test:electron` checks real key-free Electron startup, isolated task persistence and native metrics on a machine with a display (Xvfb on Linux). No API key is needed for that check. Physical Mac permissions, speakers, Apple Silicon performance and your local Ollama model inference need local validation.

## Sources / licenses

- [Ollama native chat API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion): `/api/chat`, `/api/show`, `messages`, `stream:false`, bounded `options` and `keep_alive`.
- [Ollama](https://ollama.com) / [Llama 3.1 library](https://ollama.com/library/llama3.1). Model licensing is provided with the model; use `ollama show --license llama3.1:8b` to view it.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and published model checksums, MIT.
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), MIT; Kokoro model Apache 2.0.

A packaged/signable macOS distribution is outside this setup; it needs microphone usage descriptions and appropriate signing/entitlements. This repository runs from its existing source checkout with `npm start`.
