'use strict';
const {captureNativePage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs');
const fixtureRoot=path.join(policy.root,'package-ui',crypto.randomUUID());require('./package-fixtures.cjs').fixture(fixtureRoot);
projects.activate(fixtureRoot);
let seen=false;
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;
 window.webContents.on('did-finish-load',()=>setTimeout(async()=>{
  let result;
  try{
   await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   result=await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'package-ui.js'),'utf8'));
   await window.webContents.executeJavaScript('document.getElementById("proof-project-snapshot").open=true;document.getElementById("proof-output").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   fs.writeFileSync(path.join(policy.root,'package-report.png'),(await captureNativePage(window.webContents)).toPNG());
  }catch(error){result={passed:false,error:error.message};try{result.display=await window.webContents.executeJavaScript('document.getElementById("proof-output").textContent');fs.writeFileSync(path.join(policy.root,'package-failure.png'),(await captureNativePage(window.webContents)).toPNG());}catch(_){} }
  const runtime=require('../../deploy/core/proof-js.cjs');await runtime.shutdown();result.cleanup=runtime.diagnostics();delete result.cleanup.recent;
  result.passed=result.passed&&runtime.activeCount()===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(policy.root,'package-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);
 },2200));
});
setTimeout(()=>app.exit(2),45000);
require('../../deploy/core/main.js');
