'use strict';
process.env.LT_REVIVAL_TEST='1';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),npm=require('../../deploy/core/revival-npm.cjs'),memory=require('../../deploy/core/proof-memory.cjs');
const root=path.join(policy.root,'npm-vite',crypto.randomUUID());fs.mkdirSync(root,{recursive:true});projects.activate(root);
const manifest=path.join(root,'package.json');fs.writeFileSync(manifest,JSON.stringify({name:'lt-real-vite',version:'1.0.0',private:true,type:'module',devDependencies:{vite:'8.0.0'},scripts:{dev:'vite --host 127.0.0.1 --port 0 --strictPort',build:'vite build'}},null,2));
fs.writeFileSync(path.join(root,'.npmrc'),'registry=https://registry.npmjs.org/\naudit=false\nfund=false\nignore-scripts=true\ncache=.revival/npm-cache\n');fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><meta charset="utf-8"><h1>Real Vite project</h1><output id="value">Ready</output><script type="module" src="/main.ts"></script>');fs.writeFileSync(path.join(root,'main.ts'),'const answer: number=20+22; document.querySelector<HTMLOutputElement>("#value")!.textContent=String(answer);');
const options=kind=>({kind,path:manifest,source:fs.readFileSync(manifest,'utf8'),...(kind==='server'?{script:'dev'}:{})});
const checks=[];const check=(name,ok)=>{assert(ok,name);checks.push(name);console.error(name);};
(async()=>{let result;try{
 const install=await npm.start(801,options('install')),finished=await npm.wait(801,install.id);fs.writeFileSync(path.join(policy.root,'npm-vite-install.json'),JSON.stringify(finished,null,2));check('Real Vite 8.0.0 installs under the production npm quota',finished.status==='exited'&&finished.memory.hardPrivateCommit&&finished.memory.processExited);
 const server=await npm.start(801,options('server'));const end=Date.now()+15000;let url;while(Date.now()<end){const state=npm.status(801);if(!state)throw Error('Vite exited: '+JSON.stringify(await npm.wait(801,server.id)));url=state.output.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];if(url)break;await new Promise(resolve=>setTimeout(resolve,50));}if(!url)throw Error('Vite did not report its listening URL.');
 const page=await fetch(url),html=await page.text();check('The real Vite server serves project HTML and its HMR client',page.status===200&&html.includes('Real Vite project')&&html.includes('/@vite/client'));
 const module=await fetch(url+'/main.ts'),code=await module.text();check('Vite transforms actual TypeScript using its installed native toolchain',module.status===200&&code.includes('String(answer)')&&!code.includes(': number'));
 fs.writeFileSync(path.join(root,'main.ts'),'const answer: number=43; document.querySelector<HTMLOutputElement>("#value")!.textContent=String(answer);');let changed='';const changedDeadline=Date.now()+5000;
 while(Date.now()<changedDeadline){changed=await(await fetch(url+'/main.ts?t='+Date.now())).text();if(changed.includes('43'))break;await new Promise(resolve=>setTimeout(resolve,30));}
 check('The running Vite server serves saved edits without a process restart',changed.includes('43'));
 const stopped=await npm.stop(801);check('Stopping real Vite closes its listener and releases the entire process job',stopped.memory.processExited&&memory.status().jobs===0);await assert.rejects(fetch(url));result={passed:true,checks,version:'8.0.0',root,url};
 }catch(error){result={passed:false,checks,error:error.stack,active:npm.status(801)};console.error(error);}
 await npm.shutdown();await memory.stop();result.cleanup={npmActive:npm.activeCount(),...memory.status()};result.passed=result.passed&&result.cleanup.npmActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;fs.writeFileSync(path.join(policy.root,'npm-vite-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=result.passed?0:1;
})();
