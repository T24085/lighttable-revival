'use strict';
const crypto=require('crypto'),path=require('path'),acorn=require('acorn'),mapping=require('@jridgewell/trace-mapping'),watches=require('./proof-watches.cjs'),html=require('./revival-html-watches.cjs'),syntax=require('./revival-syntax.cjs');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const normalize=source=>source.replace(/\r\n/g,'\n'),sourceViews=require('./revival-map-sources.cjs');
function create(root,input=[],checked){
 const watch={key:'__lt_watch_'+crypto.randomBytes(16).toString('hex'),generationAware:true,revision:-1},bindings=new Map();
 function update(files){
  if(!Array.isArray(files))throw Error('Invalid server watch files');
  for(const item of files)if(!item||typeof item.path!=='string'||! /\.(?:html?|[cm]?js|jsx|[cm]?ts|tsx)$/i.test(item.path))throw Error('Server watches need HTML, JavaScript, JSX or TypeScript project sources');
  let plan;try{plan=watches.plan('',[],files,null,file=>{const actual=checked(file),relative=path.relative(root,actual);if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw Error('Server watch leaves its project');return actual;},watch.key,html.instrumentSource);}catch(error){if(error.watchPath&&error.loc)error.location={path:error.watchPath,name:path.relative(root,error.watchPath),line:error.loc.line,column:error.loc.column+1,source:error.watchSource,sourceLine:error.watchSource.split(/\r?\n/)[error.loc.line-1]||'',sha256:hash(error.watchSource)};throw error;}
  const previous=new Map(bindings);Object.assign(watch,plan||{files:[],specs:[],sha256:hash('[]'),source:'',edits:[]});
  watch.specs=watch.specs.map(item=>({...item,captureToken:hash(JSON.stringify({sourceSha256:item.sourceSha256,loader:item.loader,specs:watch.files.find(file=>file.path===item.path).specs}))}));
  watch.revision++;bindings.clear();for(const item of watch.specs){const old=previous.get(item.id);bindings.set(item.id,old?.captureToken===item.captureToken?old:{id:item.id,sourceSha256:item.sourceSha256,captureToken:item.captureToken,status:'waiting'});}return watch;
 }
 update(input);
 function transform(source,map,file,resolve,unavailable,originalFor){
  const matched=[];
  if(map){for(let index=0;index<map.sources.length;index++){const address=map.resolvedSources[index],saved=originalFor?.(address,index),embedded=map.sourcesContent?.[index],original=typeof embedded==='string'?embedded:saved?.mappedSource,actual=resolve(address);if(!actual)continue;const record=watch.files.find(item=>item.path.toLowerCase()===actual.toLowerCase());if(record)matched.push({record,original,address,saved,index});}}
  else{const record=watch.files.find(item=>item.path.toLowerCase()===file?.toLowerCase());if(record)matched.push({record,original:source,address:null});}
  if(!matched.length)return {source,instrument:null};
  const specs=[],tokens={};let ast,nodes,calls;
  for(const {record,original:servedOriginal,address,saved,index:sourceIndex} of matched){
   const original=record.originalSource;
   const originalHash=hash(record.originalSource),tokenFor=id=>watch.specs.find(item=>item.id===id).captureToken;
   const view=sourceViews.view(original,servedOriginal,!!record.html);
   const hasSaved=typeof saved?.source==='string';
   if(view.status!=='matched'||view.body&&(!hasSaved||normalize(saved.source)!==normalize(original))){
    const status=!map&&unavailable?'unmapped':view.status!=='matched'?view.status:hasSaved?'stale':'unmapped',reason=!map&&unavailable?'Source map unavailable: '+unavailable:view.status!=='matched'?(saved?.reason||view.reason):hasSaved?'The original HTML changed since the compiled module':saved?.reason||'Original HTML source snapshot unavailable';
    for(const item of record.specs){if(view.regions?.length&&!view.regions.some(block=>item.from>=block.from&&item.to<=block.to))continue;bindings.set(item.id,{id:item.id,status,sourceSha256:originalHash,captureToken:tokenFor(item.id),reason});}continue;
   }
   if(!map){for(const item of record.specs){specs.push(item);tokens[item.id]=tokenFor(item.id);}continue;}
   // Different extracted bodies can share a source URL. Mapping lookups by URL
   // otherwise select its first occurrence; keep this ordinal distinct.
   const activeMap=map.resolvedSources.indexOf(address)===map.resolvedSources.lastIndexOf(address)?map:new mapping.TraceMap({version:3,sources:map.resolvedSources.map((value,index)=>index===sourceIndex?value:'lt-ignored:'+index),names:map.names,mappings:mapping.decodedMappings(map)});
   if(!ast){
    try{ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true,preserveParens:true});}catch(_){ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true,preserveParens:true});}
    nodes=new Map();calls=[];const pending=[ast];
    while(pending.length){const node=pending.pop();if(!node||typeof node.type!=='string')continue;
     if(/Expression$/.test(node.type)||['Identifier','Literal','TemplateLiteral'].includes(node.type)){const key=node.loc.start.line+':'+node.loc.start.column;if(!nodes.has(key))nodes.set(key,[]);nodes.get(key).push(node);if(node.type==='CallExpression')calls.push(node);}
     for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))for(const child of value)pending.push(child);else if(value&&typeof value==='object')pending.push(value);}
    }
   }
   const blocks=record.html?html.regions(original):[{from:0,to:original.length,source:original,module:record.module,toRaw:index=>index,fromRaw:index=>index}];
   const originalTokens=[];for(const block of blocks)for(const token of syntax.tokens(block.source,{filename:record.html?null:record.path,loader:record.html?undefined:record.loader,sourceType:block.module?'module':'script',allowNewTargetOutsideFunction:!!block.handler,allowReturnOutsideFunction:!!block.handler}))originalTokens.push({start:block.toRaw(token.start),end:block.toRaw(token.end,true)});
   const originalIndex=position=>position.source===address&&position.line!==null&&position.column!==null?view.fromMap(position.line,position.column):-1;
   function tokenAt(index){let low=0,high=originalTokens.length-1,found;while(low<=high){const mid=(low+high)>>>1;if(originalTokens[mid].start<=index){found=originalTokens[mid];low=mid+1;}else high=mid-1;}return found&&found.end>index?found:null;}
   for(const spec of record.specs){
    const block=blocks.find(block=>spec.from>=block.from&&spec.to<=block.to);if(!block||spec.from<view.from||spec.to>view.to)continue;
    const expression=syntax.runtimeExpression(syntax.expression(block.source,block.fromRaw(spec.from),block.fromRaw(spec.to),{filename:record.html?null:record.path,loader:record.html?undefined:record.loader,sourceType:block.module?'module':'script',allowNewTargetOutsideFunction:!!block.handler,allowReturnOutsideFunction:!!block.handler}));
    const selected={start:block.toRaw(expression.start),end:block.toRaw(expression.end,true)},jsx=expression.type==='JSXElement'||expression.type==='JSXFragment',closing=jsx?(expression.closingElement||expression.closingFragment):null,closingFrom=jsx?block.toRaw(closing?.start??expression.openingElement.end-2):-1;
    const point=view.toMap(selected.start),positions=mapping.allGeneratedPositionsFor(activeMap,{source:address,line:point.line,column:point.column}),candidates=[];
    // JSX pure annotations can own the only mapping segment at the opening
    // delimiter. The actual factory call inherits that segment's position.
    if(jsx)for(const node of calls){const position=node.loc.start,from=originalIndex(mapping.originalPositionFor(activeMap,position));if(from===selected.start&&!positions.some(item=>item.line===position.line&&item.column===position.column))positions.push(position);}
    // A compiler may split one HTML file into several module responses. A
    // response without this selection must not invalidate another module's
    // binding. Each complete expression is bound by the response that maps it.
    if(record.html&&!positions.length)continue;
    for(const position of positions)for(const node of nodes.get(position.line+':'+position.column)||[]){
     const from=originalIndex(mapping.originalPositionFor(activeMap,{line:node.loc.start.line,column:node.loc.start.column})),last=originalIndex(mapping.originalPositionFor(activeMap,{line:node.loc.end.line,column:Math.max(0,node.loc.end.column-1)})),lastToken=tokenAt(last);
     const endMatches=lastToken?.end===selected.end||jsx&&node.type==='CallExpression'&&last>=closingFrom&&last<selected.end;
     if(from===selected.start&&endMatches&&!candidates.includes(node))candidates.push(node);
    }
    if(candidates.length!==1){bindings.set(spec.id,{id:spec.id,status:'unmapped',sourceSha256:originalHash,captureToken:tokenFor(spec.id),reason:'The compiler map does not identify one complete expression'});continue;}
    specs.push({...spec,from:candidates[0].start,to:candidates[0].end});tokens[spec.id]=tokenFor(spec.id);
   }
  }
  const instrument=watches.instrument(source,specs,watch.key,tokens);
  for(const spec of specs)bindings.set(spec.id,{id:spec.id,status:'bound',captureToken:tokens[spec.id],sourceSha256:watch.specs.find(item=>item.id===spec.id).sourceSha256});
  return {source:instrument?.source||source,instrument};
 }
 function transformHTML(source,file){
  const record=watch.files.find(item=>item.html&&item.path.toLowerCase()===file?.toLowerCase());if(!record)return {source,instrument:null};
  const originals=html.regions(record.originalSource),served=html.regions(source),specs=[],tokens={},locations=[];
  for(const block of originals){
   const selections=record.specs.filter(item=>item.from>=block.from&&item.to<=block.to);
   const matching=served.filter(item=>item.kind===block.kind&&item.namespace===block.namespace&&item.module===block.module&&(!block.handler||item.name===block.name&&item.tag===block.tag&&(!block.elementId||item.elementId===block.elementId))&&normalize(item.source)===normalize(block.source));
   if(matching.length!==1){for(const spec of selections)bindings.set(spec.id,{id:spec.id,status:matching.length?'unmapped':'stale',captureToken:watch.specs.find(item=>item.id===spec.id).captureToken,sourceSha256:hash(record.originalSource),reason:'The server did not identify one matching inline script'});continue;}
   const target=matching[0];locations.push({from:target.from,to:target.to,region:target,originalRegion:block});
   for(const spec of selections){const from=html.originalLocation(block.source,block.fromRaw(spec.from)),to=html.originalLocation(block.source,block.fromRaw(spec.to));specs.push({...spec,from:target.toRaw(html.indexFromLocation(target.source,from.line,from.column)),to:target.toRaw(html.indexFromLocation(target.source,to.line,to.column),true)});tokens[spec.id]=watch.specs.find(item=>item.id===spec.id).captureToken;bindings.set(spec.id,{id:spec.id,status:'bound',captureToken:tokens[spec.id],sourceSha256:hash(record.originalSource)});}
  }
  const instrument=html.instrument(source,specs,watch.key,tokens,require('./revival-browser-watches.cjs').updateSource(watch));return {source:instrument?.source||source,instrument:instrument?{...instrument,htmlLocations:locations,originalRecord:record}:null};
 }
 return {watch,update,transform,transformHTML,bindings:()=>[...bindings.values()]};
}
module.exports={create};
