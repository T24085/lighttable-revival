'use strict';
const acorn=require('acorn'),crypto=require('crypto'),path=require('path'),syntax=require('./revival-syntax.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const parse=(source,handler=false,grammar={})=>{const options={ecmaVersion:'latest',locations:true,preserveParens:true};if(handler){const prefix='function __lt_handler('+(handler==='window-error'?'event,source,lineno,colno,error':'event')+') {\n';let tree;try{tree=acorn.parse(prefix+source+'\n}',{...options,sourceType:'script'}).body[0].body;}catch(error){error.pos=Math.max(0,Math.min(source.length,error.pos-prefix.length));error.loc={line:Math.max(1,error.loc.line-1),column:error.loc.column};throw error;}const pending=[tree];while(pending.length){const node=pending.pop();if(!node||typeof node.type!=='string')continue;node.start-=prefix.length;node.end-=prefix.length;node.loc.start.line--;node.loc.end.line--;for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(value);}}return tree;}return syntax.parse(source,{...options,...grammar});};
function enumReferences(source,names,options){
 const tree=options.ast||parse('('+source+')',false,options),shift=options.ast?0:1,root={parent:null,function:true,names:new Set()},references=[];
 function bind(node,scope){if(!node||syntax.isTypeOnly(node))return;if(node.type==='Identifier'){scope.names.add(node.name);return;}for(const [name,value] of syntax.children(node)){if(node.type==='AssignmentPattern'&&name==='right'||node.type==='Property'&&name==='key')continue;if(Array.isArray(value))value.forEach(item=>bind(item,scope));else if(value&&typeof value==='object')bind(value,scope);}}
 function visit(node,parent,field,scope,binding=false){
  if(!node||typeof node.type!=='string'||syntax.isTypeOnly(node))return;let current=scope;
  const fn=/Function/.test(node.type)||node.type==='ArrowFunctionExpression',cls=['ClassDeclaration','ClassExpression'].includes(node.type);
  if(['FunctionDeclaration','ClassDeclaration','TSEnumDeclaration','TSModuleDeclaration','TSImportEqualsDeclaration'].includes(node.type))bind(node.id,scope);
  if(fn||cls||['BlockStatement','TSModuleBlock','CatchClause','ForStatement','ForInStatement','ForOfStatement','SwitchStatement'].includes(node.type))current={parent:scope,function:fn,names:new Set()};
  if(fn){bind(node.id,current);for(const param of node.params||[])bind(param,current);}if(cls)bind(node.id,current);if(node.type==='CatchClause')bind(node.param,current);
  if(node.type==='VariableDeclarator'){let owner=current;if(parent?.kind==='var')while(owner.parent&&!owner.function)owner=owner.parent;bind(node.id,owner);}
  if(node.type==='ImportDeclaration')for(const specifier of node.specifiers||[])if(!syntax.isTypeOnly(specifier))bind(specifier.local,current);
  if(node.type==='Identifier'&&!binding&&names.has(node.name)){
   const syntaxName=parent&&(parent.type==='MemberExpression'&&field==='property'&&!parent.computed||parent.type==='Property'&&field==='key'&&!parent.computed||['MethodDefinition','PropertyDefinition','ClassProperty','ClassPrivateProperty','ClassAccessorProperty'].includes(parent.type)&&field==='key'&&!parent.computed||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)&&field==='label'||parent.type==='MetaProperty');
   if(!syntaxName)references.push({node,parent,scope:current});
  }
  for(const [name,value] of syntax.children(node)){
   const defaultValue=node.type==='AssignmentPattern'&&name==='right',computedKey=['Property','MethodDefinition','PropertyDefinition','ClassProperty','ClassPrivateProperty','ClassAccessorProperty'].includes(node.type)&&name==='key'&&node.computed;
   const binds=binding&&!defaultValue&&!computedKey||/Pattern$/.test(node.type)&&!defaultValue&&!computedKey||node.type==='VariableDeclarator'&&name==='id'||fn&&['id','params'].includes(name)||(cls||['TSEnumDeclaration','TSModuleDeclaration','TSImportEqualsDeclaration'].includes(node.type))&&name==='id'||node.type==='CatchClause'&&name==='param'||/^Import.*Specifier$/.test(node.type);
   if(Array.isArray(value))value.forEach(child=>visit(child,node,name,current,binds));else if(value&&typeof value==='object')visit(value,node,name,current,binds);
  }
 }visit(tree,null,null,root);
 return references.filter(({node,scope})=>{for(let at=scope;at;at=at.parent)if(at.names.has(node.name))return false;return true;}).map(({node,parent})=>({from:node.start-shift,to:node.end-shift,name:node.name,shorthand:parent?.type==='Property'&&parent.shorthand}));
}
function enumQualification(source,record,values,options){
 const named=record.named||(record.named=new Map(record.members.map(member=>[String(member.id.name??member.id.value),member]))),names=new Set(named.keys()),events=[];
 for(const reference of enumReferences(source,names,options)){
  const member=named.get(reference.name),constant=values.get(member),prefix=reference.shorthand?reference.name+':':'';
  if(constant!==undefined)events.push({at:reference.from,text:prefix+'(false?(',open:true,end:reference.to,priority:-100},{at:reference.to,text:'):'+constant+')',open:false,start:reference.from,priority:-100});
  else events.push({at:reference.from,text:prefix+record.node.id.name+'.',open:true,end:reference.to,priority:-100});
 }
 return events;
}
function instrument(source,input,sharedKey,tokens,options={},loaderHint){
 if(typeof options==='string')options={filename:options};else if(!options)options={};
 if(loaderHint!==undefined)options={...options,loader:syntax.effectiveLoader(options.filename,loaderHint)};
 if(input===undefined||input===null||Array.isArray(input)&&!input.length)return null;
 if(!Array.isArray(input)||input.length>64)throw Error('At most 64 expression watches are allowed');
 const ast=parse(source,options.handler,options),specs=[],ids=new Set(),key=sharedKey||'__lt_watch_'+crypto.randomBytes(16).toString('hex');
 if(!/^__lt_watch_[a-f0-9]{32}$/.test(key))throw Error('Invalid watch capture key');
 for(const item of input){
  if(!item||typeof item.id!=='string'||!/^[-\w]{1,80}$/.test(item.id)||ids.has(item.id)||!Number.isInteger(item.from)||!Number.isInteger(item.to)||item.from<0||item.to>source.length||item.from>=item.to)throw Error('Invalid expression watch');
  ids.add(item.id);let from=item.from,to=item.to;while(/\s/.test(source[from]))from++;while(/\s/.test(source[to-1]))to--;if(source[to-1]===';')to--;while(/\s/.test(source[to-1]))to--;
  let selected,invalid=false;
  function visit(node,parent,field,binding=false,referenceRole=false){
   if(!node||typeof node!=='object'||typeof node.type!=='string')return;
   if(node.start>from||node.end<to)return;
   if(syntax.isTypeOnly(node))return;
   if(node.start===from&&node.end===to){
    const expression=syntax.isExpression(node);
    const reference=referenceRole||parent&&(parent.directive||(['AssignmentExpression','AssignmentPattern'].includes(parent.type)&&field==='left')||(parent.type==='UpdateExpression'&&field==='argument')||(['CallExpression','NewExpression'].includes(parent.type)&&field==='callee')||(parent.type==='TaggedTemplateExpression'&&field==='tag')||(parent.type==='UnaryExpression'&&parent.operator==='delete')||(parent.type==='MemberExpression'&&field==='property'&&!parent.computed)||(parent.type==='Property'&&(parent.shorthand||field==='key'&&!parent.computed||parent.method&&field==='value'))||(parent.type==='MethodDefinition'&&(field==='value'||field==='key'&&!parent.computed))||(['PropertyDefinition','ClassProperty','ClassPrivateProperty','ClassAccessorProperty'].includes(parent.type)&&field==='key'&&!parent.computed)||(parent.type==='JSXAttribute'&&field==='value')||(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(parent.type)&&field==='source'));
    if(expression&&!binding&&!reference)selected=node;else if(expression)invalid=true;
   }
   for(const [name,value] of syntax.children(node)){
    const defaultValue=node.type==='AssignmentPattern'&&name==='right',computedKey=['Property','PropertyDefinition','ClassProperty','ClassPrivateProperty','ClassAccessorProperty','MethodDefinition'].includes(node.type)&&name==='key'&&node.computed;
    const binds=(binding&&!defaultValue&&!computedKey)||/Pattern$/.test(node.type)&&!defaultValue&&!computedKey||node.type==='VariableDeclarator'&&name==='id'||/Function/.test(node.type)&&['id','params'].includes(name)||node.type==='CatchClause'&&name==='param'||/^(Import|Export).*Specifier$/.test(node.type)||['ClassDeclaration','ClassExpression','TSEnumDeclaration','TSEnumMember','TSModuleDeclaration','TSImportEqualsDeclaration'].includes(node.type)&&name==='id'||node.type==='TSParameterProperty'&&name==='parameter'||['AssignmentExpression','ForInStatement','ForOfStatement'].includes(node.type)&&name==='left'||node.type==='UpdateExpression'&&name==='argument';
    const references=syntax.transparent.has(node.type)&&name==='expression'&&referenceRole||['CallExpression','NewExpression'].includes(node.type)&&name==='callee'||node.type==='TaggedTemplateExpression'&&name==='tag'||node.type==='UnaryExpression'&&node.operator==='delete'&&name==='argument';
    if(Array.isArray(value))value.forEach(child=>visit(child,node,name,binds,references));else if(value&&typeof value==='object')visit(value,node,name,binds,references);
   }
  }visit(ast);
  if(!selected||invalid){const error=Error('Watch a complete value expression, rather than a type, binding, assignment target, property name or method reference.');error.pos=from;error.loc=require('./revival-js-locations.cjs').location(source,from);throw error;}
  const expression=item.expression;
  if(expression!==undefined&&expression!==null&&(typeof expression!=='string'||Buffer.byteLength(expression)>4096))throw Error('Custom watch expressions are limited to 4 KiB');
  const temp=key+'_value_'+specs.length;let custom;
  if(expression){custom=expression.trim().replace(/;\s*$/,'').replaceAll('__SELECTION*__',JSON.stringify(temp)).replaceAll('__SELECTION__',temp).replaceAll('__ID__',item.id);const tree=parse('('+custom+')',options.handler,options);if(tree.body.length!==1||tree.body[0].type!=='ExpressionStatement')throw Error('Custom watch must be a JavaScript expression');}
  const token=tokens?.[item.id];if(token!==undefined&&(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)))throw Error('Invalid watch source token');const tail=token===undefined?'':','+JSON.stringify(token);
  specs.push({id:item.id,from,to,...(expression?{expression}:{}),custom,temp,tail,prefix:custom?'(('+temp+')=>{'+key+'('+JSON.stringify(item.id)+',('+custom+')'+tail+');return '+temp+';})(':''+key+'('+JSON.stringify(item.id)+',(',suffix:custom?')':')'+tail+')'});
 }
 const sorted=[...specs].sort((a,b)=>a.from-b.from||b.to-a.to),stack=[];
 for(const item of sorted){while(stack.length&&item.from>=stack.at(-1).to)stack.pop();if(stack.length&&item.to>stack.at(-1).to)throw Error('Expression watches must be separate or nested');stack.push(item);}
 let events=specs.flatMap(item=>[{at:item.from,text:item.prefix,open:true,end:item.to,id:item.id},{at:item.to,text:item.suffix,open:false,start:item.from,id:item.id}]);
 const enumRecords=[];function collectEnums(node,parent){if(!node||typeof node.type!=='string'||syntax.isTypeOnly(node))return;if(node.type==='TSEnumDeclaration')enumRecords.push({node,parent,members:node.members||node.body?.members||[]});for(const [,value] of syntax.children(node)){if(Array.isArray(value))value.forEach(child=>collectEnums(child,node));else if(value&&typeof value==='object')collectEnums(value,node);}}collectEnums(ast);
 const affectedEnums=enumRecords.some(record=>record.members.some(member=>member.initializer&&specs.some(spec=>spec.from>=member.initializer.start&&spec.to<=member.initializer.end)));
 if(affectedEnums){
  // Preserve the compiler's original string-vs-numeric enum emission, including
  // constant aliases in other enums. Guessing from TypeScript types would also
  // change ordinary esbuild behavior for nonconstant string-valued expressions.
  const compiler=require('esbuild'),mapping=require('@jridgewell/trace-mapping'),positions=require('./revival-js-locations.cjs');let built;
  try{built=compiler.transformSync(source,{loader:options.loader||syntax.loader(options.filename),format:'esm',target:'es2022',treeShaking:false,sourcefile:'lt-original-enum.ts',sourcemap:'external',sourcesContent:false,legalComments:'none'});}catch(error){const detail=error.errors?.[0]?.location;if(detail){const line=source.split(/\r\n|\r|\n|\u2028|\u2029/)[detail.line-1]||'',column=Buffer.from(line).subarray(0,detail.column).toString('utf8').length;error.loc={line:detail.line,column};error.pos=positions.indexFromLocation(source,detail.line,column);}throw error;}
  if(Buffer.byteLength(built.code)>4*1024*1024||Buffer.byteLength(built.map)>8*1024*1024)throw Error('Enum watch analysis exceeds 4 MiB code / 8 MiB maps');
  const trace=new mapping.TraceMap(JSON.parse(built.map)),compiled=syntax.parse(built.code,{sourceType:'module',locations:true}),kinds=new Map(),constantValues=new Map(),members=enumRecords.flatMap(record=>record.members).sort((a,b)=>a.id.start-b.id.start),globals=new Set(enumReferences(source,new Set(['Infinity','NaN']),{...options,ast}).map(reference=>reference.from)),globalIdentifiers=new Map();
  function findGlobals(node){if(!node||typeof node.type!=='string'||syntax.isTypeOnly(node))return;if(node.type==='Identifier'&&['Infinity','NaN'].includes(node.name))globalIdentifiers.set(node.start,node);for(const [,value] of syntax.children(node)){if(Array.isArray(value))value.forEach(findGlobals);else if(value&&typeof value==='object')findGlobals(value);}}findGlobals(ast);
  function memberAt(index){let low=0,high=members.length-1,found;while(low<=high){const mid=(low+high)>>>1;if(members[mid].id.start<=index){found=members[mid];low=mid+1;}else high=mid-1;}return found&&index<found.id.end?found:null;}
  function constantEmission(node){if(node.type==='Identifier'&&['Infinity','NaN'].includes(node.name)){const point=mapping.originalPositionFor(trace,node.loc.start),original=point.line===null?null:globalIdentifiers.get(positions.indexFromLocation(source,point.line,point.column));return !original||original.name!==node.name||globals.has(original.start);}return node.type==='Literal'&&['number','string'].includes(typeof node.value)||node.type==='UnaryExpression'&&['+','-','void'].includes(node.operator)&&constantEmission(node.argument);}
  function classify(node,parent){if(!node||typeof node.type!=='string')return;if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.property.type==='Literal'){
    const point=mapping.originalPositionFor(trace,node.left.property.loc.start),index=point.line===null?-1:positions.indexFromLocation(source,point.line,point.column),member=memberAt(index);
    if(member&&String(member.id.name??member.id.value)===String(node.left.property.value)){const kind=parent?.type==='MemberExpression'&&parent.property===node?'numeric':'string';if(kinds.has(member)&&kinds.get(member)!==kind)throw Error('Original enum initialization is ambiguous');kinds.set(member,kind);if(constantEmission(node.right)){const value=built.code.slice(node.right.start,node.right.end);if(constantValues.has(member)&&constantValues.get(member)!==value)throw Error('Original enum initialization is ambiguous');constantValues.set(member,value);}}
   }for(const [,value] of syntax.children(node)){if(Array.isArray(value))value.forEach(child=>classify(child,node));else if(value&&typeof value==='object')classify(value,node);}}
  classify(compiled);for(const record of enumRecords)for(const member of record.members)if(member.initializer&&specs.some(spec=>spec.from>=member.initializer.start&&spec.to<=member.initializer.end)&&!kinds.has(member))throw Error('The compiler did not identify the original enum initializer');
  // Keep compiler-constant initializers intact, so later enum reads retain all
  // original folding. Capture copies immediately after the same declaration;
  // original source characters in those copies retain their editor positions.
  // Custom constant observations therefore see the state after the final enum
  // member; dynamic initializer watches still observe at their evaluation site.
  const deferred=new Set();
  for(const record of enumRecords){const parts=[];for(const member of record.members){if(!member.initializer||!constantValues.has(member))continue;const selected=specs.filter(spec=>spec.from>=member.initializer.start&&spec.to<=member.initializer.end);if(!selected.length)continue;const from=member.initializer.start,to=member.initializer.end,raw=source.slice(from,to),copied=enumQualification(raw,record,constantValues,options);if(!parts.length)parts.push({text:'{',at:from});
    for(const spec of selected){deferred.add(spec.id);let prefix=spec.prefix;if(spec.custom){const additions=enumQualification(spec.custom,record,constantValues,options).sort((a,b)=>b.at-a.at||(a.open?1:-1));let custom=spec.custom;for(const event of additions)custom=custom.slice(0,event.at)+event.text+custom.slice(event.at);prefix='(('+spec.temp+')=>{'+key+'('+JSON.stringify(spec.id)+',('+custom+')'+spec.tail+');return '+spec.temp+';})(';}
     copied.push({at:spec.from-from,text:prefix,open:true,end:spec.to-from},{at:spec.to-from,text:spec.suffix,open:false,start:spec.from-from});}
    copied.sort((a,b)=>a.at-b.at||(a.open===b.open?(a.open?b.end-a.end||(b.priority||0)-(a.priority||0):b.start-a.start||(a.priority||0)-(b.priority||0)):a.open?1:-1));parts.push({text:';(',at:from});let cursor=0;for(const event of copied){if(event.at>cursor)parts.push({text:raw.slice(cursor,event.at),at:from+cursor,copy:true});cursor=event.at;parts.push({text:event.text,at:from+event.at});}if(cursor<raw.length)parts.push({text:raw.slice(cursor),at:from+cursor,copy:true});parts.push({text:');',at:to});
   }if(parts.length){parts.push({text:'}',at:record.node.end});events.push({at:record.parent?.type==='ExportNamedDeclaration'?record.parent.end:record.node.end,parts,open:true,end:record.node.end});}}
  events=events.filter(event=>!deferred.has(event.id));
 }
 events.sort((a,b)=>a.at-b.at||(a.open===b.open?(a.open?b.end-a.end||(b.priority||0)-(a.priority||0):b.start-a.start||(a.priority||0)-(b.priority||0)):a.open?1:-1));
 let code='',cursor=0;const edits=[];
 for(const event of events){code+=source.slice(cursor,event.at);cursor=event.at;for(const part of event.parts||[{text:event.text,at:event.at}]){const start=code.length;code+=part.text;edits.push({start,end:code.length,at:part.at,...(part.copy?{copy:true}:{})});}}code+=source.slice(cursor);
 if(Buffer.byteLength(code)>Math.max(256*1024,Buffer.byteLength(source)+256*1024))throw Error('Watch instrumentation exceeds its source budget');
 return {key,source:code,edits,specs:specs.map(({id,from,to,expression})=>({id,from,to,...(expression?{expression}:{})})),sha256:crypto.createHash('sha256').update(JSON.stringify(specs.map(({id,from,to,expression})=>({id,from,to,expression})))).digest('hex'),module:ast.sourceType==='module',...(options.filename?{filename:options.filename}:{}),...(options.loader?{loader:options.loader}:{}),...(options.handler?{handler:options.handler}:{})};
}
function plan(source,input,files=[],entry=null,checked=file=>path.resolve(file),sharedKey,instrumentSource=instrument,entryLoader){
 if(!Array.isArray(files)||files.length>64)throw Error('At most 64 watched files are allowed');
 if(entryLoader!==undefined)syntax.effectiveLoader(entry,entryLoader);
 const key=sharedKey||'__lt_watch_'+crypto.randomBytes(16).toString('hex');let first;
 try{first=instrumentSource(source,input,key,undefined,entry,entryLoader);}catch(error){error.watchPath=entry;error.watchSource=source;throw error;}
 const records=[],ids=new Set(),paths=new Set();let total=Buffer.byteLength(source),count=first?.specs.length||0;
 if(first)records.push({path:entry,originalSource:source,...first,...(!first.html?{loader:syntax.effectiveLoader(entry,first.loader??entryLoader)}:{})});
 for(const item of files){
  if(!item||typeof item.path!=='string'||typeof item.source!=='string'||!Array.isArray(item.watches)||!item.watches.length)throw Error('Invalid watched project file');
  const file=checked(item.path),name=file.toLowerCase();if(name===entry?.toLowerCase()||paths.has(name))throw Error('Duplicate watched project file');paths.add(name);
  if(Buffer.byteLength(item.source)>2*1024*1024||(total+=Buffer.byteLength(item.source))>8*1024*1024)throw Error('Watched source snapshots exceed 2 MiB per file / 8 MiB total');
  count+=item.watches.length;if(count>64)throw Error('At most 64 expression watches are allowed across the execution graph');
  if(item.loader!==undefined)syntax.effectiveLoader(file,item.loader);
  try{const instrumented=instrumentSource(item.source,item.watches,key,undefined,file,item.loader);records.push({path:file,originalSource:item.source,...instrumented,...(!instrumented?.html?{loader:syntax.effectiveLoader(file,instrumented?.loader??item.loader)}:{})});}catch(error){error.watchPath=file;error.watchSource=item.source;throw error;}
 }
 if(!records.length)return null;
 const specs=records.flatMap(item=>item.specs.map(spec=>({...spec,path:item.path,sourceSha256:hash(item.originalSource),...(item.loader?{loader:item.loader}:{})})));
 for(const spec of specs){if(ids.has(spec.id))throw Error('Duplicate watch identifier across project files');ids.add(spec.id);}
 return {key,entry,source:first?.source||source,edits:first?.edits||[],files:records,specs,sha256:hash(JSON.stringify(specs))};
}
function forFile(watch,file){return watch?.files?watch.files.find(item=>item.path?.toLowerCase()===file?.toLowerCase())||null:watch;}
function apply(watch,file,source){const item=forFile(watch,file);if(!item)return source;if(item.originalSource!==undefined&&item.originalSource!==source)throw Error('Watched source changed before execution: '+file);return item.source;}
function nativeFormat(value){
 const inspect=value=>require('node:util').inspect(value,{depth:5,maxArrayLength:100,maxStringLength:4096,customInspect:false,getters:false,colors:false}),type=typeof value,complex=value&&type==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null;
 if(value===undefined)return 'undefined';if(type==='number'&&!Number.isFinite(value))return String(value);
 if(['bigint','symbol','function'].includes(type)||complex)return inspect(value);
 const getter=value&&type==='object'&&Object.values(Object.getOwnPropertyDescriptors(value)).some(item=>item.get);if(getter)return inspect(value);
 try{return JSON.stringify(value)??inspect(value);}catch(_){return inspect(value);}
}
function installNative(watch,changed=()=>{}){
 const values=new Map();let bytes=0;if(!watch)return values;const ids=new Set(watch.ids||watch.specs.map(item=>item.id));
 Object.defineProperty(globalThis,watch.key,{value:(id,value)=>{try{if(!ids.has(id))throw Error('Unknown expression watch');const result=nativeFormat(value),size=Buffer.byteLength(result),next=bytes+size-Buffer.byteLength(values.get(id)||'');if(size>1024||next>16384)throw Error('Watch values exceed 1 KiB each / 16 KiB total');bytes=next;values.set(id,result);changed();return value;}catch(error){values.failure=values.failure||error;changed(true);throw error;}},configurable:false,writable:false});return values;
}
function mergeContexts(watch,groups){
 const grouped=new Map(),seen=new Set();let bytes=0;
 for(const {pid,threadId,values} of groups){if(!Number.isInteger(pid)||pid<=0||!Number.isInteger(threadId)||threadId<0)throw Error('Invalid watch execution context');
  const identity=pid+':'+threadId;if(seen.has(identity))throw Error('Duplicate watch execution context');seen.add(identity);
  for(const item of validate(values,watch)){if((bytes+=Buffer.byteLength(item.result))>16384)throw Error('Watch family values exceed 16 KiB total');if(!grouped.has(item.id))grouped.set(item.id,[]);grouped.get(item.id).push({pid,threadId,result:item.result});}
 }
 return [...grouped].map(([id,contexts])=>{contexts.sort((a,b)=>a.pid-b.pid||a.threadId-b.threadId);const result=contexts.length===1?contexts[0].result:contexts.map(item=>'[pid '+item.pid+', thread '+item.threadId+'] '+item.result).join('\n');if(Buffer.byteLength(result)>1024)throw Error('Context watch display exceeds 1 KiB');return {id,result,contexts};});
}
function offset(watch,position){if(!watch)return position;let removed=0;for(const edit of watch.edits){if(position<edit.start)break;if(position<edit.end)return edit.at+(edit.copy?position-edit.start:0);removed+=edit.end-edit.start;}return position-removed;}
function configure(instrument,code){
 if(!instrument||!code)return instrument;const ast=parse(instrument.source,instrument.handler,instrument);let at=0;for(const statement of ast.body){if(!statement.directive)break;at=statement.end;}
 const added=';'+code+';\n',edits=instrument.edits.map(edit=>({...edit,start:edit.start>=at?edit.start+added.length:edit.start,end:edit.end>=at?edit.end+added.length:edit.end}));
 edits.push({start:at,end:at+added.length,at:offset(instrument,at)});edits.sort((a,b)=>a.start-b.start);
 return {...instrument,source:instrument.source.slice(0,at)+added+instrument.source.slice(at),edits};
}
function position(watch,line,column,original){if(!watch)return {line,column};const lines=watch.source.split('\n');let index=column;for(let i=0;i<line-1;i++)index+=(lines[i]?.length||0)+1;index=offset(watch,index);const before=original.slice(0,index);return {line:before.split('\n').length,column:index-(before.lastIndexOf('\n')+1)};}
function validate(values,watch){if(!Array.isArray(values)||values.length>64)throw Error('Invalid watch results');const allowed=new Set(watch?.specs.map(item=>item.id)||[]),seen=new Set();let bytes=0;return values.map(item=>{if(!item||!allowed.has(item.id)||seen.has(item.id)||typeof item.result!=='string'||Buffer.byteLength(item.result)>1024||(bytes+=Buffer.byteLength(item.result))>16384)throw Error('Watch results exceed their value budget');seen.add(item.id);return {id:item.id,result:item.result};});}
module.exports={instrument,plan,forFile,apply,nativeFormat,installNative,mergeContexts,offset,position,validate,configure};
