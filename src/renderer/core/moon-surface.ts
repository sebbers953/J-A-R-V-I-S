import { seededRandom } from './model';
// Generated once: a height field with overlapping bowls, raised rims and maria.
// No remote images, expensive SVG filters or runtime noise generation.
export function makeTerrain(width=768,height=384) {
  const random=seededRandom(3101),heights=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    heights[y*width+x]=(random()-.5)*.025+Math.sin(x*.031+Math.sin(y*.022)*2)*Math.cos(y*.034)*.035;
  }
  for(let i=0;i<720;i++) {
    const cx=random()*width,cy=8+random()*(height-16);
    const radius=1.2+Math.pow(random(),3)*24;
    const stretch=1/Math.max(.35,Math.cos((cy/height-.5)*Math.PI));
    for(let y=Math.max(0,Math.floor(cy-radius*1.4));y<Math.min(height,cy+radius*1.4);y++)for(let ox=Math.floor(-radius*stretch*1.4);ox<radius*stretch*1.4;ox++) {
      const dx=ox/stretch,dy=y-cy,d=Math.sqrt(dx*dx+dy*dy)/radius;
      if(d>1.4)continue;
      const x=((Math.floor(cx)+ox)%width+width)%width;
      const bowl=d<.83?-.15*Math.pow(1-d*d/(.83*.83),1.2):0;
      const rim=.11*Math.exp(-(((d-.92)/.12)**2));
      heights[y*width+x]+=bowl+rim;
    }
  }
  const albedo=new Uint8Array(width*height),du=new Float32Array(width*height),dv=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x,h=heights[i];
    albedo[i]=Math.max(15,Math.min(96,49+h*160+(random()-.5)*11));
    du[i]=(heights[y*width+(x+1)%width]-heights[y*width+(x+width-1)%width])*2.1;
    dv[i]=(heights[Math.max(0,y-1)*width+x]-heights[Math.min(height-1,y+1)*width+x])*2.1;
  }
  return {width,height,albedo,du,dv};
}
export class MoonSurface {
  readonly canvas=document.createElement('canvas');
  private context:CanvasRenderingContext2D;
  private image:ImageData;
  private pixels:{offset:number;u:number;row:number;light:number;tu:number;tv:number;rim:number}[]=[];
  private terrain:ReturnType<typeof makeTerrain>;
  constructor(size=320) {
    this.terrain=makeTerrain();
    this.canvas.width=this.canvas.height=size;this.context=this.canvas.getContext('2d')!;
    this.image=this.context.createImageData(size,size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const nx=(x+.5-size/2)/(size/2),ny=-(y+.5-size/2)/(size/2),r2=nx*nx+ny*ny;
      if(r2>=1)continue;
      const nz=Math.sqrt(1-r2),longitude=Math.atan2(nx,nz),latitude=Math.asin(ny);
      this.pixels.push({offset:(y*size+x)*4,u:(longitude/(Math.PI*2)+.5)*this.terrain.width,
        row:Math.min(this.terrain.height-1,Math.floor((.5-latitude/Math.PI)*this.terrain.height))*this.terrain.width,
        light:-nx*.61+ny*.4+nz*.67,
        tu:-Math.cos(longitude)*.61-Math.sin(longitude)*.67,
        tv:Math.sin(latitude)*Math.sin(longitude)*.61+Math.cos(latitude)*.4-Math.sin(latitude)*Math.cos(longitude)*.67,
        rim:Math.pow(1-nz,4.2),
      });
    }
    this.render(0);
  }
  render(rotation:number) {
    const {width,albedo,du,dv}=this.terrain,shift=rotation/(Math.PI*2)*width,data=this.image.data;
    for(const p of this.pixels) {
      const index=p.row+((Math.floor(p.u+shift)%width)+width)%width;
      const light=Math.max(0,p.light-du[index]*p.tu-dv[index]*p.tv);
      const tone=albedo[index]*(.11+light*.72);
      const red=p.rim*(48+Math.max(0,p.light)*65);
      data[p.offset]=Math.min(255,tone+red+3);data[p.offset+1]=tone*.7+red*.08+2;data[p.offset+2]=tone*.73+red*.09+3;data[p.offset+3]=255;
    }
    this.context.putImageData(this.image,0,0);
  }
}
