'use strict';
process.env.LT_REVIVAL_TEST='1';
const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),preview=require('../../deploy/core/revival-preview.cjs'),memory=require('../../deploy/core/proof-memory.cjs');
const root=path.join(policy.root,'inline-html-nested',crypto.randomUUID()),directory=path.join(root,'pages'),entry=path.join(directory,'index.html');fs.mkdirSync(directory,{recursive:true});
const source='<h1>Nested inline modules</h1>\n<script type="module">\nimport {offset} from "./helper.mjs";\nglobalThis.answer=offset + 1;\nglobalThis.inlineMeta=import.meta.url;\nglobalThis.dynamicAnswer=await import("./helper.mjs").then(module=>module.offset + 1);\nglobalThis.fail=()=>{throw new Error("nested inline failure");};\n</script>';
fs.writeFileSync(entry,source);fs.writeFileSync(path.join(directory,'helper.mjs'),'export const offset=41;');projects.activate(root);
const owner=918,checks=[];let host;const deadline=setTimeout(()=>app.exit(2),20000);
app.whenReady().then(async()=>{let result;try{
 host=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});await host.loadURL('data:text/html,<title>Nested inline host</title>');
 const from=source.indexOf('offset + 1'),started=await preview.start(owner,{path:entry,watches:[{id:'nested',from,to:from+10}]},host),until=Date.now()+4000;
 while((await preview.evaluate(owner,'dynamicAnswer')).result!=='42'){if(Date.now()>until)throw Error('Nested module import did not finish');await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal((await preview.evaluate(owner,'answer')).result,'42');assert.equal(preview.status(owner).watches[0].result,'42');checks.push('Nested inline static and dynamic relative imports retain actual browser values');
 assert.equal((await preview.evaluate(owner,'inlineMeta')).result,JSON.stringify(started.url));checks.push('Internal error identities retain the original inline module import.meta.url');
 await assert.rejects(preview.evaluate(owner,'fail()'),error=>error.location?.path===entry&&error.location.line===7&&error.location.source===source);checks.push('Nested inline failures map back to the original HTML source');
 result={passed:true,checks,root};
 }catch(error){result={passed:false,checks,root,error:error.stack,snapshot:preview.status(owner)};console.error(error);}
 await preview.shutdown();await memory.stop();host?.destroy();result.cleanup={previewActive:preview.activeCount(),...memory.status()};result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
 fs.writeFileSync(path.join(policy.root,'inline-html-nested-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
}).catch(error=>{console.error(error);app.exit(1);});
