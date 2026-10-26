import { SpaceXAI } from '@xai-official/sdk';
import { LocalSpeech, type SpeechEngine, type LocalSpeechOptions } from './local-speech';
import type { FailureKind } from './diagnostics';
export interface ProviderKeys { grok?: string; speech?: LocalSpeechOptions }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface VoiceProviders {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  respond(history: Message[], personality: string, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class ProviderError extends Error {
  constructor(public provider: 'Grok', public status: number, public kind?: FailureKind) { super('Provider request failed'); }
}
export const GROK_MODEL = 'grok-4.7';
export class CloudProviders implements VoiceProviders {
  private grok: SpaceXAI;private speech: SpeechEngine;
  constructor(keys: ProviderKeys, request: typeof fetch = fetch, speech?: SpeechEngine) {
    delete process.env.XAI_DEBUG;
    this.grok=new SpaceXAI({apiKey:keys.grok!,baseURL:'https://api.x.ai/v1',timeout:60_000,maxRetries:0,fetch:request});
    this.speech=speech || new LocalSpeech(keys.speech!);
  }
  transcribe(audio: Uint8Array,signal: AbortSignal) {return this.speech.transcribe(audio,signal);}
  speak(text: string,signal: AbortSignal) {return this.speech.speak(text,signal);}
  async respond(history: Message[],personality: string,signal: AbortSignal) {
    const response=await this.grok.responses.create({model:GROK_MODEL,input:[{role:'system',content:personality},...history],max_output_tokens:2048,reasoning:{effort:'low'},store:false,stream:false},{signal});
    const text=response.toText().trim();if(!text)throw new ProviderError('Grok',200,'invalid_response');return text;
  }
}
