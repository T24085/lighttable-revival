'use strict';
const {StringDecoder}=require('string_decoder');
// Keep every JSON value and ordinary JSON.parse number/prototype semantics.
// The fetch body is decoded incrementally instead of retaining body + text +
// parsed object at the same time. Large individual strings still need memory.
class Parser {
 constructor(){this.decoder=new StringDecoder('utf8');this.stack=[];this.value=undefined;this.root=false;this.lex=null;this.bytes=0;this.strings=new Map();this.stringBytes=0;}
 string(value){if(value.length<256)return value;const previous=this.strings.get(value);if(previous!==undefined)return previous;
  // JSON strings are immutable. Sharing repeated license/readme text keeps all
  // values intact without retaining another full response representation.
  const bytes=value.length*2;if(this.stringBytes+bytes<=16*1024*1024&&this.strings.size<4096){this.strings.set(value,value);this.stringBytes+=bytes;}return value;
 }
 write(chunk){if(!Buffer.isBuffer(chunk))chunk=Buffer.from(chunk);this.bytes+=chunk.length;if(this.bytes>128*1024*1024)throw Error('npm JSON response exceeds 128 MiB');this.text(this.decoder.write(chunk));}
 fail(){throw SyntaxError('Invalid JSON response');}
 assign(value){const frame=this.stack.at(-1);if(!frame){if(this.root)this.fail();this.value=value;this.root=true;return;}
  if(frame.array){if(!['value','valueOrEnd'].includes(frame.stage))this.fail();frame.value.push(value);}
  else{if(frame.stage!=='value')this.fail();Object.defineProperty(frame.value,frame.key,{value,enumerable:true,writable:true,configurable:true});}
  frame.stage='commaOrEnd';
 }
 token(){const lex=this.lex;this.lex=null;const raw=lex.parts.join('');let value;
  if(lex.type==='string'){value=this.string(JSON.parse(raw));if(lex.key){const frame=this.stack.at(-1);frame.key=value;frame.stage='colon';return;}}
  else value=JSON.parse(raw);
  this.assign(value);
 }
 text(text){let index=0;while(index<text.length){
  if(this.lex){const lex=this.lex,start=index;
   if(lex.type==='string'){
    while(index<text.length){const char=text[index++];if(char==='"'&&!lex.escape){lex.parts.push(text.slice(start,index));this.token();break;}if(char==='\\')lex.escape=!lex.escape;else lex.escape=false;}
    if(this.lex)this.lex.parts.push(text.slice(start,index));continue;
   }
   while(index<text.length&&!/[\s,}\]]/.test(text[index]))index++;
   lex.parts.push(text.slice(start,index));if(index<text.length)this.token();continue;
  }
  const char=text[index];if(/[ \t\r\n]/.test(char)){index++;continue;}
  const frame=this.stack.at(-1);
  if(frame?.stage==='commaOrEnd'){
   if(char===(frame.array?']':'}')){this.stack.pop();index++;continue;}
   if(char!==',')this.fail();frame.stage=frame.array?'value':'key';index++;continue;
  }
  if(frame&&!frame.array&&['key','keyOrEnd'].includes(frame.stage)){
   if(char==='}'&&frame.stage==='keyOrEnd'){this.stack.pop();index++;continue;}
   if(char!=='"')this.fail();this.lex={type:'string',key:true,parts:['"'],escape:false};index++;continue;
  }
  if(frame?.stage==='colon'){if(char!==':')this.fail();frame.stage='value';index++;continue;}
  if(frame?.array&&frame.stage==='valueOrEnd'&&char===']'){this.stack.pop();index++;continue;}
  if(!frame&&this.root)this.fail();
  if(char==='{'||char==='['){const value=char==='{'?{}:[];this.assign(value);this.stack.push({value,array:char==='[',stage:char==='['?'valueOrEnd':'keyOrEnd'});index++;continue;}
  if(char==='"'){this.lex={type:'string',parts:['"'],escape:false};index++;continue;}
  if(!/[\-0-9tfn]/.test(char))this.fail();this.lex={type:'value',parts:[]};
 }}
 end(){this.text(this.decoder.end());if(this.lex){if(this.lex.type==='string')this.fail();this.token();}if(this.stack.length||!this.root)this.fail();this.strings.clear();return this.value;}
}
async function parse(body,size=0){const parser=new Parser();if(body===null||body===undefined)return parser.end();
 if(typeof body.stream==='function')body=body.stream();
 if(Buffer.isBuffer(body)||typeof body==='string'){parser.write(Buffer.from(body));if(size&&parser.bytes>size)throw Error('JSON response exceeds its size limit');return parser.end();}
 if(typeof body.on!=='function'){for await(const chunk of body){parser.write(chunk);if(size&&parser.bytes>size)throw Error('JSON response exceeds its size limit');}return parser.end();}
 return new Promise((resolve,reject)=>{
  let settled=false;const destroyed=Object.getOwnPropertySymbols(body).find(symbol=>symbol.description==='destroyed');
  const cleanup=()=>{body.removeListener('data',data);body.removeListener('end',end);body.removeListener('error',error);body.removeListener('close',close);if(destroyed)body.removeListener(destroyed,close);};
  const error=cause=>{if(settled)return;settled=true;cleanup();body.pause?.();reject(cause);};
  const close=()=>error(Error('JSON response stream closed before completing'));
  const data=chunk=>{try{parser.write(chunk);if(size&&parser.bytes>size)throw Error('JSON response exceeds its size limit');}catch(cause){error(cause);}};
  const end=()=>{if(settled)return;try{const value=parser.end();settled=true;cleanup();resolve(value);}catch(cause){error(cause);}};
  if(body.destroyed){error(Error('JSON response stream was destroyed'));return;}
  body.on('error',error);body.on('close',close);if(destroyed)body.on(destroyed,close);body.on('end',end);if(!settled)body.on('data',data);
 });
}
function install(cli){
 const localRequire=require('module').createRequire(cli),fetch=localRequire('minipass-fetch'),FetchError=localRequire('minipass-fetch/lib/fetch-error.js');
 if(typeof fetch.Response?.prototype.json!=='function')throw Error('This npm fetch implementation does not support streaming JSON.');
 fetch.Response.prototype.json=async function(){
  const key=Object.getOwnPropertySymbols(this).find(symbol=>symbol.description==='Body internals'),internal=key&&this[key];
  if(!internal||typeof internal.disturbed!=='boolean')throw Error('This npm fetch body does not support streaming JSON.');
  if(internal.disturbed)throw TypeError('body used already for: '+this.url);internal.disturbed=true;if(internal.error)throw internal.error;
  let timeout;if(this.timeout)timeout=setTimeout(()=>this.body?.destroy?.(new FetchError('Response timeout while trying to fetch '+this.url,'body-timeout')),this.timeout);
  try{return await parse(this.body,this.size);}catch(error){if(internal.error)throw internal.error;throw new FetchError('invalid json response body at '+this.url+' reason: '+error.message,'invalid-json');}finally{clearTimeout(timeout);}
 };
}
module.exports={Parser,parse,install};
