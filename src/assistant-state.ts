import type { AssistantState } from './shared';
export type VoiceEvent = 'start' | 'submit' | 'reply' | 'finish' | 'mute' | 'error';
export function nextState(state: AssistantState, event: VoiceEvent): AssistantState {
  if (event === 'mute') return 'MUTED';
  if (event === 'error') return 'IDLE';
  if (event === 'start' && (state === 'IDLE' || state === 'MUTED')) return 'LISTENING';
  if (event === 'submit' && state === 'LISTENING') return 'PROCESSING';
  if (event === 'reply' && state === 'PROCESSING') return 'SPEAKING';
  if (event === 'finish' && (state === 'PROCESSING' || state === 'SPEAKING')) return 'IDLE';
  return state;
}
