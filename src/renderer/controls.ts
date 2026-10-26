import type { ControlRequest, ControlResult, JarvisAPI, Proposal } from '../shared';
export function initControls(api:JarvisAPI|undefined,pause:()=>void) {
  const el=(id:string)=>document.getElementById(id)!;
  const dialog=el('local-controls') as HTMLDialogElement;
  const text=el('control-message');
  let editing:string|undefined;
  let currentProposal:Proposal|undefined;
  let pending=false;let generation=0;
  window.addEventListener('jarvis-cancel-controls',()=>{generation++;showProposal(undefined);});
  const input=el('memory-text') as HTMLTextAreaElement;
  const category=el('memory-category') as HTMLSelectElement;
  function showProposal(proposal:Proposal|undefined) {
    currentProposal=proposal;
    el('action-proposal').hidden=!proposal;
    el('action-description').textContent=proposal?.description??'';
    window.dispatchEvent(new CustomEvent('jarvis-proposal',{detail:!!proposal}));
  }
  async function request(q:ControlRequest) {
    if(!api?.control){text.textContent='Local controls require the updated Electron application.';return;}
    if(pending)return;
    const token=generation;pending=true;window.dispatchEvent(new CustomEvent('jarvis-control-busy',{detail:true}));let result:ControlResult;
    try {result=await api.control(q);}catch {result={ok:false,text:'Local operation unavailable. Please retry.'};}
    finally {pending=false;window.dispatchEvent(new CustomEvent('jarvis-control-busy',{detail:false}));}
    if(token!==generation)return;
    text.textContent=result.text;
    if(!dialog.open)window.dispatchEvent(new CustomEvent('jarvis-control-result',{detail:{text:result.text,ok:result.ok}}));
    if(result.proposal)showProposal(result.proposal);
    if(q.kind==='confirm')showProposal(undefined);
    if(result.memories) {
      const list=el('memory-list');list.replaceChildren();
      for(const memory of result.memories) {
        const row=document.createElement('div');row.className='memory-row';
        const content=document.createElement('span');content.textContent=`[${memory.kind}] ${memory.text}`;
        const edit=document.createElement('button');edit.textContent='Edit';edit.onclick=()=>{editing=memory.id;input.value=memory.text;category.value=memory.kind;input.focus();};
        const remove=document.createElement('button');remove.textContent='Delete';remove.onclick=()=>void request({kind:'memory-delete',id:memory.id});
        row.append(content,edit,remove);list.append(row);
      }
      if(!result.memories.length)list.textContent='No memories stored.';
    }
    if(typeof result.enabled==='boolean')(el('memory-enabled') as HTMLInputElement).checked=result.enabled;
    if(result.folders) {
      const list=el('folder-list');list.replaceChildren();
      for(const f of result.folders) {
        const row=document.createElement('p');row.textContent=`${f.name} · ${f.id} `;
        const remove=document.createElement('button');remove.textContent='Revoke';remove.onclick=()=>void request({kind:'folder-revoke',id:f.id});row.append(remove);list.append(row);
      }
    }
    if(result.shortcuts) {
      const list=el('shortcut-list');list.replaceChildren();
      for(const name of result.shortcuts) {
        const row=document.createElement('p');row.textContent=name+' ';
        const remove=document.createElement('button');remove.textContent='Revoke';remove.onclick=()=>void request({kind:'shortcut-revoke',name});row.append(remove);list.append(row);
      }
    }
    window.dispatchEvent(new Event('jarvis-tasks-refresh'));
  }
  el('manage-local').onclick=()=>{pause();showProposal(undefined);el('modal-proposal').append(el('action-proposal'));dialog.showModal();void request({kind:'memory-list'});};
  el('close-controls').onclick=()=>dialog.close();
  (el('memory-enabled') as HTMLInputElement).onchange=e=>void request({kind:'memory-enabled',enabled:(e.target as HTMLInputElement).checked});
  el('save-memory').onclick=()=>{void request({kind:'memory-save',text:input.value,category:category.value as 'fact'|'summary'|'project'|'preference',id:editing});editing=undefined;input.value='';};
  el('new-memory').onclick=()=>{editing=undefined;input.value='';};
  el('export-memory').onclick=()=>void request({kind:'memory-export'});
  el('clear-memory').onclick=()=>void request({kind:'memory-clear'});
  el('approve-folder').onclick=()=>void request({kind:'folder-approve'});
  el('approve-shortcut').onclick=()=>{void request({kind:'shortcut-approve',name:(el('shortcut-name') as HTMLInputElement).value});};
  el('confirm-action').onclick=()=>{if(currentProposal)void request({kind:'confirm',id:currentProposal.id,approved:true});};
  el('deny-action').onclick=()=>{if(currentProposal)void request({kind:'confirm',id:currentProposal.id,approved:false});};
  window.addEventListener('jarvis-result',event=>{const proposal=(event as CustomEvent<Proposal|undefined>).detail;showProposal(proposal);});
  // Confirmation remains visible inside the modal while managing memories.
  dialog.addEventListener('close',()=>{el('proposal-home').append(el('action-proposal'));if(currentProposal)void request({kind:'confirm',id:currentProposal.id,approved:false});});
  return {showProposal};
}
