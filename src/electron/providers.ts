import { SpaceXAI } from '@xai-official/sdk';
import { encode } from '@msgpack/msgpack';
import type { FailureKind } from './diagnostics';
export interface ProviderKeys { grok?: string; fish?: string }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface VoiceProviders {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  respond(history: Message[], personality: string, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class ProviderError extends Error {
  constructor(public provider: 'Fish Audio' | 'Grok', public status: number, public kind?: FailureKind) { super('Provider request failed'); }
}
export const GROK_MODEL = 'grok-4.7';
export const FISH_MODEL = 's2.1-pro';
// These HTTP contracts follow the providers' official SDKs (sources in README).
export class CloudProviders implements VoiceProviders {
  private grok: SpaceXAI;
  private readonly voiceId: string | undefined;
  constructor(private keys: ProviderKeys, private request: typeof fetch = fetch) {
    const voiceId = process.env.FISH_AUDIO_MODEL_ID?.trim();
    this.voiceId = voiceId && voiceId !== 'your_model_id_here' ? voiceId : undefined;
    // Never let an inherited debug flag enable SDK request logging.
    delete process.env.XAI_DEBUG;
    this.grok = new SpaceXAI({ apiKey: keys.grok!, baseURL: 'https://api.x.ai/v1', timeout: 60_000, maxRetries: 0, fetch: request });
  }
  private async fish(path: 'asr' | 'tts', body: BodyInit, signal: AbortSignal, headers: Record<string,string> = {}) {
    const response = await this.request(`https://api.fish.audio/v1/${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.keys.fish}`, ...headers }, body,
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new ProviderError('Fish Audio', response.status); }
    return response;
  }
  async transcribe(audio: Uint8Array, signal: AbortSignal) {
    // Fish's current Python SDK uses MessagePack with binary WAV, not multipart.
    const body=encode({audio,ignore_timestamps:true});
    const response = await this.fish('asr', new Uint8Array(body), signal, {'Content-Type':'application/msgpack'});
    let data: { text?: unknown };
    try { data=JSON.parse(new TextDecoder().decode(await boundedBytes(response,2_000_000))); }
    catch(error) { if(error instanceof ProviderError) throw error; throw new ProviderError('Fish Audio',response.status,'invalid_response'); }
    if (!data || typeof data.text !== 'string') throw new ProviderError('Fish Audio',response.status,'invalid_response');
    return data.text;
  }
  async respond(history: Message[], personality: string, signal: AbortSignal) {
    const response = await this.grok.responses.create({
      model: GROK_MODEL, input: [{ role: 'system', content: personality }, ...history],
      max_output_tokens: 2048, reasoning: { effort: 'low' }, store: false, stream: false,
    }, { signal });
    const text=response.toText().trim();
    if(!text) throw new ProviderError('Grok',200,'invalid_response');
    return text;
  }
  async speak(text: string, signal: AbortSignal) {
    const body = encode({ text, format: 'wav', ...(this.voiceId ? { reference_id: this.voiceId } : {}) });
    const response = await this.fish('tts', new Uint8Array(body), signal, { 'Content-Type': 'application/msgpack', model: FISH_MODEL });
    const bytes = await boundedBytes(response, 20_000_000);
    if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0,4))!=='RIFF' || new TextDecoder().decode(bytes.subarray(8,12))!=='WAVE') throw new ProviderError('Fish Audio',response.status,'invalid_response');
    return bytes;
  }
}
async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new ProviderError('Fish Audio',response.status,'invalid_response');
  const reader=response.body.getReader(); const chunks: Uint8Array[]=[];let total=0;
  try {
    while (true) { const {value,done}=await reader.read(); if(done) break; total+=value.length; if(total>limit) throw new ProviderError('Fish Audio',response.status,'response_too_large'); chunks.push(value); }
    const result=new Uint8Array(total);let offset=0; for(const chunk of chunks) {result.set(chunk,offset);offset+=chunk.length;} return result;
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
