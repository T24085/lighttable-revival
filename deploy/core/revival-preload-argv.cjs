'use strict';
const path=require('node:path');
function normalizeArgv(preload){for(let index=process.execArgv.length-2;index>=0;index--)if(['--require','-r'].includes(process.execArgv[index])&&path.resolve(process.execArgv[index+1]).toLowerCase()===preload.toLowerCase())process.execArgv.splice(index,2);}
module.exports={normalizeArgv};
