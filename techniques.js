'use strict';
// One contact-driven demonstration is shared by technique cards, warmups and lesson swatches.
const TechniqueDemo = (() => {
  const line=(a,b,n=20)=>Array.from({length:n},(_,i)=>[a[0]+(b[0]-a[0])*i/(n-1),a[1]+(b[1]-a[1])*i/(n-1)]);
  const plans=new Map();let eraseLayer=null,toolRenderer=null;
  function plan(id){if(plans.has(id))return plans.get(id);const paths=[];const add=(p,w=2.4,alpha=.7)=>paths.push({p,w,alpha});
    if(['hatch','cross'].includes(id)){for(let layer=0;layer<(id==='cross'?2:1);layer++)for(let i=0;i<9;i++){const x=190+i*18;add(layer?line([x-50,100],[x+62,212]):Array.from({length:25},(_,j)=>[x+Math.sin(j/24*Math.PI)*14,212-j/24*112]),2,.52);}}
    else if(id==='waves'){for(let row=0;row<3;row++)add(Array.from({length:121},(_,i)=>[185+i*2,105+row*40+Math.sin(i/120*Math.PI*4)*12]),2.4,.55);}
    else if(id==='fur'){for(let row=0;row<3;row++)for(let i=0;i<6;i++){const x=190+i*31,y=105+row*39;add(Array.from({length:20},(_,j)=>[x+j*1.05,y+j*.8+Math.sin(j/19*Math.PI)*5]),2.6,.56);}}
    else if(['shading','fill','highlight'].includes(id)){for(let layer=0;layer<3;layer++)for(let row=0;row<6;row++)for(let col=0;col<7;col++){const x=205+col*23,y=99+row*21;if(id==='shading'&&((col<3&&row<2)||(layer===1&&col<3)||(layer===2&&col<5&&row<4)))continue;add(Array.from({length:33},(_,j)=>[x+Math.cos(j/32*Math.PI*2)*14,y+Math.sin(j/32*Math.PI*2)*10]),id==='shading'?14:12,.055+layer*.025);}}
    else if(id==='eraser'){add(line([185,155],[415,155],60),18,1);add(line([300,76],[300,238],45),18,1);}
    else {add(Array.from({length:121},(_,i)=>[300+110*Math.cos(-Math.PI/2+i/120*Math.PI*2),157+81*Math.sin(-Math.PI/2+i/120*Math.PI*2)]),id==='construction'?2:3.5,id==='construction'?.38:.78);}
    plans.set(id,paths);return paths;
  }
  function drawTool(ctx,x,y,side=false,erase=false,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);if(erase){ctx.fillStyle='#efb7bb';ctx.strokeStyle='#785e70';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-10,-12,42,25,7);ctx.fill();ctx.stroke();ctx.restore();return;}
    ctx.rotate(side?-.18:-.92);ctx.fillStyle='#dba74e';ctx.fillRect(10,-5,92,10);ctx.fillStyle='#ffe08a';ctx.fillRect(10,-5,92,4);ctx.fillStyle='#d6c0a1';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(17,-5);ctx.lineTo(17,5);ctx.closePath();ctx.fill();ctx.fillStyle='#5f5f64';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(6,-2);ctx.lineTo(6,2);ctx.closePath();ctx.fill();
    // A deliberately illustrative side grip: thumb and two fingers lie along the low shaft.
    ctx.strokeStyle='#bd8d77';ctx.fillStyle='#f3c6a7';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(105,10);ctx.bezierCurveTo(78,21,59,14,49,4);ctx.bezierCurveTo(32,-6,32,-16,44,-16);ctx.bezierCurveTo(58,-16,65,-8,71,-8);ctx.lineTo(98,-7);ctx.bezierCurveTo(79,-24,63,-28,62,-37);ctx.bezierCurveTo(63,-48,87,-39,110,-22);ctx.lineTo(139,0);ctx.lineTo(130,36);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
  function draw(canvas,id,progress){const ctx=canvas.getContext('2d'),W=600,H=300;ctx.save();ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#fffdf7';ctx.fillRect(0,0,W,H);ctx.lineCap=ctx.lineJoin='round';
    ctx.font='600 17px system-ui';ctx.fillStyle='#5e596b';const side=id==='shading';ctx.fillText(side?'Blyanten skråt · lette cirkler':id==='hatch'?'Oprejst blyant · samme retning':id==='cross'?'Først ét lag · så 45° på tværs':id==='highlight'?'Lad glanspunktet være hvidt':id==='fur'?'Følg formen · løft mellem stregerne':'Se bevægelsen · prøv bagefter',18,28);
    if(['shading','hatch','cross','highlight'].includes(id)){ctx.fillStyle='#efc35b';ctx.beginPath();ctx.arc(51,76,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c59c44';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(69,90);ctx.lineTo(115,123);ctx.lineTo(101,120);ctx.moveTo(115,123);ctx.lineTo(110,110);ctx.stroke();ctx.fillStyle='#625c6a';ctx.fillText('Lys',24,108);}
    let eraseTip=null;
    if(id==='eraser'){
      eraseLayer ||= document.createElement('canvas');eraseLayer.width=600;eraseLayer.height=300;const e=eraseLayer.getContext('2d');e.strokeStyle='#b1aab5';e.lineWidth=2;e.beginPath();e.moveTo(185,155);e.lineTo(415,155);e.moveTo(300,76);e.lineTo(300,238);e.stroke();e.globalCompositeOperation='destination-out';e.lineCap=e.lineJoin='round';e.lineWidth=18;
      const paths=plan(id),amount=Math.max(0,Math.min(1,progress))*paths.length;for(let i=0;i<Math.ceil(amount);i++){const p=paths[i].p,last=Math.max(1,Math.floor(Math.min(1,amount-i)*(p.length-1)));e.beginPath();e.moveTo(...p[0]);for(let j=1;j<=last;j++)e.lineTo(...p[j]);e.stroke();eraseTip=p[last];}
      e.globalCompositeOperation='source-over';ctx.drawImage(eraseLayer,0,0);ctx.strokeStyle='#69616e';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(300,157,110,81,0,0,Math.PI*2);ctx.stroke();
    }
    if(['highlight','fill','shading'].includes(id)){ctx.strokeStyle='#8b8390';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(300,157,110,81,0,0,Math.PI*2);ctx.stroke();}
    const paths=plan(id),amount=Math.max(0,Math.min(1,progress))*paths.length;let tip=null;
    ctx.save();if(['highlight','fill','shading','hatch','cross'].includes(id)){ctx.beginPath();ctx.ellipse(300,157,108,79,0,0,Math.PI*2);if(id==='highlight'){ctx.moveTo(279,122);ctx.arc(263,122,16,0,Math.PI*2,true);}ctx.clip('evenodd');}
    if(id!=='eraser')for(let i=0;i<Math.ceil(amount);i++){const action=paths[i],p=action.p,part=Math.min(1,amount-i),last=Math.max(1,Math.floor(part*(p.length-1)));ctx.strokeStyle='#56535b';ctx.globalAlpha=action.alpha;ctx.lineWidth=action.w;ctx.beginPath();ctx.moveTo(...p[0]);for(let j=1;j<=last;j++)ctx.lineTo(...p[j]);ctx.stroke();tip=p[last];}
    ctx.restore();
    if(id==='eraser')tip=eraseTip;
    if(tip&&progress<1&&!toolRenderer?.(ctx,tip[0],tip[1],side,id==='eraser'))drawTool(ctx,tip[0],tip[1],side,id==='eraser',.92);
    if(['shading','hatch','cross'].includes(id)){ctx.fillStyle='#656071';ctx.font='600 15px system-ui';ctx.fillText(progress<.34?'1 · Meget let lag':progress<.67?'2 · Flere lette lag':'3 · Mørkere kun i skyggesiden',168,276);ctx.strokeStyle='#95869d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(425,155);ctx.lineTo(462,177);ctx.lineTo(449,176);ctx.moveTo(462,177);ctx.lineTo(457,164);ctx.stroke();}
    ctx.restore();return progress>=1;
  }
  return {draw,drawTool,plan,setToolRenderer(renderer){toolRenderer=renderer;}};
})();
