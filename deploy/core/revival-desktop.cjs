'use strict';
const {BrowserWindow,dialog,Menu,clipboard,app}=require('electron');
const policy=require('./proof-policy.cjs');
const projects=require('./revival-projects.cjs');
const nodeTrust=new Set();
const appMenus=new WeakMap(),watchedMenuWindows=new WeakSet();
function setAppMenu(window,menu){
 appMenus.set(window,menu);
 if(!watchedMenuWindows.has(window)){
  watchedMenuWindows.add(window);
  window.on('focus',()=>{const current=appMenus.get(window);if(current&&!window.isDestroyed())Menu.setApplicationMenu(current);});
 }
 if(window.isFocused())Menu.setApplicationMenu(menu);
}
async function authorizeNode(event,root){
 if(nodeTrust.has(root.toLowerCase()))return;
 const answer=await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:'question',title:'Run local Node project',message:'Allow Node and npm to run this project?',detail:root+'\n\nNode and npm run with your Windows account. Project code can read and write files, use the network and start processes. Allow projects whose code you trust. This permission lasts until Light Table closes.',buttons:['Cancel','Allow this project'],defaultId:0,cancelId:0,noLink:true});
 if(answer.response!==1)throw Error('Node project execution was cancelled.');nodeTrust.add(root.toLowerCase());
}
function template(items,sender,depth=0,count={value:0}){
 if(!Array.isArray(items)||items.length>128||depth>6)throw Error('Invalid menu');
 return items.map(item=>{
  if(!item||++count.value>512)throw Error('Menu too large');
  const output={};
  for(const key of ['label','type','role','accelerator','enabled','checked'])if(['string','boolean'].includes(typeof item[key]))output[key]=item[key];
  if(!output.accelerator||output.accelerator.includes(' '))delete output.accelerator;
  if(item.submenu)output.submenu=template(item.submenu,sender,depth+1,count);
  if(typeof item.id==='string'&&/^(app|popup):[0-9]{1,3}$/.test(item.id))output.click=()=>{if(sender.isDestroyed())return;const owner=BrowserWindow.fromWebContents(sender);if(owner&&!owner.isDestroyed()&&owner.isFocused())sender.send('revival-menu',item.id);};
  return output;
 });
}
function operation(event,op,args){
 const window=BrowserWindow.fromWebContents(event.sender);
 switch(op){
  case 'project-info':return projects.info();
  case 'project-preview':return projects.preview();
  case 'node-info':return require('./revival-node.cjs').info();
  case 'project-parent':{const chosen=dialog.showOpenDialogSync(window,{title:'Choose where to create your project',defaultPath:app.getPath('documents'),properties:['openDirectory','createDirectory']});return chosen?.[0]?projects.chooseParent(chosen[0]):null;}
  case 'project-create':return projects.create(args[0],args[1],args[2]||{});
  case 'project-open':{const chosen=dialog.showOpenDialogSync(window,{title:'Open project folder',defaultPath:projects.info().current?.path||app.getPath('documents'),properties:['openDirectory']});return chosen?.[0]?projects.activate(chosen[0]):null;}
  case 'project-reopen':return projects.reopen(args[0]);
  case 'project-file':if(args.length!==2||typeof args[1]!=='string')throw Error('A displayed project is required to create a file.');return projects.newFile(args[0],args[1]);
  case 'dialog-open':{
   const directory=args[0]?.properties?.includes('openDirectory');
   const chosen=dialog.showOpenDialogSync(window,{defaultPath:policy.docs,properties:[directory?'openDirectory':'openFile','multiSelections']})||[];
   return chosen.map(p=>directory?policy.grantDirectory(p):policy.grantFile(p));
  }
  case 'dialog-save':{
   const chosen=dialog.showSaveDialogSync(window,{defaultPath:typeof args[0]?.defaultPath==='string'?args[0].defaultPath:policy.docs});
   return chosen?policy.grantFile(chosen):null;
  }
  case 'menu':{const items=template(args[1],event.sender);if(args[0]==='app')items.splice(Math.min(3,items.length),0,{label:'&Assistant',submenu:[['Chat','chat','Ctrl+Alt+A'],['Activity','activity'],['New chat','new'],['Attach files…','attach'],['Attach selection','selection'],['Pause','pause'],['Resume','resume'],['Stop','stop','Ctrl+Alt+.'],['Undo assistant edits','undo'],['Refresh models','models'],['Settings…','settings']].map(([label,op,accelerator])=>({label,...(accelerator?{accelerator}:{}),click:()=>{if(!event.sender.isDestroyed()&&window&&!window.isDestroyed()&&window.isFocused())event.sender.send('assistant-menu',op);}}))});const menu=Menu.buildFromTemplate(items);if(args[0]==='popup')menu.popup({window});else if(args[0]==='app')setAppMenu(window,menu);else throw Error('Unknown menu kind');return true;}
  case 'clipboard-read':return clipboard.readText();
  case 'clipboard-write':if(typeof args[0]!=='string'||Buffer.byteLength(args[0])>8*1024*1024)throw Error('Clipboard text too large');clipboard.writeText(args[0]);return true;
  default:throw Error('Unknown desktop operation');
 }
}
const languageTrust=new Set();
async function authorizeLanguage(event,root,language,prepared={transport:'local'}){
 const key=language+':'+root.toLowerCase()+':'+prepared.transport+':'+(prepared.endpoint||'');if(languageTrust.has(key))return;
 const name=language==='python'?'Python':language==='clojurescript'?'ClojureScript':'Clojure',external=prepared.transport!=='local';
 const answer=await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:'question',title:(external?'Connect external ':'Run local ')+name+' project',message:external?'Allow this project to execute on '+prepared.endpoint+'?':'Allow '+name+' to run this project?',detail:root+'\n\n'+(external?'Editor code is sent to the selected external runtime. It runs with that server’s permissions. Light Table disconnects its own session and requests interruption of active work; it cannot enforce the server’s memory limits or terminate the server. Use trusted endpoints or an SSH tunnel.':'Project code runs with your Windows account and can read or write files, use the network and start processes. Allow projects whose code you trust.')+' This permission lasts until Light Table closes.',buttons:['Cancel','Allow this project'],defaultId:0,cancelId:0,noLink:true});
 if(answer.response!==1)throw Error(name+' project execution was cancelled.');languageTrust.add(key);
}
module.exports={operation,authorizeNode,authorizeLanguage};
