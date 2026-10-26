import { LocalSpeech, type SpeechEngine, type LocalSpeechOptions } from './local-speech';
import type { FailureKind } from './diagnostics';
export interface ProviderOptions { model?: string; speech?: LocalSpeechOptions }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface VoiceProviders {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  respond(history: Message[], personality: string, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class ProviderError extends Error {
  constructor(public status: number | undefined, public kind: FailureKind) { super('Local Ollama operation failed'); }
}
// Selected for the user's confirmed Apple M4 / 24 GB unified memory.
export const OLLAMA_MODEL = 'llama3.1:8b';
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export class OllamaProviders implements VoiceProviders {
  private speech: SpeechEngine;private model: string;
  constructor(options: ProviderOptions = {},private request: typeof fetch = fetch,speech?: SpeechEngine) {
    this.model=options.model?.trim() || OLLAMA_MODEL;
    this.speech=speech || new LocalSpeech(options.speech!);
  }
  transcribe(audio: Uint8Array,signal: AbortSignal){return this.speech.transcribe(audio,signal);}
  speak(text: string,signal: AbortSignal){return this.speech.speak(text,signal);}
  private async post(path: '/api/show' | '/api/chat',body: unknown,signal: AbortSignal): Promise<Record<string,unknown>> {
    if(signal.aborted)throw new ProviderError(undefined,'cancelled');
    let response: Response;
    try {
      response=await this.request(new Request(`${OLLAMA_URL}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(180_000)]),redirect:'error'}));
    }catch(error){
      if(signal.aborted)throw new ProviderError(undefined,'cancelled');
      if(error instanceof Error && error.name==='TimeoutError')throw new ProviderError(undefined,'timeout');
      throw new ProviderError(undefined,'ollama_unavailable');
    }
    if(!response.body)throw new ProviderError(response.status,'invalid_response');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    let data: unknown;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2_000_000)throw new ProviderError(response.status,'response_too_large');chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ProviderError(response.status,'invalid_response');}
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    if(!response.ok){
      if(response.status===404)throw new ProviderError(404,'model_unavailable');
      // Interpret a known failure category; never log the raw body or an echoed prompt.
      const message=data && typeof data==='object' && 'error' in data ? String(data.error) : '';
      if(/memory|out of memory|cannot allocate/i.test(message))throw new ProviderError(response.status,'insufficient_memory');
      throw new ProviderError(response.status,response.status>=500?'server':'invalid_request');
    }
    if(!data || typeof data!=='object' || Array.isArray(data))throw new ProviderError(response.status,'invalid_response');
    return data as Record<string,unknown>;
  }
  async respond(history: Message[],personality: string,signal: AbortSignal) {
    // No host URLs or cloud tags; an alias is also checked against /api/show below.
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)?(?::[a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/.test(this.model) || /cloud/i.test(this.model) || (this.model.includes('/') && this.model.split('/')[0].includes('.')))throw new ProviderError(undefined,'cloud_model_blocked');
    // Check every turn so retagging a local alias cannot silently select a cloud model.
    const info=await this.post('/api/show',{model:this.model},signal);
    if(info.remote_host || info.remote_model)throw new ProviderError(undefined,'cloud_model_blocked');
    const details=info.details as {format?:unknown}|undefined;
    if(!details || details.format!=='gguf' || !info.model_info)throw new ProviderError(undefined,'invalid_response');
    if(Array.isArray(info.capabilities)&&!info.capabilities.includes('completion'))throw new ProviderError(undefined,'model_unavailable');
    const data=await this.post('/api/chat',{
      model:this.model,messages:[{role:'system',content:personality},...history],stream:false,
      options:{num_ctx:4096,num_predict:512,temperature:0.4},keep_alive:'5m',
    },signal);
    if(data.remote_host || data.remote_model)throw new ProviderError(undefined,'cloud_model_blocked');
    const message=data.message as {role?:unknown;content?:unknown}|undefined;
    if(data.done!==true || message?.role!=='assistant' || typeof message.content!=='string' || !message.content.trim())throw new ProviderError(undefined,'invalid_response');
    return message.content.trim();
  }
}
