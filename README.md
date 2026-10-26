# J.A.R.V.I.S.

Electron + TypeScript red/black V2 desktop HUD with an animated cratered moon and orbital stars, live clock/date, native CPU/RAM/storage/battery/uptime, persistent Daily Tasks, and an explicit-capture voice assistant.

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

An exported setting takes precedence over the corresponding `.env` entry. Restart JARVIS after edits. If you choose another local model, download that exact tag with `ollama pull` first. There is deliberately no remote URL override: the application only connects to `http://127.0.0.1:11434`. Model names containing cloud tags or remote URL namespaces are rejected. Each turn checks `/api/show`; models with `remote_host`/`remote_model` metadata are blocked before inference, including aliases. A local GGUF chat model is required. There is no fallback to Grok, Fish, OpenAI, Ollama cloud, web search or remote tools.

Run the daemon with `OLLAMA_NO_CLOUD=1` as `start:ollama` does, so the service also disallows cloud inference. Running the Ollama GUI with its own settings is a different service lifecycle; setting this variable only on JARVIS does not reconfigure an already-running daemon. See [Ollama's local-only documentation](https://github.com/ollama/ollama/blob/main/docs/faq.mdx#how-do-i-disable-ollamas-cloud-features).

The current Whisper/Kokoro paths are preserved. API-key values and raw daemon errors, transcripts and replies are not logged by the app. The model's visible answer and local diagnostic answer are intentionally displayed. Speech processes retain their private stdin/environment handling and temporary-file cleanup.

## Using the HUD

Click the microphone to begin **LISTENING**, speak, then click **Send utterance**. Clicking the microphone before sending discards the capture and enters **MUTED**. Capture is capped at 45 seconds / 8 MB. The input is encoded as WAV in memory; FFmpeg converts it to 16 kHz mono PCM16 for local Whisper.

States: **IDLE → LISTENING → THINKING → SPEAKING → IDLE** (with MUTED, INTERRUPTED and ERROR). THINKING, internally PROCESSING, covers local transcription and Ollama's response. Input tracks stop before processing and stay off throughout playback, preventing self-transcription. Clicking the microphone while processing or speaking cancels the turn and mutes. The existing waveform uses real microphone samples and then real playback samples; the existing core pulses with output audio. No always-on listening or wake phrase is enabled.

The exact local model response text is displayed and passed to local Kokoro, whose WAV plays through your default Mac output device. Three recent exchanges stay visible; ten exchanges remain in session memory and clear on restart. Ollama receives the existing JARVIS personality plus session messages through its native `/api/chat` endpoint with `stream:false`. Explicit approved commands are handled by a deterministic local dispatcher before chat; the model itself has no executable tools.

Microphone permission failure shows **MICROPHONE PERMISSION REQUIRED**. Allow Electron in System Settings → Privacy & Security → Microphone. Ollama needs no credentials. A stopped service reports that Ollama must be started; a missing model reports the appropriate `ollama pull` setup action. Cloud models, insufficient memory, malformed responses and timeouts have separate safe errors. Missing local tools/models show **Local speech-to-text** or **Local text-to-speech** setup errors directing you to `npm run setup:voice`. Ollama failures are separately labeled. A TTS failure retains the local model's visible text and conversation context. Terminal logs contain normalized stage/engine/timing/failure metadata only; no raw server body is printed.

Temporary audio/transcript files live in private OS temporary directories and are deleted after success, cancellation or failure. They are never added to the Daily Tasks database. Text goes to Kokoro over stdin, not in process arguments. Local programs run without a shell; their raw output is discarded. Forced app termination/power loss may leave an OS temporary directory, which can be removed normally.

The V2 presentation uses a red/black HUD, stationary J A R V I S lettering over a slowly rotating cratered moon, and depth-sorted orbital stars. HOME, MEMORY, TASKS, SYSTEM, HISTORY and SETTINGS organize the existing functionality. HOME has compact voice controls, real system data, today's tasks, quick actions and recent conversation; memory editing and detailed permissions are on their own pages. There is no Recent Action panel or mechanical moon ring. Escape/header button toggles fullscreen; ⌘Q quits. `npm start` launches the existing production build; `npm run dev` builds then launches.

## Tasks and system data

Tasks are scoped to local calendar dates; prior days are retained in `app.getPath('userData')/tasks.json` (normally `~/Library/Application Support/jarvis-hud/tasks.json` on macOS). Saves are atomic and validated. Read failures leave existing data intact and disable editing. CPU is measured from OS interval deltas, memory from the macOS VM counters described below, storage from home-volume statistics, uptime from the OS, and battery from macOS `pmset`. Unavailable readings are marked unavailable. Linux telemetry describes the cloud host, not your Mac.

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

RAM telemetry on macOS uses `vm_stat`'s reported page size (including Apple Silicon's 16 KB pages). Used RAM is anonymous pages minus purgeable pages, plus wired pages and physical compressor pages. File-backed pages plus purgeable pages are reported separately as reclaimable cache; logical pages stored in the compressor and swap are never added to used RAM. Hover over the existing RAM gauge/detail for cache, wired, compressed and swap values. Values labelled GB use binary GiB, matching the 24 GB physical-capacity convention. Pressure comes independently from `kern.memorystatus_vm_pressure_level` (green/yellow/red); unsupported systems show unavailable. Missing or inconsistent memory samples show a dash, never a full gauge.

