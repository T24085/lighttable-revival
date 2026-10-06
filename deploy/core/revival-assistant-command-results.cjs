'use strict';
const fs=require('node:fs'),path=require('node:path');
const vite=/^\s*(?:npm(?:\.cmd)?\s+(?:create|init)\s+(?:(?:--yes|-y)\s+)?vite(?:@[^\s]+)?|npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?create-vite(?:@[^\s]+)?)(?:\s|$)/im;
const tailwind=/^\s*npx(?:\.cmd)?\s+(?:(?:--yes|-y)\s+)?tailwindcss(?:@[^\s]+)?\s+init(?:\s|$)/im;
const clean=value=>String(value||'').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'');
function major(cwd){
 try{return Number(JSON.parse(fs.readFileSync(path.join(cwd,'node_modules/tailwindcss/package.json'),'utf8')).version.split('.')[0]);}catch(_){return null;}
}
function preflight(command){
 if(vite.test(command)&&!/(?:^|\s)--no-interactive(?:\s|$)/.test(command)){
  const error=Error('Vite scaffolding needs --no-interactive because assistant commands cannot answer terminal prompts. Use an empty directory and an explicit template, then verify package.json and index.html were created. Do not overwrite an existing project to bypass a prompt.');
  error.code='LT_VITE_INTERACTIVE';throw error;
 }
}
function outcome(command,cwd,{exitCode,stdout,stderr}){
 const output=clean(stdout)+'\n'+clean(stderr);
 if(vite.test(command)&&/^\s*[—-]?\s*Operation cancel(?:l)?ed\.?\s*$/im.test(output))return {code:'LT_VITE_CANCELLED',error:'Vite cancelled without creating the project, even though it returned exit code 0. Inspect the target directory. Use --no-interactive in an empty directory, or add the missing project files with file tools. Do not repeat this scaffolding command or remove existing files.'};
 if(exitCode!==0&&tailwind.test(command)&&major(cwd)>=4)return {code:'LT_TAILWIND_SETUP',error:'Installed Tailwind CSS v4 has no tailwindcss init command. For Vite, install @tailwindcss/vite, add its plugin to vite.config, and import "tailwindcss" in the stylesheet. For the CLI use @tailwindcss/cli. Inspect package.json and the installed version before configuring; do not retry init with different flags.'};
 if(exitCode!==0&&/The term 'touch' is not recognized/i.test(output))return {code:'LT_WINDOWS_SHELL',error:'Commands run in PowerShell on Windows; Bash touch is unavailable. Use write_file to create source files directly and create_directory for folders. Existing files must be read before replacing them.'};
 return null;
}
function failureKey(name,args,value){
 if(name==='run_command'&&value.code?.startsWith('LT_'))return JSON.stringify([name,args?.cwd||'.',value.code]);
 const normalized=name==='run_command'?{...args,command:String(args?.command||'').replace(/\r\n/g,'\n').trim()}:args;
 return JSON.stringify([name,normalized,value.error]);
}
module.exports={preflight,outcome,failureKey};
