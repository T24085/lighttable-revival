'use strict';
// This trusted gate waits for verified OS job attachment before starting a shell.
const {spawn}=require('child_process'),readline=require('readline');
const input=readline.createInterface({input:process.stdin});let released=false;
input.once('line',line=>{try{const args=JSON.parse(line);if(!args.release||typeof args.command!=='string'||typeof args.cwd!=='string'||typeof args.shell!=='string')throw Error('Invalid release');released=true;input.close();const source="[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);\n"+args.command+"\n$ltAssistantSucceeded=$?; if($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0){exit $LASTEXITCODE}; if(-not $ltAssistantSucceeded){exit 1}";const child=spawn(args.shell,['-NoProfile','-NonInteractive','-Command',source],{cwd:args.cwd,env:process.env,windowsHide:true,stdio:['ignore','inherit','inherit']});child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=Number.isInteger(code)?code:1;});}catch(error){console.error(error.message);process.exitCode=1;input.close();}});
input.once('close',()=>{if(!released)process.exitCode=1;});