To compare on your Mac, open Activity Monitor → Memory while JARVIS is running. Compare Memory Used, Wired Memory, Compressed, Cached Files and Swap Used with the gauge/tooltip, allowing for the two-second sampling interval. The used figure approximates Activity Monitor using public VM counters; its private accounting and rapidly changing snapshots can differ. Pressure is independent of allocation percentage. No Activity Monitor comparison can be performed in the Linux build environment.

## Local memory, approved Mac actions and conversation

No new package or speech-model download is needed for this upgrade. Electron 39 bundles the SQLite API used here. Keep your existing `.env`, Ollama `llama3.1:8b`, Whisper and Kokoro `bm_george` setup. From the repository on your Mac:

```bash
git pull --ff-only origin main
npm ci
npm run typecheck
npm run build
npm test
npm start
```

Keep your existing local Ollama service running. If it is stopped, run `npm run start:ollama` in a separate terminal; do not start a second service if port 11434 is already occupied. `npm run diagnose:ollama` remains available to verify an actual local inference.

### Explicit durable memory

Use **MEMORY** in the sidebar to inspect, add, edit, export or delete notes, or turn memory off. Changing sections stops microphone capture and continuous mode. Memory defaults to enabled, but saves happen only through explicit commands or the Save button. There is no automatic summarization or passive extraction from conversations.

Supported voice commands include:

- “Remember that I prefer short answers.”
- “Remember preference: Use British spelling.”
- “Remember project: Build my trading journal.”
- “Remember summary: We finished the journal layout; next is testing.” (your explicitly approved summary)
- “What do you remember about trading?”
- “What were we working on last time?” (only explicitly stored project/summary entries)
- “Forget that [exact stored text].” (requires the HUD confirmation)
- “Disable memory.” (re-enable using MEMORY)

SQLite lives outside the checkout at `app.getPath('userData')/memory.sqlite`, normally `~/Library/Application Support/jarvis-hud/memory.sqlite`. The file is mode 600. It is local plaintext, not an encrypted vault: use FileVault and your macOS account protections. Known credential-like content is refused and no memory content is logged. Detection is conservative and cannot identify every possible secret; do not submit credentials as notes. Exports contain private note text: select a new file outside the repository in the native Save dialog. Existing files are never overwritten. Database files and the default export filename pattern are Git-ignored.

Up to 1,000 notes of 2,000 characters each are supported. Parameterized lexical retrieval ranks relevant notes and injects at most four notes / 4,500 characters into a prompt, labelled as untrusted data. This is not semantic/vector search. Recent chat is separate and remains bounded to ten exchanges. Memory mutations clear the recent model context to prevent stale recalled facts surviving an edit, deletion or disable. Disabling prevents both durable writes and retrieval, survives restarts, and leaves notes available only for explicit inspection/export/deletion. Deletions use SQLite secure-delete; OS backups, SSD snapshots and already exported files are outside the application's control.

### Safe explicit commands

Only the deterministic main-process dispatcher executes commands. Model output, stored notes and file contents cannot invoke tools. Every IPC endpoint checks the authorized HUD window and main frame; context isolation and the sandbox remain enabled with renderer Node integration disabled. Only fixed executable paths and individual validated arguments are used, without a shell or user-provided AppleScript.

