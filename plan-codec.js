'use strict';
/* TSP1: lossless JSON trees. Postorder value table interns strings/containers.
   Tags: 0 null, 1 false, 2 true, 3 unsigned integer, 4 negative integer,
   5 LE float64, 6 UTF-8 string, 7 array, 8 object, 9 integer vector,
   10 table reference. Lengths/indices use unsigned base-128 varints.
   Integer vectors delta-code alternating lanes (x/y), zigzag signed deltas.
   References expand to independent JSON values: callers may safely mutate them.
   No quantisation, browser compression API, worker or third-party dependency. */
const PlanCodec = (() => {
  const MAGIC=[84,83,80,49],MAX=Number.MAX_SAFE_INTEGER;
  function decode(input){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),table=[];
    let at=0;
    function byte(){if(at>=bytes.length)throw Error('Truncated TSP1 plan');return bytes[at++];}
    for(const b of MAGIC)if(byte()!==b)throw Error('Unknown plan format');
    function uint(){let n=0,scale=1;for(let i=0;i<8;i++){const b=byte();n+=(b&127)*scale;if(!Number.isSafeInteger(n))throw Error('Invalid plan integer');if(b<128)return n;scale*=128;}throw Error('Invalid plan varint');}
    function count(){const n=uint();if(n>bytes.length-at)throw Error('Invalid plan length');return n;}
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const clone=v=>Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
    function read(depth=0){
      if(depth>64)throw Error('Plan nesting too deep');
      const tag=byte();let value;
      switch(tag){
        case 0:return null;case 1:return false;case 2:return true;
        case 3:return uint();case 4:return -uint();
        case 5:if(at+8>bytes.length)throw Error('Truncated float');value=view.getFloat64(at,true);at+=8;if(!Number.isFinite(value))throw Error('Invalid float');return value;
        case 6:{const n=count();value=decoder.decode(bytes.subarray(at,at+n));at+=n;break;}
        case 7:{const n=count();value=Array.from({length:n},()=>read(depth+1));break;}
        case 8:{const n=count();value={};for(let i=0;i<n;i++){const key=read(depth+1);if(typeof key!=='string')throw Error('Invalid object key');Object.defineProperty(value,key,{value:read(depth+1),writable:true,enumerable:true,configurable:true});}break;}
        case 9:{const n=count();value=new Array(n);for(let i=0;i<n;i++){const v=uint(),d=v%2?-(v+1)/2:v/2;value[i]=(i<2?0:value[i-2])+d;if(!Number.isSafeInteger(value[i]))throw Error('Invalid vector');}break;}
        case 10:{const i=uint();if(i>=table.length)throw Error('Invalid plan reference');return clone(table[i]);}
        default:throw Error('Invalid plan tag');
      }
      table.push(value);return value;
    }
    const value=read();if(at!==bytes.length)throw Error('Trailing plan bytes');return value;
  }
  function encode(value){
    const out=[...MAGIC],memo=new Map();let next=0;
    function uint(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid integer');while(n>=128){out.push(n%128+128);n=Math.floor(n/128);}out.push(n);}
    function write(v){
      if(v===null){out.push(0);return;}if(typeof v==='boolean'){out.push(v?2:1);return;}
      if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Invalid number');if(Number.isSafeInteger(v)&&!Object.is(v,-0)){out.push(v<0?4:3);uint(Math.abs(v));}else{out.push(5);const b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,v,true);for(const x of b)out.push(x);}return;}
      const key=JSON.stringify(v);if(memo.has(key)){out.push(10);uint(memo.get(key));return;}
      if(typeof v==='string'){const b=new TextEncoder().encode(v);out.push(6);uint(b.length);for(const x of b)out.push(x);}
      else if(Array.isArray(v)){
        const ints=v.length>0&&v.every((x,i)=>Number.isSafeInteger(x)&&!Object.is(x,-0)&&Math.abs(x-(i<2?0:v[i-2]))<=MAX/2);
        out.push(ints?9:7);uint(v.length);if(ints)for(let i=0;i<v.length;i++){const d=v[i]-(i<2?0:v[i-2]);uint(d<0?-d*2-1:d*2);}else for(const x of v)write(x);
      }else if(typeof v==='object'){const keys=Object.keys(v).filter(k=>v[k]!==undefined);out.push(8);uint(keys.length);for(const k of keys){write(k);write(v[k]);}}
      else throw Error('Not a JSON value');
      memo.set(key,next++);
    }
    write(value);return Uint8Array.from(out);
  }
  return {decode,encode};
})();
if(typeof module!=='undefined')module.exports=PlanCodec;
