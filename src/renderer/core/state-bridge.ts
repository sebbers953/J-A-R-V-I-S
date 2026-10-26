import { JarvisCore } from './jarvis-core';
// Visual-only adapter: reads the existing voice state and amplitude. Never calls
// providers, captures audio, executes actions, or changes the assistant state.
export function connectCoreToHud(host:HTMLElement,subscribeVisibility?: (callback:(visible:boolean)=>void)=>()=>void) {
  const core=new JarvisCore(host,{state:document.body.dataset.voice??'idle',audioLevel:()=>Number(document.body.style.getPropertyValue('--audio-level'))||0});
  const unsubscribe=subscribeVisibility?.(visible=>{if(typeof visible==='boolean')core.setWindowVisible(visible);});
  const state=new MutationObserver(()=>core.setState(document.body.dataset.voice??'idle'));
  state.observe(document.body,{attributes:true,attributeFilter:['data-voice']});
  const completed=()=>core.pulseAction();
  window.addEventListener('jarvis-action-complete',completed);
  const destroy=()=>{unsubscribe?.();state.disconnect();window.removeEventListener('jarvis-action-complete',completed);core.destroy();};
  return {core,destroy};
}
