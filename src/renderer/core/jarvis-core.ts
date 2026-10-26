import './moon-core.css';
import { coreState, makeStars, orbit, reaction, type CoreState } from './model';
import { MoonSurface } from './moon-surface';
export interface CoreOptions { audioLevel?:()=>number; state?:string }
export class JarvisCore {
  readonly element=document.createElement('div');
  private canvas=document.createElement('canvas');
  private context:CanvasRenderingContext2D;
  private surface=new MoonSurface();
  private stars=makeStars();
  private angles=this.stars.map(s=>s.phase);
  private points=this.stars.map((s,i)=>({s,i,p:{x:0,y:0,z:0,scale:1}}));
  private tail={x:0,y:0,z:0,scale:1};
  private red=this.sprite(false);private white=this.sprite(true);
  private state:CoreState='idle';private actionAt=-Infinity;private errorAt=-Infinity;
  private phase=0;private elapsed=0;private speed=1;private tighten=0;
  private last=0;private lastPaint=0;private lastTexture=0;private frame=0;private destroyed=false;
  private visible=true;private windowVisible=true;private intersecting=true;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  private resize:ResizeObserver;private intersection:IntersectionObserver;
  private frames=0;private textureUpdates=0;private drawingMs=0;
  constructor(host:HTMLElement,private options:CoreOptions={}) {
    this.element.className='moon-core';this.element.setAttribute('role','img');
    this.canvas.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='moon-core__lettering';label.textContent='J A R V I S';
    this.element.append(this.canvas,label);host.append(this.element);this.context=this.canvas.getContext('2d',{alpha:true})!;
    this.setState(options.state??'idle');
    this.resize=new ResizeObserver(()=>{this.resizeCanvas();this.paint();});this.resize.observe(this.element);
    this.intersection=new IntersectionObserver(entries=>{this.intersecting=entries[0]?.isIntersecting??false;this.sync();});this.intersection.observe(this.element);
    document.addEventListener('visibilitychange',this.sync);window.addEventListener('pagehide',this.hide);window.addEventListener('pageshow',this.show);
    this.reduced.addEventListener('change',this.sync);this.resizeCanvas();this.sync();
  }
  private sprite(white:boolean) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,0,16,16,16);
    gradient.addColorStop(0,white?'#fff7f0':'#ffd1cf');gradient.addColorStop(.08,white?'#ffeddf':'#ff7777');
    gradient.addColorStop(.2,'#d42f3d88');gradient.addColorStop(1,'#a3091d00');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);ctx.fillStyle=white?'#fff5ef':'#ffaaa9';ctx.fillRect(15,15,2,2);ctx.strokeStyle=white?'#ffe7e36b':'#ed879345';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(16,11);ctx.lineTo(16,21);ctx.moveTo(11,16);ctx.lineTo(21,16);ctx.stroke();return canvas;
  }
  setState(value:string) {
    const next=coreState(value);
    if(next==='error'&&this.state!=='error')this.errorAt=this.elapsed;
    this.state=next;this.element.dataset.state=next;
    this.element.setAttribute('aria-label',`JARVIS moon and orbital stars, ${next}`);
    if(next==='action')this.pulseAction();
    if(this.reduced.matches)this.paint();
  }
  setWindowVisible(visible:boolean) {this.windowVisible=visible;this.sync();}
  pulseAction() {this.actionAt=this.elapsed;if(this.reduced.matches)this.paint();}
  snapshot() {return {state:this.state,running:!!this.frame,reducedMotion:this.reduced.matches,frames:this.frames,textureUpdates:this.textureUpdates,drawingMs:this.drawingMs,particleCount:this.stars.length,actionPulseActive:this.elapsed-this.actionAt<1.2};}
  private resizeCanvas() {
    const size=Math.max(1,this.element.clientWidth),ratio=Math.min(devicePixelRatio||1,1.5);
    this.canvas.width=this.canvas.height=Math.ceil(size*ratio);
  }
  private hide=()=>{this.visible=false;this.sync();};
  private show=()=>{this.visible=true;this.sync();};
  private sync=()=>{
    if(this.destroyed)return;
    cancelAnimationFrame(this.frame);this.frame=0;this.last=0;this.lastPaint=0;
    if(this.visible&&this.windowVisible&&!document.hidden&&this.intersecting){this.paint();if(!this.reduced.matches)this.frame=requestAnimationFrame(this.tick);}
  };
  private tick=(time:number)=>{
    this.frame=0;
    if(this.destroyed||document.hidden||!this.visible||!this.windowVisible||!this.intersecting||this.reduced.matches)return;
    if(!this.last)this.last=time;
    if(time-this.lastPaint>=1000/30-1) {
      const dt=Math.min(.08,(time-this.last)/1000);this.last=time;this.lastPaint=time;this.elapsed+=dt;
      const settings=reaction(this.state,this.options.audioLevel?.()??0,this.elapsed-this.actionAt,this.elapsed-this.errorAt);
      const ease=1-Math.exp(-dt*2.5);this.speed+=(settings.speed-this.speed)*ease;this.tighten+=(settings.tighten-this.tighten)*ease;
      for(let i=0;i<this.stars.length;i++)this.angles[i]+=this.stars[i].speed*dt*this.speed;
      this.phase+=dt*Math.PI*2/1100; // One moon rotation in approximately 18 minutes.
      if(this.elapsed-this.lastTexture>=.5){this.surface.render(this.phase);this.lastTexture=this.elapsed;this.textureUpdates++;}
      this.paint();
    }
    this.frame=requestAnimationFrame(this.tick);
  };
  private paint() {
    if(this.destroyed||!this.context||document.hidden||!this.visible||!this.windowVisible||!this.intersecting)return;
    const start=performance.now(),ctx=this.context,size=this.canvas.width;
    const settings=reaction(this.state,this.reduced.matches?0:this.options.audioLevel?.()??0,this.elapsed-this.actionAt,this.elapsed-this.errorAt);
    const error=settings.error,moon=size*.265;
    ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(size/2,size/2);
    const halo=ctx.createRadialGradient(0,0,moon*.93,0,0,moon*1.18);
    halo.addColorStop(0,'#7b142600');halo.addColorStop(.32,`rgba(${145-error*45},20,34,${settings.rim*.23})`);halo.addColorStop(1,'#7b142600');
    ctx.fillStyle=halo;ctx.fillRect(-moon*1.2,-moon*1.2,moon*2.4,moon*2.4);
    const points=this.points;for(const point of points)orbit(point.s,this.angles[point.i],point.i%4===0?this.tighten:settings.action*.045,point.p);
    const drawStar=({s,i,p}:typeof points[number])=>{
      const front=p.z>=0,shimmer=this.reduced.matches?1:.92+.08*Math.sin(this.elapsed*.65+s.phase*3);
      const flicker=1-error*.13*(.5+.5*Math.sin(this.elapsed*3+i));
      ctx.globalAlpha=Math.min(1,s.brightness*(front?.87:.4)*settings.brightness*shimmer*flicker);
      const x=p.x*size,y=p.y*size,spriteSize=s.size*p.scale*(front?9:6)*size/600;
      if(s.trail&&!this.reduced.matches){
        const tail=orbit(s,this.angles[i]-Math.sign(s.speed)*.018,i%4===0?this.tighten:settings.action*.045,this.tail);
        ctx.strokeStyle=s.white?'#d6a8aa38':'#a6283933';ctx.lineWidth=Math.max(.4,size/1100);ctx.beginPath();ctx.moveTo(tail.x*size,tail.y*size);ctx.lineTo(x,y);ctx.stroke();
      }
      ctx.drawImage(s.white?this.white:this.red,x-spriteSize/2,y-spriteSize/2,spriteSize,spriteSize);
    };
    for(const point of points)if(point.p.z<0)drawStar(point);
    ctx.globalAlpha=1;ctx.drawImage(this.surface.canvas,-moon,-moon,moon*2,moon*2);
    // A restrained light wash moves over the surface only while thinking.
    if(this.state==='thinking'&&!this.reduced.matches){ctx.save();ctx.beginPath();ctx.arc(0,0,moon,0,Math.PI*2);ctx.clip();
      const light=ctx.createRadialGradient(Math.cos(this.elapsed*.25)*moon*.6,-moon*.45,0,0,0,moon*1.4);light.addColorStop(0,'#7f15231a');light.addColorStop(1,'#7f152300');ctx.fillStyle=light;ctx.fillRect(-moon,-moon,moon*2,moon*2);ctx.restore();}
    ctx.strokeStyle=`rgba(${155-error*48},${35-error*15},${46-error*18},${Math.min(.8,settings.rim)})`;ctx.lineWidth=Math.max(.6,size/900);ctx.beginPath();ctx.arc(0,0,moon,0,Math.PI*2);ctx.stroke();
    for(const point of points)if(point.p.z>=0)drawStar(point);
    ctx.restore();this.frames++;this.drawingMs+=performance.now()-start;
  }
  destroy() {
    this.destroyed=true;cancelAnimationFrame(this.frame);this.frame=0;this.resize.disconnect();this.intersection.disconnect();
    document.removeEventListener('visibilitychange',this.sync);window.removeEventListener('pagehide',this.hide);window.removeEventListener('pageshow',this.show);this.reduced.removeEventListener('change',this.sync);this.element.remove();
  }
}
