// Local silence policy. Keeps only timing and energy, never audio samples.
export class SilenceDetector {
  private spoken=false;
  private lastSound=0;
  constructor(readonly silenceMs=1200,readonly threshold=0.025) {
    if(!Number.isFinite(silenceMs)||silenceMs<500||silenceMs>5000||!Number.isFinite(threshold)||threshold<0.005||threshold>0.2)throw new Error('Invalid silence configuration');
  }
  sample(rms:number,time:number):boolean {
    if(!Number.isFinite(rms)||!Number.isFinite(time))return false;
    if(rms>=this.threshold){this.spoken=true;this.lastSound=time;return false;}
    return this.spoken&&time-this.lastSound>=this.silenceMs;
  }
}
export function conversationCanResume(consent:boolean,pending:boolean,deadline:number,now:number):boolean {
  return consent&&!pending&&Number.isFinite(deadline)&&now<deadline;
}
