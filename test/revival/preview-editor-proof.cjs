'use strict';
const {captureNativePage}=require('./native-page-capture.cjs');
process.env.LT_REVIVAL_TEST='1';
const {app}=require('electron'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const policy=require('../../deploy/core/proof-policy.cjs'),projects=require('../../deploy/core/revival-projects.cjs');
const root=path.join(policy.root,'preview-editor',crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><meta charset="utf-8"><title>Orders preview</title><link rel="stylesheet" href="./style.css"><main><h1>Order report</h1><button id="total">Calculate revenue</button><output id="revenue">Ready</output></main><script src="./app.js"></script>');
fs.writeFileSync(path.join(root,'app.js'),'var prices=[12,30];document.getElementById("total").onclick=()=>document.getElementById("revenue").textContent=prices.reduce((a,b)=>a+b,0);console.log("DOM app ready");');fs.writeFileSync(path.join(root,'style.css'),'body{background:#10271f;color:#d9ede2;font:18px system-ui;padding:36px}button{padding:12px}output{margin-left:24px}');projects.activate(root);
fs.appendFileSync(path.join(root,'index.html'),'<script type="module" src="./module.mjs"></script>');fs.writeFileSync(path.join(root,'module.mjs'),'import {double} from "./helper.mjs";globalThis.browserDouble=double;globalThis.browserInitial=double(21);');fs.writeFileSync(path.join(root,'helper.mjs'),'export function double(n){return n * 2;}');
let seen=false;const deadline=setTimeout(()=>app.exit(2),65000);
app.on('browser-window-created',(_event,window)=>{if(seen)return;seen=true;window.setOpacity(0);window.setSkipTaskbar(true);window.showInactive();window.webContents.on('did-finish-load',()=>setTimeout(async()=>{
 let result;try{
  await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'menu-ui.js'),'utf8'));
  result=await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'preview-ui.js'),'utf8'));
  const watched=await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'browser-watch-ui.js'),'utf8'));result.passed=result.passed&&watched.passed;result.browserWatchChecks=watched.checks;
  await new Promise(resolve=>setTimeout(resolve,150));fs.writeFileSync(path.join(policy.root,'browser-watch-editor-report.png'),(await captureNativePage(window.webContents)).toPNG());await window.webContents.executeJavaScript('ltPreview.refresh()');await new Promise(resolve=>setTimeout(resolve,120));
  const preview=require('../../deploy/core/revival-preview.cjs'),view=preview.view(window.webContents.id);result.nativeView={visible:view.getVisible(),bounds:view.getBounds()};result.passed=result.passed&&result.nativeView.visible&&result.nativeView.bounds.width>200;
  fs.writeFileSync(path.join(policy.root,'preview-editor-report.png'),(await captureNativePage(window.webContents)).toPNG());
  fs.writeFileSync(path.join(policy.root,'preview-dom-report.png'),(await captureNativePage(view.webContents)).toPNG());
 }catch(error){result={passed:false,error:error.stack};try{result.display=await window.webContents.executeJavaScript('document.getElementById("preview-activity").textContent');result.watchState=await window.webContents.executeJavaScript('({preview:ltPreview.state(),widgets:[...document.querySelectorAll(".watch-result")].map(node=>({status:node.dataset.status,text:node.textContent,title:node.title}))})');fs.writeFileSync(path.join(policy.root,'preview-editor-failure.png'),(await captureNativePage(window.webContents)).toPNG());}catch(_){}console.error(error);}
 const preview=require('../../deploy/core/revival-preview.cjs'),node=require('../../deploy/core/revival-node.cjs'),js=require('../../deploy/core/proof-js.cjs');await preview.shutdown();await node.shutdown();await js.shutdown();result.cleanup={previewActive:preview.activeCount(),nodeActive:node.activeCount(),jsActive:js.activeCount(),...js.diagnostics()};delete result.cleanup.recent;result.passed=result.passed&&result.cleanup.previewActive===0&&result.cleanup.nodeActive===0&&result.cleanup.jsActive===0&&result.cleanup.jobs===0&&result.cleanup.pending===0&&!result.cleanup.helperPid;
 fs.writeFileSync(path.join(policy.root,'preview-editor-result.json'),JSON.stringify(result,null,2));clearTimeout(deadline);app.exit(result.passed?0:1);
 },1500));});require('../../deploy/core/main.js');
