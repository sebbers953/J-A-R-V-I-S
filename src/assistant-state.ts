import type { AssistantState } from './shared';
export type VoiceEvent = 'start' | 'submit' | 'reply' | 'finish' | 'mute' | 'error';
export function nextState(state: AssistantState, event: VoiceEvent): AssistantState {
  if (event === 'mute') return 'MUTED';
  if (event === 'error') return 'IDLE';
  if (event === 'start' && (state === 'IDLE' || state === 'MUTED')) return 'LISTENING';
  if (event === 'submit' && state === 'LISTENING') return 'THINKING';
  if (event === 'reply' && state === 'THINKING') return 'SPEAKING';
  if (event === 'finish' && (state === 'THINKING' || state === 'SPEAKING')) return 'IDLE';
  return state;
}