| Command | Behavior and permission |
| --- | --- |
| “Open Safari / Terminal / Finder / Calendar / Activity Monitor” | HUD confirmation; approved bundle IDs only; Terminal opens without executing commands. Running state is checked before reporting success. |
| “Open https://example.com/path” | HUD confirmation; validated public HTTPS URL, no credentials or custom port. Reports handoff to default browser, not successful page loading. |
| “Open my trading charts” | Proposes `https://www.tradingview.com/chart/`; confirm before browser handoff. |
| “Play music” / “Pause music” | Apple Music must already be running. HUD confirmation; macOS may request **Automation** permission. Playback state is checked. Other players are currently unsupported. |
| “Create a task to [title]” / “List my tasks” / “Complete task [exact title]” | Uses the same dated, atomic task store as the HUD. Ambiguous titles are refused. Concurrent stale HUD edits are rejected and reloaded, preserving voice-created tasks. |
| “What is the date and time?” | Reads the local system clock directly. |
| “Run shortcut [exact name]” | Allowlist its exact name in SETTINGS first, after reviewing it in Apple's Shortcuts app. Approval lasts this session only. Every run requires confirmation and warns about external/destructive effects. Exit status is checked; individual workflow effects are not independently verified. |
| “List files in folder [name or ID]” / “Read file [relative.txt] in folder [name or ID]” | Choose a folder via the native picker first. Grants are read-only, revocable and session-only. Duplicate folder names require the shown ID. |

No folders or shortcuts are preapproved. Whole-home/system/hidden folders are excluded by the picker. File access rejects traversal, hidden/credential filenames, symbolic links and oversized files; reads are restricted to UTF-8 `.txt`, `.md`, `.csv` up to 16 KB, displaying at most 4,000 characters. File content is not saved as memory automatically. macOS may separately request Documents/Desktop access; grant only the folders you intend to use. Do not approve folders being modified by untrusted programs concurrently.

Confirmations expire after 60 seconds, are single-use, and are invalidated by a new voice turn, mute/interruption, or opening settings. Confirmed-action results appear in the transcript/HUD as text. Failed or denied operations never produce a fabricated success. Cancellation can stop a running helper but cannot undo effects already performed by an application or shortcut. Arbitrary shell execution, messages, purchases, system-setting changes, file writes/deletion and unrestricted autonomous control are unsupported. Use the documented phrases; commands are intentionally not inferred from arbitrary conversation.

### Opt-in continuous conversation

Push-to-talk remains the default on every launch. Explicitly check **Continuous conversation** in the microphone strip, then click the microphone to begin. This permits successive temporary captures until you mute, interrupt, turn the mode off, hide the app, encounter an error or reach the inactivity timeout. It never persists consent across launches. Raw audio exists only during an utterance and private temporary speech processing; speech helpers remove their temporary files. No audio archive is created.

SETTINGS exposes silence duration (0.5–5 seconds, default 1.2) and idle timeout (15–300 seconds, default 30). An energy-based detector submits only after speech followed by silence; it is not a wake-word or speech-meaning detector and background noise can affect it. Captures remain capped at 45 seconds / 8 MB. Microphone tracks are stopped during transcription, generation and playback; after a reply, a 400 ms gap precedes the next capture. Pending action confirmations pause automatic resumption. Click **Interrupt** to stop playback immediately, abort an in-flight request and discard stale replies. It also disables continuous mode. Wake-word listening is unavailable and stays disabled; no additional listener/model is installed.

HUD labels are **IDLE, LISTENING, THINKING, SPEAKING, INTERRUPTED, ERROR, MUTED**. THINKING represents the existing internal PROCESSING state. Errors stop continuous mode and leave the text response visible if TTS failed; click the mic to recover. The British voice, local model, RAM correction and existing backend behavior remain unchanged; the frontend is organized into the V2 sections. A single-instance lock prevents duplicate JARVIS windows from launching concurrent backends. No persistent second Ollama/Whisper/Kokoro service is launched: the existing serialized local speech helpers and Ollama service are reused.

### Validation scope

Unit/integration tests cover SQLite restart persistence/CRUD/disable, bounded relevant retrieval, credential refusal, explicit intent routing, expiring single-use confirmations, action validation, symlink/traversal restrictions, IPC sender/frame authorization, silence policy, state recovery and cancellation. Browser tests exercise simulated real microphone audio, silence-triggered sending, continuous resumption, stopped input during playback, immediate playback interruption and stale-reply handling. Electron tests exercise actual SQLite and preload IPC, memory management/export, task commands and denial of an unrelated window. Native macOS app/media/Shortcuts adapters are tested with a fake OS transport; actual macOS Automation/folder permissions, physical microphone/speaker behavior and installed local model performance still need verification on your Mac. No live Mac-control success is claimed by these Linux checks.


