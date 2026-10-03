'use strict';
window.ltProofUI=(()=>{
let cm=null,last=null,revision=0,runId=0,pending=Promise.resolve();const panel=document.createElement('aside');panel.id='proof-calculation';panel.style.cssText='position:fixed;right:0;top:40px;bottom:20px;width:310px;padding:22px;box-sizing:border-box;background:#202526;color:#e5ece8;border-left:1px solid #4a5550;z-index:25;font:14px/1.6 Consolas,monospace';
const title=document.createElement('h3');title.textContent='REVIVAL / CALCULATION';title.style.cssText='font:13px Arial;letter-spacing:2px;color:#9cb9ae';panel.append(title);
const scope=document.createElement('p');scope.textContent='Run numeric arithmetic or synchronous JavaScript. Every run starts fresh. Async results are unsupported.';scope.style.color='#a7b4ae';panel.append(scope);
const controls=document.createElement('div');panel.append(controls);
const output=document.createElement('div');output.id='proof-output';output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin-top:25px';output.textContent='Open calculation.js to begin.';panel.append(output);
function editor(){return [...document.querySelectorAll('.CodeMirror')].map(e=>e.CodeMirror).find(c=>c&&c.getWrapperElement().getBoundingClientRect().height>0);}
function connect(){const next=editor();if(next&&next!==cm){cm=next;cm.on('change',()=>{revision++;if(last){output.textContent='STALE — code changed\n\nLast result: '+last.result+'\nSource: '+last.source+'\nSHA-256:\n'+last.sha256;output.dataset.status='stale';}});}}
function command(name){lt.objs.command.exec_BANG_(cljs.core.keyword(name));}
function button(id,label,fn){const el=document.createElement('button');el.id=id;el.textContent=label;el.style.cssText='background:#34473e;border:1px solid #729483;color:#edf7f1;border-radius:3px;padding:7px 10px;margin:3px 5px 3px 0;cursor:pointer';el.onclick=()=>{try{fn();}catch(e){output.textContent=e.message;output.dataset.status='rejected';}};controls.append(el);}
button('proof-open','Open proof',()=>{command('open-file');connect();if(cm){cm.focus();output.textContent='calculation.js opened. Ready to calculate.';}});
button('proof-save','Save',()=>{connect();if(!cm)throw Error('Open the proof first');cm.focus();command('save');output.textContent=(last?'Saved. Last result remains tied to its source hash.\n\n'+output.textContent:'File saved.');});
function evaluate(transport=source=>window.ltProof.calculate(source)){
connect();if(!cm)return Promise.reject(Error('Open the proof first'));
const source=cm.getValue(),version=revision,id=++runId;
output.dataset.status='running';output.textContent='Calculating this code version…';
pending=(async()=>{try{const result=await transport(source);if(id!==runId)return {accepted:false,reason:'superseded',result};if(version!==revision||source!==cm.getValue()){output.dataset.status='stale';output.textContent='STALE — calculation belongs to previous code\n\nSource: '+result.source+'\nResult: '+result.result+'\nSHA-256:\n'+result.sha256;return {accepted:false,reason:'source changed',result};}last=result;output.dataset.status='current';output.textContent='RESULT  '+last.result+'\n\nSource:\n'+last.source+'\n\nSHA-256:\n'+last.sha256+'\n\nCurrent code version verified.';return {accepted:true,result};}catch(error){if(id===runId){output.dataset.status='rejected';output.textContent='Calculation rejected: '+error.message;}return {accepted:false,reason:'error',error:error.message};}})();return pending;
}
button('proof-evaluate','Run calculation',()=>evaluate());
button('proof-javascript','Run JavaScript',()=>evaluate(source=>window.ltProof.javascript(source)));
button('proof-cancel','Cancel',()=>{runId++;window.ltProof.cancelJavascript();output.dataset.status='cancelled';output.textContent='Pending result cancelled. Editor remains available.';});
return {initialize(){document.body.append(panel);const style=document.createElement('style');style.textContent='#canvas{right:310px !important} .CodeMirror{max-width:calc(100vw - 310px)}';document.head.append(style);},connect,getLast:()=>last,evaluate,pending:()=>pending};
})();