'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),policy=require('./proof-policy.cjs');
const statePath=path.join(policy.root,process.env.LT_REVIVAL_TEST==='1'?'test-projects.json':'projects.json');
const parents=new Map();let current=null,recents=[],warning=null;
function identity(p){return {path:p,name:path.basename(p)};}
function validName(value){
 if(typeof value!=='string'||value.length>80||value!==value.trim()||!value||/^[.]+$|[<>:"/\\|?*\x00-\x1f]|[. ]$/.test(value)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))throw Error('Use a folder or file name without slashes, reserved characters or trailing spaces.');
 return value;
}
function info(){return {current:current&&identity(current),recents:recents.map(identity),warning};}
function load(){
 current=null;recents=[];warning=null;
 if(!fs.existsSync(statePath))return info();
 try{
  if(fs.statSync(statePath).size>65536)throw Error('Recent projects file too large');
  const saved=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(!Array.isArray(saved.recents)||saved.recents.length>20)throw Error('Invalid recent projects');
  for(const input of saved.recents){try{const p=policy.grantDirectory(input);if(!recents.some(r=>r.toLowerCase()===p.toLowerCase()))recents.push(p);}catch(_){} }
  current=recents.find(p=>p.toLowerCase()===String(saved.current).toLowerCase())||null;
 }catch(error){warning='Recent projects could not be loaded: '+error.message;}
 return info();
}
function save(){const temp=statePath+'.tmp';fs.writeFileSync(temp,JSON.stringify({current,recents},null,2));fs.renameSync(temp,statePath);}
function activate(input){const p=policy.grantDirectory(input);current=p;recents=[p,...recents.filter(r=>r.toLowerCase()!==p.toLowerCase())].slice(0,20);warning=null;try{save();}catch(error){warning='Project opened, but recent projects could not be saved: '+error.message;}const entry=path.join(p,'index.js');return {...identity(p),...info(),entry:fs.existsSync(entry)&&fs.statSync(entry).isFile()?entry:null};}
function chooseParent(input){const p=policy.directory(input),token=crypto.randomBytes(24).toString('hex');parents.clear();parents.set(token,p);return {path:p,token};}
const starter='// Run this file with Ctrl+Shift+Enter.\nconst total = require("./totals.cjs");\nconst prices = [12, 30];\nconsole.log("Project is running");\n({ total: total(prices), itemCount: prices.length });\n';
const totals='module.exports = function total(values) {\n  return values.reduce((sum, price) => sum + price, 0);\n};\n';
const starterTests='const test = require("node:test");\nconst assert = require("node:assert/strict");\nconst total = require("./totals.cjs");\n\ntest("adds the project prices", () => assert.equal(total([12, 30]), 42));\ntest("an empty list totals zero", () => assert.equal(total([]), 0));\ntest("handles discounts without changing the input", () => {\n  const prices = Object.freeze([30, -5, 12]);\n  assert.equal(total(prices), 37);\n});\n';
function create(token,name,options={}){
 const parent=parents.get(token);if(!parent)throw Error('Choose the project location first.');
 validName(name);policy.directory(parent);const target=path.join(parent,name);
 if(fs.existsSync(target))throw Error('A folder with that name already exists. Open it as a project or choose another name.');
 const created=[];fs.mkdirSync(target);
 try{
  const files={'index.js':starter,'totals.cjs':totals,'totals.test.cjs':starterTests,'README.md':'# '+name+'\n\nOpen this folder in Light Table. Edit index.js or totals.cjs, save, and press Ctrl+Shift+Enter to run.\n\nRun → Run file with Node uses real Node APIs. Run → npm scripts → test runs totals.test.cjs with Node\'s test runner; start runs index.js. Save project files before running npm. Native Node and short npm commands have a 30-second limit. Run → Install dependencies allows five minutes; Run → Development server → script allows fifteen minutes. All use the existing Node 24+ installation and project trust. Installation, short commands and development servers have a 1 GiB process-family limit. Run → Stop closes execution and server processes; Stop npm operation closes only the installer/server. Activity displays their output. When a development script prints its HTTP loopback URL, Run → Preview development server opens its saved app in the Browser preview tab with live updates. Closing the preview leaves the server running; Refresh preview reconnects.\n\nUse File → New file in project to add files and Refresh project files to reload the tree. No dependencies need installing for this starter.\n', 'package.json':JSON.stringify({name:name.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'')||'javascript-project',version:'0.1.0',private:true,scripts:{start:'node index.js',test:'node --test totals.test.cjs'}},null,2)+'\n'};
  if(options.empty===true)for(const name of Object.keys(files))delete files[name];
  for(const [file,content] of Object.entries(files)){const p=path.join(target,file);fs.writeFileSync(p,content,{flag:'wx'});created.push(p);}
 }catch(error){for(const p of created)fs.unlinkSync(p);try{fs.rmdirSync(target);}catch(_){}throw error;}
 parents.delete(token);return activate(target);
}
function reopen(input){const p=recents.find(r=>r.toLowerCase()===String(input).toLowerCase());if(!p)throw Error('Choose a project through Open project first.');return activate(p);}
function newFile(name,expectedRoot){
 if(!current)throw Error('Create or open a project first.');
 if(expectedRoot!==undefined){
  const changed='The active project changed in another window. Reopen this project before creating a file.';
  if(typeof expectedRoot!=='string'||expectedRoot.length>1024||expectedRoot.includes('\0')||!path.isAbsolute(expectedRoot))throw Error(changed);
  const expected=path.resolve(expectedRoot),active=path.resolve(current),same=process.platform==='win32'?expected.toLowerCase()===active.toLowerCase():expected===active;
  if(!same)throw Error(changed);
 }
 validName(name);const p=policy.checked(path.join(current,name),true);
 try{fs.writeFileSync(p,'',{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw Error('That file already exists. Choose another name.');throw error;}
 return {path:p,project:identity(current)};
}
load();
module.exports={info,load,chooseParent,create,activate,reopen,newFile,validName,statePath};
