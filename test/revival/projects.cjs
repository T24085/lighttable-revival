'use strict';
process.env.LT_REVIVAL_TEST='1';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs');
const parent=path.join(policy.root,'project-tests',crypto.randomUUID());fs.mkdirSync(parent,{recursive:true});
const saved=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
try{
 const selection=projects.chooseParent(parent);
 check('Choosing a parent does not grant its other files',()=>assert.throws(()=>policy.operation('write',[path.join(parent,'sibling.js'),'bad'])));
 check('Creating a project requires the picker token',()=>assert.throws(()=>projects.create('unknown','my-project')));
 for(const name of ['../escape','..','C:\\escape','nul','con.js','invalid:name','trailing.',' padded '])check('Reject unsafe name '+name,()=>assert.throws(()=>projects.create(selection.token,name)));
 const created=projects.create(selection.token,'my-project',{template:'javascript'}),index=path.join(created.path,'index.js');
 check('Starter, shared module, tests, README and package are on disk',()=>{for(const name of ['index.js','totals.cjs','totals.test.cjs','README.md','package.json'])assert.equal(fs.statSync(path.join(created.path,name)).isFile(),true);assert.equal(JSON.parse(fs.readFileSync(path.join(created.path,'package.json'))).private,true);});
 check('The new project grants only its folder',()=>{assert.equal(policy.operation('read',[index]),fs.readFileSync(index,'utf8'));assert.throws(()=>policy.operation('write',[path.join(parent,'escape.js'),'bad']));});
 check('Consumed create token cannot create another folder',()=>assert.throws(()=>projects.create(selection.token,'another')));
 const again=projects.chooseParent(parent);
 check('Existing project creation preserves its files',()=>{assert.throws(()=>projects.create(again.token,'my-project'));assert.ok(fs.readFileSync(index,'utf8').includes('[12, 30]'));});
 const file=projects.newFile('report.js');
 check('New file is created inside the active project',()=>assert.equal(file.path,path.join(created.path,'report.js')));
 const changedMessage='The active project changed in another window. Reopen this project before creating a file.';
 check('Invalid expected project roots reject before creating files or changing project state',()=>{
  const before=fs.readFileSync(projects.statePath);
  for(const expected of [null,1,{},'','relative-project',created.path+'\0','x'.repeat(1025)])assert.throws(()=>projects.newFile('invalid-context.js',expected),error=>error.message===changedMessage);
  assert.equal(fs.existsSync(path.join(created.path,'invalid-context.js')),false);assert(fs.readFileSync(projects.statePath).equals(before));assert.equal(projects.info().current.path,created.path);
 });
 check('Expected roots use canonical paths and the platform case rules',()=>{
  const expected=path.join(created.path,'unused','..'),canonical=projects.newFile('canonical-context.js',expected);assert.equal(canonical.path,path.join(created.path,'canonical-context.js'));
  if(process.platform==='win32')assert.equal(projects.newFile('case-context.js',created.path.toUpperCase()).path,path.join(created.path,'case-context.js'));
  else if(created.path.toUpperCase()!==created.path)assert.throws(()=>projects.newFile('case-context.js',created.path.toUpperCase()),error=>error.message===changedMessage);
 });
 policy.operation('write',[file.path,'40+2']);
 check('Duplicate new file never overwrites code',()=>{assert.throws(()=>projects.newFile('report.js'));assert.equal(fs.readFileSync(file.path,'utf8'),'40+2');});
 check('New file traversal is rejected',()=>assert.throws(()=>projects.newFile('../outside.js')));
 const renamed=path.join(created.path,'renamed.js');
 check('Original editor rename and delete operations work inside a project',()=>{policy.operation('rename',[file.path,renamed]);assert.equal(policy.operation('read',[renamed]),'40+2');policy.operation('unlink',[renamed]);assert.equal(fs.existsSync(renamed),false);});
 check('Rename refuses overwriting an existing file',()=>{const other=projects.newFile('other.js');assert.throws(()=>policy.operation('rename',[other.path,index]));assert.ok(fs.readFileSync(index,'utf8').includes('[12, 30]'));});
 check('Directory deletion is not an unlink operation',()=>assert.throws(()=>policy.operation('unlink',[created.path])));
 check('Opening an existing folder preserves its contents',()=>{const existing=path.join(parent,'existing');fs.mkdirSync(existing);fs.writeFileSync(path.join(existing,'index.js'),'17');projects.activate(existing);assert.equal(fs.readFileSync(path.join(existing,'index.js'),'utf8'),'17');assert.equal(projects.info().recents.length>=2,true);});
 const otherProject=projects.info().current.path;
 check('A stale window cannot create a file in either its old project or another active project',()=>{
  const before=fs.readFileSync(projects.statePath),oldFiles=fs.readdirSync(created.path),activeFiles=fs.readdirSync(otherProject);
  assert.throws(()=>projects.newFile('stale-window.js',created.path),error=>error.message===changedMessage);assert.equal(projects.info().current.path,otherProject);
  assert.equal(fs.existsSync(path.join(created.path,'stale-window.js')),false);assert.equal(fs.existsSync(path.join(otherProject,'stale-window.js')),false);
  assert.deepEqual(fs.readdirSync(created.path),oldFiles);assert.deepEqual(fs.readdirSync(otherProject),activeFiles);assert(fs.readFileSync(projects.statePath).equals(before));
 });
 check('Reopening the intended project permits creation only in that project',()=>{
  projects.reopen(created.path);const recovered=projects.newFile('stale-window.js',created.path);assert.equal(recovered.path,path.join(created.path,'stale-window.js'));assert.equal(fs.readFileSync(recovered.path,'utf8'),'');assert.equal(fs.existsSync(path.join(otherProject,'stale-window.js')),false);
 });
 check('Unchosen folders cannot be reopened by renderer path',()=>assert.throws(()=>projects.reopen(parent)));
 projects.reopen(created.path);
 check('Recent list does not duplicate a reopened folder',()=>assert.equal(projects.info().recents.filter(p=>p.path===created.path).length,1));
 check('Fresh process restores the project and only its saved folder grants',()=>{
  const code=`const assert=require('assert/strict'),projects=require(${JSON.stringify(path.resolve(__dirname,'../../deploy/core/revival-projects.cjs'))}),policy=require(${JSON.stringify(path.resolve(__dirname,'../../deploy/core/proof-policy.cjs'))});assert.equal(projects.info().current.path,${JSON.stringify(created.path)});assert.ok(policy.operation('read',[${JSON.stringify(index)}]).includes('[12, 30]'));assert.throws(()=>policy.operation('write',[${JSON.stringify(path.join(parent,'escape.js'))},'bad']));`;
  const result=spawnSync(process.execPath,['-e',code],{env:process.env,encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);
 });
 check('Default project creates and opens only index.html with no package or scaffold',()=>{const p=projects.create(projects.chooseParent(parent).token,'single-html');assert.deepEqual(fs.readdirSync(p.path),['index.html']);assert.equal(p.entry,path.join(p.path,'index.html'));assert(fs.readFileSync(p.entry,'utf8').includes('<meta name="viewport"'));});
 check('Selected Python, JavaScript and custom types each create only their named file',()=>{for(const fileName of ['main.py','app.js','query.scene']){const p=projects.create(projects.chooseParent(parent).token,'typed-'+fileName.replace('.','-'),{fileName});assert.deepEqual(fs.readdirSync(p.path),[fileName]);assert.equal(p.entry,path.join(p.path,fileName));assert.equal(fs.readFileSync(p.entry,'utf8'),'');assert.equal(projects.reopen(p.path).entry,p.entry);}});
 check('Unsafe initial filenames are rejected before a project folder is created',()=>{for(const fileName of ['../escape.html','CON.py','bad:name.html']){const picked=projects.chooseParent(parent);assert.throws(()=>projects.create(picked.token,'invalid-start',{fileName}));assert(!fs.existsSync(path.join(parent,'invalid-start')));}});
 check('Explicit empty projects remain empty for assistant scaffolding',()=>{const p=projects.create(projects.chooseParent(parent).token,'assistant-empty',{empty:true});assert.deepEqual(fs.readdirSync(p.path),[]);});
 check('Nested file creation stays inside the displayed project and refuses another folder',()=>{projects.activate(created.path);const folder=path.join(created.path,'nested');fs.mkdirSync(folder);assert.equal(projects.newFile('worker.py',created.path,folder).path,path.join(folder,'worker.py'));assert.throws(()=>projects.newFile('escape.py',created.path,parent),/inside the active project/);assert(!fs.existsSync(path.join(parent,'escape.py')));});
 console.log(JSON.stringify({passed:true,checks:checks.length,project:created.path}));
}finally{if(saved)fs.writeFileSync(projects.statePath,saved);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);}
