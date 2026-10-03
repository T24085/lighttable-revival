(async()=>{
const checks=[];async function value(source,expected){const r=await ltProof.javascript(source);if(r.rendererPid===window.testEditorPID||!r.rendererPid||!r.sandbox||r.nodeIntegration||r.result!==expected||r.source!==source)throw Error('Incorrect result for '+source);checks.push(source);}
await value('let prices=[12,30]; function total(xs){return xs.reduce((a,b)=>a+b,0)}; ({total:total(prices),items:prices.length})','{"total":42,"items":2}');
await value('globalThis.previous=99; previous','99');await value('typeof previous','"undefined"');
await value('[typeof require,typeof process,typeof fetch,typeof Worker,typeof document]','["undefined","undefined","undefined","undefined","undefined"]');
for(const source of ['while(true){}','Promise.resolve(42)','let = ;','(()=>{throw Error("runtime test")})()']){let rejected=false;try{await ltProof.javascript(source)}catch(e){rejected=true;checks.push(e.message)}if(!rejected)throw Error('Expected rejection');await value('6*7','42');}
const cancellation=ltProof.javascript('while(true){}').then(()=>false,()=>true);await new Promise(r=>setTimeout(r,50));ltProof.cancelJavascript();if(!await cancellation)throw Error('Cancel failed');checks.push('Active execution cancelled');
const old=ltProof.javascript('while(true){}').then(()=>false,()=>true);await value('40+2','42');if(!await old)throw Error('Superseded run survived');checks.push('Superseded execution destroyed');
const cm=document.querySelector('.CodeMirror').CodeMirror;cm.setValue('const values=[12,31]; function sum(xs){return xs.reduce((a,b)=>a+b,0)}; sum(values)');await ltProofUI.evaluate(s=>ltProof.javascript(s));if(ltProofUI.getLast().result!=='43')throw Error('Original editor JS integration failed');checks.push('Original editor JavaScript version output');return {passed:true,checks};
})()
