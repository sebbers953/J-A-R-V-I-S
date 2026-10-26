import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APPROVED_APPS, type ActionHost } from './actions';
import { LocalInputError } from './memory-store';
const exec=promisify(execFile);
// No shell, user scripts or inherited API credentials. AppleScript source is static.
async function run(binary:string,args:string[],signal:AbortSignal,timeout=10_000) {
  if(process.platform!=='darwin')throw new LocalInputError('Mac control is only available on macOS.');
  const result=await exec(binary,args,{signal,timeout,maxBuffer:65536,env:{PATH:'/usr/bin:/bin:/usr/sbin',HOME:process.env.HOME,LANG:'en_US.UTF-8'}});
  signal.throwIfAborted();return result.stdout.trim();
}
export function macHost(tasks:ActionHost['tasks'],openExternal:(url:string)=>Promise<void>):ActionHost {
  return {
    tasks,
    async openApp(app,signal) {
      const bundle=APPROVED_APPS[app];if(!Object.hasOwn(APPROVED_APPS,app))throw new LocalInputError('Application is not approved.');
      await run('/usr/bin/open',['-b',bundle],signal);
      const running=await run('/usr/bin/osascript',['-e',`application id "${bundle}" is running`],signal);
      if(running!=='true')throw new LocalInputError('Application launch could not be verified.');
      return `${app} is running. No commands were entered.`;
    },
    async openURL(url) {
      if(process.platform!=='darwin')throw new LocalInputError('Mac control is only available on macOS.');
      await openExternal(url);return 'URL handed to the default browser. Page loading has not been verified.';
    },
    async media(operation,signal) {
      const running=await run('/usr/bin/osascript',['-e','application id "com.apple.Music" is running'],signal);
      if(running!=='true')throw new LocalInputError('Apple Music must already be open. No playback action was performed.');
      const script=operation==='play' ? 'tell application id "com.apple.Music" to play' : 'tell application id "com.apple.Music" to pause';
      await run('/usr/bin/osascript',['-e',script],signal);
      const state=await run('/usr/bin/osascript',['-e','tell application id "com.apple.Music" to get player state as string'],signal);
      if(state!==(operation==='play'?'playing':'paused'))throw new LocalInputError('Playback state could not be verified.');
      return `Apple Music is ${state}.`;
    },
    async shortcut(name,signal) {
      // Name is an individual argv value, never executable source. Allowlist checked by runner.
      await run('/usr/bin/shortcuts',['run',name],signal,60_000);
      return `Shortcuts reported successful completion of “${name}”. Its individual effects were not independently verified.`;
    }
  };
}
