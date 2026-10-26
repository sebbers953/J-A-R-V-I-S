import type { NetworkDevice } from '../shared';
// Illustrative topology only; no fake location, distance, measured latency or data.
export class NetworkRadar {
  private canvas:HTMLCanvasElement;private context:CanvasRenderingContext2D;
  private devices:NetworkDevice[]=[];private positions=new Map<string,{x:number;y:number}>();private scanning=false;private visible=false;private nativeVisible=true;
  private frame=0;private last=0;private angle=0;private observer:ResizeObserver;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(host:HTMLElement,private select:(id:string)=>void){
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','Illustrative network radar; use the accessible device list to select a device');host.append(this.canvas);this.context=this.canvas.getContext('2d')!;
    this.observer=new ResizeObserver(()=>{const size=Math.max(1,host.clientWidth),ratio=Math.min(devicePixelRatio||1,1.5);this.canvas.width=this.canvas.height=Math.round(size*ratio);this.paint();});this.observer.observe(host);
    this.canvas.onclick=event=>{const bounds=this.canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width-.5,y=(event.clientY-bounds.top)/bounds.height-.5;const found=this.devices.slice(0,80).find(device=>{const p=this.position(device.id);return Math.hypot(x-p.x,y-p.y)<.027;});if(found)this.select(found.id);};
    document.addEventListener('visibilitychange',this.sync);this.reduced.addEventListener('change',this.sync);
  }
  set(devices:NetworkDevice[],scanning:boolean){this.devices=devices;const ids=new Set(devices.slice(0,80).map(device=>device.id));for(const id of this.positions.keys())if(!ids.has(id))this.positions.delete(id);this.scanning=scanning;this.sync();}
  visibility(visible:boolean,native?:boolean){this.visible=visible;if(native!==undefined)this.nativeVisible=native;this.sync();}
  private position(id:string){
    const cached=this.positions.get(id);if(cached)return cached;
    let hash=2166136261;for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
    let point={x:0,y:0};for(let attempt=0;attempt<32;attempt++){
      const angle=(hash%360)*Math.PI/180+attempt*2.39996,radius=.13+((hash+attempt*7)%31)/100;
      point={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};if(![...this.positions.values()].some(other=>Math.hypot(point.x-other.x,point.y-other.y)<.045))break;
    }
    this.positions.set(id,point);return point;
  }
  private sync=()=>{cancelAnimationFrame(this.frame);this.frame=0;this.last=0;if(!this.visible||!this.nativeVisible||document.hidden)return;this.paint();if(this.scanning&&!this.reduced.matches)this.frame=requestAnimationFrame(this.draw);};
  private draw=(time:number)=>{this.frame=0;if(!this.visible||!this.nativeVisible||document.hidden||!this.scanning||this.reduced.matches)return;if(time-this.last>=1000/24){this.angle+=this.last?Math.min(.1,(time-this.last)/1000)*.55:0;this.last=time;this.paint();}this.frame=requestAnimationFrame(this.draw);};
  private paint(){
    if(!this.visible||!this.nativeVisible||document.hidden)return;
    const ctx=this.context,size=this.canvas.width,r=size*.46;ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size/2,size/2);
    ctx.strokeStyle='#75312870';ctx.lineWidth=Math.max(.6,size/1000);
    for(const fraction of [.25,.5,.75,1]){ctx.beginPath();ctx.arc(0,0,r*fraction,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='#64272b66';for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*.75]){ctx.beginPath();ctx.moveTo(Math.cos(angle)*-r,Math.sin(angle)*-r);ctx.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);ctx.stroke();}
    if(this.scanning){ctx.save();ctx.rotate(this.angle);const sweep=ctx.createConicGradient(-.55,0,0);sweep.addColorStop(0,'#e06d2700');sweep.addColorStop(.07,'#e06d2720');sweep.addColorStop(.085,'#f5a86166');sweep.addColorStop(.09,'#e06d2700');sweep.addColorStop(1,'#e06d2700');ctx.fillStyle=sweep;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const device of this.devices.slice(0,80)){
      const p=this.position(device.id),x=p.x*size,y=p.y*size;
      const fresh=Date.now()<device.expires,status=fresh?device.status:'unknown';
      ctx.fillStyle=status==='online'?'#ffc18a':status==='offline'?'#ea7684':'#a792a0';ctx.strokeStyle=ctx.fillStyle;
      const radius=Math.max(2.5,size*.0055),pulse=this.scanning&&!this.reduced.matches?.65+.35*Math.sin(this.angle*4+p.x*20):.8;
      ctx.globalAlpha=pulse;ctx.beginPath();ctx.arc(x,y,radius*2.3,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      if(status==='offline')ctx.strokeRect(x-radius,y-radius,radius*2,radius*2);else{ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);if(status==='online')ctx.fill();else ctx.stroke();}
    }
    ctx.fillStyle='#d76b4c';ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  destroy(){cancelAnimationFrame(this.frame);this.observer.disconnect();document.removeEventListener('visibilitychange',this.sync);this.reduced.removeEventListener('change',this.sync);this.canvas.remove();}
}
