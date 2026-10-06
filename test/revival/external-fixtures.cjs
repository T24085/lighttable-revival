'use strict';
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),readline=require('readline'),memory=require('../../deploy/core/proof-memory.cjs');
async function gate(executable,args,options,limitBytes){
 const child=spawn(executable,args,{...options,windowsHide:true,stdio:['pipe','pipe','pipe']});let quota,errors='';const reader=readline.createInterface({input:child.stdout});child.stderr.on('data',chunk=>errors=(errors+chunk.toString()).slice(-4096));
 let timer;const ready=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('External fixture startup timed out: '+errors)),20000);reader.on('line',line=>{try{resolve(JSON.parse(line));}catch(_){}});child.on('error',reject);child.on('exit',()=>reject(Error('Fixture exited: '+errors)));});ready.catch(()=>{});
 const stop=async()=>{clearTimeout(timer);reader.close();if(quota)await quota.release();else{child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(resolve,2000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}};
 try{quota=await memory.attach(child.pid,[],executable,{limitBytes});child.stdin.write('start\n');const info=await ready;clearTimeout(timer);return {child,info,quota,stop,diagnostics:()=>({pid:child.pid,exitCode:child.exitCode,errors})};}catch(error){await stop();throw error;}
}
async function start(root){
 const toolchain=require('../../deploy/core/revival-runtime-paths.cjs').toolchain(),java=require('../../deploy/core/revival-languages.cjs').info().clojure.executable,python=fs.realpathSync(path.join(toolchain,'repl-python/Scripts/python.exe'));
 const jars=[['org/clojure/clojure','1.10.3','clojure'],['org/clojure/spec.alpha','0.2.194','spec.alpha'],['org/clojure/core.specs.alpha','0.2.56','core.specs.alpha'],['nrepl/nrepl','1.0.0','nrepl']].map(([dir,version,name])=>path.join(toolchain,'m2',dir,version,name+'-'+version+'.jar'));
 const clj=path.join(root,'fixture-server.clj'),py=path.join(root,'fixture-kernel.py'),connectionFile=path.join(root,'kernel.json');
 fs.writeFileSync(clj,'(require \'[nrepl.server :as server])\n(read-line)\n(let [s (server/start-server :bind "127.0.0.1" :port 0)] (println (str "{\\\"port\\\":" (:port s) "}")) (flush))\n(while true (Thread/sleep 1000))');
 fs.writeFileSync(py,'import sys,json,time\nsys.stdin.readline()\nfrom jupyter_client import KernelManager\nmanager=KernelManager(connection_file='+JSON.stringify(connectionFile)+')\nmanager.kernel_spec.argv=[sys.executable,"-m","ipykernel_launcher","-f","{connection_file}"]\nmanager.start_kernel()\nmanager.write_connection_file()\nprint(json.dumps({"connectionFile":manager.connection_file}),flush=True)\nfor action in sys.stdin:\n    if action.strip()=="interrupt":\n        manager.interrupt_kernel()\n        print(json.dumps({"interrupted":True}),flush=True)\n');
 let nrepl,kernel;try{nrepl=await gate(java,['-Xmx48m','-Xss256k','-XX:MaxMetaspaceSize=48m','-XX:ReservedCodeCacheSize=16m','-XX:CompressedClassSpaceSize=16m','-cp',jars.join(path.delimiter),'clojure.main',clj],{cwd:root},384*1024*1024);kernel=await gate(python,['-I','-u',py],{cwd:root},512*1024*1024);return {nrepl,kernel,connectionFile,stop:async()=>{await kernel.stop();await nrepl.stop();}};}catch(error){if(kernel)await kernel.stop();if(nrepl)await nrepl.stop();throw error;}
}
module.exports={start};
