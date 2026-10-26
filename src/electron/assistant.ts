import { CloudProviders, type ProviderKeys, type VoiceProviders, type Message } from './providers';
import type { AssistantResult } from '../shared';
export const PERSONALITY = "You are JARVIS, Seb's personal desktop AI assistant. Speak naturally, intelligently and concisely. You are calm, capable, slightly futuristic, and conversational. Prefer short spoken answers unless the user requests detail. Never claim to have performed computer actions: you have no computer-control tools.";
export const CONFIGURATION_MESSAGE = 'CONFIGURATION REQUIRED';
export class Assistant {
  private client: VoiceProviders | null;
  private history: Message[] = [];
  private controller: AbortController | null = null;
  constructor(keys: ProviderKeys = {}, client?: VoiceProviders) {
    const usable = (value?: string) => !!value?.trim() && !/^your_.*key_here$/.test(value) && value !== 'your_key_here';
    this.client = client ?? (usable(keys.grok) && usable(keys.fish) ? new CloudProviders(keys) : null);
  }
  configured() { return this.client !== null; }
  cancel() { this.controller?.abort(); }
  async turn(payload: unknown): Promise<AssistantResult> {
    if (!this.client) return { ok: false, message: CONFIGURATION_MESSAGE };
    if (this.controller) return { ok: false, message: 'Assistant is already processing.' };
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Invalid audio input.' };
    const { audio, mime } = payload as { audio: unknown; mime: unknown };
    if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 8_000_000 || typeof mime !== 'string' || mime !== 'audio/wav') return { ok: false, message: 'Invalid audio input.' };
    const controller = new AbortController(); this.controller = controller;
    let user = ''; let text = '';
    try {
      user = (await this.client.transcribe(audio, controller.signal)).trim().slice(0, 8000);
      if (!user) return { ok: false, message: 'No speech detected. Please try again.' };
      text = (await this.client.respond([...this.history, { role: 'user', content: user }], PERSONALITY, controller.signal)).trim();
      if (!text) return { ok: false, message: 'No assistant response. Please try again.', user };
      if (controller.signal.aborted) return { ok: false, message: 'Cancelled.' };
      this.history = [...this.history, { role: 'user' as const, content: user }, { role: 'assistant' as const, content: text }].slice(-20);
      try {
        const bytes = Buffer.from(await this.client.speak(text, controller.signal));
        if (controller.signal.aborted) return { ok: false, message: 'Cancelled.' };
        return { ok: true, user, text, audio: bytes.toString('base64') };
      } catch {
        return controller.signal.aborted ? { ok: false, message: 'Cancelled.' } : { ok: true, user, text, audio: null, warning: 'Fish Audio voice unavailable. Response shown below.' };
      }
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
      return { ok: false, user: user || undefined, message: controller.signal.aborted ? 'Cancelled.' : status === 401 || status === 403 ? 'Provider authentication failed. Check your local Grok and Fish Audio configuration.' : status === 429 ? 'API limit reached. Please try again later.' : 'Grok or Fish Audio unavailable. Please try again.' };
    } finally { this.controller = null; }
  }
}
