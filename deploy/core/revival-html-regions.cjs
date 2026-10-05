'use strict';
const parse5=require('parse5'),{EntityDecoder,DecodingMode,htmlDecodeTree}=require('entities/decode'),events=require('./revival-html-events.cjs');
const HTML='http://www.w3.org/1999/xhtml',SVG='http://www.w3.org/2000/svg',javascriptTypes=new Set(['application/ecmascript','application/javascript','application/x-ecmascript','application/x-javascript','text/ecmascript','text/javascript','text/jscript','text/livescript','text/x-ecmascript','text/x-javascript',...Array.from({length:6},(_,index)=>'text/javascript1.'+index)]),trim=value=>value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g,'');
function decoded(raw,start,attribute=false){
 const pieces=[],chunks=[];let length=0,plain=0,index=0,cdata=false,entity='';const decoder=new EntityDecoder(htmlDecodeTree,code=>{entity+=String.fromCodePoint(code);});
 const push=(from,to,text)=>{if(!text)return;pieces.push({from:start+from,to:start+to,first:length,last:length+text.length});chunks.push(text);length+=text.length;},flush=to=>{push(plain,to,raw.slice(plain,to));};
 while(index<raw.length){
  if(!attribute&&!cdata&&raw.startsWith('<![CDATA[',index)){flush(index);index+=9;plain=index;cdata=true;continue;}
  if(!attribute&&cdata&&raw.startsWith(']]>',index)){flush(index);index+=3;plain=index;cdata=false;continue;}
  if(raw[index]==='\r'||raw[index]==='\0'){flush(index);const size=raw[index]==='\r'&&raw[index+1]==='\n'?2:1;push(index,index+size,raw[index]==='\0'?'\uFFFD':'\n');index+=size;plain=index;continue;}
  if(!cdata&&raw[index]==='&'){entity='';decoder.startEntity(attribute?DecodingMode.Attribute:DecodingMode.Legacy);let size=decoder.write(raw,index+1);if(size===-1)size=decoder.end();if(size>0){flush(index);push(index,index+size,entity);index+=size;plain=index;continue;}}
  index++;
 }
 flush(index);const source=chunks.join('');
 function toRaw(point,end=false){if(!Number.isInteger(point)||point<0||point>source.length)return -1;let low=0,high=pieces.length-1,found;while(low<=high){const mid=(low+high)>>>1,piece=pieces[mid];if(piece.first<point||!end&&piece.first===point){found=piece;low=mid+1;}else high=mid-1;}if(!found)found=pieces[0];if(!found)return start;if(point>found.last)return -1;if(point===found.first)return found.from;if(point===found.last)return found.to;return found.to-found.from===found.last-found.first?found.from+point-found.first:found.from;}
 function fromRaw(point){let low=0,high=pieces.length-1,found;while(low<=high){const mid=(low+high)>>>1,piece=pieces[mid];if(piece.from<=point){found=piece;low=mid+1;}else high=mid-1;}if(!found||point>found.to)return -1;if(point===found.from)return found.first;if(point===found.to)return found.last;return found.to-found.from===found.last-found.first?found.first+point-found.from:-1;}
 return {source,toRaw,fromRaw};
}
function rawRegion(source,from,to,extra){return {from,to,source:source.slice(from,to),toRaw:index=>index>=0&&index<=to-from?from+index:-1,fromRaw:index=>index>=from&&index<=to?index-from:-1,...extra};}
function script(node){
 if(node.tagName!=='script'||![HTML,SVG].includes(node.namespaceURI))return null;
 const attrs=new Map(node.attrs.map(attr=>[attr.name,attr.value])),svg=node.namespaceURI===SVG,type=(attrs.has('type')?(attrs.get('type')===''?'text/javascript':trim(attrs.get('type'))):!svg&&attrs.get('language')?'text/'+attrs.get('language'):'text/javascript').toLowerCase(),module=type==='module';
 if(!module&&!javascriptTypes.has(type)||!svg&&!module&&attrs.has('nomodule'))return null;
 if(!svg&&!module&&attrs.has('for')&&attrs.has('event')&&(trim(attrs.get('for')).toLowerCase()!=='window'||!['onload','onload()'].includes(trim(attrs.get('event')).toLowerCase())))return null;
 const external=svg?node.attrs.find(attr=>attr.name==='href'&&!attr.namespace)||node.attrs.find(attr=>attr.name==='href'&&attr.namespace==='http://www.w3.org/1999/xlink'):node.attrs.find(attr=>attr.name==='src');
 return {svg,module,external,attribute:svg?external?.prefix?'xlink:href':'href':'src',attrs};
}
function regions(source,includeHandlers=true){
 const tree=parse5.parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true}),pending=[tree],found=[];
 while(pending.length){const node=pending.pop();for(const child of node.childNodes||[])pending.push(child);const location=node.sourceCodeLocation;if(!node.tagName||!location?.startTag)continue;const attrs=new Map(node.attrs.map(attr=>[attr.name,attr.value]));
  if(includeHandlers)for(const attr of node.attrs){if(attr.namespace||!events.recognizes(node,attr.name))continue;const at=location.attrs?.[attr.name];if(!at)continue;const raw=source.slice(at.startOffset,at.endOffset),head=raw.match(/^[^\t\n\f\r =/>]+[\t\n\f\r ]*=[\t\n\f\r ]*/);if(!head)continue;const quote=raw[head[0].length],quoted=quote==='"'||quote==="'",from=at.startOffset+head[0].length+(quoted?1:0),to=at.endOffset-(quoted&&raw.endsWith(quote)?1:0),value=decoded(source.slice(from,to),from,true);if(value.source!==attr.value)throw Error('Event attribute text does not match its HTML parser location');found.push({from,to,...value,kind:'handler',handler:events.windowError(node,attr.name)?'window-error':true,module:false,name:attr.name,tag:node.tagName,namespace:node.namespaceURI,elementId:attrs.get('id')||null,encode:text=>text.replace(/[&"'<>`=\t\n\f\r ]/g,char=>'&#'+char.charCodeAt(0)+';')});}
  const classification=script(node);if(!classification||classification.external)continue;const {svg,module}=classification;
  const from=location.startTag.endOffset,to=location.endTag?.startOffset??location.endOffset,extra={module,kind:'script',namespace:node.namespaceURI};
  if(!svg)found.push(rawRegion(source,from,to,extra));else{
   const parts=[];let length=0;for(const child of node.childNodes||[]){if(child.nodeName!=='#text'||!child.sourceCodeLocation)continue;const at=child.sourceCodeLocation,value=decoded(source.slice(at.startOffset,at.endOffset),at.startOffset);if(value.source!==child.value)throw Error('SVG script text does not match its HTML parser location');parts.push({...value,from:at.startOffset,to:at.endOffset,first:length,last:length+value.source.length});length+=value.source.length;}
   found.push({from,to,source:parts.map(part=>part.source).join(''),...extra,
    toRaw:(point,end=false)=>{if(!Number.isInteger(point)||point<0||point>length)return -1;const part=(end?parts:[...parts].reverse()).find(part=>point>=part.first&&point<=part.last);return part?part.toRaw(point-part.first,end):point===0?from:-1;},
    fromRaw:point=>{const part=parts.find(part=>point>=part.from&&point<=part.to);if(!part)return -1;const index=part.fromRaw(point);return index<0?-1:part.first+index;},
    encode:(text,at)=>{const part=parts.find(part=>at>=part.from&&at<=part.to),prefix=source.slice(part?.from??from,at),open=prefix.lastIndexOf('<![CDATA[')>prefix.lastIndexOf(']]>');return open?text.replaceAll(']]>',']]]]><![CDATA[>'):text.replace(/[&<>]/g,char=>'&#'+char.charCodeAt(0)+';');}});
  }
 }
 return found.sort((a,b)=>a.from-b.from);
}
module.exports={regions,blocks:source=>regions(source,false),decoded,script};
