export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'action' | 'error';
export function coreState(state: string): CoreState {
  const value=state.toLowerCase();
  if(value==='processing')return 'thinking';
  return ['listening','thinking','speaking','action','error'].includes(value)?value as CoreState:'idle';
}
export function seededRandom(seed=953) {
  return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}
export interface OrbitalStar { radius:number; inclination:number; node:number; phase:number; speed:number; size:number; brightness:number; white:boolean; trail:boolean }
export function makeStars(count=112):OrbitalStar[] {
  const random=seededRandom();
  return Array.from({length:count},(_,i)=>({
    radius:.34+(i%4)*.038+random()*.012, inclination:.72+(i%4)*.16+random()*.08,
    node:(i%4)*.67-.92,phase:random()*Math.PI*2,
    speed:(i%2?1:-1)*(.024+random()*.018),size:.55+random()*1.1,
    brightness:.45+random()*.55,white:random()>.72,trail:i%7===0,
  }));
}
export function orbit(star:OrbitalStar,angle:number,tightening=0,result={x:0,y:0,z:0,scale:1}) {
  const radius=star.radius*(1-tightening);
  const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*Math.cos(star.inclination),z=Math.sin(angle)*radius*Math.sin(star.inclination);
  const perspective=1+z*.24;
  result.x=(x*Math.cos(star.node)-y*Math.sin(star.node))*perspective;result.y=(x*Math.sin(star.node)+y*Math.cos(star.node))*perspective;result.z=z;result.scale=perspective;return result;
}
export function reaction(state:CoreState,audio:number,actionAge=Infinity,errorAge=Infinity) {
  const amplitude=Number.isFinite(audio)?Math.max(0,Math.min(1,audio)):0;
  const action=actionAge>=0&&actionAge<1.2?Math.sin(Math.PI*actionAge/1.2):0;
  const error=errorAge>=0&&errorAge<2?Math.sin(Math.PI*errorAge/2):0;
  return {
    speed:(state==='thinking'?2.1:state==='listening'?1.3:1)+action*.8,
    brightness:(state==='listening'?1.18:1)+(state==='speaking'?amplitude*.22:0),
    rim:.55+(state==='listening'?amplitude*.18:state==='speaking'?amplitude*.3:0)+action*.22,
    tighten:(state==='thinking'?.065:0)+action*.1,
    action,error,
  };
}
