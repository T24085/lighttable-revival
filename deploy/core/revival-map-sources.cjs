'use strict';
const acorn=require('acorn'),html=require('./revival-html-watches.cjs'),javascript=require('./revival-js-locations.cjs');
const normalize=source=>source.replace(/\r\n/g,'\n');
function scriptBody(source){
 if(typeof source!=='string')return false;
 for(const sourceType of ['module','script'])try{acorn.parse(source,{ecmaVersion:'latest',sourceType});return true;}catch(_){}
 return !html.regions(source).length;
}
function view(original,embedded,isHTML=false){
 if(typeof embedded!=='string')return {status:'unmapped',reason:'The source map omits original source contents'};
 const same=normalize(original)===normalize(embedded),matches=same?[{from:0,to:original.length,source:original,toRaw:index=>index,fromRaw:index=>index}]:isHTML?html.regions(original).filter(block=>normalize(block.source)===normalize(embedded)):[];
 if(matches.length!==1)return {status:matches.length?'unmapped':'stale',reason:matches.length?'The source map does not identify one original inline script':'The mapped source differs from the original editor',regions:matches};
 const block=matches[0],locations=isHTML&&same?{location:html.originalLocation,indexFromLocation:html.indexFromLocation}:javascript;
 return {status:'matched',body:!same,from:block.from,to:block.to,source:block.source,
  toMap:index=>locations.location(block.source,block.fromRaw(index)),
  fromMap:(line,column)=>{const index=locations.indexFromLocation(block.source,line,column);if(index<0||index>block.source.length)return -1;const point=locations.location(block.source,index);return point.line===line&&point.column===column?block.toRaw(index):-1;}};
}
module.exports={view,scriptBody};
