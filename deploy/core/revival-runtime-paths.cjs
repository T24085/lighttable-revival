'use strict';
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'../..');
function toolchain(){
 if(process.env.LT_TOOLCHAIN_ROOT)return path.resolve(process.env.LT_TOOLCHAIN_ROOT);
 const local=path.join(source,'.revival/toolchain');
 return fs.existsSync(local)?local:path.resolve(source,'../toolchain');
}
function powershell(){
 const candidates=[process.env.LT_POWERSHELL_EXECUTABLE,path.join(toolchain(),'powershell/pwsh.exe'),path.join(process.env.ProgramFiles||'C:/Program Files','PowerShell/7/pwsh.exe')];
 for(const candidate of candidates)if(candidate&&path.isAbsolute(candidate))try{if(fs.statSync(candidate).isFile())return candidate;}catch(_){}
 throw Error('PowerShell 7 was not found. Install it, provide the portable toolchain, or set LT_POWERSHELL_EXECUTABLE.');
}
module.exports={toolchain,powershell};
