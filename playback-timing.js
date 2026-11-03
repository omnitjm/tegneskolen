'use strict';
/* One timing model for the browser, asset builder and duration audit. Milliseconds
   are demonstration time; child-controlled pauses never consume this clock. */
const PlaybackTiming = (() => {
  const LIMIT = 60000, DEMO = 6500, CUE_LIMIT = 8000;
  const bounds = p => { let x0=1024,y0=1024,x1=0,y1=0; for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);y0=Math.min(y0,p[i+1]);x1=Math.max(x1,p[i]);y1=Math.max(y1,p[i+1]);}return {x0,y0,x1,y1}; };
  const join = (a,b) => a ? ({x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)}) : {...b};
  function raw(data, meta={}, text='') {
    const strokes=[],segments=[];let time=0,last=null,drawingBounds=null;
    const sources=data.v===2?data.segments:[{id:'legacy',instruction:text,actions:data.strokes}];
    for(const source of sources){const start=time,items=[];let box=null;
      for(const a of source.actions){const points=Float32Array.from(a.p),lengths=new Float32Array(points.length/2);for(let i=1;i<lengths.length;i++)lengths[i]=lengths[i-1]+Math.hypot(points[i*2]-points[i*2-2],points[i*2+1]-points[i*2-1]);
        const length=lengths[lengths.length-1],drawDuration=Math.max(160,Number(a.duration)||Math.min(8000,length/170*1000));
        const lift=Math.max(280,Math.min(1800,280+(last?Math.hypot(points[0]-last[0],points[1]-last[1]):0)*1.4));
        const b=bounds(points),pad=a.w/2;b.x0-=pad;b.y0-=pad;b.x1+=pad;b.y1+=pad;
        const s={points,lengths,length,w:a.w,drawDuration,preview:time,start:time+lift,end:time+lift+drawDuration,glide:!!last,layer:a.layer||0,action:a.action||'draw',tool:a.tool||'graphitePoint',pressure:a.pressure||meta.pressure||'let',type:source.skillId||meta.skillIds?.[0]||'contour',bounds:b,smooth:true,straight:true};
        items.push(s);strokes.push(s);box=join(box,b);time=s.end;last=points.subarray(points.length-2);
      }
      if(!items.length)continue;const f=source.focusBounds;
      segments.push({id:source.id,start,end:time,items,bounds:box,focusBounds:f?{x0:f[0],y0:f[1],x1:f[2],y1:f[3]}:box,pressure:items[0].pressure,type:source.skillId||items[0].type,instruction:source.instruction||text,spokenText:source.spokenText||source.instruction||text,audioSrc:source.audioSrc,tip:source.instruction||text,pauseAfter:source.pauseAfter!==false});drawingBounds=join(drawingBounds,box);
    }
    const dense=time>LIMIT,scale=dense?LIMIT/time:1;
    if(dense){for(const s of strokes){for(const k of ['preview','start','end','drawDuration'])s[k]*=scale;}for(const g of segments){g.start*=scale;g.end*=scale;}}
    const duration=Math.max(1,time*scale),stops=dense?copyStops(duration):segments.filter(g=>g.pauseAfter).map(g=>g.end);
    return {strokes,segments,stops,duration,dense,originalDuration:time,toneLayers:data.toneLayers||1,analysis:{pressure:meta.pressure||'let',techniques:meta.skillIds||[strokes[0]?.type||'contour'],erased:strokes.some(s=>s.action==='erase'),drawingBounds}};
  }
  function copyStops(duration){const n=Math.max(1,Math.round(duration/7000));return Array.from({length:n},(_,i)=>duration*(i+1)/n);}
  function batches(data){
    if(data.contourGuide){const plan=raw(data.contourGuide,{pressure:data.analysis.pressure,skillIds:data.analysis.techniques});return {...plan,count:data.actionCount,contourGuide:true,guideWidth:data.guideWidth,analysis:data.analysis};}
    if(data.primaryGuide){
      const primary=raw(data.primaryGuide,{pressure:data.analysis.pressure,skillIds:data.analysis.techniques});
      const rest=batches({...data,primaryGuide:null,duration:Math.min(30000,LIMIT-primary.duration)});
      for(const g of rest.segments){g.start+=primary.duration;g.end+=primary.duration;}
      const duration=primary.duration+rest.duration;
      return {...rest,strokes:primary.strokes,primaryDuration:primary.duration,batchSegments:rest.segments,segments:[...primary.segments,...rest.segments],stops:copyStops(duration),duration};
    }
    const total=data.groups.reduce((n,g)=>n+g.weight,0);let time=0;
    const base=Math.min(600,data.duration/data.groups.length/2),remaining=data.duration-base*data.groups.length;
    const segments=data.groups.map(g=>{const start=time;time+=base+remaining*g.weight/total;return {...g,start,end:time,tip:g.instruction,focusBounds:g.bounds};});
    return {kind:'batches',dense:true,count:data.actionCount,segments,strokes:[],stops:copyStops(data.duration),duration:data.duration,toneLayers:data.toneLayers,analysis:data.analysis};
  }
  const hasDemo = analysis => analysis.techniques.some(id=>['shading','hatch','cross','fur','highlight'].includes(id));
  function budget(plan,cueMs=0){return plan.duration+(hasDemo(plan.analysis)?DEMO:0)+Math.min(CUE_LIMIT,cueMs);}
  return {VERSION:1,LIMIT,DEMO,CUE_LIMIT,raw,batches,copyStops,budget,hasDemo};
})();
if(typeof module!=='undefined')module.exports=PlaybackTiming;