## JARVIS V2 presentation and status

- **HOME**: the moon/star core, Push/Continuous selector, microphone and contextual Send/Interrupt buttons, live system summary, today's tasks, recent conversation, and working app/website/file/media/shortcut quick actions. There is no Recent Action panel. “Open website” opens a validated URL after confirmation; it is not a search or browsing AI feature.
- **MEMORY**: inspect, add, edit, export, delete and disable explicit durable notes. Existing SQLite storage is reused.
- **TASKS**: the same dated task store and checkboxes as HOME, with the editor expanded.
- **SYSTEM**: real telemetry plus separate capacity/used/cache/compressed/wired/swap/pressure details. Host data is sampled every two seconds while visible; failures show unavailable.
- **HISTORY**: up to ten exchanges in renderer memory, including verified control feedback. This view clears on reload/quit and never writes conversation text to durable memory automatically. The existing bounded model session history remains in the main process.
- **SETTINGS**: silence/timeout controls, approved read-only folders, reviewed shortcuts and privacy/permission information. No credentials are displayed or edited.

The Ollama indicator uses a read-only, timeout-bounded main-process request to `http://127.0.0.1:11434/api/tags`, every ten seconds while visible. ONLINE means the local daemon replied and the configured model tag was present; it is not a claim that an inference has completed. MODEL MISSING and OFFLINE/UNAVAILABLE are explicit failure states. Health checks never start/load a model, capture speech, access cloud services or send authorization headers. LAST TURN is initially unknown and shows actual elapsed transcription + response + synthesis time only after a successful utterance; it is not a fabricated reasoning benchmark. Weather/location and unsupported telemetry are omitted.

The celestial core uses one 2D canvas, 112 deterministic stars in four inclined orbital families, cached star sprites and a generated crater height map. Surface projection updates at most twice per second, orbital rendering at most 30 fps. The moon rotates in approximately 18 minutes; lettering is separate stationary HTML. Existing LISTENING/THINKING/SPEAKING states drive subtle motion/glow changes using actual audio amplitude. Approved successful confirmations trigger a short visual action pulse; an error causes a restrained darker tint/flicker. No WebGL, remote assets or new dependency is required.

Native hide/minimize and show/restore events cross a boolean-only, sender-checked preload boundary. The core and waveform stop animation while hidden; polling pauses too. Offscreen sections, page visibility and reduced motion are independently respected. On Mac, manually verify minimize/restore, physical microphone/speakers, the current Whisper/Kokoro installation, local Llama inference, actual Automation/folder permissions, and Activity Monitor CPU/GPU usage under normal workloads. Linux software-rendering measurements do not establish M4 hardware GPU utilization.

Validation includes the existing full unit/integration suite, browser voice/continuous/interruption/echo checks, real Electron memory/task/permission IPC tests, six-section navigation, native hide/show and isolated core lifecycle/performance checks (`node scripts/core-smoke.cjs`, optionally `CORE_ELECTRON_SMOKE=1`). Browser fixtures intentionally use mock telemetry/providers; production does not. Real Mac-control adapters retain their existing fake-OS tests; no live native Mac action is claimed from cloud validation.

To update an existing Mac installation, quit JARVIS first and run inside the repository:

```bash
git pull --ff-only origin main
npm ci
npm run build
npm test
npm start
```

Leave your existing Ollama service running. If it is stopped, run `npm run start:ollama` in a separate terminal. Do not start a duplicate daemon or reinstall working speech engines. No `.env` edits, API credentials or new speech/model downloads are required for V2.

## Optional Network Radar and Home Assistant

Open **SYSTEM → Network Radar**. The existing six-section V2 HUD, moon core, local voice services and storage remain in place. No network discovery or smart-home integration starts on launch. **Preview demo** creates clearly labelled simulated nodes using documentation-only `192.0.2.x` addresses. Demo data never enters main-process device state, voice queries, live discovery or smart control. Switching to demo first stops any live session; use **Live view** before live operations.

### Authorized local discovery

Choose a private IPv4 interface, check that you own/are authorized to use it, then start a 60-second session. Passive mode listens for mDNS/Bonjour and SSDP announcements without sending discovery queries. The separate active checkbox permits a single SSDP M-SEARCH multicast request and at most twelve DNS-SD/mDNS queries during the first eight seconds on that interface. There are no address sweeps, ping sweeps, TCP port scans, public ranges, XML/SSDP LOCATION fetches, authentication attempts or exploitation. IPv6-only, link-local-only and typical VPN/tunnel interfaces are not supported in this version.

