'use strict';
const crypto=require('crypto'),watches=require('./proof-watches.cjs'),html=require('./revival-html-regions.cjs'),javascript=require('./revival-js-locations.cjs');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex'),blocks=html.blocks,regions=html.regions;
function originalLocation(source,index){const before=source.slice(0,index),line=before.split(/\r\n|\r|\n/).length,last=Math.max(before.lastIndexOf('\n'),before.lastIndexOf('\r'));return {line,column:index-last-1};}
function insert(source,events){let code='',cursor=0;const edits=[];for(const event of events.sort((a,b)=>a.at-b.at)){code+=source.slice(cursor,event.at);cursor=event.at;const start=code.length;code+=event.text;edits.push({start,end:code.length,at:event.at});}return {source:code+source.slice(cursor),edits};}
function instrument(source,input,key,tokens,configuration){
 if(input===undefined||input===null||Array.isArray(input)&&!input.length)return null;
 if(typeof source!=='string'||Buffer.byteLength(source)>2*1024*1024)throw Error('Watched HTML exceeds 2 MiB');
 if(!Array.isArray(input)||input.length>64)throw Error('At most 64 expression watches are allowed');
 const scripts=regions(source),groups=new Map(),ids=new Set();
 for(const item of input){
  if(!item||typeof item.id!=='string'||ids.has(item.id)||!Number.isInteger(item.from)||!Number.isInteger(item.to)||item.from<0||item.to>source.length||item.from>=item.to)throw Error('Invalid inline expression watch');ids.add(item.id);
  const block=scripts.find(block=>item.from>=block.from&&item.to<=block.to),from=block?.fromRaw(item.from),to=block?.fromRaw(item.to);
  if(!block){const error=Error('Watch a complete JavaScript expression inside an executable inline script or event handler.');error.loc=originalLocation(source,item.from);throw error;}
  if(from<0||to<0||block.toRaw(from)!==item.from||block.toRaw(to,true)!==item.to)throw Error('Select complete JavaScript text without cutting an HTML entity or CDATA delimiter.');
  if(!groups.has(block))groups.set(block,[]);groups.get(block).push({...item,from,to});
 }
 const captureKey=key||'__lt_watch_'+crypto.randomBytes(16).toString('hex'),events=[],specs=[];
 for(const [block,selected] of [...groups].sort((a,b)=>a[0].from-b[0].from)){
  let compiled;try{compiled=watches.configure(watches.instrument(block.source,selected,captureKey,tokens,{handler:block.handler}),configuration);}catch(error){error.loc=originalLocation(source,block.toRaw(error.pos??selected[0].from));throw error;}
  for(const edit of compiled.edits){const at=block.toRaw(edit.at,!compiled.specs.some(spec=>spec.from===edit.at)),text=compiled.source.slice(edit.start,edit.end);if(at<0)throw Error('Inline JavaScript insertion has no original HTML position');if(!block.encode&&/<\/script[\t\n\f\r />]/i.test(text))throw Error('Escape script closing tags in a custom inline watch expression.');events.push({at,text:block.encode?block.encode(text,at):text});}
  for(const spec of compiled.specs)specs.push({...spec,from:block.toRaw(spec.from),to:block.toRaw(spec.to,true)});
 }
 const compiled=insert(source,events);if(Buffer.byteLength(compiled.source)>Buffer.byteLength(source)+256*1024)throw Error('Inline watch instrumentation exceeds its source budget');
 return {key:captureKey,...compiled,specs,sha256:hash(JSON.stringify(specs)),html:true};
}
function instrumentSource(source,input,key,tokens,file,loader){if(/\.html?$/i.test(file||'')){if(loader!==undefined)throw Error('HTML watches use their authored script grammar');return instrument(source,input,key,tokens);}return watches.instrument(source,input,key,tokens,{filename:file},loader);}
function indexFromLocation(source,line,column){let index=0,current=1;while(index<source.length&&current<line){const ch=source[index++];if(ch==='\r'){if(source[index]==='\n')index++;current++;}else if(ch==='\n')current++;}return index+column;}
function inlineIndex(record,line,column){const index=javascript.indexFromLocation(record.body,line,column);if(index<0||index>record.body.length)throw Error('Inline error location exceeds its captured source');return record.region?record.region.toRaw(index):record.from+index;}
function annotate(instrument,origin){
 const scripts=regions(instrument.source).filter(block=>block.source.length||block.namespace!=='http://www.w3.org/2000/svg'||block.handler);if(scripts.length>256)throw Error('Preview exceeds 256 inline script sources');
 const urls=[],events=[];for(const block of scripts){const url=origin+'/__lt_inline_'+crypto.randomBytes(16).toString('hex')+'.js',text='\n//# sourceURL='+url+'\n',at=block.toRaw(block.source.length,true);urls.push(url);events.push({at,text:block.encode?block.encode(text,at):text});}
 const added=insert(instrument.source,events),shift=index=>added.edits.reduce((size,item)=>size+(item.at<=index?item.end-item.start:0),0),edits=instrument.edits.map(edit=>{const size=shift(edit.start);return {...edit,start:edit.start+size,end:edit.end+size};});
 for(const edit of added.edits)edits.push({...edit,at:watches.offset(instrument,edit.at)});edits.sort((a,b)=>a.start-b.start);
 const final=regions(added.source).filter(block=>block.source.length||block.namespace!=='http://www.w3.org/2000/svg'||block.handler);if(final.length!==urls.length)throw Error('Inline source annotations changed the HTML region structure');
 return {instrument:{...instrument,source:added.source,edits},scripts:final.map((region,index)=>({url:urls[index],from:region.from,body:region.source,region}))};
}
module.exports={blocks,regions,instrument,instrumentSource,originalLocation,indexFromLocation,scriptLocation:javascript.location,scriptIndex:javascript.indexFromLocation,inlineIndex,annotate};
