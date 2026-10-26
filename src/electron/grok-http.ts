/** Main-process diagnostics. Never serialize a Request or its Authorization headers. */
export class GrokHttpError extends Error {
  constructor(public status: number, public operation: 'catalog' | 'response', public body: string) {
    super('Grok HTTP request failed');
  }
}
export function redactGrokBody(raw: string, secrets: string[]): string {
  const redact=(text:string)=>{
    for(const secret of secrets.filter(Boolean)) {
      for(const value of new Set([secret,encodeURIComponent(secret),JSON.stringify(secret).slice(1,-1)])) text=text.split(value).join('[REDACTED]');
    }
    return text.replace(/\b(?:xai|sk)-[A-Za-z0-9_-]{10,}/g,'[REDACTED]').replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]');
  };
  const visit=(value:unknown):unknown=>{
    if(typeof value==='string')return redact(value);
    if(Array.isArray(value))return value.map(visit);
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[redact(key),/authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|(^|[_-])token($|[_-])|password|secret|cookie/i.test(key)?'[REDACTED]':visit(item)]));
    return value;
  };
  try {
    let parsed: unknown;
    try {parsed=JSON.parse(raw);}catch{return redact(raw);}
    return JSON.stringify(visit(parsed));
  } catch {return '[Provider error body could not be rendered safely]';}
}
export async function readGrokBody(response:Response):Promise<string> {
  // Bound successful/error bodies; ordinary errors are retained in full, never silently truncated.
  if(!response.body)return '';
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>2_000_000)return '[Provider body exceeded the 2 MB diagnostic limit; body not captured]';chunks.push(value);}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function grokTransport(request:typeof fetch, secrets:string[]):typeof fetch {
  return async(input,init)=>{
    const req=new Request(input,init);const operation=req.url.endsWith('/models')?'catalog' as const:'response' as const;
    if(operation==='response' && req.method==='POST') {
      const body=await req.clone().json() as Record<string,unknown>;
      // Show every wire parameter; conversation text is deliberately omitted.
      const summary={...body,input:Array.isArray(body.input)?body.input.map(item=>({role:item.role,content:'[conversation text omitted]'})):'[conversation text omitted]'};
      console.info(`[JARVIS] grok_request ${redactGrokBody(JSON.stringify({method:req.method,endpoint:new URL(req.url).pathname,body:summary}),secrets)}`);
    }
    const response=await request(req);
    if(!response.ok){
      const body=redactGrokBody(await readGrokBody(response),secrets);
      console.info(`[JARVIS] grok_http_error ${JSON.stringify({operation,status:response.status,body})}`);
      throw new GrokHttpError(response.status,operation,body);
    }
    return response;
  };
}
