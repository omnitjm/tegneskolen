'use strict';
/* On-device scanner. Bounded O(pixels) filters; no models, uploads or dependencies.
 * Crop coordinates refer to rectified paper. fullData/fullRestore retain the
 * complete rectified workspace; only sticker export trims the edited result. */
const DrawingScan = (() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function components(mask,w,h) {
    const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),groups=[];
    for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
      let head=0,tail=1,x0=w,y0=h,x1=0,y1=0;queue[0]=i;seen[i]=1;
      while(head<tail){const j=queue[head++],x=j%w,y=(j/w)|0;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[k]&&!seen[k]){seen[k]=1;queue[tail++]=k;}}
      }groups.push({pts:queue.slice(0,tail),area:tail,x0,y0,x1,y1});
    }return groups;
  }
  function hull(points) {
    const p=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const a=[],b=[];for(const v of p){while(a.length>1&&cross(a[a.length-2],a[a.length-1],v)<=0)a.pop();a.push(v);}
    for(let i=p.length-1;i>=0;i--){const v=p[i];while(b.length>1&&cross(b[b.length-2],b[b.length-1],v)<=0)b.pop();b.push(v);}a.pop();b.pop();return a.concat(b);
  }
  const polygonArea=p=>Math.abs(p.reduce((s,v,i)=>s+v[0]*p[(i+1)%p.length][1]-v[1]*p[(i+1)%p.length][0],0))/2;
  function detectPaper(rgba,w,h) {
    const scale=Math.min(1,240/Math.max(w,h)),W=Math.max(2,Math.round(w*scale)),H=Math.max(2,Math.round(h*scale)),n=W*H;
    const colors=new Float32Array(n*2),brightness=new Float32Array(n);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let r=0,g=0,b=0,count=0;const xx=Math.floor(x/scale),yy=Math.floor(y/scale);
      for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++){const i=(Math.min(h-1,yy+dy)*w+Math.min(w-1,xx+dx))*4;r+=rgba[i];g+=rgba[i+1];b+=rgba[i+2];count++;}
      const i=y*W+x,total=Math.max(1,r+g+b);colors[i*2]=r/total;colors[i*2+1]=b/total;brightness[i]=(r+g+b)/(count*3);
    }
    // Chromaticity is stable under warm/cool light and soft shadows. Cluster
    // before looking for a quadrilateral: a glowing screen must not become paper.
    const centers=[[colors[(n>>1)*2],colors[(n>>1)*2+1]]];
    for(let k=1;k<5;k++){let far=-1,at=0;for(let i=0;i<n;i+=3){if(brightness[i]<18)continue;let d=Infinity;for(const c of centers)d=Math.min(d,(colors[i*2]-c[0])**2+(colors[i*2+1]-c[1])**2);if(d>far){far=d;at=i;}}centers.push([colors[at*2],colors[at*2+1]]);}
    const labels=new Uint8Array(n);
    for(let t=0;t<7;t++){const sums=centers.map(()=>[0,0,0]);for(let i=0;i<n;i++){let best=Infinity,k=0;for(let j=0;j<centers.length;j++){const d=(colors[i*2]-centers[j][0])**2+(colors[i*2+1]-centers[j][1])**2;if(d<best){best=d;k=j;}}labels[i]=k;sums[k][0]+=colors[i*2];sums[k][1]+=colors[i*2+1];sums[k][2]++;}sums.forEach((s,j)=>{if(s[2])centers[j]=[s[0]/s[2],s[1]/s[2]];});}
    let best=null;
    const bh=new Uint32Array(256);for(const v of brightness)bh[clamp(Math.round(v),0,255)]++;let medianLight=0,weight=0;for(;medianLight<255;medianLight++){weight+=bh[medianLight];if(weight>n*.5)break;}
    for(let c=0;c<centers.length;c++){
      const mask=new Uint8Array(n);for(let i=0;i<n;i++){const other=centers[labels[i]];mask[i]=brightness[i]>18&&Math.hypot(other[0]-centers[c][0],other[1]-centers[c][1])<.033?1:0;}
      const groups=components(mask,W,H).filter(g=>g.area>n*.18);
      for(const g of groups){const points=[];for(const i of g.pts){const x=i%W,y=(i/W)|0;if(!x||!y||x===W-1||y===H-1||!mask[i-1]||!mask[i+1]||!mask[i-W]||!mask[i+W])points.push([x,y]);}
        const boundary=hull(points);if(boundary.length<4)continue;const area=polygonArea(boundary),solid=g.area/Math.max(1,area);let score=g.area*solid*solid;let light=0;for(const p of g.pts)light+=brightness[p];if(light/g.area>medianLight*2.1)score*=.25;
        if(!best||score>best.score)best={score,g,mask,boundary,solid};
      }
    }
    // Neutral paper on a neutral desk has no chromatic boundary. Fall back
    // to an enclosed bright region (Otsu); never demand an absolute white level.
    if(!best||best.g.area>n*.90){
      let total=0;for(let i=0;i<256;i++)total+=bh[i]*i;
      let weight=0,sum=0,variance=0,threshold=medianLight;
      for(let i=0;i<255;i++){weight+=bh[i];sum+=bh[i]*i;if(!weight||weight===n)continue;const v=weight*(n-weight)*(sum/weight-(total-sum)/(n-weight))**2;if(v>variance){variance=v;threshold=i;}}
      const mask=Uint8Array.from(brightness,v=>v>threshold?1:0);
      for(const g of components(mask,W,H).filter(g=>g.area>n*.20)){
        if(g.x0<2||g.y0<2||g.x1>W-3||g.y1>H-3)continue;
        const boundary=hull(Array.from(g.pts,i=>[i%W,(i/W)|0])),solid=g.area/Math.max(1,polygonArea(boundary));
        if(solid>.83&&(!best||best.g.area>n*.90))best={score:g.area*solid*solid,g,mask,boundary,solid};
      }
    }
    // Compare both brightness polarities. An incomplete chromatic cluster must
    // not veto a whole perspective sheet (or assume the desk is darker).
    if(!best||best.g.area>n*.9||best.solid<.65)for(const threshold of [55,80,105,130,155,180,205,225,238,245])for(const polarity of [1,-1]){
      const mask=Uint8Array.from(brightness,v=>polarity*(v-threshold)>0?1:0);
      for(const g of components(mask,W,H)){
        if(g.area<n*.22||g.area>n*.86||g.x0<2||g.y0<2||g.x1>W-3||g.y1>H-3)continue;
        const boundary=hull(Array.from(g.pts,i=>[i%W,(i/W)|0])),area=polygonArea(boundary),solid=g.area/Math.max(1,area);
        const poly=boundary.slice();while(poly.length>4){let least=Infinity,at=0;for(let j=0;j<poly.length;j++){const a=poly[(j+poly.length-1)%poly.length],b=poly[j],c=poly[(j+1)%poly.length],v=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(v<least){least=v;at=j;}}poly.splice(at,1);}
        const ratio=polygonArea(poly)/Math.max(1,area),score=g.area*solid*solid;
        if(solid>.75&&ratio>.96&&(!best||best.g.area>n*.9||best.solid<.65&&score>best.score*1.08))best={score,g,mask,boundary,solid};
      }
    }
    if(!best)return {quad:null,mask:null,width:W,height:H,confidence:0};
    const {g,boundary,solid}=best,region=new Uint8Array(n);for(const i of g.pts)region[i]=1;
    // A small dilation bridges graphite holes, not a large occluding phone.
    const grown=Float32Array.from(maxFilter(Float32Array.from(maxFilter(region,W,H,2),v=>-v),W,H,3),v=>-v);let quad=null;
    const clipped=g.x0<2||g.y0<2||g.x1>W-3||g.y1>H-3;
    const polygon=boundary.slice();while(polygon.length>4){let least=Infinity,at=0;for(let i=0;i<polygon.length;i++){const a=polygon[(i+polygon.length-1)%polygon.length],b=polygon[i],c=polygon[(i+1)%polygon.length],area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(area<least){least=area;at=i;}}polygon.splice(at,1);}
    const ratio=polygonArea(polygon)/polygonArea(boundary);
    if(!clipped&&ratio>.88&&solid>.78){let start=0;polygon.forEach((v,i)=>{if(v[0]+v[1]<polygon[start][0]+polygon[start][1])start=i;});quad=Array.from({length:4},(_,i)=>polygon[(start+i)%4].map(v=>v/scale));}
    return {quad,mask:grown,width:W,height:H,confidence:clamp(solid*ratio,0,1)};
  }
  function paperQuad(rgba,w,h){return detectPaper(rgba,w,h).quad;}
  function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let k=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[k][i]))k=j;[A[i],A[k]]=[A[k],A[i]];[b[i],b[k]]=[b[k],b[i]];if(Math.abs(A[i][i])<1e-9)return null;const d=A[i][i];for(let j=i;j<n;j++)A[i][j]/=d;b[i]/=d;for(let k=0;k<n;k++)if(k!==i){const f=A[k][i];for(let j=i;j<n;j++)A[k][j]-=f*A[i][j];b[k]-=f*b[i];}}return b;}
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
  function removeRulingLegacy(mask,alpha,w,h) {
    // Long, repeated parallel lines are notebook ruling. Work at 1/3 scale;
    // test small slopes as corner localisation is never pixel-perfect.
    const k=3,W=Math.ceil(w/k),H=Math.ceil(h/k),small=new Uint8Array(W*H);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])small[((y/k)|0)*W+((x/k)|0)]=1;
    for(const vertical of [false,true]){
      const length=vertical?H:W,across=vertical?W:H;
      let best=[];
      for(let step=-20;step<=20;step++){
        const slope=step*.015,counts=new Uint16Array(across+length),offset=(length/2)|0;
        for(let a=0;a<across;a++)for(let b=0;b<length;b++){const x=vertical?a:b,y=vertical?b:a;if(small[y*W+x])counts[Math.round(a-slope*b)+offset]++;}
        const peaks=[];for(let a=2;a<counts.length-2;a++)if(counts[a]>length*.45&&counts[a]>=counts[a-1]&&counts[a]>=counts[a+1])peaks.push(a-offset);
        if(peaks.length>best.length)best=peaks.map(a=>({a,slope}));
      }
      if(best.length<5)continue;
      for(const {a,slope} of best)for(let b=0;b<length*k;b++){
        const center=(a+slope*b/k)*k;for(let d=-3;d<=3;d++){const t=Math.round(center+d),x=vertical?t:b,y=vertical?b:t;if(x>=0&&x<w&&y>=0&&y<h){const i=y*w+x;
          // Preserve darker figure strokes crossing the ruling.
          if(alpha[i]<.30)mask[i]=0;
        }}
      }
    }
  }
  function removeRuling(mask,alpha,w,h) {
    // Long, repeated parallel lines are notebook ruling. Work at 1/3 scale;
    // test small slopes as corner localisation is never pixel-perfect.
    const k=3,W=Math.ceil(w/k),H=Math.ceil(h/k),small=new Uint8Array(W*H);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x])small[((y/k)|0)*W+((x/k)|0)]=1;
    for(const vertical of [false,true]){
      const length=vertical?H:W,across=vertical?W:H;
      let best=[];
      for(let step=-20;step<=20;step++){
        const slope=step*.015,counts=new Uint16Array(across+length),offset=(length/2)|0;
        for(let a=0;a<across;a++)for(let b=0;b<length;b++){const x=vertical?a:b,y=vertical?b:a;if(small[y*W+x])counts[Math.round(a-slope*b)+offset]++;}
        const peaks=[];for(let a=2;a<counts.length-2;a++)if(counts[a]>length*.45&&counts[a]>=counts[a-1]&&counts[a]>=counts[a+1]&&counts[a]>counts[a-2]*1.15&&counts[a]>counts[a+2]*1.15)peaks.push(a-offset);
        const spaced=peaks.filter((a,i)=>!i||a-peaks[i-1]>3),gaps=spaced.slice(1).map((a,i)=>a-spaced[i]).sort((a,b)=>a-b),period=gaps[gaps.length>>1];
        if(spaced.length>=5&&gaps.filter(d=>Math.abs(d-period)<=Math.max(1,period*.18)).length>=gaps.length*.7&&spaced.length>best.length)best=spaced.map(a=>({a,slope}));
      }
      if(best.length<5)continue;
      for(const {a,slope} of best)for(let b=0;b<length*k;b++){
        const center=(a+slope*b/k)*k;for(let d=-3;d<=3;d++){const t=Math.round(center+d),x=vertical?t:b,y=vertical?b:t;if(x>=0&&x<w&&y>=0&&y<h){const i=y*w+x;
          // Preserve darker figure strokes crossing the ruling.
          if(alpha[i]<.30)mask[i]=0;
        }}
      }
    }
  }
  function recoverShading(lum,keep,alpha,w,h,noise) {
    // Morphological closing estimates paper behind enclosed shapes. A narrow
    // local threshold alone hollows out filled eyes and broad pencil shading.
    const k=Math.max(2,Math.ceil(Math.max(w,h)/160)),W=Math.ceil(w/k),H=Math.ceil(h/k),n=W*H;
    const strokes=new Float32Array(n),paper=new Float32Array(n),count=new Uint16Array(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0);if(keep[i])strokes[j]=1;paper[j]+=lum[i];count[j]++;}
    for(let i=0;i<n;i++)paper[i]/=Math.max(1,count[i]);
    const barrier=maxFilter(strokes,W,H,1),outside=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
    const visit=i=>{if(!barrier[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}};
    for(let x=0;x<W;x++){visit(x);visit((H-1)*W+x);}for(let y=0;y<H;y++){visit(y*W);visit(y*W+W-1);}
    while(head<tail){const i=queue[head++],x=i%W,y=(i/W)|0;if(x)visit(i-1);if(x<W-1)visit(i+1);if(y)visit(i-W);if(y<H-1)visit(i+W);}
    const unknown=new Uint8Array(n);for(let i=0;i<n;i++)unknown[i]=!outside[i]?1:0;
    // A very large enclosed rectangle is a page edge, not a filled figure.
    if(unknown.reduce((a,b)=>a+b,0)>n*.6)return;
    const localMean=boxBlur(lum,w,h,3),detail=Float32Array.from(lum,(v,i)=>(v-localMean[i])**2),texture=boxBlur(detail,w,h,3);
    const dilated=maxFilter(paper,W,H,6),field=boxBlur(Float32Array.from(maxFilter(Float32Array.from(dilated,v=>-v),W,H,6),v=>-v),W,H,1);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0);if(!unknown[j])continue;
      const u=clamp(x/k,0,W-1),v=clamp(y/k,0,H-1),xx=u|0,yy=v|0,fx=u-xx,fy=v-yy;
      const bg=field[yy*W+xx]*(1-fx)*(1-fy)+field[yy*W+Math.min(W-1,xx+1)]*fx*(1-fy)+field[Math.min(H-1,yy+1)*W+xx]*(1-fx)*fy+field[Math.min(H-1,yy+1)*W+Math.min(W-1,xx+1)]*fx*fy;
      const dark=1-lum[i]/Math.max(12,bg),a=clamp((dark-Math.max(.012,noise*1.4))*4,0,1);
      if(a>.025&&(texture[i]>.08||dark>.45)){keep[i]=1;alpha[i]=Math.max(alpha[i],a);}
    }
  }
  function coherentInk(lum,alpha,w,h) {
    // Graphite has aligned gradients along a stroke. Sensor grain / paper
    // fibres vary in every direction. Keep solid dark pencil independently.
    const xx=new Float32Array(w*h),yy=new Float32Array(w*h),xy=new Float32Array(w*h);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,gx=lum[i+1]-lum[i-1],gy=lum[i+w]-lum[i-w];xx[i]=gx*gx;yy[i]=gy*gy;xy[i]=gx*gy;}
    const a=boxBlur(xx,w,h,3),b=boxBlur(yy,w,h,3),c=boxBlur(xy,w,h,3);
    for(let i=0;i<alpha.length;i++)if(alpha[i]<.7){const coherence=Math.sqrt((a[i]-b[i])**2+4*c[i]*c[i])/Math.max(.0001,a[i]+b[i]);alpha[i]*=Math.max(.25,clamp((coherence-.08)/.40,0,1));}
  }
  function cleanGrain(alpha,keep,w,h) {
    const mask=Uint8Array.from(alpha,(a,i)=>keep[i]&&a>.035?1:0),groups=components(mask,w,h),retained=new Float32Array(mask.length);
    const bounds=[w,h,0,0];for(const g of groups)if(Math.max(g.x1-g.x0,g.y1-g.y0)>Math.min(w,h)*.06&&g.area>50){bounds[0]=Math.min(bounds[0],g.x0);bounds[1]=Math.min(bounds[1],g.y0);bounds[2]=Math.max(bounds[2],g.x1);bounds[3]=Math.max(bounds[3],g.y1);}
    for(const g of groups){let peak=0;for(const i of g.pts)peak=Math.max(peak,alpha[i]);
      if(Math.max(g.x1-g.x0,g.y1-g.y0)<Math.max(14,Math.min(w,h)*.045)){
        if(peak<.30||g.x1<bounds[0]-4||g.y1<bounds[1]-4||g.x0>bounds[2]+4||g.y0>bounds[3]+4)continue;
      }
      for(const i of g.pts)retained[i]=1;
    }
    const edge=maxFilter(retained,w,h,1);for(let i=0;i<alpha.length;i++)if(!edge[i])keep[i]=0;
  }
  function extractLegacy(input,width,height,options={}) {
    if(width>1600||height>1600||width<8||height<8||input.length!==width*height*4)throw Error('Billedet skal være højst 1600 pixels.');
    const detection=options.detection||detectPaper(input,width,height),rect=options.rect||rectify(input,width,height,options.quad||detection.quad),rgba=rect.rgba,w=rect.width,h=rect.height,n=w*h;
    const lum=new Float32Array(n),valid=new Uint8Array(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;lum[i]=.25*rgba[i*4]+.6*rgba[i*4+1]+.15*rgba[i*4+2];
      valid[i]=rect.quad?1:!detection.mask?1:detection.mask[Math.min(detection.height-1,Math.floor(y/h*detection.height))*detection.width+Math.min(detection.width-1,Math.floor(x/w*detection.width))]>0?1:0;}
    // Three-pixel averaging suppresses sensor grain. A local bright envelope
    // then estimates exposed paper without fitting a global lighting surface.
    const denoised=boxBlur(lum,w,h,1),k=Math.max(1,Math.ceil(Math.max(w,h)/400)),W=Math.ceil(w/k),H=Math.ceil(h/k),bg=new Float32Array(W*H);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=((y/k)|0)*W+((x/k)|0);bg[j]=Math.max(bg[j],denoised[y*w+x]);}
    const envelope=boxBlur(maxFilter(bg,W,H,Math.max(2,Math.round(24/k))),W,H,2);
    const sample=(a,x,y)=>{const u=clamp((x+.5)/k-.5,0,W-1),v=clamp((y+.5)/k-.5,0,H-1),xx=u|0,yy=v|0,fx=u-xx,fy=v-yy;return a[yy*W+xx]*(1-fx)*(1-fy)+a[yy*W+Math.min(W-1,xx+1)]*fx*(1-fy)+a[Math.min(H-1,yy+1)*W+xx]*(1-fx)*fy+a[Math.min(H-1,yy+1)*W+Math.min(W-1,xx+1)]*fx*fy;};
    const flat=new Float32Array(n),noiseHist=new Uint32Array(128);let noiseCount=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,paper=Math.max(12,sample(envelope,x,y));flat[i]=clamp(denoised[i]/paper,0,1);
      if(valid[i]&&x%3===0&&y%3===0){noiseHist[clamp(Math.round(Math.abs(lum[i]-denoised[i])/paper*255),0,127)]++;noiseCount++;}}
    let median=0,sum=0;for(;median<127;median++){sum+=noiseHist[median];if(sum>noiseCount*.5)break;}
    const noise=Math.max(.002,median/255*.5),mean=boxBlur(flat,w,h,24),square=Float32Array.from(flat,v=>v*v),moment=boxBlur(square,w,h,24);
    const weak=new Uint8Array(n),strong=new Uint8Array(n),alpha=new Float32Array(n);
    const border=options.manual?1:rect.quad?Math.max(5,Math.round(Math.min(w,h)*.018)):2;
    for(let y=border;y<h-border;y++)for(let x=border;x<w-border;x++){
      const i=y*w+x;if(!valid[i])continue;const dark=mean[i]-flat[i],sd=Math.sqrt(Math.max(0,moment[i]-mean[i]*mean[i]));
      // Sauvola threshold on flattened luminance, with a noise floor. Its mask
      // seeds hysteresis; output opacity remains continuous graphite density.
      const threshold=mean[i]*(1-.025*(1-sd/.5)),high=Math.max(noise*2,.014,mean[i]-threshold),low=Math.max(noise*(noise>.008?.7:1.25),.0035);
      if(dark>low){weak[i]=1;if(dark>high)strong[i]=1;alpha[i]=clamp(dark*4*(options.strength||1),0,1);}
    }
    // Keep long, thin components with at least one confident seed. Fat low
    // contrast blobs are eraser smudges; isolated sensor grain has no span.
    removeRulingLegacy(weak,alpha,w,h);
    const groups=components(weak,w,h),accepted=new Uint8Array(n);let candidates=[];
    for(const g of groups){let seeds=0,mass=0,outer=0,boundary=0;for(const i of g.pts){seeds+=strong[i];mass+=alpha[i];const x=i%w,y=(i/w)|0;if(Math.min(x-g.x0,g.x1-x,y-g.y0,g.y1-y)<12)outer++;if(x>8&&x<w-9&&y>8&&y<h-9&&(!valid[i-8]||!valid[i+8]||!valid[i-8*w]||!valid[i+8*w]))boundary++;}const gw=g.x1-g.x0+1,gh=g.y1-g.y0+1,span=Math.max(gw,gh),fill=g.area/(gw*gh);
      if(!options.manual&&(gw>w*.9||gh>h*.9)||span<Math.max(5,Math.min(w,h)*.008)||g.area<8||!seeds||fill>.7&&span>40&&Math.min(gw,gh)>14||g.area>n*.12||fill>.15&&mass/g.area<.065&&Math.min(gw,gh)>10&&span>40||!options.manual&&outer/g.area>.70&&span>Math.min(w,h)*.2||boundary/g.area>.12)continue;
      g.major=span>Math.max(22,Math.min(w,h)*(noise>.008?.05:.025))&&seeds>Math.max(2,g.area*(noise>.008?.65:.30));g.mass=mass;g.seeds=seeds;g.span=span;g.fill=fill;candidates.push(g);if(g.major)for(const i of g.pts)accepted[i]=1;
    }
    // Spatial grouping on a small grid joins eyes and disconnected outlines.
    const S=Math.max(1,Math.ceil(Math.max(w,h)/300)),GW=Math.ceil(w/S),GH=Math.ceil(h/S),small=new Float32Array(GW*GH);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(accepted[y*w+x])small[((y/S)|0)*GW+((x/S)|0)]=1;
    const merged=maxFilter(small,GW,GH,3),clusters=components(merged,GW,GH);
    const clusterLabels=new Int32Array(GW*GH);clusters.forEach((g,i)=>{g.members=[];g.mass=0;g.ink=0;for(const p of g.pts)clusterLabels[p]=i+1;});
    for(const g of candidates.filter(g=>g.major)){const p=g.pts[(g.pts.length/2)|0],label=clusterLabels[((p/w/S)|0)*GW+(((p%w)/S)|0)];if(label){const c=clusters[label-1];c.members.push(g);c.mass+=g.mass;c.ink+=g.area;}}
    for(const c of clusters){const cw=(c.x1-c.x0+1)*S,ch=(c.y1-c.y0+1)*S,fill=c.ink/Math.max(1,cw*ch);c.score=c.ink*Math.min(1,.22/Math.max(.001,fill));
      if(cw>w*.94||ch>h*.94)c.score*=.08;
      // A screen border / table edge forms a nearly frame-sized cluster.
      if(cw*ch>n*.65)c.score*=.1;
    }
    clusters.sort((a,b)=>b.score-a.score);const main=clusters.find(c=>c.ink>20);if(!main)throw Error('Vi kan ikke se stregerne endnu. Tag et tættere foto i jævnt lys.');
    const keep=new Uint8Array(n),selected=[];
    for(const c of clusters){const dx=Math.max(0,main.x0-c.x1,c.x0-main.x1)*S,dy=Math.max(0,main.y0-c.y1,c.y0-main.y1)*S;
      if(options.manual||c===main||(Math.hypot(dx,dy)<Math.min(w,h)*.045&&c.ink>main.ink*.008&&c.ink<main.ink*.5))for(const g of c.members){selected.push(g);for(const p of g.pts)keep[p]=1;}}
    // Recover small disconnected details only within / close to the selected figure.
    for(const g of candidates.filter(g=>!g.major)){const dx=Math.max(0,main.x0*S-g.x1,g.x0-main.x1*S),dy=Math.max(0,main.y0*S-g.y1,g.y0-main.y1*S);if((options.manual||Math.hypot(dx,dy)<S*2)&&g.seeds>=2&&g.seeds/g.area>(noise>.008?.65:.30)){selected.push(g);for(const p of g.pts)keep[p]=1;}}
    if(noise<.008)recoverShading(denoised,keep,alpha,w,h,noise);
    else {coherentInk(denoised,alpha,w,h);cleanGrain(alpha,keep,w,h);}
    let left=w,top=h,right=0,bottom=0,count=0;
    for(const g of selected){left=Math.min(left,g.x0);top=Math.min(top,g.y0);right=Math.max(right,g.x1);bottom=Math.max(bottom,g.y1);count+=g.area;}
    if(noise>.008){left=w;top=h;right=0;bottom=0;count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(keep[i]&&alpha[i]>.035){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++;}}}
    if(count<20)throw Error('Prøv et foto med tydeligere streger.');
    const pad=Math.max(18,Math.round(Math.max(right-left,bottom-top)*.045));left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(w-1,right+pad);bottom=Math.min(h-1,bottom+pad);
    const cw=right-left+1,ch=bottom-top+1,out=new Uint8ClampedArray(cw*ch*4),restore=new Uint8ClampedArray(out.length),fullData=new Uint8ClampedArray(n*4),fullRestore=new Uint8ClampedArray(n*4);
    // Normalise pigment against local channel paper estimates. Graphite stays
    // neutral; coloured pencil keeps its hue without the lamp's colour cast.
    const channels=[];for(let c=0;c<3;c++){const b=new Float32Array(W*H);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=((y/k)|0)*W+((x/k)|0);b[j]=Math.max(b[j],rgba[(y*w+x)*4+c]);}channels.push(boxBlur(maxFilter(b,W,H,Math.max(2,Math.round(24/k))),W,H,2));}
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const xx=left+x,yy=top+y,i=yy*w+xx,at=(y*cw+x)*4;const ratios=channels.map((b,c)=>clamp(rgba[i*4+c]/Math.max(12,sample(b,xx,yy)),0,1)),spread=Math.max(...ratios)-Math.min(...ratios);
      for(let c=0;c<3;c++)out[at+c]=restore[at+c]=(noise<.008&&spread>.10)?clamp(255-(1-ratios[c])*500,0,255):52;
      const potential=Math.max(alpha[i],clamp((mean[i]-flat[i]-.001)*4,0,1));restore[at+3]=Math.round(potential*255);out[at+3]=keep[i]?Math.round(Math.pow(alpha[i],noise>.008?1.15:1)*255):0;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,at=i*4;for(let c=0;c<3;c++)fullData[at+c]=fullRestore[at+c]=52;fullRestore[at+3]=Math.round(Math.max(alpha[i],clamp((mean[i]-flat[i]-.001)*4,0,1))*255);fullData[at+3]=keep[i]?Math.round(alpha[i]*255):0;}
    const cleaned=noise>.008?cleanDetached(out,cw,ch):out;
    for(let y=0;y<ch;y++){fullData.set(cleaned.subarray(y*cw*4,(y+1)*cw*4),((y+top)*w+left)*4);fullRestore.set(restore.subarray(y*cw*4,(y+1)*cw*4),((y+top)*w+left)*4);}
    return {fullData,fullRestore,source:rgba,extractionConfidence:.55,uncertain:true,subjects:[],data:cleaned,restore,width:cw,height:ch,quad:rect.quad,crop:[left,top,cw,ch],rectWidth:w,rectHeight:h,inkPixels:count,confidence:detection.confidence};
  }
  // Work with a paper model at two scales. Closing follows a cast-shadow
  // step but bridges thin graphite; a larger field, fitted outside pigment,
  // supplies the colour of paper behind broad fills.
  function extract(input,width,height,options={}) {
    if(width>1600||height>1600||width<8||height<8||input.length!==width*height*4)throw Error('Billedet skal være højst 1600 pixels.');
    // Digital photos can arrive in a uniformly padded square. Ignore only
    // exact, full-height side bands with a sharp transition along most rows;
    // an ordinary desk margin meets the paper at just a few rows and stays.
    if(!options.manual&&!options.quad&&!options._unpadded){
      const color=Array.from(input.subarray(0,4)),same=(x,y)=>color.every((v,c)=>input[(y*width+x)*4+c]===v),uniform=x=>{for(let y=0;y<height;y++)if(!same(x,y))return false;return true;};
      let l=0,r=width-1;while(l<width-8&&uniform(l))l++;while(r>l+7&&uniform(r))r--;
      let leftChanges=0,rightChanges=0;for(let y=0;y<height;y++){leftChanges+=!same(l,y);rightChanges+=!same(r,y);}
      if(l>width*.05&&width-1-r>width*.05&&r-l+1>=8&&leftChanges>height*.9&&rightChanges>height*.9){const cw=r-l+1,cropped=new Uint8ClampedArray(cw*height*4);for(let y=0;y<height;y++)cropped.set(input.subarray((y*width+l)*4,(y*width+r+1)*4),y*cw*4);const result=extract(cropped,cw,height,{...options,_unpadded:true});if(result.quad)result.quad=result.quad.map(([x,y])=>[x+l,y]);else result.sourceOffset=[l,0];return result;}
    }
    if(options.quad){const q=options.quad;if(q.length!==4||q.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v)))||polygonArea(q)<256||hull(q.map(p=>p.slice())).length!==4)throw Error('Vælg fire hjørner rundt om papiret.');}
    const detection=detectPaper(input,width,height),rect=rectify(input,width,height,options.quad||detection.quad),rgba=rect.rgba,w=rect.width,h=rect.height,n=w*h;
    if(!rect.quad&&detection.mask&&detection.mask.reduce((a,b)=>a+b,0)<detection.mask.length*.9)return extractLegacy(input,width,height,{...options,detection,rect});
    const lum=new Float32Array(n),valid=new Uint8Array(n);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;lum[i]=.25*rgba[i*4]+.6*rgba[i*4+1]+.15*rgba[i*4+2];valid[i]=rect.quad||!detection.mask||detection.confidence<.65?1:detection.mask[Math.min(detection.height-1,(y/h*detection.height)|0)*detection.width+Math.min(detection.width-1,(x/w*detection.width)|0)]>0?1:0;}
    const chroma=[[],[],[]];for(let y=12;y<h-12;y+=8)for(let x=12;x<w-12;x+=8){const i=y*w+x;if(valid[i])for(let c=0;c<3;c++)chroma[c].push(rgba[i*4+c]/Math.max(12,lum[i]));}
    const stock=chroma.map(a=>{a.sort((a,b)=>a-b);return a.length?a[a.length>>1]:1;});
    const blue=new Uint8Array(n),originalBlue=new Uint8Array(n);for(let i=0;i<n;i++){const r=rgba[i*4]/stock[0],g=rgba[i*4+1]/stock[1],b=rgba[i*4+2]/stock[2];blue[i]=originalBlue[i]=valid[i]&&b-Math.min(r,g)>Math.max(2,lum[i]*.012)?1:0;}
    removeRuling(blue,new Float32Array(n),w,h);let ruled=0;for(let i=0;i<n;i++)ruled+=originalBlue[i]&&!blue[i]?1:0;
    const hasRuling=ruled>n*.001;
    let compensation=0,rulingContrast=0;
    if(hasRuling){const contrasts=[];for(let i=0;i<n;i+=7)if(originalBlue[i])contrasts.push((rgba[i*4+2]/stock[2]-rgba[i*4]/stock[0])/Math.max(12,lum[i]));contrasts.sort((a,b)=>a-b);rulingContrast=contrasts.length?contrasts[contrasts.length>>1]:0;const K=4,CW=Math.ceil(w/K),CH=Math.ceil(h/K),channel=new Float32Array(CW*CH);for(let y=0;y<CH;y++)for(let x=0;x<CW;x++)channel[y*CW+x]=rgba[(Math.min(h-1,y*K)*w+Math.min(w-1,x*K))*4+2]/stock[2];
      const ceiling=Float32Array.from(maxFilter(Float32Array.from(maxFilter(channel,CW,CH,4),v=>-v),CW,CH,4),v=>-v),values=[];for(let y=20;y<h-20;y+=3)for(let x=20;x<w-20;x+=3){const i=y*w+x,r=rgba[i*4]/stock[0],b=rgba[i*4+2]/stock[2],bg=ceiling[((y/K)|0)*CW+((x/K)|0)];if(originalBlue[i]&&b-r>12&&b>bg*.8)values.push((bg-b)/Math.max(1,b-r));}values.sort((a,b)=>a-b);compensation=values.length?clamp(values[values.length>>1],0,.25):.06;
    }
    if(hasRuling)for(let i=0;i<n;i++){const r=rgba[i*4]/stock[0],g=rgba[i*4+1]/stock[1],b=rgba[i*4+2]/stock[2];if(b-Math.min(r,g)>lum[i]*.008){const v=Math.max(r,g,b)+compensation*Math.max(0,b-r);for(let c=0;c<3;c++)rgba[i*4+c]=clamp(v*stock[c],0,255);lum[i]=v;}}
    const smooth=boxBlur(lum,w,h,1),k=Math.max(1,Math.ceil(Math.max(w,h)/400)),W=Math.ceil(w/k),H=Math.ceil(h/k),N=W*H;
    if(options.manual){const values=[];for(let i=0;i<n;i+=9)values.push(Math.abs(lum[i]-smooth[i])/Math.max(12,smooth[i]));values.sort((a,b)=>a-b);if(values[values.length>>1]>.016)return extractLegacy(input,width,height,{...options,detection,rect});}
    const small=new Float32Array(N),count=new Uint16Array(N),rgb=[new Float32Array(N),new Float32Array(N),new Float32Array(N)];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0);small[j]+=smooth[i];count[j]++;for(let c=0;c<3;c++)rgb[c][j]+=rgba[i*4+c];}
    for(let j=0;j<N;j++){small[j]/=count[j];for(let c=0;c<3;c++)rgb[c][j]/=count[j];}
    const close=(a,r)=>Float32Array.from(maxFilter(Float32Array.from(maxFilter(a,W,H,r),v=>-v),W,H,r),v=>-v);
    const field=close(small,3),sample=(a,x,y)=>{const u=clamp((x+.5)/k-.5,0,W-1),v=clamp((y+.5)/k-.5,0,H-1),xx=u|0,yy=v|0,fx=u-xx,fy=v-yy;return a[yy*W+xx]*(1-fx)*(1-fy)+a[yy*W+Math.min(W-1,xx+1)]*fx*(1-fy)+a[Math.min(H-1,yy+1)*W+xx]*(1-fx)*fy+a[Math.min(H-1,yy+1)*W+Math.min(W-1,xx+1)]*fx*fy;};
    // Detect light pigment on dark paper from interior luminance statistics.
    const hist=new Uint32Array(256);let votes=0;for(let y=10;y<h-10;y+=4)for(let x=10;x<w-10;x+=4){if(valid[y*w+x]){hist[Math.round(lum[y*w+x])]++;votes++;}}
    let med=0,total=0;for(;med<255;med++){total+=hist[med];if(total>votes*.5)break;}
    // On dark stock a morphological opening estimates the paper beneath white lines.
    const opening=Float32Array.from(close(Float32Array.from(small,v=>255-v),3),v=>255-v);
    let positive=0,negative=0;for(let i=0;i<N;i++){positive+=Math.max(0,small[i]-opening[i]);negative+=Math.max(0,field[i]-small[i]);}
    const lightInk=med<115&&rect.quad&&positive>negative*1.1;
    const local=new Float32Array(n),alpha=new Float32Array(n),weak=new Uint8Array(n),strong=new Uint8Array(n),tint=new Float32Array(n);
    // Fit paper colour and smooth illumination from exposed stock. One shared
    // field preserves pigment hue across broad fills and graphite boundaries.
    const borderColors=[[],[],[]];for(let y=8;y<H-8;y++)for(let x=8;x<W-8;x++)if(x<20||x>W-21||y<20||y>H-21){const j=y*W+x;for(let c=0;c<3;c++)borderColors[c].push(rgb[c][j]/Math.max(12,small[j]));}
    const baseColor=borderColors.map(a=>{a.sort((a,b)=>a-b);return a.length?a[a.length>>1]:1;});
    const basis=(x,y)=>[1,x,y,x*x,x*y,y*y,x*x*x,x*x*y,x*y*y,y*y*y];
    const A=Array.from({length:10},()=>Array(10).fill(0)),B=Array(10).fill(0);
    for(let y=4;y<H-4;y+=2)for(let x=4;x<W-4;x+=2){const j=y*W+x,ratios=rgb.map((a,c)=>a[j]/Math.max(12,baseColor[c]*small[j]));
      if(Math.max(...ratios)-Math.min(...ratios)>.08||field[j]-small[j]>2)continue;
      const v=basis(x/W,y/H);for(let a=0;a<10;a++){B[a]+=v[a]*small[j];for(let b=0;b<10;b++)A[a][b]+=v[a]*v[b];}}
    for(let a=0;a<10;a++)A[a][a]+=.00001;
    const model=solve(A,B),globalPaper=(x,y)=>model?clamp(basis(x/w,y/h).reduce((v,t,j)=>v+t*model[j],0),12,255):sample(field,x,y);
    const edge=rect.quad?2:1;
    for(let y=edge;y<h-edge;y++)for(let x=edge;x<w-edge;x++){
      const i=y*w+x;if(!valid[i])continue;
      const bg=Math.max(12,sample(lightInk?opening:field,x,y));let ridge=0;
      for(const d of [4,8,14])if(x>=d&&x<w-d&&y>=d&&y<h-d){for(const step of [d,d*w,d*(w+1),d*(w-1)])ridge=Math.max(ridge,lightInk?smooth[i]-Math.max(smooth[i-step],smooth[i+step]):Math.min(smooth[i-step],smooth[i+step])-smooth[i]);}
      const dark=lightInk?Math.min((smooth[i]-bg)/Math.max(45,255-bg),ridge/Math.max(45,255-bg)):Math.min((bg-smooth[i])/bg,ridge/bg);
      local[i]=Math.max(0,dark);const ratios=baseColor.map((c,j)=>rgba[i*4+j]/Math.max(12,c*lum[i]));tint[i]=Math.max(...ratios)-Math.min(...ratios);
      const color=rect.quad&&!lightInk?Math.max(0,tint[i]-.09)*.6:0;
      const a=Math.max(0,(dark-.004)*3,color);alpha[i]=clamp(a,0,1);weak[i]=a>.018?1:0;strong[i]=a>.055?1:0;
    }
    removeRuling(weak,alpha,w,h,rgba);
    const groups=components(weak,w,h),keep=new Uint8Array(n),candidates=[];
    for(const g of groups){const gw=g.x1-g.x0+1,gh=g.y1-g.y0+1,span=Math.max(gw,gh);let seeds=0,mass=0;for(const i of g.pts){seeds+=strong[i];mass+=alpha[i];}
      if(g.area<8||span<6||!seeds||!options.manual&&(gw>w*.92||gh>h*.92))continue;
      const margin=4;if((g.x0<margin||g.x1>w-1-margin)&&gh>gw*8||(g.y0<margin||g.y1>h-1-margin)&&gw>gh*8)continue;
      const fill=g.area/(gw*gh);if((g.x0<5||g.y0<5||g.x1>w-6||g.y1>h-6)&&fill>.25&&(gw>gh*3||gh>gw*3)&&span>Math.min(w,h)*.35&&!options.manual)continue;if(fill>.6&&span>45&&Math.min(gw,gh)>15&&mass/g.area<.2)continue;
      g.mass=mass;g.seeds=seeds;candidates.push(g);
    }
    candidates.sort((a,b)=>b.mass-a.mass);if(!candidates.length)throw Error('Vi kan ikke se stregerne endnu. Prøv et tættere foto i jævnt lys.');
    const main=candidates[0],bounds=[main.x0,main.y0,main.x1,main.y1],selected=[];
    for(const g of candidates){const span=Math.max(g.x1-g.x0,g.y1-g.y0),inside=g.x0>=bounds[0]-12&&g.x1<=bounds[2]+12&&g.y0>=bounds[1]-12&&g.y1<=bounds[3]+12;
      const distance=Math.hypot(Math.max(0,main.x0-g.x1,g.x0-main.x1),Math.max(0,main.y0-g.y1,g.y0-main.y1));if(distance>Math.min(w,h)*.08&&g.mass<main.mass*.25)continue;
      if(g===main||span>Math.min(w,h)*.045&&g.mass>main.mass*.025||inside&&g.mass>2){selected.push(g);for(const i of g.pts)keep[i]=1;}}
    // Flood enclosed areas on a coarse grid and interpolate illumination from
    // the outside. This also retains neutral filled eyes and coloured wings.
    // Fill interior pigment against the shared outside-paper model. Preserve
    // white negative space; enclosed does not itself mean opaque.
    const smask=new Float32Array(N);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(keep[y*w+x])smask[((y/k)|0)*W+((x/k)|0)]=1;
    const barrier=maxFilter(smask,W,H,1),outside=new Uint8Array(N),queue=new Int32Array(N);let head=0,tail=0;
    const visit=i=>{if(!barrier[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}};for(let x=0;x<W;x++){visit(x);visit((H-1)*W+x);}for(let y=0;y<H;y++){visit(y*W);visit(y*W+W-1);}while(head<tail){const i=queue[head++],x=i%W,y=(i/W)|0;if(x)visit(i-1);if(x<W-1)visit(i+1);if(y)visit(i-W);if(y<H-1)visit(i+W);}
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x,j=((y/k)|0)*W+((x/k)|0);if(!lightInk&&!outside[j]&&tint[i]>.10){const ratios=baseColor.map((c,j)=>rgba[i*4+j]/Math.max(12,c*globalPaper(x,y)));alpha[i]=clamp((1-Math.min(...ratios))-.005,0,1);if(alpha[i]>.02)keep[i]=1;}}

    if(!lightInk)recoverShading(smooth,keep,alpha,w,h,.003);
    const stepMask=new Uint8Array(N);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const j=y*W+x;stepMask[j]=Math.max(Math.abs(field[j+1]-field[j-1]),Math.abs(field[j+W]-field[j-W]))>field[j]*.08?1:0;}
    const shadowSmall=new Float32Array(N);for(const g of components(stepMask,W,H))if(Math.max(g.x1-g.x0,g.y1-g.y0)>Math.min(W,H)*.45&&(g.x0<4||g.y0<4||g.x1>W-5||g.y1>H-5))for(const j of g.pts)shadowSmall[j]=1;
    const shadow=maxFilter(shadowSmall,W,H,8);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(shadow[((y/k)|0)*W+((x/k)|0)]&&tint[i]<.10&&!lightInk)alpha[i]=Math.min(alpha[i],local[i]*4);}
    if(hasRuling){const ruleSupport=maxFilter(originalBlue,w,h,2),before=alpha.slice();
      for(let y=8;y<h-8;y++)for(let x=8;x<w-8;x++){const i=y*w+x;if(!ruleSupport[i]||before[i]>(rulingContrast>.08?.28:.065))continue;let continuation=0;
        for(const d of [4,7])for(const step of [d,d*w,d*(w+1),d*(w-1)])if(!ruleSupport[i-step]&&!ruleSupport[i+step])continuation=Math.max(continuation,Math.min(before[i-step],before[i+step]));
        if(continuation>.055)alpha[i]=Math.min(before[i],continuation);else {alpha[i]=0;keep[i]=0;}
      }
    }
    // A paper perimeter is spatially attached to the image border. Clear only
    // such long, straight fragments; drawings near the edge remain editable.
    for(const g of components(keep,w,h)){const gw=g.x1-g.x0+1,gh=g.y1-g.y0+1;if((g.x0<5||g.x1>w-6)&&gh>gw*12||(g.y0<5||g.y1>h-6)&&gw>gh*12)for(const i of g.pts)keep[i]=0;}
    let left=w,top=h,right=0,bottom=0,inkPixels=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(keep[y*w+x]&&alpha[y*w+x]>.02){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);inkPixels++;}
    if(inkPixels<20)throw Error('Prøv et foto med tydeligere streger.');
    const pad=Math.max(18,Math.round(Math.max(right-left,bottom-top)*.045));left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(w-1,right+pad);bottom=Math.min(h-1,bottom+pad);
    const cw=right-left+1,ch=bottom-top+1,full=new Uint8ClampedArray(n*4),recovery=new Uint8ClampedArray(n*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,at=i*4;let a=alpha[i],color=[52,52,52];
      if(lightInk){color=[235,235,225];a=clamp(local[i]*2.3,0,1);}
      else if(tint[i]>.10&&rect.quad){
        const bg=globalPaper(x,y),ratios=baseColor.map((c,j)=>clamp(rgba[at+j]/Math.max(12,c*bg),0,1));
        a=clamp(1-Math.min(...ratios),.01,1);color=ratios.map(v=>clamp(255*(v-1+a)/a,0,255));
      }
      for(let c=0;c<3;c++)full[at+c]=recovery[at+c]=color[c];
      recovery[at+3]=Math.round(Math.max(a,local[i]*3)*255);full[at+3]=keep[i]?Math.round(a*255):0;
    }
    const cut=data=>{const out=new Uint8ClampedArray(cw*ch*4);for(let y=0;y<ch;y++)out.set(data.subarray(((y+top)*w+left)*4,((y+top)*w+left+cw)*4),y*cw*4);return out;};
    const alternative=candidates.filter(g=>g.mass>main.mass*.25&&Math.max(g.x1-g.x0,g.y1-g.y0)>Math.min(w,h)*.1);
    const totalMass=candidates.reduce((v,g)=>v+g.mass,0),retainedMass=selected.reduce((v,g)=>v+g.mass,0),discardedMass=1-retainedMass/Math.max(1,totalMass),nearBorder=left<3||top<3||right>w-4||bottom>h-4;
    const extractionConfidence=clamp(.94-discardedMass*.5-(nearBorder?.2:0)-(alternative.length>1?.2:0)-(!rect.quad?.15:0),.05,.95);
    return {data:cut(full),restore:cut(recovery),width:cw,height:ch,quad:rect.quad,crop:[left,top,cw,ch],rectWidth:w,rectHeight:h,inkPixels,confidence:detection.confidence,extractionConfidence,uncertain:extractionConfidence<.8,quality:{discardedMass,nearBorder,alternatives:alternative.length},subjects:alternative.map(g=>[g.x0,g.y0,g.x1-g.x0+1,g.y1-g.y0+1]),fullData:full,fullRestore:recovery,source:rgba,hasRuling,compensation,rulingContrast,polarity:lightInk?'light':'dark'};
  }
  function cleanDetached(data,w,h){
    const out=data.slice(),groups=components(Uint8Array.from({length:w*h},(_,i)=>data[i*4+3]>6?1:0),w,h),bounds=[w,h,0,0];
    for(const g of groups)if(Math.max(g.x1-g.x0,g.y1-g.y0)>Math.max(w,h)*.09){bounds[0]=Math.min(bounds[0],g.x0);bounds[1]=Math.min(bounds[1],g.y0);bounds[2]=Math.max(bounds[2],g.x1);bounds[3]=Math.max(bounds[3],g.y1);}
    if(bounds[0]>bounds[2])return out;
    for(const g of groups)if(g.area<Math.max(45,w*h*.0002)&&Math.max(g.x1-g.x0,g.y1-g.y0)<Math.max(14,Math.min(w,h)*.04)&&(g.x1<bounds[0]||g.x0>bounds[2]||g.y1<bounds[1]||g.y0>bounds[3]))for(const i of g.pts)out[i*4+3]=0;
    return out;
  }
  function sourceBounds(result,width,height){
    const [l,t,cw,ch]=result.crop,points=[[l,t],[l+cw-1,t],[l+cw-1,t+ch-1],[l,t+ch-1]];
    if(!result.quad)return result.sourceOffset?points.map(([x,y])=>[x+result.sourceOffset[0],y+result.sourceOffset[1]]):points;
    const A=[],B=[],w=result.rectWidth,h=result.rectHeight;[[0,0],[w-1,0],[w-1,h-1],[0,h-1]].forEach(([x,y],i)=>{const [u,v]=result.quad[i];A.push([x,y,1,0,0,0,-x*u,-y*u],[0,0,0,x,y,1,-x*v,-y*v]);B.push(u,v);});const m=solve(A,B);if(!m)return result.quad;
    return points.map(([x,y])=>{const d=m[6]*x+m[7]*y+1;return [clamp((m[0]*x+m[1]*y+m[2])/d,0,width-1),clamp((m[3]*x+m[4]*y+m[5])/d,0,height-1)];});
  }
  return {extract,paperQuad,detectPaper,rectify,sourceBounds,cleanDetached};
})();
if(typeof module!=='undefined')module.exports=DrawingScan;
if(typeof document==='undefined'&&typeof self!=='undefined')self.onmessage=e=>{
  try{const r=DrawingScan.extract(new Uint8ClampedArray(e.data.data),e.data.width,e.data.height,e.data.options),transfer=[];for(const key of ['data','restore','fullData','fullRestore','source'])if(r[key]){r[key]=r[key].buffer;transfer.push(r[key]);}self.postMessage(r,transfer);}
  catch(error){self.postMessage({error:error.message});}
};
