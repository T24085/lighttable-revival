'use strict';
const incomplete=Symbol('incomplete'),utf8=new TextDecoder('utf-8',{fatal:true});
function encode(value){
 if(typeof value==='string'){const bytes=Buffer.from(value);return Buffer.concat([Buffer.from(bytes.length+':'),bytes]);}
 if(Number.isSafeInteger(value))return Buffer.from('i'+value+'e');
 if(Array.isArray(value))return Buffer.concat([Buffer.from('l'),...value.map(encode),Buffer.from('e')]);
 if(value&&typeof value==='object')return Buffer.concat([Buffer.from('d'),...Object.keys(value).sort().flatMap(key=>[encode(key),encode(value[key])]),Buffer.from('e')]);
 throw Error('Unsupported bencode value');
}
class Decoder{
 constructor(){this.buffer=Buffer.alloc(0);this.total=0;}
 feed(chunk){
  this.total+=chunk.length;if(this.total>128*1024*1024)throw Error('nREPL transfer exceeds 128 MiB');
  this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>4*1024*1024)throw Error('nREPL frame exceeds 4 MiB');
  const messages=[];let position=0;
  while(position<this.buffer.length){let nodes=0;
   const parse=(offset,depth=0)=>{
    if(depth>32||++nodes>10000)throw Error('nREPL message nesting or item budget exceeded');
    if(offset>=this.buffer.length)throw incomplete;
    const type=this.buffer[offset];
    if(type===105){const end=this.buffer.indexOf(101,offset+1);if(end<0)throw incomplete;const text=this.buffer.toString('ascii',offset+1,end);if(!/^(?:0|-?[1-9]\d*)$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error('Invalid bencode integer');return [Number(text),end+1];}
    if(type===108||type===100){const value=type===108?[]:Object.create(null);let next=offset+1;while(true){if(next>=this.buffer.length)throw incomplete;if(this.buffer[next]===101)return [value,next+1];let item;[item,next]=parse(next,depth+1);if(type===108)value.push(item);else{if(typeof item!=='string'||Object.hasOwn(value,item))throw Error('Invalid bencode dictionary key');let entry;[entry,next]=parse(next,depth+1);value[item]=entry;}}}
    const colon=this.buffer.indexOf(58,offset);if(colon<0){if(this.buffer.length-offset>8)throw Error('Invalid bencode string length');throw incomplete;}
    const text=this.buffer.toString('ascii',offset,colon);if(!/^(?:0|[1-9]\d*)$/.test(text)||Number(text)>4*1024*1024)throw Error('Invalid bencode string length');const end=colon+1+Number(text);if(end>this.buffer.length)throw incomplete;return [utf8.decode(this.buffer.subarray(colon+1,end)),end];
   };
   try{const [message,next]=parse(position);if(!message||Array.isArray(message)||typeof message!=='object')throw Error('nREPL response must be a dictionary');messages.push(message);position=next;}catch(error){if(error===incomplete)break;throw error;}
  }
  this.buffer=this.buffer.subarray(position);return messages;
 }
}
module.exports={encode,Decoder};
