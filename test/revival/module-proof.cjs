'use strict';
const {captureNativePage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
process.env.LT_REVIVAL_AUTO_LIVE='0';
const {app}=require('electron'),fs=require('fs'),path=require('path');
const runtime=path.resolve(__dirname,'../..','.revival');
const isolation=require('./isolated-editor-profile.cjs').create();
const project=path.join(runtime,'module-editor',require('crypto').randomUUID());fs.mkdirSync(project,{recursive:true});
require('../../deploy/core/revival-projects.cjs').activate(project);
const fixtures={'sum.js':'export const sum = (a,b)=>a+b;','data.json':'{"price":22}','common.cjs':'module.exports={answer:43};','barrel.js':'export {default as answer} from "./number.js";','number.js':'export default 43;','cycle-a.cjs':'exports.name="a";exports.other=require("./cycle-b.cjs").name;','cycle-b.cjs':'exports.name="b";require("./cycle-a.cjs");','bad.js':'export const bad = ;','loop.js':'while(true){}','module-entry.js':''};
for(const [name,source] of Object.entries(fixtures))fs.writeFileSync(path.join(project,name),source);
fs.writeFileSync(path.join(project,'awaited.mjs'),'export const answer = await new Promise(resolve=>setTimeout(()=>resolve(43),100));');
fs.writeFileSync(path.join(project,'throws.js'),'export function broken() {\n  throw new Error("dependency failed");\n}\n');
const standalone=path.join(runtime,'standalone-ui',require('crypto').randomUUID());fs.mkdirSync(standalone,{recursive:true});
const standaloneFile=path.join(standalone,'await.mjs');fs.writeFileSync(standaloneFile,'export default await Promise.resolve(43);');fs.writeFileSync(path.join(standalone,'sibling.mjs'),'export default 99;');
const dialog=require('electron').dialog,originalPicker=dialog.showOpenDialogSync;
dialog.showOpenDialogSync=(_window,options)=>options.properties?.includes('openFile')?[standaloneFile]:originalPicker(_window,options);
let seen=false;
app.on('browser-window-created',(_event,window)=>{
 if(seen)return;seen=true;
 window.webContents.on('did-finish-load',()=>setTimeout(async()=>{
  let result;
  try{
   await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
   result=await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'module-ui.js'),'utf8'));
   result.errorExample=await window.webContents.executeJavaScript(`(async()=>{lt.objs.command.exec_BANG_(cljs.core.keyword('open-path'),${JSON.stringify(path.join(project,'module-entry.js'))});const cm=ltProofUI.connect();cm.setValue('import {broken} from "./throws.js";\\nbroken();');const run=await ltProofUI.runJavaScript();document.getElementById('proof-output').scrollIntoView();return {message:run.error,location:run.location};})()`);
   await window.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   fs.writeFileSync(path.join(runtime,'module-error.png'),(await captureNativePage(window.webContents)).toPNG());
   await window.webContents.executeJavaScript(`ltProofUI.connect().setValue(${JSON.stringify(result.result.source)});ltProofUI.runJavaScript();`);
   await window.webContents.executeJavaScript('ltProofUI.pending()');
   await window.webContents.executeJavaScript('document.getElementById("proof-output").scrollIntoView();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   fs.writeFileSync(path.join(runtime,'module-report.png'),(await captureNativePage(window.webContents)).toPNG());
  }catch(error){result={passed:false,error:error.message};try{result.display=await window.webContents.executeJavaScript('document.getElementById("proof-output").textContent');fs.writeFileSync(path.join(runtime,'module-failure.png'),(await captureNativePage(window.webContents)).toPNG());}catch(_){} }
  dialog.showOpenDialogSync=originalPicker;
  await require('../../deploy/core/proof-js.cjs').shutdown();
  result.cleanup=require('../../deploy/core/proof-js.cjs').diagnostics();delete result.cleanup.recent;
  result.restoration=isolation.restore();
  result.passed=result.passed&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
  fs.writeFileSync(path.join(runtime,'module-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);
 },2200));
});
setTimeout(()=>app.exit(2),45000);
require('../../deploy/core/main.js');
