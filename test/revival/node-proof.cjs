'use strict';
const {captureNativePage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app,dialog}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs'),fixture=require('./package-fixtures.cjs');
const root=path.join(policy.root,'node-ui',crypto.randomUUID());fixture.fixture(root);fixture.write(root,'index.js','');fixture.write(root,'orders.json',[{price:12,count:2},{price:30,count:3}]);fixture.write(root,'broken.cjs','module.exports=()=>{\n throw new Error("native dependency failed");\n};');
fixture.write(root,'worker.cjs','const {parentPort,workerData}=require("node:worker_threads");parentPort.postMessage(workerData.value*2);');
fixture.write(root,'child.cjs','process.on("message",({value})=>process.send(value*2,()=>process.disconnect()));');
fixture.write(root,'failed-worker.cjs','const value=21;\nthrow new Error("worker file failed");');
fixture.write(root,'loop-worker.cjs','require("node:worker_threads").parentPort.postMessage("worker ready");while(true){}');
fixture.write(root,'child-process-output.cjs','console.log(42);');
fs.writeFileSync(path.join(root,'input.bin'),Buffer.from([0,255,254,42]));
fixture.write(root,'test.cjs','const test=require("node:test");const assert=require("node:assert/strict");test("real Node test runner",()=>assert.equal(20+22,42));');
const json=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));json.scripts={pretest:'node -e "require(\'fs\').writeFileSync(\'pretest-marker.txt\',\'pretest\')"',test:'node --test test.cjs'};fixture.write(root,'package.json',json);projects.activate(root);
const originalDialog=dialog.showMessageBox;let requests=0;dialog.showMessageBox=async(window,options)=>options.title==='Run local Node project'?{response:requests++===0?0:1}:originalDialog(window,options);
let seen=false;
app.on('browser-window-created',(_event,window)=>{if(seen)return;seen=true;window.webContents.on('did-finish-load',()=>setTimeout(async()=>{
 let result;try{
  await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
  result=await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'node-ui.js'),'utf8'));
  result.trustRequests=requests;result.passed=result.passed&&requests===2;
  await window.webContents.executeJavaScript('document.getElementById("proof-project-snapshot").open=true;document.getElementById("proof-output").scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');fs.writeFileSync(path.join(policy.root,'node-report.png'),(await captureNativePage(window.webContents)).toPNG());
 }catch(error){result={passed:false,error:error.message};try{result.display=await window.webContents.executeJavaScript('document.getElementById("proof-output").textContent');fs.writeFileSync(path.join(policy.root,'node-failure.png'),(await captureNativePage(window.webContents)).toPNG());}catch(_){} }
 dialog.showMessageBox=originalDialog;const localNode=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs');await localNode.shutdown();await js.shutdown();result.cleanup={nodeActive:localNode.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;
 result.passed=result.passed&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
 fs.writeFileSync(path.join(policy.root,'node-result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1);
},2200));});setTimeout(()=>app.exit(2),50000);require('../../deploy/core/main.js');