The main-process service uses `multicast-dns` and Node UDP on standard mDNS `224.0.0.251:5353` and SSDP `239.255.255.250:1900`, bound to the selected interface for multicast membership/transmission. On-link private source addresses are required. mDNS A records must match the packet sender, avoiding false online status from third-party cached addresses. SSDP device classes are labelled self-advertised; hostname/device types are otherwise unknown. Untrusted TXT records, URLs and capabilities are not followed.

Online means **a recent local protocol announcement was received**, not an authenticated health check. Freshness is bounded by advertised TTL and a maximum of 45 seconds. An explicit protocol departure is labelled offline/reported; a quiet, expired, stopped, or changed-network observation becomes **unknown**, never assumed offline or online. The reachability count is deliberately labelled “recently observed”; there is no invented direct reachability or latency measurement. MAC addresses are optional **existing ARP-cache metadata**, read only when you click that button on macOS, and never establish online status. Device positions on the radar are illustrative and do not measure distance/location.

A single service is shared by voice and UI; repeated start requests do not create duplicates. It stops automatically after 60 seconds, when a selected interface/address/netmask change is detected, when the app window hides/minimizes, or when you click Stop/pause. Stop has a narrow independent IPC path so it remains available while another assistant/control request is busy. Cached observations are session-only, bounded to 128 IPs, and are not automatically saved as personal memory. The list shows all records; the canvas draws at most 80 markers. A sidebar indicator stays visible during a live session. Unchecking authorization revokes the selected scope immediately; changing interface/probing choice requires fresh authorization. To restart a paused session, explicitly start another session; changing network never silently authorizes a new one.

On macOS, allow the development **Electron** application under **System Settings → Privacy & Security → Local Network** if requested. Firewalls, Wi-Fi client isolation/VLANs, sleeping devices and multicast filtering can prevent discovery. Empty results do not prove an empty network. A future packaged Mac app should supply an appropriate `NSLocalNetworkUsageDescription` (and Bonjour service declarations when applicable) under its own bundle identity. This development project does not rewrite or re-sign your installed Electron bundle. Actual M4 permission/discovery behavior still needs testing on your Mac; UDP bind/membership errors are reported safely.

Voice commands use the existing deterministic dispatcher:

- “JARVIS, scan my local network.” — requires a previously authorized interface, then an explicit HUD confirmation; uses the selected passive/active mode.
- “JARVIS, show connected devices.” — opens live Network Radar (not the demo) and reports real observations. Continuous capture stops before changing sections.
- “JARVIS, stop the network scan.” — stops discovery and invalidates cached online state.
- “JARVIS, is [exact hostname/IP or approved light alias] online?” — reports recent protocol evidence or Home Assistant's current report, never inferred device health.
- “JARVIS, turn on/off my desk lights.” — only when the exact light alias is locally configured, integration is enabled, and the HUD confirmation is approved.

### Independently configured Home Assistant lights

Only Home Assistant's supported [REST API](https://developers.home-assistant.io/docs/api/rest/) is used: `GET /api/states/<approved-light-id>` and `POST /api/services/light/turn_on` or `turn_off`, with a bearer token kept exclusively in the main process. Discovery is not required to configure/use this integration. No raw discovered device can acquire control capabilities or become an approved light automatically.

Configure a private local JSON file **outside the repository**, for example `~/Library/Application Support/JARVIS/home-assistant-import.json`. Set file permissions to 600. This schema contains **placeholders only**; put your real token in the file locally using an editor, never in chat, shell arguments or Git:

```json
{
  "url": "https://homeassistant.local:8123",
  "token": "YOUR_LOCAL_HOME_ASSISTANT_TOKEN_HERE",
  "lights": [
    { "id": "light.desk", "name": "Desk lights" }
  ]
}
```

Use a dedicated appropriately restricted Home Assistant user/token where practical. Explicitly review each entity/alias. At most sixteen unique `light.*` entities are supported. Locks, switches, cameras, alarms, doors, thermostats, arbitrary services and scripts are refused. Even light actions may trigger automations: every control action requires a single-use, expiring HUD confirmation. Enable/disable and configuration changes invalidate pending light actions.

