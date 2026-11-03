'use strict';
/* Shared, deterministic image processing. No DOM or network; also runs in a Worker. */
const DrawingScan = (() => {
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function components(mask,w,h) {
    const seen=new Uint8Array(mask.length), queue=new Int32Array(mask.length), groups=[];
    for(let i=0;i<mask.length;i++) if(mask[i]&&!seen[i]) {
      let head=0,tail=1;queue[0]=i;seen[i]=1;let x0=w,y0=h,x1=0,y1=0,pts=[];
      while(head<tail){const j=queue[head++],x=j%w,y=(j/w)|0;pts.push(j);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
        for(const k of [x?j-1:-1,x<w-1?j+1:-1,y?j-w:-1,y<h-1?j+w:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;queue[tail++]=k;}}
      groups.push({pts,area:tail,x0,y0,x1,y1});
    }return groups;
  }
  function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let k=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[k][i]))k=j;[A[i],A[k]]=[A[k],A[i]];[b[i],b[k]]=[b[k],b[i]];if(Math.abs(A[i][i])<1e-9)return null;const d=A[i][i];for(let j=i;j<n;j++)A[i][j]/=d;b[i]/=d;for(let k=0;k<n;k++)if(k!==i){const f=A[k][i];for(let j=i;j<n;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}}return b;}
  function paperQuad(rgba,w,h){
    // A close crop of paper with a lighting gradient is not a trapezoid. In
    // particular Otsu must not mistake its bright half for the sheet itself.
    const corner=(x,y)=>{const i=(y*w+x)*4;return .2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];};
    if([[0,0],[w-1,0],[w-1,h-1],[0,h-1]].every(([x,y])=>corner(x,y)>225))return null;
    const k=Math.min(1,240/Math.max(w,h)),W=Math.round(w*k),H=Math.round(h*k),lum=new Uint8Array(W*H);let hist=new Uint32Array(256);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(Math.min(h-1,Math.round(y/k))*w+Math.min(w-1,Math.round(x/k)))*4;const g=Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]);lum[y*W+x]=g;hist[g]++;}
    // Otsu separates the bright sheet from the desk. A low-contrast full frame is already paper.
    let sum=0;for(let i=0;i<256;i++)sum+=hist[i]*i;let weight=0,s=0,best=0,threshold=150;
    for(let i=0;i<254;i++){weight+=hist[i];s+=hist[i]*i;if(!weight||weight===lum.length)continue;const between=weight*(lum.length-weight)*(s/weight-(sum-s)/(lum.length-weight))**2;if(between>best){best=between;threshold=i;}}
    threshold=clamp(threshold+12,130,225);const mask=Uint8Array.from(lum,v=>v>threshold?1:0);
    const group=components(mask,W,H).filter(g=>g.area>W*H*.20).sort((a,b)=>b.area-a.area)[0];if(!group)return null;
    let corners=[null,null,null,null],scores=[Infinity,-Infinity,-Infinity,Infinity];
    for(const p of group.pts){const x=p%W,y=(p/W)|0,a=x+y,b=x-y;if(a<scores[0]){scores[0]=a;corners[0]=[x/k,y/k];}if(b>scores[1]){scores[1]=b;corners[1]=[x/k,y/k];}if(a>scores[2]){scores[2]=a;corners[2]=[x/k,y/k];}if(b<scores[3]){scores[3]=b;corners[3]=[x/k,y/k];}}
    const area=Math.abs(corners.reduce((s,p,i)=>s+p[0]*corners[(i+1)%4][1]-p[1]*corners[(i+1)%4][0],0))/2;
    if(area<w*h*.25)return null;return corners;
  }
  function rectify(rgba,w,h,quad){
    if(!quad)return {rgba:new Uint8ClampedArray(rgba),width:w,height:h,quad:null};
    const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);let W=Math.round(Math.max(dist(quad[0],quad[1]),dist(quad[3],quad[2]))),H=Math.round(Math.max(dist(quad[0],quad[3]),dist(quad[1],quad[2])));
    const k=Math.min(1,1600/Math.max(W,H));W=Math.max(32,Math.round(W*k));H=Math.max(32,Math.round(H*k));const A=[],B=[];
    [[0,0],[W-1,0],[W-1,H-1],[0,H-1]].forEach(([x,y],i)=>{const [u,v]=quad[i];A.push([x,y,1,0,0,0,-x*u,-y*u],[0,0,0,x,y,1,-x*v,-y*v]);B.push(u,v);});const m=solve(A,B);if(!m)return rectify(rgba,w,h,null);
    const out=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=m[6]*x+m[7]*y+1,u=clamp((m[0]*x+m[1]*y+m[2])/d,0,w-1),v=clamp((m[3]*x+m[4]*y+m[5])/d,0,h-1),xx=Math.floor(u),yy=Math.floor(v),fx=u-xx,fy=v-yy,at=(y*W+x)*4;
      for(let c=0;c<3;c++){const a=rgba[(yy*w+xx)*4+c],b=rgba[(yy*w+Math.min(w-1,xx+1))*4+c],cc=rgba[(Math.min(h-1,yy+1)*w+xx)*4+c],dd=rgba[(Math.min(h-1,yy+1)*w+Math.min(w-1,xx+1))*4+c];out[at+c]=a*(1-fx)*(1-fy)+b*fx*(1-fy)+cc*(1-fx)*fy+dd*fx*fy;}out[at+3]=255;}
    return {rgba:out,width:W,height:H,quad};
  }
  function boxBlur(src,w,h,r){const tmp=new Float32Array(src.length),out=new Float32Array(src.length);for(let y=0;y<h;y++){let s=0;for(let x=-r;x<=r;x++)s+=src[y*w+clamp(x,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=s/(r*2+1);s+=src[y*w+clamp(x+r+1,0,w-1)]-src[y*w+clamp(x-r,0,w-1)];}}for(let x=0;x<w;x++){let s=0;for(let y=-r;y<=r;y++)s+=tmp[clamp(y,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=s/(r*2+1);s+=tmp[clamp(y+r+1,0,h-1)*w+x]-tmp[clamp(y-r,0,h-1)*w+x];}}return out;}
  function maxFilter(src,w,h,r){
    const tmp=new Float32Array(src.length),out=new Float32Array(src.length),q=new Int32Array(Math.max(w,h));
    function pass(input,output,lines,size,stride,lineStride){for(let line=0;line<lines;line++){let head=0,tail=0;for(let i=0;i<size+r;i++){if(i<size){const v=input[line*lineStride+i*stride];while(tail>head&&input[line*lineStride+q[tail-1]*stride]<=v)tail--;q[tail++]=i;}while(tail>head&&q[head]<i-2*r)head++;if(i>=r)output[line*lineStride+(i-r)*stride]=input[line*lineStride+q[head]*stride];}}}
    pass(src,tmp,h,w,1,w);pass(tmp,out,w,h,w,1);return out;
  }
  function illumination(bg,envelope,w,h){
    // Fit only exposed paper, not the ink inside a closed outline. A smooth
    // background model also avoids grid bands after perspective resampling.
    const basis=(x,y)=>{x=x/(w-1)*2-1;y=y/(h-1)*2-1;return [1,x,y,x*x,y*y,x*y,x*x*x,y*y*y];};
    const A=Array.from({length:8},()=>Array(8).fill(0)),B=Array(8).fill(0);let count=0;
    for(let y=3;y<h-3;y+=2)for(let x=3;x<w-3;x+=2){const i=y*w+x;if(bg[i]<envelope[i]*.94||bg[i]<80)continue;const v=basis(x,y);count++;for(let a=0;a<8;a++){B[a]+=v[a]*bg[i];for(let b=0;b<8;b++)A[a][b]+=v[a]*v[b];}}
    const coefficients=count>40?solve(A,B):null;if(!coefficients)return envelope;
    const result=new Float32Array(bg.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=basis(x,y),estimate=v.reduce((s,n,i)=>s+n*coefficients[i],0);result[y*w+x]=clamp(estimate,80,255);}return result;
  }
  function extract(input,width,height,options={}){
    if(width>1600||height>1600)throw Error('Billedet skal være højst 1600 pixels.');
    const rect=rectify(input,width,height,paperQuad(input,width,height)),rgba=rect.rgba,w=rect.width,h=rect.height,n=w*h,lum=new Float32Array(n);
    for(let i=0;i<n;i++)lum[i]=.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2];
    // Bright local envelope estimates paper illumination without averaging graphite into the background.
    const k=Math.max(1,Math.ceil(Math.max(w,h)/200)),W=Math.ceil(w/k),H=Math.ceil(h/k),bg=new Float32Array(W*H);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=((y/k)|0)*W+((x/k)|0);bg[j]=Math.max(bg[j],lum[y*w+x]);}
    const radius=Math.max(3,Math.ceil(Math.min(W,H)*.23)),bright=maxFilter(bg,W,H,radius),negative=Float32Array.from(bright,v=>-v),envelope=Float32Array.from(maxFilter(negative,W,H,radius),v=>-v);
    const smooth=illumination(bg,boxBlur(envelope,W,H,3),W,H),alpha=new Float32Array(n),small=new Uint8Array(W*H),strength=options.strength||1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0),paper=Math.max(55,smooth[j]),dark=clamp(1-lum[i]/paper,0,1),chroma=Math.max(rgba[i*4],rgba[i*4+1],rgba[i*4+2])-Math.min(rgba[i*4],rgba[i*4+1],rgba[i*4+2]),a=Math.max(clamp((dark-.032)*strength/0.78,0,1),dark>.055?clamp((chroma-12)/30,0,1):0);alpha[i]=a;if(a>.045&&x>w*.025&&x<w*.975&&y>h*.025&&y<h*.975)small[j]=1;}
    // Merge nearby disconnected parts (eyes, whiskers, feet), discard isolated text and sheet edges.
    const merged=new Uint8Array(small.length),r=3;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(small[y*W+x])for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H)merged[(y+dy)*W+x+dx]=1;
    const groups=components(merged,W,H).filter(g=>g.area>12).sort((a,b)=>score(b)-score(a));
    function score(g){const cx=(g.x0+g.x1)/2/W,cy=(g.y0+g.y1)/2/H;return g.area*(1-.7*Math.hypot(cx-.5,cy-.5))*(g.x0<2||g.y0<2||g.x1>W-3||g.y1>H-3?.15:1);}
    const main=groups[0];if(!main)throw Error('Vi kan ikke se stregerne endnu. Tag et tættere foto i jævnt lys.');
    const keep=new Uint8Array(W*H);for(const g of groups){const gapX=Math.max(0,main.x0-g.x1,g.x0-main.x1),gapY=Math.max(0,main.y0-g.y1,g.y0-main.y1);if(g===main||(Math.hypot(gapX,gapY)<Math.max(W,H)*.07&&g.area>main.area*.015))for(const p of g.pts)keep[p]=1;}
    let left=w,top=h,right=0,bottom=0,count=0;const ink=new Uint8ClampedArray(n*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0);if(!keep[j]||x<w*.025||x>w*.975||y<h*.025||y>h*.975||alpha[i]<.008)continue;const at=i*4,chroma=Math.max(rgba[at],rgba[at+1],rgba[at+2])-Math.min(rgba[at],rgba[at+1],rgba[at+2]);for(let c=0;c<3;c++)ink[at+c]=chroma>18?clamp(rgba[at+c]/Math.max(55,smooth[j])*255,0,255):56;ink[at+3]=Math.round(alpha[i]*255);if(alpha[i]>.035){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}}
    if(count<20)throw Error('Prøv et foto med tydeligere streger.');const pad=18;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(w-1,right+pad);bottom=Math.min(h-1,bottom+pad);const cw=right-left+1,ch=bottom-top+1,out=new Uint8ClampedArray(cw*ch*4);
    for(let y=0;y<ch;y++)out.set(ink.subarray(((top+y)*w+left)*4,((top+y)*w+right+1)*4),y*cw*4);
    return {data:out,width:cw,height:ch,quad:rect.quad,inkPixels:count};
  }
  return {extract,paperQuad,rectify};
})();
if(typeof module!=='undefined')module.exports=DrawingScan;
if(typeof document==='undefined'&&typeof self!=='undefined')self.onmessage=e=>{try{const r=DrawingScan.extract(new Uint8ClampedArray(e.data.data),e.data.width,e.data.height,e.data.options);self.postMessage({...r,data:r.data.buffer},[r.data.buffer]);}catch(error){self.postMessage({error:error.message});}};
