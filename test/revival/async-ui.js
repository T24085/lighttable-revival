(async()=>{
const checks=[];const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);console.info('Revival async check: '+name);};
async function value(source,expected){const r=await ltProof.javascript(source);check('Result: '+source,r.result===expected&&r.source===source&&r.sha256.length===64);return r;}
async function rejected(source,fragment){let error='';try{await ltProof.javascript(source)}catch(e){error=e.message}check('Rejected: '+fragment,error.includes(fragment));await value('6*7','42');}
await value('(async()=>{const a=await Promise.resolve(12);const b=await new Promise(r=>setTimeout(()=>r(31),30));return {sum:a+b,values:[a,b]}})()','{"sum":43,"values":[12,31]}');
await rejected('const huge=new Uint8Array(1536*1024*1024);huge.fill(1);new Promise(()=>{})','Array buffer allocation failed');
await rejected('Promise.resolve().then(()=>{while(true){}})','Execution exceeded');
await rejected('new Promise(()=>{})','Execution exceeded');
await rejected('Promise.reject(Error("async error"))','async error');
await rejected('new Promise(()=>setTimeout(()=>{throw Error("timer error")},10))','timer error');
await rejected('new Promise(r=>setTimeout(r,501))','Timer delay');
await rejected('for(let i=0;i<33;i++)setTimeout(()=>{},500)','Timer budget');
await rejected('setTimeout("40+2",10)','callback must be');
await rejected('"x".repeat(16385)','Output exceeds');
await rejected('x'.repeat(16385),'Source exceeds');
await value('let fired=0;const handle=setTimeout(()=>fired++,1);clearTimeout(handle);new Promise(r=>setTimeout(()=>r(fired),30))','0');
await rejected('const p=Object.getPrototypeOf(self);p.setTimeout.call(self,()=>{},501)','Timer delay');
await rejected('Map.prototype.set=()=>{};for(let i=0;i<33;i++)setTimeout(()=>{},500)','Timer budget');
await value('[typeof fetch,typeof XMLHttpRequest,typeof WebSocket,typeof require,typeof process,typeof document,typeof Worker,typeof setInterval]','["undefined","undefined","undefined","undefined","undefined","undefined","undefined","undefined"]');
const cm=document.querySelector('.CodeMirror').CodeMirror,source='new Promise(r=>setTimeout(()=>r(43),300))';
cm.setValue(source);const changed=ltProofUI.evaluate(s=>ltProof.javascript(s));await new Promise(r=>setTimeout(r,80));cm.setValue('44');const changedResult=await changed;check('Actual async edit preserves stale source/hash',!changedResult.accepted&&changedResult.reason==='source changed'&&changedResult.result.source===source&&document.getElementById('proof-output').dataset.status==='stale');
cm.setValue('new Promise(()=>{})');const cancelled=ltProofUI.evaluate(s=>ltProof.javascript(s));await new Promise(r=>setTimeout(r,80));testMenuClick('Stop');await cancelled;check('Actual async cancellation UI',document.getElementById('proof-output').dataset.status==='cancelled');
cm.setValue('new Promise(r=>setTimeout(()=>r(1),400))');const first=ltProofUI.evaluate(s=>ltProof.javascript(s));await new Promise(r=>setTimeout(r,80));cm.setValue('Promise.resolve(43)');const second=await ltProofUI.evaluate(s=>ltProof.javascript(s));await first;check('Actual async supersede cannot overwrite newest',second.accepted&&ltProofUI.getLast().result==='43'&&ltProofUI.getLast().source==='Promise.resolve(43)');
cm.setValue('(async () => {\n  const values = await new Promise(resolve =>\n    setTimeout(() => resolve([12, 31]), 30)\n  );\n  return values.reduce((sum, value) => sum + value, 0);\n})()');await ltProofUI.evaluate(s=>ltProof.javascript(s));check('Async result displayed beside original editor',ltProofUI.getLast().result==='43'&&document.getElementById('proof-output').dataset.status==='current');
return {passed:true,checks};
})()
