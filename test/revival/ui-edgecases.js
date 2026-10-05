(async()=>{
const results=[];const cm=document.querySelector('.CodeMirror').CodeMirror;
function status(){return document.getElementById('proof-output').dataset.status;}
function check(name,value,details){results.push({name,passed:!!value,details});if(!value)throw Error(name+' failed');}
let resolveOld;cm.setValue('(12 + 30)');const old=ltProofUI.evaluate(source=>new Promise(resolve=>{resolveOld=()=>resolve(ltProof.calculate(source));}));
cm.setValue('(12 + 31)');const latest=await ltProofUI.evaluate();resolveOld();const oldResult=await old;
check('slow old result cannot replace new revision',!oldResult.accepted&&oldResult.reason==='superseded'&&ltProofUI.getLast().result===43&&status()==='current',{old:oldResult.result,new:latest.result});
let release;cm.setValue('1 + 1');const stale=ltProofUI.evaluate(source=>new Promise(resolve=>{release=()=>resolve(ltProof.calculate(source));}));cm.setValue('1 + 2');release();const staleResult=await stale;check('edit while old calculation pending preserves old identity as stale',!staleResult.accepted&&staleResult.reason==='source changed'&&status()==='stale'&&staleResult.result.source==='1 + 1',staleResult);
let releaseCancelled;const cancelled=ltProofUI.evaluate(source=>new Promise(resolve=>{releaseCancelled=()=>resolve(ltProof.calculate(source));}));await new Promise(r=>setTimeout(r,40));testMenuClick('Stop');releaseCancelled();const cancelledResult=await cancelled;check('cancel rejects late result',!cancelledResult.accepted&&status()==='cancelled');
cm.setValue('20 + 22');const a=ltProofUI.evaluate();const b=ltProofUI.evaluate();const runs=await Promise.all([a,b]);check('rapid run/run only latest result applies',!runs[0].accepted&&runs[1].accepted&&ltProofUI.getLast().result===42);
for(const [name,source] of [['syntax error','(1 +'],['numeric runtime error','1 / 0'],['infinite loop rejected','while(true){}'],['promise rejected','Promise.resolve(1)'],['timer rejected','setTimeout(()=>1,0)'],['Node escape rejected','this.constructor.constructor("return process")()'],['filesystem rejected','require("fs").writeFileSync("x","x")'],['network rejected','fetch("https://example.com")'],['prototype mutation rejected','Object.prototype.x=1']]){cm.setValue(source);testMenuClick('Evaluate arithmetic');const r=await ltProofUI.pending();check(name,r.reason==='error'&&status()==='rejected',r.error);cm.setValue('21 * 2');await ltProofUI.evaluate();check(name+' leaves editor responsive',status()==='current'&&ltProofUI.getLast().result===42);}
cm.setValue('7 % 3');const once=await ltProofUI.evaluate();const twice=await ltProofUI.evaluate();check('fresh numeric runs remain independent',once.result.result===1&&twice.result.result===1&&once.result.sha256===twice.result.sha256);
cm.setValue('(12 + 31)');cm.focus();testMenuClick('Save file');testMenuClick('Evaluate arithmetic');await ltProofUI.pending();
return {passed:results.every(r=>r.passed),checks:results.length,results};
})()
