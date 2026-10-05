'use strict';
const path=require('path'),crypto=require('crypto'),acorn=require('acorn'),esbuild=require('esbuild'),parse5=require('parse5'),mapping=require('@jridgewell/trace-mapping');
const packages=require('./proof-packages.cjs'),watches=require('./proof-watches.cjs'),html=require('./revival-html-watches.cjs'),javascript=require('./revival-js-locations.cjs'),syntax=require('./revival-syntax.cjs'),configurations=require('./revival-compiler-config.cjs'),localResolution=require('./revival-local-resolve.cjs');
const limits=Object.freeze({codeBytes:4*1024*1024,mapBytes:8*1024*1024,outputs:256,compileMs:5000,classicDependencies:256});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const assetExtensions=new Set(['.svg','.png','.jpg','.jpeg','.gif','.webp','.avif','.bmp','.ico','.woff','.woff2','.ttf','.otf','.eot']);
function walk(node,visit){if(!node||typeof node.type!=='string')return;visit(node);for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))for(const child of value)walk(child,visit);else if(value&&typeof value==='object')walk(value,visit);}}
function parse(source,filename,loader){try{return syntax.parse(source,{filename,loader,sourceType:'module',locations:true});}catch(error){try{return syntax.parse(source,{filename,loader,sourceType:'script',locations:true});}catch(_){throw error;}}}
function create(input){
 const {root,entry,origin,read,checked,url,fromURL,instrument,watch}=input,outputRoot=path.join(root,'.lt-preview-'+crypto.randomBytes(16).toString('hex')),prefix=origin+'/'+path.basename(outputRoot)+'/';
 const entries=[],inline=new Map(),sourceRecords=new Map(),outputs=new Map(),aliases=new Map(),buffers=new Map(),classicSources=new Map(),classicLocations=new Map(),classicRoots=[],rootIds=new Map(),rootAliases=[],unavailableRoots=new Map(),classicStyles=new Map();const classicKey='__lt_classic_'+crypto.randomBytes(16).toString('hex');let compiled=null,closed=false,context,timer,startedAt=0,classicFailure=null,moduleDynamic=false,localResolver,browserMapping=()=>false;
 const loaderFor=file=>syntax.effectiveLoader(file,input.loaderFor?.(file));
 function aborted(){if(closed)throw Error('Preview compilation cancelled');if(startedAt&&Date.now()-startedAt>=limits.compileMs)throw Error('Preview compilation exceeded 5000 ms');}
 function finishMetadata(tracker,config){
  const tracked=tracker.finish(),captured=new Map();let bytes=0;
  for(const item of [...tracked.metadata,...(config?config.finish().metadata:[])]){
   aborted();const key=item.path.toLowerCase(),prior=captured.get(key);if(prior){if(prior.exists!==item.exists||prior.sha256!==item.sha256)throw Error('Preview metadata changed during compilation. Run again.');continue;}
   if(captured.size>=packages.limits.manifests)throw Error('Preview exceeds 256 metadata paths');bytes+=Buffer.byteLength(item.source||'');if(bytes>packages.limits.metadataBytes)throw Error('Preview metadata exceeds 1 MiB');captured.set(key,item);
  }
  tracked.metadata=[...captured.values()];return tracked;
 }
 function resolveLocal(input){aborted();return localResolver.resolve(input);}
 function local(specifier,importer){const address=new URL(specifier,url(importer));if(address.origin!==new URL(origin).origin||address.protocol!==new URL(origin).protocol)throw Error('Browser module import leaves the preview origin');return fromURL(address.href);}
 function dependencies(source,file){const found=[];walk(parse(source,file,loaderFor(file)),node=>{if(node.importKind==='type'||node.exportKind==='type')return;const value=node.type==='ImportDeclaration'||node.type==='ExportAllDeclaration'||node.type==='ExportNamedDeclaration'?node.source:node.type==='ImportExpression'?node.source:node.type==='CallExpression'&&node.callee?.name==='require'?node.arguments[0]:null;if(value?.type==='Literal'&&typeof value.value==='string')found.push(value.value);});return found;}
 function needs(file,source,visited=new Set()){
  aborted();
  const key=file.toLowerCase();if(visited.has(key))return false;visited.add(key);if(loaderFor(file)!=='js'||/\.cjs$/i.test(file))return true;
  let list,cjs=false;try{list=dependencies(source,file);walk(parse(source,file,loaderFor(file)),node=>{if(node.type==='MemberExpression'&&(node.object?.name==='exports'||node.object?.name==='module'&&(node.property?.name==='exports'||node.property?.value==='exports')))cjs=true;});}catch(_){return false;}if(cjs)return true;
  for(const specifier of list){
   if(!/^(?:\.\.?\/|\/|lt-preview:)/.test(specifier))return true;
   try{
    const requested=local(specifier,file);if(browserMapping(requested))return true;const resolved=resolveLocal(requested);
    // Native module requests cannot infer extensions or directory indexes.
    // Use the compiler's same resolver before deciding to keep a native page.
    if(resolved.toLowerCase()!==requested.toLowerCase())return true;
    if(!/\.[cm]?js$/i.test(resolved))return true;
    const dependency=read(resolved);if(/\.[cm]?js$/i.test(dependency.path)&&needs(dependency.path,dependency.source,visited))return true;
   }catch(_){return true;} // Let compilation report resolution/policy failures.
  }
  return false;
 }
 function documentEntries(source){
  const tree=parse5.parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true}),pending=[tree],found=[],regions=html.blocks(source),classicText=new Map();aborted();
  while(pending.length){aborted();const node=pending.pop();for(const child of node.childNodes||[])pending.push(child);if(node.tagName!=='script'||!['http://www.w3.org/1999/xhtml','http://www.w3.org/2000/svg'].includes(node.namespaceURI))continue;
   const location=node.sourceCodeLocation,classification=require('./revival-html-regions.cjs').script(node);if(!location?.startTag||!classification)continue;const {svg,module,external,attribute,attrs}=classification;
   let styleAt=location.startOffset;for(let parent=node.parentNode;parent;parent=parent.parentNode)if(parent.tagName==='svg'&&parent.sourceCodeLocation)styleAt=parent.sourceCodeLocation.startOffset;
   if(external){const requested=local(external.value,entry),file=module?resolveLocal(requested):requested,item=read(file);if(!item.exists||item.source===null)continue;if(!module&&!classicText.has(file.toLowerCase()))classicText.set(file.toLowerCase(),input.responseSource(file));found.push({file,requested,source:module?item.source:classicText.get(file.toLowerCase()),location,styleAt,inline:false,attribute,svg,module,async:attrs.has('async'),defer:attrs.has('defer')&&!attrs.has('async')});}
   else{const from=location.startTag.endOffset,region=regions.find(item=>item.from===from);if(!region)continue;const id='inline-'+found.length;inline.set(id,{file:entry,source:region.source,from,region,instrument:instrument(entry)});found.push({file:id,source:region.source,location,styleAt,inline:true,attribute:svg?'href':'src',svg,module,async:false,defer:false});}
  }
  return found.sort((a,b)=>a.location.startOffset-b.location.startOffset);
 }
 function planClassics(items){
  const classicItems=items.filter(item=>!item.module);if(!classicItems.length)return [];
  const analyzer=require('./revival-browser-dependencies.cjs'),records=[],blocking=new Set(),deferred=new Set(),allBlocking=new Set(),analyses=new Map();let addedBytes=0;
  for(const item of classicItems){
   aborted();const key=item.inline?item.file:item.file.toLowerCase();let analysis=analyses.get(key);
   if(analysis===undefined){try{const {ast,...summary}=analyzer.analyze(item.source,{classic:true});if(item.classicTransform)walk(ast,node=>{if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&!node.callee.computed&&node.callee.object.name===classicKey&&node.callee.property.name==='fallback'&&node.arguments[0]?.type==='Literal')summary.dependencies.push({kind:'require-call',resolutionKind:'import-statement',forced:true,specifier:node.arguments[0].value,from:node.callee.start,to:node.callee.end,node});});summary.dependencies.sort((a,b)=>a.from-b.from);analysis=summary;}catch(error){if(!(error instanceof SyntaxError))throw error;analysis=null;}analyses.set(key,analysis);}
   aborted();if(!analysis)continue;records.push({...item,analysis});if(!item.async&&!item.defer)for(const name of analysis.globalBindings)allBlocking.add(name);
  }
  // Callbacks can run after later scripts declare or assign the global binding.
  const uncertain=records.some(item=>item.analysis.globalBindings.has('require')||item.analysis.dynamic)||items.some(item=>item.module&&(()=>{try{return analyzer.analyze(item.source,{classic:false}).dynamic;}catch(_){return false;}})());
  for(const item of records){
   aborted();const globals=new Set(item.defer?[...allBlocking,...deferred]:blocking),analysis=item.analysis,edits=[],dependencies=new Set();
   for(const dependency of analysis.dependencies){
    aborted();if(dependency.kind==='require-call'&&!dependency.forced&&globals.has('require'))continue;
    if(dependency.kind==='dynamic-import'&&dependency.node?.options){const error=Error('Classic package import options are not supported yet');error.location=dependencyLocation({...dependency,item});throw error;}
    const importer=item.inline?entry:item.file,key=JSON.stringify([importer.toLowerCase(),dependency.kind,dependency.resolutionKind||dependency.kind,dependency.specifier]);let id=rootIds.get(key);
    const optional=dependency.kind==='require-call'&&!dependency.forced&&(uncertain||item.async&&allBlocking.has('require'));
    if(id===undefined){if(classicRoots.length>=limits.classicDependencies)throw Error('Preview exceeds 256 classic dependency roots');id=classicRoots.length;rootIds.set(key,id);classicRoots.push({kind:dependency.kind,resolutionKind:dependency.resolutionKind,specifier:dependency.specifier,from:dependency.from,to:dependency.to,importer,optional,item});}else classicRoots[id].optional=classicRoots[id].optional||optional;
    dependencies.add(id);
    if(dependency.kind==='require-call'){const callee=dependency.node.callee;edits.push({from:callee.start,to:callee.end,text:classicKey+'.select('+id+','+item.source.slice(callee.start,callee.end)+')'});}
    else{
     const token=acorn.tokenizer(item.source.slice(dependency.from,dependency.node.source.start),{ecmaVersion:'latest'});token.getToken();const opening=token.getToken();if(opening.type.label!=='(')throw Error('Dynamic import has no opening parenthesis');edits.push({from:dependency.from,to:dependency.from+6,text:classicKey+'.import'},{from:dependency.from+opening.end,to:dependency.from+opening.end,text:id+','});
    }
   }
   for(const edit of edits){addedBytes+=Math.max(0,Buffer.byteLength(edit.text)-Buffer.byteLength(item.source.slice(edit.from,edit.to)));if(addedBytes>limits.codeBytes)throw Error('Preview compilation exceeds 4 MiB code / 8 MiB maps');}
   item.dependencies=[...dependencies];
   // Repeated external tags request one resource. Merge their planned edits;
   // the dispatcher still looks up the native require binding on each run.
   const prior=item.inline?null:classicSources.get(item.file.toLowerCase())?.record,merged=prior?[...prior.originalEdits,...edits]:edits,unique=[...new Map(merged.map(edit=>[edit.from+':'+edit.to,edit])).values()];
   const converted=replaceEdits(item.source,unique),record={file:item.inline?entry:item.file,inline:item.inline?inline.get(item.file):null,before:item.source,code:converted.source,edits:converted.edits,originalEdits:unique,...(item.classicTransform?{classicTransform:item.classicTransform,loader:item.loader}:{})};item.converted=converted;item.record=record;
   if(item.inline){const address=item.source.match(/\/\/\# sourceURL=(\S+)\s*$/)?.[1];if(address)classicLocations.set(fromURL(address).toLowerCase(),record);}
   else{const original=read(item.file);classicSources.set(item.file.toLowerCase(),{...original,type:'text/javascript',source:converted.source,value:Buffer.from(converted.source),sha256:hash(converted.source),byteLength:Buffer.byteLength(converted.source),record});}
   if(!item.async)for(const name of item.analysis.globalBindings)(item.defer?deferred:blocking).add(name);
   delete item.analysis;
  }
  for(const item of records)if(!item.inline){const record=classicSources.get(item.file.toLowerCase()).record;item.record=record;item.converted={source:record.code,edits:record.edits};}
  aborted();return records;
 }
 function dependencyLocation(dependency){
  const item=dependency.item,record=item.inline?inline.get(item.file):null,file=record?entry:item.file,source=read(file);let index=dependency.from;
  if(record)index=watches.offset(record.instrument,record.region.toRaw(index));else{if(item.classicTransform)index=classicOriginalIndex(item.classicTransform,index);index=watches.offset(watches.forFile(watch,file),index);}
  const point=html.originalLocation(source.source,index);return {...source,...point,value:undefined,column:point.column+1,sourceLine:source.source?.split(/\r\n|\r|\n/)[point.line-1]||''};
 }
 function replaceEdits(source,edits){let code='',cursor=0;const offsets=[];for(const edit of edits.sort((a,b)=>a.from-b.from||a.to-b.to)){if(edit.from<cursor)throw Error('Overlapping classic dependency edits');code+=source.slice(cursor,edit.from);const start=code.length;code+=edit.text;offsets.push({...edit,start,end:code.length});cursor=edit.to;}code+=source.slice(cursor);return {source:code,edits:offsets};}
 function undoEdits(index,edits){let delta=0;for(const edit of edits){if(index<edit.start)break;if(index<edit.end)return edit.from;delta+=(edit.end-edit.start)-(edit.to-edit.from);}return index-delta;}
 function classicOriginalIndex(transform,index){const generated=undoEdits(index,transform.imports.edits),point=javascript.location(transform.generated,generated),mapped=mapping.originalPositionFor(transform.trace,{line:point.line,column:point.column});return mapped.line===null?transform.imports.edits.some(edit=>edit.runtimeImport&&generated>=edit.from&&generated<=edit.to)?transform.jsxIndex:-1:javascript.indexFromLocation(transform.source,mapped.line,mapped.column);}
 function classicImports(source){
  const {ast,bindings}=require('./revival-browser-dependencies.cjs').importBindings(source),edits=[];let id=0;
  for(const declaration of ast.body.filter(node=>node.type==='ImportDeclaration')){
   const namespace=classicKey+'_jsx_'+crypto.randomBytes(8).toString('hex')+'_'+id++,values=[namespace+'='+classicKey+'.fallback('+JSON.stringify(declaration.source.value)+')'];
   for(const binding of bindings.filter(item=>item.declaration===declaration)){const specifier=binding.node,value=specifier.type==='ImportNamespaceSpecifier'?namespace:'(0,'+namespace+'['+JSON.stringify(specifier.type==='ImportDefaultSpecifier'?'default':specifier.imported.name??specifier.imported.value)+'])';for(const reference of binding.references)edits.push({from:reference.node.start,to:reference.node.end,text:(reference.shorthand?reference.node.name+':':'')+value});}
   edits.push({from:declaration.start,to:declaration.end,text:'var '+values.join(',')+';',runtimeImport:true});
  }
  return replaceEdits(source,edits);
 }
 function replaceMeta(source,file,inlineRecord){
  const edits=[];let tree;try{tree=parse(source,file,loaderFor(file));}catch(error){if(error.loc){if(inlineRecord)error.inlineParserFailure=true;const item=read(file),index=error.pos??javascript.indexFromLocation(source,error.loc.line,error.loc.column);let raw=index,instrument=watches.forFile(watch,file);if(inlineRecord){if(!Number.isSafeInteger(index)||index<0||index>source.length)throw Error('Inline parser location exceeds its captured source',{cause:error});raw=inlineRecord.region.toRaw(index);instrument=inlineRecord.instrument;if(!Number.isSafeInteger(raw)||raw<0)throw Error('Inline parser location has no original HTML position',{cause:error});}const original=watches.offset(instrument,raw);if(inlineRecord&&(!Number.isSafeInteger(original)||original<0||original>item.source.length))throw Error('Inline parser location exceeds its original HTML source',{cause:error});const point=html.originalLocation(item.source,original);error.location={...item,...point,column:point.column+1,value:undefined,sourceLine:item.source.split(/\r\n|\r|\n/)[point.line-1]||''};}throw error;}walk(tree,node=>{if(node.type==='MemberExpression'&&!node.computed&&node.object?.type==='MetaProperty'&&node.object.meta.name==='import'&&node.object.property.name==='meta'&&node.property.name==='url')edits.push({from:node.start,to:node.end,text:JSON.stringify(url(file))});});
  let code='',cursor=0;const offsets=[];for(const edit of edits.sort((a,b)=>a.from-b.from)){code+=source.slice(cursor,edit.from);const start=code.length;code+=edit.text;offsets.push({...edit,start,end:code.length});cursor=edit.to;}code+=source.slice(cursor);return {source:code,edits:offsets};
 }
 function sourceRecord(name){const exact=sourceRecords.get(name);if(exact)return exact;let found,keyLength=0;for(const [key,record] of sourceRecords)if(key.length>keyLength&&name.startsWith(key)&&/^[?#]/.test(name.slice(key.length))){found=record;keyLength=key.length;}return found;}
 async function cssResolve(args,build){
  const asset=args.kind==='url-token',specifier=args.path;
  // Keep data images/fonts and same-document SVG fragments as browser values.
  // Stylesheets and file resources otherwise use the same checked project graph.
  if(asset&&(/^(?:data:|#)/i.test(specifier)))return {path:specifier,external:true};
  if(specifier.startsWith('//')||/^(?!lt-preview:)[a-z][a-z\d+.-]*:/i.test(specifier))throw Error('CSS resource leaves the preview origin: '+specifier);
  const at=specifier.search(/[?#]/),name=at<0?specifier:specifier.slice(0,at),suffix=at<0?'':specifier.slice(at);
  if(!name)throw Error('CSS resource has no project path: '+specifier);
  let candidate;
  if(/^(?:\/|lt-preview:)/.test(name))candidate=local(name,args.importer);
  else{const relative=decodeURIComponent(name);if(/[\\:\x00]/.test(relative))throw Error('Invalid CSS resource path: '+specifier);candidate=checked(path.resolve(path.dirname(args.importer),relative));}
  aborted();const item=read(candidate);
  if(asset){if(!item.exists)throw Error('CSS asset not found: '+item.name);return {path:candidate,namespace:'lt-asset',suffix};}
  if(item.exists)return {path:candidate,namespace:'lt-project',suffix};
  if(/^(?:\.\.?\/|\/|lt-preview:)/.test(name))throw Error('CSS stylesheet not found: '+item.name);
  // Bare CSS imports first follow URL-relative lookup, then installed packages.
  const resolved=await trackerResolveCSS({...args,path:name},build);return {...resolved,suffix};
 }
 let trackerResolveCSS;
 function restore(record,line,column){
  if(record.transform){const point=mapping.originalPositionFor(record.transform,{line,column});if(point.line===null||point.column===null)return null;line=point.line;column=point.column;}
  let index=record.css?html.indexFromLocation(record.code,line,column):javascript.indexFromLocation(record.code,line,column),delta=0;if(index<0||index>record.code.length)throw Error('Compiled source location exceeds its captured source');for(const edit of record.edits){if(index<edit.start)break;if(index<edit.end){index=edit.from;delta=0;break;}delta+=(edit.end-edit.start)-(edit.to-edit.from);}index-=delta;
  if(record.inline){index=record.inline.region.toRaw(index);index=watches.offset(record.inline.instrument,index);return {...read(entry),...html.originalLocation(read(entry).source,index)};}
  if(record.classicTransform){index=classicOriginalIndex(record.classicTransform,index);if(index<0)return null;}
  const item=read(record.file);return {...item,...html.originalLocation(item.source,watches.offset(watches.forFile(watch,record.file),index))};
 }
 function configurationLocation(error){return configurations.validateLocation(configurations.fromError(error),{root,checked});}
 async function compile(document){
  try{return await compileDocument(document);}catch(error){const location=configurationLocation(error);if(location)error.location=location;throw error;}
 }
 async function compileDocument(document){
  if(closed)aborted();if(compiled)return compiled;startedAt=Date.now();aborted();
  for(const item of input.buffers||[])buffers.set(item.path.toLowerCase(),item.source);
  const tracker=packages.tracker(root,buffers,aborted,{onDiscovery:input.onDiscovery}),config=configurations.create({root,buffers,checked,aborted}),transforms=new Map(),classicTransforms=new Map();let transformBytes=0,transformMapBytes=0,classicCodeBytes=0,classicMapBytes=0;
  browserMapping=tracker.requiresBrowser;
  localResolver=localResolution.create({root,checked,buffers,manifest:tracker.manifest,negative:tracker.negative,aborted});
  const documentEntry=/\.html?$/i.test(entry)?documentEntries(document):[{file:entry,source:read(entry).source,inline:false,module:true}];
  for(const item of documentEntry){if(item.inline||item.module||loaderFor(item.file)==='js')continue;aborted();const key=item.file.toLowerCase();let transformed=classicTransforms.get(key);if(!transformed){
    const loader=loaderFor(item.file),source=item.source;let parsed;const original=read(item.file),failureLocation=(line,column)=>{const point=watches.position(watches.forFile(watch,item.file),line,column,original.source);return {...original,...point,column:point.column+1,sourceLine:original.source.split(/\r\n|\r|\n/)[point.line-1]||'',value:undefined};};try{parsed=parse(source,item.file,loader);}catch(error){error.location=failureLocation(error.loc?.line||1,error.loc?.column||0);throw error;}
    const invalid=parsed.body.find(node=>!syntax.isTypeOnly(node)&&(/^Export/.test(node.type)||node.type==='ImportDeclaration'&&(!node.specifiers.length||node.specifiers.some(specifier=>specifier.importKind!=='type'))));if(invalid){const error=Error('Classic scripts cannot contain runtime imports or exports: '+path.relative(root,item.file));error.location=failureLocation(invalid.loc.start.line,invalid.loc.start.column);throw error;}
    let jsxIndex=-1;walk(parsed,node=>{if(['JSXElement','JSXFragment'].includes(node.type)&&(jsxIndex<0||node.start<jsxIndex))jsxIndex=node.start;});
    const raw=config.forFile(item.file).raw;let built;try{built=await esbuild.transform(source,{loader,tsconfigRaw:raw,...(/^(?:preserve|react-native)$/.test(raw.compilerOptions.jsx||'')?{jsx:'transform'}:{}),target:'es2022',sourcefile:item.file,sourcemap:'external',sourcesContent:false,legalComments:'none',logLevel:'silent'});}catch(error){const configured=configurationLocation(error);if(configured){error.location=configured;throw error;}const detail=error.errors?.[0]?.location;if(detail){const column=Buffer.from(detail.lineText||'').subarray(0,detail.column).toString('utf8').length;error.location=failureLocation(detail.line,column);}throw error;}aborted();const imports=classicImports(built.code);transformed={trace:new mapping.TraceMap(JSON.parse(built.map)),source,generated:built.code,imports,loader,jsxIndex};classicTransforms.set(key,transformed);classicCodeBytes+=Buffer.byteLength(imports.source);transformBytes+=Buffer.byteLength(imports.source);transformMapBytes+=Buffer.byteLength(built.map);if(transformBytes>limits.codeBytes||transformMapBytes>limits.mapBytes)throw Error('Preview transformation exceeds 4 MiB code / 8 MiB maps');
   }item.source=transformed.imports.source;item.classicTransform=transformed;item.loader=transformed.loader;
  }
  const moduleEntry=documentEntry.filter(item=>item.module),classics=planClassics(documentEntry),moduleNeeds=moduleEntry.some(item=>item.requested&&item.requested.toLowerCase()!==item.file.toLowerCase()||needs(item.inline?entry:item.file,item.source));
  if(!classicRoots.length&&!moduleNeeds){aborted();const tracked=finishMetadata(tracker,classicTransforms.size?config:null);if(!classicTransforms.size)return compiled={html:document,...tracked,outputs:[]};let result=document;for(const item of classics.filter(item=>item.classicTransform&&item.location.attrs?.integrity).sort((a,b)=>b.location.attrs.integrity.startOffset-a.location.attrs.integrity.startOffset)){const attr=item.location.attrs.integrity;result=result.slice(0,attr.startOffset)+result.slice(attr.endOffset);}return compiled={html:result,...tracked,compiler:'esbuild '+esbuild.version,outputs:[],warnings:[]};}
  entries.push(...moduleEntry);const entryPoints=entries.map((item,index)=>({in:item.inline?'lt-inline:'+item.file:item.file,out:'entry-'+index}));if(classicRoots.length)entryPoints.push({in:'lt-classic-bootstrap:',out:'classic-bootstrap'});
  trackerResolveCSS=(args,build)=>tracker.resolve(args,build,resolveLocal);
  try{
   const buildOptions={absWorkingDir:root,tsconfigRaw:{},nodePaths:[],entryPoints,bundle:true,splitting:true,write:false,platform:'browser',format:'esm',outdir:outputRoot,assetNames:'assets/[name]-[hash]',publicPath:prefix,sourcemap:'external',sourcesContent:false,target:'es2022',treeShaking:false,legalComments:'none',metafile:true,logLevel:'silent',plugins:[{name:'light-table-browser-project',setup(build){
    build.onResolve({filter:/.*/},async args=>{
     try{if(args.pluginData?.ltNativeResolve)return;aborted();if(args.kind==='entry-point')return args.path==='lt-classic-bootstrap:'?{path:'bootstrap',namespace:'lt-classic-bootstrap'}:args.path.startsWith('lt-classic-styles:')?{path:args.path.slice(18),namespace:'lt-classic-styles'}:args.path.startsWith('lt-inline:')?{path:args.path.slice(10),namespace:'lt-inline'}:{path:checked(args.path),namespace:'lt-project'};
      if(['lt-classic-bootstrap','lt-classic-styles'].includes(args.namespace)&&/^lt-classic-root:\d+$/.test(args.path)){
       const id=Number(args.path.slice(16)),dependency=classicRoots[id];if(!dependency)throw Error('Invalid classic dependency root');let resolved;
       try{const request={...args,path:dependency.specifier,importer:dependency.importer,kind:dependency.resolutionKind||dependency.kind};resolved=/^(?:\/|lt-preview:)/.test(request.path)?{path:resolveLocal(local(request.path,request.importer)),namespace:'lt-project'}:await tracker.resolve(request,build,resolveLocal);if(resolved.errors?.length)throw Error(resolved.errors[0].text);}
       catch(error){if(dependency.kind!=='require-call'){classicFailure=classicFailure||dependencyLocation(dependency);throw error;}if(!dependency.optional)unavailableRoots.set(id,error);resolved={path:String(id),namespace:'lt-classic-unavailable',pluginData:{message:error.message}};}
       rootAliases[id]=resolved.namespace+':'+resolved.path.toLowerCase();return resolved;
      }
      const importer=args.namespace==='lt-inline'?entry:args.importer;
      if(['import-rule','composes-from','url-token'].includes(args.kind))return await cssResolve({...args,importer},build);
      if(/^(?:\/|lt-preview:)/.test(args.path))return {path:resolveLocal(local(args.path,importer)),namespace:'lt-project'};
      const alias=config.resolve(args.path,importer,resolveLocal);if(alias)return {path:alias,namespace:'lt-project'};
      return await tracker.resolve({...args,importer},build,resolveLocal);
     }catch(error){return {errors:[{text:error.message,detail:error}]};}
    });
    build.onLoad({filter:/.*/,namespace:'lt-project'},async args=>{
     aborted();const item=read(args.path);if(!item.exists)throw Error('Browser module not found: '+item.name);const extension=path.extname(args.path).toLowerCase();if(assetExtensions.has(extension))return {contents:item.value,loader:'file',resolveDir:path.dirname(args.path)};if(!['.js','.mjs','.cjs','.jsx','.ts','.tsx','.mts','.cts','.json','.css'].includes(extension))throw Error('Unsupported browser module type: '+extension);
     if(extension==='.css'){tracker.chain(path.dirname(args.path));sourceRecords.set('lt-project:'+args.path,{file:args.path,before:item.source,code:item.source,edits:[],css:true});return {contents:item.source,loader:/\.module\.css$/i.test(args.path)?'local-css':'css',resolveDir:path.dirname(args.path)};}
     tracker.chain(path.dirname(args.path));const before=extension==='.json'?item.source:input.responseSource(args.path),converted=extension==='.json'?{source:before,edits:[]}:replaceMeta(before,args.path);
     const loader=loaderFor(args.path),name='lt-project:'+args.path,record={file:args.path,before,code:converted.source,edits:converted.edits,...(extension!=='.json'?{loader}:{})};sourceRecords.set(name,record);let contents=converted.source;
     if(loader!=='js'&&extension!=='.json'){let transformed=transforms.get(name);if(!transformed){const raw=config.forFile(args.path).raw;transformed=await esbuild.transform(contents,{loader,tsconfigRaw:raw,...(/^(?:preserve|react-native)$/.test(raw.compilerOptions.jsx||'')?{jsx:'transform'}:{}),target:'es2022',sourcefile:name,sourcemap:'external',sourcesContent:false,legalComments:'none',logLevel:'silent'});aborted();transformBytes+=Buffer.byteLength(transformed.code);transformMapBytes+=Buffer.byteLength(transformed.map);if(transformBytes>limits.codeBytes||transformMapBytes>limits.mapBytes)throw Error('Preview transformation exceeds 4 MiB code / 8 MiB maps');transforms.set(name,transformed);}record.transform=new mapping.TraceMap(JSON.parse(transformed.map));contents=transformed.code;}
     if(classicRoots.length&&extension!=='.json'&&!moduleDynamic){try{moduleDynamic=require('./revival-browser-dependencies.cjs').analyze(contents,{classic:false}).dynamic;}catch(_){moduleDynamic=true;}aborted();}
     return {contents,loader:extension==='.json'?'json':'js',resolveDir:path.dirname(args.path)};
    });
    build.onLoad({filter:/.*/,namespace:'lt-inline'},args=>{
     const record=inline.get(args.path),converted=replaceMeta(record.source,entry,record);sourceRecords.set('lt-inline:'+args.path,{file:entry,inline:record,before:record.source,code:converted.source,edits:converted.edits});return {contents:converted.source,loader:'js',resolveDir:path.dirname(entry)};
    });
    build.onLoad({filter:/.*/,namespace:'lt-asset'},args=>{aborted();const item=read(args.path);if(!item.exists)throw Error('CSS asset not found: '+item.name);return {contents:item.value,loader:'file',resolveDir:path.dirname(args.path)};});
    build.onLoad({filter:/.*/,namespace:'lt-classic-bootstrap'},()=>({contents:require('./revival-classic-runtime.cjs').source(classicKey,classicRoots),loader:'js',resolveDir:root}));
    build.onLoad({filter:/.*/,namespace:'lt-classic-styles'},args=>{const style=[...classicStyles.values()].find(item=>item.name===args.path);if(!style)throw Error('Invalid classic stylesheet entry');return {contents:style.dependencies.map(id=>'export const dependency'+id+'=()=>'+(classicRoots[id].kind==='require-call'?'require':'import')+'("lt-classic-root:'+id+'");').join('\n'),loader:'js',resolveDir:root};});
    build.onLoad({filter:/.*/,namespace:'lt-classic-unavailable'},args=>({contents:'throw Error('+JSON.stringify(args.pluginData.message)+');',loader:'js'}));
    build.onLoad({filter:/.*/,namespace:'lt-empty'},()=>({contents:'module.exports={};',loader:'js'}));
   }}]};
   async function build(){aborted();context=await esbuild.context(buildOptions);aborted();timer=setTimeout(()=>context?.cancel().catch(()=>{}),Math.max(1,limits.compileMs-(Date.now()-startedAt)));const result=await context.rebuild();aborted();return result;}
   let built=await build();
   // Identify CSS-reaching roots from the real resolved graph. Pure JS pages
   // keep their original single bootstrap instead of generating unused entries.
   const graph=new Map(Object.entries(built.metafile.inputs).map(([name,item])=>[name.toLowerCase(),{name,...item}]));
   function reachesCSS(name,visited=new Set()){aborted();name=name.toLowerCase();if(visited.has(name))return false;visited.add(name);const item=graph.get(name);if(!item)return false;if(sourceRecord(item.name)?.css)return true;return item.imports.some(dependency=>!dependency.external&&reachesCSS(dependency.path,visited));}
   const cssRoots=new Set(rootAliases.flatMap((alias,id)=>reachesCSS(alias)?[id]:[]));
   // Companion entries only describe each classic tag's CSS graph. Their JS
   // is never loaded; the final split build still shares lazy package factories.
   for(const item of classics){const dependencies=item.dependencies.filter(id=>cssRoots.has(id));if(!dependencies.length)continue;const key=JSON.stringify(dependencies);let style=classicStyles.get(key);if(!style){style={name:'classic-style-'+classicStyles.size,dependencies};classicStyles.set(key,style);entryPoints.push({in:'lt-classic-styles:'+style.name,out:style.name});}item.styles=style;}
   if(classicStyles.size){clearTimeout(timer);await context.dispose();context=null;built=null;built=await build();}
   if(!moduleDynamic&&unavailableRoots.size){const [id,error]=unavailableRoots.entries().next().value;error.location=dependencyLocation(classicRoots[id]);throw error;}
   let codeBytes=classicCodeBytes+classics.reduce((size,item)=>size+Math.max(0,Buffer.byteLength(item.converted.source)-Buffer.byteLength(item.source)),0),mapBytes=transformMapBytes;
   const unusedPaths=new Set([...classicStyles.values()].flatMap(item=>[path.join(outputRoot,item.name+'.js'),path.join(outputRoot,item.name+'.js.map')]));if(classicStyles.size){unusedPaths.add(path.join(outputRoot,'classic-bootstrap.css'));unusedPaths.add(path.join(outputRoot,'classic-bootstrap.css.map'));}
   const mapPaths=new Set(built.outputFiles.filter(output=>/\.(?:js|css)$/i.test(output.path)&&!output.path.startsWith(path.join(outputRoot,'assets')+path.sep)).map(output=>output.path+'.map'));
   for(const output of built.outputFiles){aborted();if(unusedPaths.has(output.path))continue;const name=path.relative(outputRoot,output.path).split(path.sep).join('/');if(mapPaths.has(output.path)){mapBytes+=output.contents.length;continue;}codeBytes+=output.contents.length;if(outputs.size>=limits.outputs)throw Error('Preview compilation exceeds 256 outputs');
    const mapFile=built.outputFiles.find(item=>item.path===output.path+'.map'),trace=mapFile?new mapping.TraceMap(JSON.parse(mapFile.text)):null,type=input.typeFor?.(output.path)||(/\.css$/i.test(name)?'text/css':'text/javascript'),text=/^(text\/|application\/json|image\/svg)/.test(type);outputs.set(name,{name,type,exists:true,path:null,value:Buffer.from(output.contents),source:text?output.text:null,sha256:hash(output.contents),byteLength:output.contents.length,trace});}
   if(codeBytes>limits.codeBytes||mapBytes>limits.mapBytes)throw Error('Preview compilation exceeds 4 MiB code / 8 MiB maps');
   if(!/\.html?$/i.test(entry))for(let index=0;index<entries.length;index++)if(!entries[index].inline)aliases.set(entries[index].file.toLowerCase(),'entry-'+index+'.js');
   const tracked=finishMetadata(tracker,config),replacements=[];
   for(let index=0;index<entries.length;index++){const item=entries[index];if(!item.location)continue;
    if(item.inline){const selfClosing=document.slice(item.location.startTag.endOffset-2,item.location.startTag.endOffset)==='/>',tag=document.slice(item.location.startTag.startOffset,item.location.startTag.endOffset-(selfClosing?2:1))+' '+item.attribute+'="'+prefix+'entry-'+index+'.js">';replacements.push({from:item.location.startTag.startOffset,to:item.location.endOffset,text:tag+'</script>'});}
    else{
     const attr=item.location.attrs[item.attribute];replacements.push({from:attr.startOffset,to:attr.endOffset,text:item.attribute+'='+JSON.stringify(prefix+'entry-'+index+'.js')});
     if(item.location.attrs?.integrity)replacements.push({from:item.location.attrs.integrity.startOffset,to:item.location.attrs.integrity.endOffset,text:''});
    }
   }
   for(const item of classics){
    if(item.inline){const region=inline.get(item.file).region;for(const edit of item.converted.edits){const from=region.toRaw(edit.from),to=region.toRaw(edit.to,true);if(from<0||to<from)throw Error('Classic dependency edit leaves its HTML region');replacements.push({from,to,text:region.encode?region.encode(edit.text,from):edit.text});}}
    else if((item.converted.edits.length||item.classicTransform)&&item.location.attrs?.integrity)replacements.push({from:item.location.attrs.integrity.startOffset,to:item.location.attrs.integrity.endOffset,text:''});
   }
   const stylesheetLinks=new Set(),styleImports=[];
   function stylesheet(scriptName,at,order=at){
    const metadata=Object.entries(built.metafile.outputs).find(([name])=>path.resolve(root,name)===path.join(outputRoot,scriptName))?.[1];if(!metadata?.cssBundle)return;
    const name=path.relative(outputRoot,path.resolve(root,metadata.cssBundle)).split(path.sep).join('/');if(!outputs.has(name)||outputs.get(name).type!=='text/css')throw Error('Compiled stylesheet is unavailable');
    if(stylesheetLinks.has(name))return;stylesheetLinks.add(name);styleImports.push({at,order,text:'<link rel="stylesheet" href="'+prefix+name+'">'});
   }
   for(let index=0;index<entries.length;index++)stylesheet('entry-'+index+'.js',entries[index].styleAt??resultScriptOffset(document),entries[index].location?.startOffset);
   for(const item of classics)if(item.styles)stylesheet(item.styles.name+'.js',item.styleAt,item.location.startOffset);
   const styleInsertions=new Map();for(const item of styleImports.sort((a,b)=>a.order-b.order))styleInsertions.set(item.at,(styleInsertions.get(item.at)||'')+item.text);
   for(const [at,text] of styleInsertions)replacements.push({from:at,to:at,text});
   let result=document;for(const edit of replacements.sort((a,b)=>b.from-a.from))result=result.slice(0,edit.from)+edit.text+result.slice(edit.to);
   if(!/\.html?$/i.test(entry))result=result.replace('<script src=', '<script type="module" src=');
   const formats=new Map(Object.entries(built.metafile.inputs).map(([name,item])=>[name.toLowerCase(),item.format]));
   // esbuild already caches CJS factories and returns their current exports.
   // Only its fresh require(ESM) namespace wrappers need additional identity caching.
   const memoize=rootAliases.map(alias=>formats.get(alias)==='esm');
   aborted();compiled={html:result,...tracked,compiler:'esbuild '+esbuild.version,outputs:[...outputs.values()].map(({name,type,sha256,byteLength})=>({name,type,sha256,byteLength})),warnings:built.warnings.map(item=>item.text).slice(0,8),...(classicRoots.length?{bootstrap:{url:prefix+'classic-bootstrap.js',key:classicKey,aliases:rootAliases,memoize}}:{})};return compiled;
  }catch(error){const configured=configurationLocation(error);if(configured){error.location=configured;throw error;}const detail=error.errors?.[0],location=detail?.location;if(location){const record=sourceRecord(location.file);if(record){const column=Buffer.from(location.lineText||'').subarray(0,location.column).toString('utf8').length,item=restore(record,location.line,column);if(item)error.location={...item,value:undefined,column:item.column+1,sourceLine:item.source?.split(/\r\n|\r|\n/)[item.line-1]||''};}}if(!error.location&&detail?.detail?.location)error.location=detail.detail.location;if(!error.location&&classicFailure)error.location=classicFailure;if(error.location&&detail?.detail?.inlineParserFailure){const text=String(detail.text).replace(/\s*\(\d+:\d+\)\s*$/,'');error.message=(error.location.name||path.relative(root,error.location.path))+':'+error.location.line+':'+error.location.column+' - '+text;}throw error;}
  finally{clearTimeout(timer);if(context){await context.dispose();context=null;}}
 }
 function resultScriptOffset(document){const at=document.indexOf('<script');return at<0?0:at;}
 function resource(file){const classic=classicSources.get(file.toLowerCase());if(classic)return classic;const name=aliases.get(file.toLowerCase())||file.startsWith(outputRoot+path.sep)&&path.relative(outputRoot,file).split(path.sep).join('/');return name?outputs.get(name):null;}
 function mapLocation(file,line,column){const direct=classicLocations.get(file.toLowerCase())||classicSources.get(file.toLowerCase())?.record;if(direct){const item=restore(direct,line,column-1);return item?{...item,column:item.column+1,sourceLine:item.source?.split(/\r\n|\r|\n/)[item.line-1]||'',value:undefined}:null;}const output=resource(file);if(!output?.trace)return null;const point=mapping.originalPositionFor(output.trace,{line,column:column-1});if(point.source===null||point.line===null)return null;const record=sourceRecord(point.source);if(!record)return null;const item=restore(record,point.line,point.column);return item?{...item,column:item.column+1,sourceLine:item.source?.split(/\r\n|\r|\n/)[item.line-1]||'',value:undefined}:null;}
 async function close(){closed=true;if(context)await context.cancel().catch(()=>{});}
 return {compile,resource,mapLocation,close,virtual:file=>file.startsWith(outputRoot+path.sep),limits};
}
module.exports={create,limits};
