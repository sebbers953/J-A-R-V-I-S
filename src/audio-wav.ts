// Encode decoded capture as standard mono PCM16 WAV, without external codecs.
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  if(!channels.length || channels.some(c=>c.length!==channels[0].length) || sampleRate<8000 || sampleRate>192000) throw new Error('Invalid audio');
  const count=channels[0].length; const bytes=new Uint8Array(44+count*2); const view=new DataView(bytes.buffer);
  const word=(at:number,value:string)=>{for(let i=0;i<value.length;i++) bytes[at+i]=value.charCodeAt(i);};
  word(0,'RIFF');view.setUint32(4,bytes.length-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const mean=channels.reduce((sum,c)=>sum+c[i],0)/channels.length;const value=Math.max(-1,Math.min(1,mean));view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);}
  return bytes;
}
