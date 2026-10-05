'use strict';
const crypto=require('crypto'),hot=require('./revival-hot-code.cjs'),mapping=require('@jridgewell/trace-mapping');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
function create(prepared,key){
 const resources=new Map(),maps=new Map();
 const classics=new Set(),nodes=[require('parse5').parse(prepared.html)];let modulePage=false,base=prepared.url,baseSeen=false;
 while(nodes.length){const node=nodes.pop();for(const child of [...(node.childNodes||[])].reverse())nodes.push(child);if(node.tagName==='base'&&!baseSeen){const href=node.attrs.find(attr=>attr.name==='href')?.value;if(href!==undefined){baseSeen=true;try{base=new URL(href,base).href;}catch(_){}}}const script=require('./revival-html-regions.cjs').script(node);if(!script)continue;if(script.module)modulePage=true;else if(script.external)try{classics.add(prepared.urlFor(prepared.fromURL(new URL(script.external.value,base).href)));}catch(_){} }
 function decorate(file,body){
  const type=prepared.typeFor(file),address=prepared.urlFor(file),source=Buffer.isBuffer(body)?body.toString('utf8'):String(body);
  if(!/^(?:text\/javascript|text\/css)/.test(type))return body;
  // Module bindings cannot be recreated by evaluation in the global context.
  // Instrument only declared classic resources in a classic-only document.
  const compiled=type==='text/javascript'&&!modulePage&&classics.has(address)?hot.compile(source,address,key):null;
  resources.set(file,{file,address,type,source,sha256:hash(source),compiled});if(compiled)maps.set(address,{address,trace:new mapping.TraceMap(compiled.map),prepared});
  return compiled?Buffer.from(compiled.code):body;
 }
 function mapped(address,line,column){const map=maps.get(address);if(!map)return null;const point=mapping.originalPositionFor(map.trace,{line,column:Math.max(0,column-1)});return point.line===null?null:map.prepared.mapLocation(map.address,point.line,point.column+1);}
 function plan(candidate){
  const next=create(candidate,key),patches=[],styles=[];let markup=false;
  const previous=prepared.snapshot(),known=new Map(previous.files.map(item=>[item.path?.toLowerCase(),item]));
  for(const item of previous.files){if(!item.path)continue;const now=candidate.read(item.path);if(now.sha256===item.sha256)continue;
   if(item.path===prepared.entry&&/\.html?$/i.test(item.path)){markup=true;continue;}
   const resource=resources.get(item.path);if(!resource)return {reason:'A source or project input needs a restart'};
  }
  for(const resource of resources.values()){
   const raw=candidate.response(resource.file);if(!raw)return {reason:'The compiled resource layout changed'};
   next.decorate(resource.file,raw);const updated=next.resources.get(resource.file);
   if(updated.sha256===resource.sha256)continue;
   if(resource.type==='text/css'){styles.push({address:resource.address,text:updated.source});continue;}
   if(!resource.compiled||!updated.compiled||resource.compiled.fingerprint!==updated.compiled.fingerprint)return {reason:'Initialization or module structure changed'};
   patches.push(updated.compiled);
  }
  for(const item of candidate.snapshot().files)if(item.path&&!known.has(item.path.toLowerCase())&&item.kind!=='resolution-source')return {reason:'The project resource layout changed'};
  if(markup&&patches.length)return {reason:'Code and document structure changed together'};
  return {next,patches,styles,markup,html:candidate.html};
 }
 function patchAddress(patch,index){const address=patch.address+'?lt-live-update='+index;maps.set(address,{address:patch.address,trace:new mapping.TraceMap(patch.patchMap),prepared});return address;}
 return {resources,maps,decorate,mapped,plan,patchAddress,key};
}
function documentPatch(html,validateOnly=false){return `(()=>{const incoming=new DOMParser().parseFromString(${JSON.stringify(html)},'text/html');const scripts=doc=>JSON.stringify([...doc.querySelectorAll('script')].map(node=>({position:(()=>{const chain=[];for(let parent=node;parent&&parent.nodeType===1;parent=parent.parentElement)chain.push([parent.nodeName,[...parent.parentNode.children].indexOf(parent)]);return chain;})(),attributes:[...node.attributes].map(a=>[a.name,a.value]).sort(),text:node.textContent})));if(scripts(document)!==scripts(incoming))return 'Script layout changed';if([...incoming.querySelectorAll('*')].some(node=>node.localName.includes('-')))return 'Custom elements require a restart';if(incoming.querySelectorAll('*').length>10000)return 'Document exceeds 10000 nodes';if(${validateOnly?'true':'false'})return null;let visited=0;function patch(oldNode,newNode){if(++visited>10000)throw Error('Live document patch exceeds 10000 nodes');if(oldNode.nodeType!==newNode.nodeType||oldNode.nodeType===1&&oldNode.nodeName!==newNode.nodeName){oldNode.replaceWith(newNode.cloneNode(true));return;}if(oldNode.nodeType!==1){if(oldNode.nodeValue!==newNode.nodeValue)oldNode.nodeValue=newNode.nodeValue;return;}if(oldNode.nodeName==='SCRIPT')return;const scroll=[oldNode.scrollLeft,oldNode.scrollTop],form=['INPUT','TEXTAREA','SELECT'].includes(oldNode.nodeName),value=form?oldNode.value:null,checked=oldNode.checked;for(const attr of [...oldNode.attributes])if(!newNode.hasAttribute(attr.name))oldNode.removeAttribute(attr.name);for(const attr of [...newNode.attributes])if(oldNode.getAttribute(attr.name)!==attr.value)oldNode.setAttribute(attr.name,attr.value);let index=0;for(const child of [...newNode.childNodes]){let current=oldNode.childNodes[index];if(child.nodeType===1&&child.id){const match=[...oldNode.children].find(node=>node.id===child.id&&node.nodeName===child.nodeName);if(match){if(match!==current)oldNode.insertBefore(match,current||null);current=match;}}if(current)patch(current,child);else oldNode.append(child.cloneNode(true));index++;}while(oldNode.childNodes.length>index)oldNode.lastChild.remove();if(form){if(oldNode.nodeName!=='SELECT'||[...oldNode.options].some(option=>option.value===value))oldNode.value=value;if(checked!==undefined)oldNode.checked=checked;}oldNode.scrollLeft=scroll[0];oldNode.scrollTop=scroll[1];}patch(document.head,incoming.head);patch(document.body,incoming.body);return null;})()`;}
module.exports={create,documentPatch};
