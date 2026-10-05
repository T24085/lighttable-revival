'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const core=path.resolve(__dirname,'../../deploy/core'),runtime=path.resolve(__dirname,'../../.revival');
const shell=require(path.join(core,'node_modules/shelljs'));
const tar=require(path.join(core,'node_modules/tar'));
const {Server}=require(path.join(core,'node_modules/socket.io'));
const manifest=require(path.join(core,'package.json'));
(async()=>{
 const checks=[];
 fs.mkdirSync(runtime,{recursive:true});
 const root=fs.mkdtempSync(path.join(runtime,'dependency-smoke-'));
 const input=path.join(root,'input'),output=path.join(root,'output');
 assert.equal(shell.mkdir('-p',input,output).code,0);checks.push('CommonJS shell filesystem API');
 fs.writeFileSync(path.join(input,'sample.txt'),'43');
 assert.equal(shell.test('-f',path.join(input,'sample.txt')),true);
 assert.deepEqual([...shell.ls(input)],['sample.txt']);checks.push('Existing shell test/list semantics');
 assert.equal(String(shell.which(process.execPath)).toLowerCase(),process.execPath.toLowerCase());checks.push('Executable lookup API');
 const archive=path.join(root,'sample.tar.gz');
 await tar.c({file:archive,cwd:input,gzip:true},['sample.txt']);
 await tar.x({file:archive,cwd:output,strict:true,preservePaths:false});
 assert.equal(fs.readFileSync(path.join(output,'sample.txt'),'utf8'),'43');checks.push('Modern gzip archive create/extract API');
 const http=require('http').createServer(),server=new Server(http,{serveClient:false});
 try{
  await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(0,'127.0.0.1',resolve);});
  assert.equal(http.address().address,'127.0.0.1');assert.ok(http.address().port>0);
  assert.equal(typeof server.sockets.on,'function');checks.push('Modern Socket.IO server can bind an isolated loopback port');
 }finally{await new Promise(resolve=>server.close(resolve));}
 assert.equal(http.listening,false);checks.push('Socket.IO server and test listener are released');
 assert.equal(manifest.dependencies.request,undefined);assert.equal(manifest.dependencies.replace,undefined);
 checks.push('Unused deprecated HTTP/replacement packages are absent');
 process.stdout.write(JSON.stringify({passed:true,checks:checks.length,versions:{shelljs:manifest.dependencies.shelljs,socketIO:manifest.dependencies['socket.io'],tar:manifest.dependencies.tar}})+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
