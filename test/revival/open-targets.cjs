'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const source=path.resolve(__dirname,'../../deploy/core/revival-open-targets.cjs'),targets=require(source);
const tempBase=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(tempBase,'lt-open-targets-')),links=[],checks=[],startedAt=new Date().toISOString();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),key=file=>process.platform==='win32'?file.toLowerCase():file;
const write=(name,content='throw new Error("Authored source must not execute during opening");')=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);return file;};
const file=write('answer 😀.js'),later=write('later.mjs'),sibling=write('sibling.js'),numeric=write('notes2026'),directory=path.join(root,'folder');fs.mkdirSync(directory);
function fake({notificationFailure=false,grantFailure=false}={}){
 let focus=null;const grants=[],selected=[],notifications=[];
 const policy={grantFile:p=>{if(grantFailure)throw Error('x'.repeat(3000));grants.push({kind:'file',path:p});selected.push({kind:'file',path:p});return p;},grantDirectory:p=>{grants.push({kind:'directory',path:p});selected.push({kind:'directory',path:p});return p;}};
 const transport=targets.create({policy,preferredOwner:()=>focus,notify:owner=>{notifications.push(owner);if(notificationFailure)throw Error('Owner is not ready');}});
 return {transport,grants,notifications,setFocus:owner=>{focus=owner;},canRead:p=>selected.some(item=>item.kind==='file'?key(p)===key(item.path):key(p)===key(item.path)||key(p).startsWith(key(item.path)+path.sep))};
}
function check(name,fn){fn();checks.push(name);}
const take=(state,owner=11)=>{state.transport.register(owner);return state.transport.take(owner);};
let result;
try{
 check('Unpackaged Electron arguments skip only its executable application entry and recognized logging switches',()=>{
  const argv=['electron.exe','--enable-logging','app.cjs','--enable-logging=stderr',file+':2'];
  assert.deepEqual(targets.launchArguments(argv,{defaultApp:true}),['--enable-logging=stderr',file+':2']);
  const state=fake();state.transport.seedLaunch(argv,{defaultApp:true,cwd:root});const [item]=take(state);assert.equal(item.path,file);assert.equal(item.line,2);assert.equal(item.origin,'command-line');assert.equal(state.grants.length,1);
 });
 check('Packaged Electron keeps the first authored file instead of dropping an application argument',()=>{
  const state=fake();state.transport.seedLaunch(['LightTable.exe','--enable-logging',file],{defaultApp:false,cwd:root});assert.equal(take(state)[0].path,file);assert.equal(state.grants.length,1);
 });
 check('Normal empty launch arguments open nothing and perform no source grants',()=>{
  const state=fake();state.transport.seedLaunch(['electron.exe','core'],{defaultApp:true,cwd:root});assert.deepEqual(take(state),[]);assert.deepEqual(state.grants,[]);assert.equal(state.transport.diagnostics().pending,0);
 });
 check('Malformed launch shapes produce a bounded diagnostic without treating the executable as a source',()=>{
  for(const [argv,options] of [[[],{defaultApp:false}],[['electron.exe','--enable-logging'],{defaultApp:true}],[['electron.exe','core'],{defaultApp:'true'}]]){const state=fake();state.transport.seedLaunch(argv,{...options,cwd:root});assert.equal(take(state)[0].kind,'error');assert.equal(state.grants.length,0);}
 });
 check('Explicit line suffixes preserve quoted spaces Unicode relative paths and numeric-ending filenames',()=>{
  const state=fake();state.transport.seed([path.basename(file)+':12',path.basename(numeric)],root);const items=take(state);assert.equal(items[0].path,file);assert.equal(items[0].line,12);assert.equal(items[1].path,numeric);assert.equal(items[1].line,null);
  if(process.platform==='win32')assert.equal(targets.commandLine(['C:2026'],root)[0].line,null);
 });
 check('Zero and unsafe line numbers reject the entire parsed batch before source grants',()=>{
  for(const suffix of [':0',':9007199254740992']){const state=fake();state.transport.seed([file,later+suffix],root);assert.equal(take(state)[0].kind,'error');assert.deepEqual(state.grants,[]);}
 });
 check('Only recognized startup options are consumed while -- preserves a literal dash filename',()=>{
  const literal=write('--enable-logging');const state=fake();state.transport.seed(['--enable-logging','--add',path.basename(file),'--',path.basename(literal)],root);const items=take(state);assert.equal(items.length,2);assert(items.every(item=>item.add===true));assert.equal(items[1].path,literal);
  const short=fake();short.transport.seed(['-a',file],root);assert.equal(take(short)[0].add,true);
 });
 check('An unknown option cannot manufacture a blank editor or grant an earlier valid file',()=>{
  const state=fake();state.transport.seed([file,'--not-a-target'],root);const [error]=take(state);assert.match(error.message,/Unsupported startup option/);assert.equal(state.grants.length,0);
 });
 check('Startup argument count bytes path length NUL and invalid cwd remain bounded before grants',()=>{
  const cases=[Array(65).fill(file),Array(32).fill('😀'.repeat(500)),['x'.repeat(1025)],['bad\0.js']];
  for(const args of cases){const state=fake();state.transport.seed(args,root);assert.equal(take(state)[0].kind,'error');assert.equal(state.grants.length,0);}
  const state=fake();state.transport.seed([file],'relative');assert.equal(take(state)[0].kind,'error');assert.equal(state.grants.length,0);
 });
 check('Selecting a file grants only its exact path and never adjacent source access',()=>{
  const state=fake();state.transport.seed([file],root);take(state);assert.deepEqual(state.grants,[{kind:'file',path:file}]);assert.equal(state.canRead(file),true);assert.equal(state.canRead(sibling),false);assert.equal(state.canRead(root),false);
 });
 check('An explicit directory selects that directory while directory line hints fail before grants',()=>{
  const state=fake();state.transport.seed([directory],root);assert.equal(take(state)[0].kind,'directory');assert.deepEqual(state.grants,[{kind:'directory',path:directory}]);assert.equal(state.canRead(path.join(directory,'nested.js')),true);assert.equal(state.canRead(sibling),false);
  const invalid=fake();invalid.transport.seed([directory+':2'],root);assert.equal(take(invalid)[0].kind,'error');assert.equal(invalid.grants.length,0);
 });
 check('A missing command-line file with an existing parent remains unsaved until original Save',()=>{
  const missing=path.join(root,'new-unsaved.js'),state=fake();state.transport.seed([missing],root);const [item]=take(state);assert.equal(item.kind,'new-file');assert.equal(item.path,missing);assert.equal(fs.existsSync(missing),false);assert.deepEqual(state.grants,[{kind:'file',path:missing}]);
 });
 check('Missing relative and directory file-manager targets produce errors without grants or ghost files',()=>{
  for(const target of [path.join(root,'missing-os.js'),'relative.js',directory]){const state=fake();state.transport.fileManager(target);assert.equal(take(state)[0].kind,'error');assert.equal(state.grants.length,0);}
  assert.equal(fs.existsSync(path.join(root,'missing-os.js')),false);
 });
 check('An invalid later parent rejects startup validation before registering earlier valid file grants',()=>{
  const state=fake();state.transport.seed([file,path.join(root,'absent-parent','new.js')],root);assert.equal(take(state)[0].kind,'error');assert.equal(state.grants.length,0);
  const fileParent=fake();fileParent.transport.seed([path.join(file,'child.js')],root);assert.equal(take(fileParent)[0].kind,'error');assert.equal(fileParent.grants.length,0);
 });
 check('A junction or symlink in the selected ancestry is rejected before grant callbacks',()=>{
  const targetDir=path.join(root,'link-target');fs.mkdirSync(targetDir);write('link-target/linked.js');const link=path.join(root,'link');fs.symlinkSync(targetDir,link,process.platform==='win32'?'junction':'dir');links.push(link);
  for(const origin of ['cli','os']){const state=fake();if(origin==='cli')state.transport.seed([path.join(link,'linked.js')],root);else state.transport.fileManager(path.join(link,'linked.js'));assert.match(take(state)[0].message,/Links forbidden/);assert.equal(state.grants.length,0);}
 });
 check('Pre-window targets bind to the first registered original owner and are consumed once',()=>{
  const state=fake();state.transport.seed([file],root);assert.deepEqual(state.transport.take(11),[]);state.transport.register(11);state.transport.register(22);assert.deepEqual(state.transport.take(22),[]);assert.equal(state.transport.take(11)[0].path,file);assert.deepEqual(state.transport.take(11),[]);
 });
 check('Later events notify and deliver only to the registered focused owner',()=>{
  const state=fake();state.transport.register(11);state.transport.register(22);state.setFocus(22);state.transport.fileManager(later);assert.deepEqual(state.notifications,[22]);assert.deepEqual(state.transport.take(11),[]);assert.equal(state.transport.take(22)[0].path,later);
 });
 check('An unregistered focus cannot divert source targets from the primary owner',()=>{
  const state=fake();state.transport.register(11);state.setFocus(99);state.transport.fileManager(file);assert.deepEqual(state.transport.take(99),[]);assert.equal(state.transport.take(11)[0].path,file);
 });
 check('Closing an owner retargets undelivered requests to one remaining live owner',()=>{
  const state=fake();state.transport.register(11);state.transport.register(22);state.setFocus(22);state.transport.fileManager(later);assert.equal(state.transport.closed(22),true);assert.deepEqual(state.transport.take(22),[]);assert.equal(state.transport.take(11)[0].path,later);assert.deepEqual(state.transport.take(11),[]);assert.equal(state.transport.diagnostics().owners,1);
 });
 check('Closing every owner preserves queued requests for the next original window',()=>{
  const state=fake();state.transport.register(11);state.transport.fileManager(file);state.transport.closed(11);assert.equal(state.transport.diagnostics().owners,0);state.transport.register(33);assert.equal(state.transport.take(33)[0].path,file);
 });
 check('Unknown or invalid owner operations do not reroute consume or manufacture targets',()=>{
  const state=fake();state.transport.register(11);state.transport.fileManager(file);assert.equal(state.transport.closed(99),false);assert.throws(()=>state.transport.register('11'),/Invalid target owner/);assert.deepEqual(state.transport.take({path:sibling}),[]);assert.equal(state.transport.take(11)[0].path,file);assert.equal(state.grants.length,1);
 });
 check('Pending duplicate paths coalesce before grants but later explicit opens remain usable',()=>{
  const state=fake();state.transport.seed([file,file],root);assert.equal(take(state).length,1);assert.equal(state.grants.length,1);state.transport.fileManager(file);state.transport.fileManager(file);assert.equal(state.transport.take(11).length,1);assert.equal(state.grants.length,2);state.transport.fileManager(file);assert.equal(state.transport.take(11).length,1);assert.equal(state.grants.length,3);
 });
 check('A full queue refuses new grants and keeps just one bounded overflow diagnostic',()=>{
  const state=fake(),paths=Array.from({length:32},(_,index)=>path.join(root,'pending-'+index+'.js'));state.transport.seed(paths,root);assert.equal(state.grants.length,32);state.transport.fileManager(file);state.transport.fileManager(later);assert.equal(state.grants.length,32);assert.deepEqual(state.transport.diagnostics(),{pending:32,owners:0,overflow:true});const items=take(state);assert.equal(items.length,33);assert.equal(items.at(-1).kind,'error');assert(items.at(-1).message.length<=targets.limits.messageCharacters);assert.equal(state.transport.diagnostics().overflow,false);
 });
 check('Startup batch capacity is reserved before any new file grants',()=>{
  const state=fake(),paths=Array.from({length:31},(_,index)=>path.join(root,'reserved-'+index+'.js'));state.transport.seed(paths,root);state.transport.seed([file,later],root);assert.equal(state.grants.length,31);const items=take(state);assert.equal(items.length,32);assert.equal(items.at(-1).kind,'error');
 });
 check('Owner closure also preserves the bounded overflow diagnostic until one receiver consumes it',()=>{
  const state=fake();state.transport.register(11);state.transport.seed(Array.from({length:32},(_,index)=>path.join(root,'overflow-'+index+'.js')),root);state.transport.fileManager(file);state.transport.closed(11);state.transport.register(22);const items=state.transport.take(22);assert.equal(items.length,33);assert.equal(items.at(-1).kind,'error');assert.deepEqual(state.transport.take(22),[]);
 });
 check('A missed or failed wake notification never loses the queued source payload',()=>{
  const state=fake({notificationFailure:true});state.transport.register(11);state.transport.fileManager(file);assert.equal(state.transport.take(11)[0].path,file);assert.deepEqual(state.transport.take(11),[]);
 });
 check('Grant failures stay bounded and cannot publish a successful target',()=>{
  const state=fake({grantFailure:true});state.transport.seed([file],root);const [item]=take(state);assert.equal(item.kind,'error');assert.equal(item.message.length,targets.limits.messageCharacters);assert.equal(state.canRead(file),false);
 });
 check('Opening transports only canonical selection metadata and never authored source or code execution',()=>{
  const secret='globalThis.__lt_open_target_authoredRan=true;throw Error("PRIVATE_AUTHORED_SOURCE");',authored=write('never-run.js',secret),state=fake();state.transport.seed([authored+':1'],root);const [item]=take(state);assert.deepEqual(Object.keys(item).sort(),['add','id','kind','line','origin','path']);assert.equal(JSON.stringify(item).includes('PRIVATE_AUTHORED_SOURCE'),false);assert.equal(globalThis.__lt_open_target_authoredRan,undefined);assert.equal(fs.readFileSync(authored,'utf8'),secret);
 });
 result={passed:true,checks,startedAt,finishedAt:new Date().toISOString(),sourceSha256:hash(fs.readFileSync(source)),testSha256:hash(fs.readFileSync(__filename)),limits:targets.limits};
}catch(error){result={passed:false,checks,startedAt,error:error.stack,sourceSha256:hash(fs.readFileSync(source)),testSha256:hash(fs.readFileSync(__filename))};process.exitCode=1;}
finally{
 try{
  for(const link of links)if(fs.existsSync(link)||fs.lstatSync(link,{throwIfNoEntry:false}))fs.unlinkSync(link);
  const resolved=path.resolve(root);if(path.dirname(resolved)!==tempBase||!path.basename(resolved).startsWith('lt-open-targets-'))throw Error('Temporary cleanup target leaves its owned directory');
  fs.rmSync(resolved,{recursive:true,force:true});result.cleanup={ownedTempRemoved:!fs.existsSync(resolved)};
 }catch(error){result.passed=false;result.cleanupError=error.stack;process.exitCode=1;}
 const receipt=path.resolve(__dirname,'../../.revival/open-targets-result.json');fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