In **Network Radar**, click **Import local configuration** and choose that file in the native picker. Its contents never pass through renderer IPC or a token input field. Electron `safeStorage` encrypts the configuration into `app.getPath('userData')/home-assistant.enc` (mode 600; macOS OS/Keychain-backed encryption). Plaintext fallback such as Linux `basic_text` is refused. Importing does **not** enable requests. After a successful encrypted import, delete the original plaintext import file yourself. Backups of that original file are outside the app's control. `.env` is unchanged; no new environment secrets are required. Default import names and encrypted files are Git-ignored as an additional precaution.

Click **Enable integration**, then **Refresh approved lights** to read state. There is no automatic HA polling or service call. A fresh HA report is distinct from network reachability: the app cannot independently prove that physical hardware is online. Reports age to unknown after 45 seconds. State failures, authorization/TLS failures and cancelled requests never become fabricated success.

Local destinations are restricted to private IPv4, localhost, `.local` and `.home.arpa` names resolving to private IPv4. DNS results are checked and the connection is pinned to that checked address, retaining the original TLS SNI/Host. Redirects and public destinations are refused. LAN endpoints require HTTPS with a certificate trusted by the Node TLS runtime; self-signed certificates are never silently bypassed. For a private CA, configure trust locally (for example `NODE_EXTRA_CA_CERTS=/absolute/path/local-ca.pem npm start`). HTTP is allowed only for loopback/local proxies at localhost/127.0.0.1, never across the LAN. The common default `http://homeassistant.local:8123` must be secured with trusted HTTPS or a local proxy before use here. No Home Assistant proxy/server is installed automatically.

A successful service HTTP response is not proof of action completion. The adapter first reads the exact entity, sends at most one on/off service request, then checks fresh state (up to three bounded reads). It reports success only when HA returns the requested state, qualifying that physical hardware is not independently verified. If already in the requested state, it explicitly says no service call was made. Disabling aborts integration requests and clears in-memory credentials; removal requires confirmation and deletes the encrypted configuration. The app never logs tokens, raw API bodies or integration errors that could contain credentials.

### Radar performance and validation scope

Radar uses one lightweight Canvas 2D surface at at most 24 fps. It is static when stopped, pauses when offscreen/hidden/minimized and respects reduced motion. Status refresh runs every three seconds only while the panel is open or discovery is active, pauses when the app is hidden, and reads existing main-process state rather than sending discovery packets. No extra Ollama, Whisper or Kokoro instances are launched. Credentials, light state and LAN device state are separate from durable personal memory.

After updating, run inside the repository:

```bash
npm ci
npm run typecheck
npm run build
npm test
npm start
```

Existing Ollama/service/speech setup and `.env` remain unchanged. Additional checks are `node scripts/network-ui.cjs` (with Vite preview on port 4173), `npm run test:smoke` and `npm run test:electron`. Network tests use injected UDP transports and synthetic packets; smart-home tests use a fake adapter and a real **loopback test server**, not physical devices. No live LAN packets are sent by those discovery tests. Browser data is clearly marked demo/fixture. Actual Bonjour/SSDP discovery, MAC availability, OS Keychain/local-network permissions, HA TLS/token permissions, physical light effects, and CPU/GPU behavior alongside real inference on your M4 must be manually verified before claiming live support works there.

Implementation file inventory for this upgrade:

- Discovery/integration: `src/electron/network/address.ts`, `device-store.ts`, `discovery.ts`, `credentials.ts`, `home-assistant.ts`, `service.ts`.
- Main/voice/IPC integration: `src/electron/assistant.ts`, `local-features.ts`, `main.ts`, `preload.ts`, plus `src/shared.ts`.
- Presentation: `src/renderer/network.ts`, `network-radar.ts`, `layout.ts`, `main.ts`, `controls.ts`, `voice.ts`, `style.css`.
- Validation: `scripts/network.test.cjs`, `network-service.test.cjs`, `smart-home.test.cjs`, `network-ui.cjs`, `electron-smoke.cjs`, `smoke.cjs`.
- Dependencies/documentation: `package.json`, `package-lock.json`, `.gitignore`, `README.md`.

Discovery scope is an interface/private IPv4 subnet, not an authenticated SSID identity. A Wi-Fi change that preserves the same interface, address and netmask may not be detectable by the portable OS interface watcher. Stop/revoke discovery before switching networks and authorize again on the new network. Active query transmission is limited to the initial eight-second window; no later background probing is scheduled.
