import type { AssistantHealth } from '../shared';
import { OLLAMA_MODEL } from './providers';
// Read-only local daemon health. Never starts a model or sends conversation/audio.
export async function assistantHealth(model:string=OLLAMA_MODEL,voice?:string,request:typeof fetch=fetch):Promise<AssistantHealth> {
  const safe=/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/.test(model)&&!/^(?:sk-|xai-)|cloud|https?:/i.test(model);
  const result:AssistantHealth={available:false,installed:false,model:safe?model:null,voice:voice==='bm_george'||voice==='bm_lewis'?voice:null};
  if(!safe)return result;
  try {
    const response=await request(new Request('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(1500),redirect:'error'}));
    if(!response.ok||!response.body)return result;
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    try {while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>262144)return result;chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!Array.isArray(data?.models))return result;
    return {...result,available:true,installed:data.models.some((entry:unknown)=>!!entry&&typeof entry==='object'&&'name' in entry&&(entry.name===model||entry.name===`${model}:latest`))};
  } catch {return result;}
}
