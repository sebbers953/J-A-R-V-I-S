import OpenAI, { toFile } from 'openai';
import type { AssistantResult } from '../shared';
export const PERSONALITY = "You are JARVIS, Seb's personal desktop AI assistant. Speak naturally, intelligently and concisely. You are calm, capable, slightly futuristic, and conversational. Prefer short spoken answers unless the user requests detail. Never claim to have performed computer actions: you have no computer-control tools.";
export const CONFIGURATION_MESSAGE = 'CONFIGURATION REQUIRED';
export class Assistant {
  private client: OpenAI | null;
  private history: { role: 'user' | 'assistant'; content: string }[] = [];
  private controller: AbortController | null = null;
  constructor(key?: string, client?: OpenAI) {
    this.client = client ?? (key && key !== 'your_key_here' ? new OpenAI({ apiKey: key, timeout: 60_000, maxRetries: 0, logLevel: 'off' }) : null);
  }
  configured() { return this.client !== null; }
  cancel() { this.controller?.abort(); }
  async turn(payload: unknown): Promise<AssistantResult> {
    if (!this.client) return { ok: false, message: CONFIGURATION_MESSAGE };
    if (this.controller) return { ok: false, message: 'Assistant is already processing.' };
    if (!payload || typeof payload !== 'object') return { ok: false, message: 'Invalid audio input.' };
    const { audio, mime } = payload as { audio: unknown; mime: unknown };
    if (!(audio instanceof Uint8Array) || audio.byteLength < 100 || audio.byteLength > 8_000_000 || typeof mime !== 'string' || !/^audio\/(webm|mp4|ogg)(;codecs=[\w,-]+)?$/.test(mime)) return { ok: false, message: 'Invalid audio input.' };
    const controller = new AbortController(); this.controller = controller;
    let user = ''; let text = '';
    try {
      const extension = mime.startsWith('audio/mp4') ? 'mp4' : mime.startsWith('audio/ogg') ? 'ogg' : 'webm';
      const transcript = await this.client.audio.transcriptions.create({ model: 'gpt-4o-mini-transcribe', file: await toFile(Buffer.from(audio), `speech.${extension}`, { type: mime.split(';')[0] }) }, { signal: controller.signal });
      user = transcript.text.trim().slice(0, 8000);
      if (!user) return { ok: false, message: 'No speech detected. Please try again.' };
      const response = await this.client.responses.create({ model: 'gpt-4.1-mini', instructions: PERSONALITY, input: [...this.history, { role: 'user', content: user }], max_output_tokens: 700, store: false }, { signal: controller.signal });
      text = response.output_text.trim();
      if (!text) return { ok: false, message: 'No assistant response. Please try again.', user };
      if (controller.signal.aborted) return { ok: false, message: 'Cancelled.' };
      this.history = [...this.history, { role: 'user' as const, content: user }, { role: 'assistant' as const, content: text }].slice(-20);
      try {
        const speech = await this.client.audio.speech.create({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: text, response_format: 'wav' }, { signal: controller.signal });
        const bytes = Buffer.from(await speech.arrayBuffer());
        if (controller.signal.aborted) return { ok: false, message: 'Cancelled.' };
        return { ok: true, user, text, audio: bytes.toString('base64') };
      } catch {
        return controller.signal.aborted ? { ok: false, message: 'Cancelled.' } : { ok: true, user, text, audio: null, warning: 'Voice playback unavailable. Response shown below.' };
      }
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
      return { ok: false, user: user || undefined, message: controller.signal.aborted ? 'Cancelled.' : status === 401 ? 'API authentication failed. Check your local configuration.' : status === 429 ? 'API limit reached. Please try again later.' : 'Connection or API unavailable. Please try again.' };
    } finally { this.controller = null; }
  }
}
