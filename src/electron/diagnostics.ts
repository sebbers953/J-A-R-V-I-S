export type Stage = 'transcription' | 'response' | 'tts';
export type FailureKind = 'authentication' | 'payment_required' | 'permission' | 'not_found' | 'invalid_request' | 'rate_limit' | 'server' | 'timeout' | 'network' | 'invalid_response' | 'response_too_large' | 'cancelled' | 'unknown';
const kinds: FailureKind[] = ['authentication','payment_required','permission','not_found','invalid_request','rate_limit','server','timeout','network','invalid_response','response_too_large','cancelled','unknown'];
export function failureInfo(error: unknown): { kind: FailureKind; status?: number } {
  const e = error && typeof error === 'object' ? error as {status?: unknown; kind?: unknown; name?: unknown; code?: unknown; cause?: {code?: unknown}} : {};
  const status = typeof e.status === 'number' && Number.isInteger(e.status) && e.status>=100 && e.status<=599 ? e.status : undefined;
  if (kinds.includes(e.kind as FailureKind)) return {kind:e.kind as FailureKind,status};
  if(status === 401) return {kind:'authentication',status};
  if(status === 402) return {kind:'payment_required',status};
  if(status === 403) return {kind:'permission',status};
  if(status === 404) return {kind:'not_found',status};
  if(status === 400 || status === 413 || status === 415 || status === 422) return {kind:'invalid_request',status};
  if(status === 429) return {kind:'rate_limit',status};
  if(status && status>=500) return {kind:'server',status};
  if(e.name === 'TimeoutError' || e.code === 'ETIMEDOUT' || e.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') return {kind:'timeout',status};
  if(e.name === 'AbortError') return {kind:'cancelled',status};
  if(e.name === 'APIConnectionError' || e.name === 'TypeError' || ['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(String(e.cause?.code || e.code))) return {kind:'network',status};
  return {kind:'unknown',status};
}
export function stageLabel(stage: Stage): string {
  return stage === 'transcription' ? 'Fish Audio transcription' : stage === 'response' ? 'Grok response' : 'Fish Audio voice';
}
export function failureMessage(stage: Stage, error: unknown): string {
  const {kind,status}=failureInfo(error);
  const hints: Record<FailureKind,string> = {
    authentication:'authentication failed; check the local API key',
    payment_required:stage==='response'?'API payment required; check xAI API billing':'insufficient developer API credit; check Fish API Billing, not the web-plan credit meter',
    permission:'access denied; check API permissions and credits',
    not_found:stage==='response'?'model or endpoint unavailable; check Grok model access':stage==='tts'?'voice/model or endpoint unavailable; check Fish voice access':'transcription endpoint unavailable',
    invalid_request:stage==='tts'?'request rejected; check Fish voice/model configuration':stage==='transcription'?'audio request rejected; check the transcription format':'request rejected; check Grok model support',
    rate_limit:'quota or rate limit reached',server:'provider service unavailable',timeout:'request timed out',network:'network or TLS connection failed',
    invalid_response:'unexpected provider response',response_too_large:'provider response exceeded the size limit',cancelled:'cancelled',unknown:'request failed; see the main-process stage log',
  };
  return `${stageLabel(stage)} failed${status ? ` (HTTP ${status})` : ''}: ${hints[kind]}.`;
}
// Only fixed labels, a local turn number, elapsed time and normalized failure metadata.
// Never pass an Error, provider body, URL query, header, transcript, audio, or env value here.
export function logStage(turn: number, stage: Stage, event: 'start' | 'success' | 'failed' | 'cancelled', elapsedMs = 0, error?: unknown) {
  const info=event==='cancelled' ? {kind:'cancelled' as FailureKind} : error === undefined ? undefined : failureInfo(error);
  console.info(`[JARVIS] turn=${turn} stage=${stage} provider=${stage==='response'?'xAI':'FishAudio'} event=${event} elapsed_ms=${Math.max(0,Math.round(elapsedMs))}${info ? ` category=${info.kind}${info.status ? ` http_status=${info.status}` : ''}` : ''}`);
}
