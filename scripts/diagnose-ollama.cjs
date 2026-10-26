const path=require('node:path');
const {loadAssistantConfig}=require('../dist/electron/electron/config.js');
const {OllamaProviders}=require('../dist/electron/electron/providers.js');
const {PERSONALITY}=require('../dist/electron/electron/assistant.js');
const {failureMessage}=require('../dist/electron/electron/diagnostics.js');
(async()=>{
 const options=loadAssistantConfig(path.resolve(__dirname,'..'));
 try{
  const text=await new OllamaProviders(options).respond([{role:'user',content:'Reply briefly that the local connection is working.'}],PERSONALITY,new AbortController().signal);
  console.info('[JARVIS] local Ollama chat succeeded.');
  console.info(text);
 }catch(error){console.error(failureMessage('response',error));process.exitCode=1;}
})().catch(()=>{console.error('Local diagnostic could not start. Run npm run build.');process.exitCode=1;});
