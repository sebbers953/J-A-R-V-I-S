import type { ControlRequest, ControlResult, JarvisAPI, Proposal } from '../shared';
export function initControls(api:JarvisAPI|undefined) {
  const el=(id:string)=>document.getElementById(id)!;
  let editing:string|undefined,currentProposal:Proposal|undefined,pending=false,generation=0;
  let source:'action'|'management'='action';
  const input=el('memory-text') as HTMLTextAreaElement,category=el('memory-category') as HTMLSelectElement;
  const dialog=el('quick-dialog') as HTMLDialogElement;
  const select=(id:string,items:{id:string;name:string}[],empty:string)=>{
    const node=el(id) as HTMLSelectElement,previous=node.value;node.replaceChildren();
    if(!items.length){const option=document.createElement('option');option.value='';option.textContent=empty;node.append(option);}
    for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;node.append(option);}
    if(items.some(item=>item.id===previous))node.value=previous;
  };
  function showProposal(proposal:Proposal|undefined,origin:'action'|'management'='action') {
    currentProposal=proposal;source=origin;el('action-proposal').hidden=!proposal;el('action-description').textContent=proposal?.description??'';
    window.dispatchEvent(new CustomEvent('jarvis-proposal',{detail:!!proposal}));
    if(proposal)(el('deny-action') as HTMLButtonElement).focus();
  }
  window.addEventListener('jarvis-cancel-controls',()=>{generation++;showProposal(undefined);});
  async function request(q:ControlRequest,feedback=q.kind==='action'||q.kind==='confirm'&&source==='action'):Promise<ControlResult> {
    if(!api?.control){const result={ok:false,text:'Launch the desktop application to use local controls.'};el('control-message').textContent=result.text;return result;}
    if(pending)return {ok:false,text:'A local operation is already running.'};
    const token=generation;pending=true;window.dispatchEvent(new CustomEvent('jarvis-control-busy',{detail:true}));
    let result:ControlResult;
    try{result=await api.control(q);}catch{result={ok:false,text:'Local operation unavailable. Please retry.'};}
    finally{pending=false;window.dispatchEvent(new CustomEvent('jarvis-control-busy',{detail:false}));}
    if(token!==generation)return {ok:false,text:'Cancelled.'};
    el('control-message').textContent=q.kind==='memory-list'&&result.ok?'':result.text;
    if(feedback)window.dispatchEvent(new CustomEvent('jarvis-control-result',{detail:{text:result.text,ok:result.ok}}));
    if(result.proposal)showProposal(result.proposal,q.kind==='action'?'action':'management');
    if(q.kind==='confirm'){showProposal(undefined);if(q.approved&&result.ok)window.dispatchEvent(new Event('jarvis-action-complete'));}
    if(result.memories){
      const list=el('memory-list');list.replaceChildren();
      for(const memory of result.memories){
        const row=document.createElement('div');row.className='memory-row';
        const content=document.createElement('span');const tag=document.createElement('small');tag.textContent=memory.kind.toUpperCase();content.append(tag,document.createTextNode(memory.text));
        const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>{editing=memory.id;input.value=memory.text;category.value=memory.kind;el('memory-editor-title').textContent='EDIT NOTE';input.focus();};
        const remove=document.createElement('button');remove.textContent='Delete';remove.onclick=()=>void request({kind:'memory-delete',id:memory.id});
        row.append(content,edit,remove);list.append(row);
      }
      if(!result.memories.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='A clear slate. Save something worth remembering.';list.append(empty);}
    }
    if(typeof result.enabled==='boolean'){const enabled=el('memory-enabled') as HTMLInputElement;enabled.checked=result.enabled;enabled.disabled=false;}
    if(result.folders){
      const list=el('folder-list');list.replaceChildren();select('file-folder',result.folders,'No folders approved');
      for(const folder of result.folders){const row=document.createElement('p');row.className='permission-row';const name=document.createElement('span');name.textContent=folder.name;name.title=folder.id;const remove=document.createElement('button');remove.textContent='Revoke';remove.onclick=()=>void request({kind:'folder-revoke',id:folder.id});row.append(name,remove);list.append(row);}
    }
    if(result.shortcuts){
      const list=el('shortcut-list');list.replaceChildren();select('run-shortcut-name',result.shortcuts.map(name=>({id:name,name})),'No shortcuts approved');
      for(const name of result.shortcuts){const row=document.createElement('p');row.className='permission-row';const title=document.createElement('span');title.textContent=name;const remove=document.createElement('button');remove.textContent='Revoke';remove.onclick=()=>void request({kind:'shortcut-revoke',name});row.append(title,remove);list.append(row);}
    }
    if(q.kind!=='memory-list')window.dispatchEvent(new Event('jarvis-tasks-refresh'));
    return result;
  }
  const refresh=()=>request({kind:'memory-list'},false);
  (el('memory-enabled') as HTMLInputElement).onchange=e=>void request({kind:'memory-enabled',enabled:(e.target as HTMLInputElement).checked});
  el('save-memory').onclick=async()=>{const result=await request({kind:'memory-save',text:input.value,category:category.value as 'fact'|'summary'|'project'|'preference',id:editing});if(result.ok){editing=undefined;input.value='';el('memory-editor-title').textContent='ADD A NOTE';}};
  el('new-memory').onclick=()=>{editing=undefined;input.value='';el('memory-editor-title').textContent='ADD A NOTE';};
  el('refresh-memory').onclick=()=>void refresh();el('export-memory').onclick=()=>void request({kind:'memory-export'});el('clear-memory').onclick=()=>void request({kind:'memory-clear'});
  el('approve-folder').onclick=()=>void request({kind:'folder-approve'});el('approve-shortcut').onclick=()=>void request({kind:'shortcut-approve',name:(el('shortcut-name') as HTMLInputElement).value});
  el('confirm-action').onclick=()=>{if(currentProposal)void request({kind:'confirm',id:currentProposal.id,approved:true});};
  el('deny-action').onclick=()=>{if(currentProposal)void request({kind:'confirm',id:currentProposal.id,approved:false});};
  window.addEventListener('jarvis-result',event=>showProposal((event as CustomEvent<Proposal|undefined>).detail));
  el('close-quick').onclick=()=>dialog.close();
  const act=async(action:Extract<ControlRequest,{kind:'action'}>['action'])=>{dialog.close();return request({kind:'action',action});};
  el('open-app').onclick=()=>void act({kind:'open-app',app:(el('app-choice') as HTMLSelectElement).value});
  el('open-website').onclick=()=>void act({kind:'open-url',url:(el('website-url') as HTMLInputElement).value.trim()});
  el('run-shortcut').onclick=()=>void act({kind:'shortcut',name:(el('run-shortcut-name') as HTMLSelectElement).value});
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-media]'))button.onclick=()=>void act({kind:'media',operation:button.dataset.media as 'play'|'pause'});
  const files=async(read:boolean)=>{const result=await request({kind:'action',action:{kind:'files',folder:(el('file-folder') as HTMLSelectElement).value,...(read?{path:(el('file-path') as HTMLInputElement).value}:{})}},false);el('file-result').textContent=result.text;};
  el('list-files').onclick=()=>void files(false);el('read-file').onclick=()=>void files(true);
  return {request,refresh,showProposal,openQuick:async(page:string)=>{
    for(const section of document.querySelectorAll<HTMLElement>('[data-quick-page]'))section.hidden=section.dataset.quickPage!==page;
    el('quick-title').textContent=({app:'OPEN APPLICATION',website:'OPEN WEBSITE',files:'APPROVED FILES',mac:'MAC CONTROLS'} as Record<string,string>)[page]??'QUICK ACTION';
    el('file-result').textContent='';dialog.showModal();if(page==='files'||page==='mac')await refresh();
  }};
}
