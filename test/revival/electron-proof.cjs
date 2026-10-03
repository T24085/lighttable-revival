'use strict';
const {app}=require('electron'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..','.revival'),phase=process.env.LT_PROOF_PHASE||'evaluation';
fs.writeFileSync(path.join(root,phase+'-console.log'),'');
let editorWindowSeen=false;
app.on('browser-window-created',(_e,win)=>{
if(editorWindowSeen)return;editorWindowSeen=true;
win.webContents.on('console-message',(_e,level,message,line,source)=>fs.appendFileSync(path.join(root,phase+'-console.log'),JSON.stringify({level,message,line,source})+'\n'));
win.webContents.on('did-finish-load',()=>setTimeout(async()=>{let result={};try{
await win.webContents.executeJavaScript(`document.getElementById('proof-open').click();`);
await win.webContents.executeJavaScript(`document.getElementById('proof-evaluate').click();`);
result.first=await win.webContents.executeJavaScript(`({last:ltProofUI.getLast(),status:document.getElementById('proof-output').dataset.status,editor:document.querySelector('.CodeMirror').CodeMirror.getValue()})`);
fs.writeFileSync(path.join(root,'evaluation-42.png'),(await win.webContents.capturePage()).toPNG());
await win.webContents.executeJavaScript(`document.querySelector('.CodeMirror').CodeMirror.focus();document.querySelector('.CodeMirror').CodeMirror.execCommand('selectAll');`);
await win.webContents.insertText('(12 + 31)');
await new Promise(resolve=>setTimeout(resolve,200));
result.afterEdit=await win.webContents.executeJavaScript(`({status:document.getElementById('proof-output').dataset.status,editor:document.querySelector('.CodeMirror').CodeMirror.getValue()})`);
await win.webContents.executeJavaScript(`document.getElementById('proof-save').click();document.getElementById('proof-evaluate').click();`);
result.second=await win.webContents.executeJavaScript(`({last:ltProofUI.getLast(),status:document.getElementById('proof-output').dataset.status,editor:document.querySelector('.CodeMirror').CodeMirror.getValue(),requireType:typeof require,actualNodeProcess:typeof process?.versions,hasLegacyRemote:typeof ltRequire('electron').remote.require})`);
result.disk=fs.readFileSync(path.join(require('../../deploy/core/proof-policy.cjs').docs,'calculation.js'),'utf8');
result.runtime={electron:process.versions.electron,chrome:process.versions.chrome};result.settings=win.webContents.getLastWebPreferences(); result.settings.preload='deploy/core/proof-preload.cjs';
result.passed=result.runtime.electron==='44.5.1'&&result.first.last.result===42&&result.second.last.result===43&&result.first.last.sha256!==result.second.last.sha256&&result.afterEdit.status==='stale'&&result.disk.replace(/\r\n/g,'\n')===result.second.editor&&result.settings.contextIsolation===true&&result.settings.nodeIntegration===false&&result.settings.sandbox===true&&result.settings.enableRemoteModule!==true;
result.edgecases=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'ui-edgecases.js'),'utf8'));result.passed=result.passed&&result.edgecases.passed;
await win.webContents.executeJavaScript('window.testEditorPID='+win.webContents.getOSProcessId());
result.javascript=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'javascript-ui.js'),'utf8'));result.passed=result.passed&&result.javascript.passed;
result.async=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'async-ui.js'),'utf8'));result.passed=result.passed&&result.async.passed;
result.cleanup={active:require('../../deploy/core/proof-js.cjs').activeCount(),windows:require('electron').BrowserWindow.getAllWindows().length};result.passed=result.passed&&result.cleanup.active===0&&result.cleanup.windows===1;
fs.writeFileSync(path.join(root,'async-43.png'),(await win.webContents.capturePage()).toPNG());
fs.writeFileSync(path.join(root,'javascript-43.png'),(await win.webContents.capturePage()).toPNG());
fs.writeFileSync(path.join(root,'evaluation-43.png'),(await win.webContents.capturePage()).toPNG());
}catch(e){result.passed=false;result.error=e.message;result.stack=e.stack;}
fs.writeFileSync(path.join(root,phase+'-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);},3000));});
setTimeout(()=>app.exit(2),55000);
require('../../deploy/core/main.js');