'use strict';
const {captureNativePage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..','.revival');
const earlier=JSON.parse(fs.readFileSync(path.join(root,'evaluation-result.json'),'utf8')).projects;
let seen=false;
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;
 window.webContents.on('did-finish-load',()=>setTimeout(async()=>{
  let result;
  try{
   result=await window.webContents.executeJavaScript(`(async()=>{
    const expected=${JSON.stringify(earlier)},checks=[];
    const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
    check('Restart restores the active project',ltProjects.info().current.path===expected.project&&document.getElementById('project-name').textContent==='working-project');
    const file=lt.objs.sidebar.workspace.find_by_path(expected.index);
    check('Restart restores the original project tree',!!file&&!!lt.objs.sidebar.workspace.find_by_path(expected.report));
    lt.object.__GT_content(file).querySelector('p').click();
    check('Restart opens the saved code',ltProofUI.connect().getValue().includes('[12, 31]'));
    const run=await ltProofUI.runJavaScript();
    check('Restart restores folder access and runs saved JavaScript',run.accepted&&JSON.parse(run.result.result).total===43&&ltProof.read(expected.index).includes('[12, 31]'));
    check('Recent projects survive restart',ltProjects.info().recents.some(p=>p.name==='existing-project'));
    return {passed:true,checks,project:expected.project,result:run.result};
   })()`);
   await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   fs.writeFileSync(path.join(root,'project-reopened.png'),(await captureNativePage(window.webContents)).toPNG());
  }catch(error){result={passed:false,error:error.message};}
  await require('../../deploy/core/proof-js.cjs').shutdown();
  fs.writeFileSync(path.join(root,'project-reopen-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);
 },2200));
});
setTimeout(()=>app.exit(2),25000);
require('../../deploy/core/main.js');
