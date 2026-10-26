import { SpaceXAI } from '@xai-official/sdk';
import { LocalSpeech, type SpeechEngine, type LocalSpeechOptions } from './local-speech';
import type { FailureKind } from './diagnostics';
export interface ProviderKeys { grok?: string; model?: string; speech?: LocalSpeechOptions }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface VoiceProviders {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  respond(history: Message[], personality: string, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class ProviderError extends Error {
  constructor(public provider: 'Grok', public status: number, public kind?: FailureKind) { super('Provider request failed'); }
}
export const GROK_MODEL = 'grok-4.20-0309-non-reasoning';
const CHAT_MODELS=[GROK_MODEL,'grok-4.3','grok-4.6','grok-4.7'];
export class CloudProviders implements VoiceProviders {
  private grok: SpaceXAI;private speech: SpeechEngine;
  private selectedModel?: string;
  private preferredModel: string;private explicitModel: boolean;
  constructor(keys: ProviderKeys, request: typeof fetch = fetch, speech?: SpeechEngine) {
    this.preferredModel=keys.model?.trim() || GROK_MODEL;this.explicitModel=!!keys.model?.trim();
    delete process.env.XAI_DEBUG;
    this.grok=new SpaceXAI({apiKey:keys.grok!,baseURL:'https://api.x.ai/v1',timeout:60_000,maxRetries:0,fetch:request});
    this.speech=speech || new LocalSpeech(keys.speech!);
  }
  transcribe(audio: Uint8Array,signal: AbortSignal) {return this.speech.transcribe(audio,signal);}
  speak(text: string,signal: AbortSignal) {return this.speech.speak(text,signal);}
  private async model(signal: AbortSignal): Promise<string> {
    if(this.selectedModel)return this.selectedModel;
    let ids: Set<string>;
    try {
      const catalog=await this.grok.models.list({signal});
      ids=new Set(catalog.data.map(model=>model.id));
    } catch(error) {
      const status=error && typeof error==='object' && 'status' in error ? error.status : undefined;
      // Some scoped keys permit inference but not catalog reads. Let inference verify access.
      if(status!==403 && status!==404)throw error;
      console.info('[JARVIS] stage=response model_catalog=unavailable selection=configured-default');
      this.selectedModel=this.preferredModel;
      return this.selectedModel;
    }
    const candidates=this.explicitModel?[this.preferredModel]:CHAT_MODELS;
    const selected=candidates.find(id=>ids.has(id));
    if(!selected)throw new ProviderError('Grok',400,'model_unavailable');
    this.selectedModel=selected;
    console.info('[JARVIS] stage=response model_catalog=checked selection=available-chat-model');
    return selected;
  }
  async respond(history: Message[],personality: string,signal: AbortSignal) {
    const model=await this.model(signal);
    const response=await this.grok.responses.create({model,input:[{role:'system',content:personality},...history],max_output_tokens:2048,store:false,stream:false},{signal});
    const text=response.toText().trim();if(!text)throw new ProviderError('Grok',200,'invalid_response');return text;
  }
}
