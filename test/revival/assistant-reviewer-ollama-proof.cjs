'use strict';
// Explicit integration proof: real composer, coding tools, browser and Ollama decisions.
// Never downloads weights or changes the user's normal assistant profile.
process.env.LT_REVIVAL_TEST='1';process.env.LT_REVIVAL_AUTO_LIVE='0';
const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=path.resolve(__dirname,'../../deploy/core'),policy=require(core+'/proof-policy.cjs'),projects=require(core+'/revival-projects.cjs');
const model=process.env.LT_ASSISTANT_PROOF_MODEL||'ornith-1.5:9b',reviewer=process.env.LT_REVIEWER_PROOF_MODEL||'tev1:4b';
const base=path.join(policy.root,'assistant-real-fixtures'),root=path.join(base,crypto.randomUUID()),project=path.join(root,'reviewed-counter');
assert(path.dirname(root)===base);fs.mkdirSync(project,{recursive:true});
fs.writeFileSync(path.join(project,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px;font:18px Arial;background:#eef2ed;color:#17271d}main{width:640px;padding:24px;background:white}button{padding:12px}output{display:block;margin:16px}</style></head><body><main><h1>Counter</h1><output id="count">0</output><button id="increment">Add</button></main><script src="app.js"></script></body></html>');
fs.writeFileSync(path.join(project,'app.js'),'function increment(n){return n+1;}\nif(typeof module!=="undefined")module.exports={increment};\nif(typeof document!=="undefined")document.getElementById("increment").onclick=()=>{const count=document.getElementById("count");count.textContent=increment(Number(count.textContent));};\n');
fs.writeFileSync(path.join(project,'counter.test.cjs'),'const {test}=require("node:test"),assert=require("node:assert/strict"),{increment}=require("./app.js");test("adds one",()=>assert.equal(increment(0),1));\n');
function tree(dir){const files=new Map();function visit(d){if(!fs.existsSync(d))return;for(const name of fs.readdirSync(d)){const f=path.join(d,name),s=fs.lstatSync(f);assert(!s.isSymbolicLink());if(s.isDirectory())visit(f);else files.set(f,fs.readFileSync(f));}}visit(dir);return files;}
const before=fs.existsSync(projects.statePath)?fs.readFileSync(projects.statePath):null;
const snapshots=['ltcache','assistant'].map(name=>{const dir=path.join(policy.user,name);return {dir,files:tree(dir)};});projects.activate(project);
const file=path.join(policy.root,'assistant-reviewer-ollama-result.json'),result={passed:false,simulated:false,model,reviewer,project,startedAt:new Date().toISOString(),transport:[],checks:[]};
let backend,host,ending=false,seen=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms)),save=()=>fs.writeFileSync(file,JSON.stringify(result,null,2));
// Observe the production transport without replacing model responses or evidence.
const ollama=require(core+'/revival-assistant-ollama.cjs'),create=ollama.create;
ollama.create=(...args)=>{const client=create(...args);for(const operation of ['chat','decision','unload']){const original=client[operation];client[operation]=async(...inputs)=>{const body=inputs[0],row={operation,model:typeof body==='string'?body:body.model,startedAt:new Date().toISOString()};if(operation==='decision'){row.state=body.state;row.questionKeys=Object.keys(body.questions);row.imageCount=body.images?.length||0;row.payloadBytes=Buffer.byteLength(JSON.stringify(body));}result.transport.push(row);save();const started=Date.now();try{const reply=await original(...inputs);row.latencyMs=Date.now()-started;if(operation==='decision'){row.answers=reply.answers;row.usage=reply.usage;}if(operation==='chat'){row.tools=reply.message.tool_calls?.map(c=>c.function.name)||[];row.receipt=reply.receipt;}return reply;}catch(error){row.error=error.message;throw error;}finally{save();}};}return client;};
const deadline=setTimeout(()=>finish(Error('Real coding and review proof exceeded 30 minutes')),1800000);
async function finish(error){if(ending)return;ending=true;clearTimeout(deadline);if(error)result.error=error.stack;try{
 if(backend?.assistant.runtime.state())result.conversation=backend.assistant.runtime.load(backend.assistant.runtime.state().sessionId);
 result.generatedFiles=[...tree(project)].map(([f,bytes])=>({path:path.relative(project,f),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),content:bytes.toString('utf8')}));
 await backend?.assistant.shutdown();for(const name of ['revival-languages.cjs','revival-preview.cjs','revival-npm.cjs','revival-node.cjs','proof-js.cjs'])await require(core+'/'+name).shutdown();await require(core+'/proof-memory.cjs').stop();
 if(before)fs.writeFileSync(projects.statePath,before);else if(fs.existsSync(projects.statePath))fs.unlinkSync(projects.statePath);
 for(const {dir,files}of snapshots){for(const f of tree(dir).keys())if(!files.has(f))fs.unlinkSync(f);for(const [f,bytes]of files){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes);}}
 assert(fs.realpathSync(root)===root&&path.dirname(root)===base);fs.rmSync(root,{recursive:true});
 result.cleanup={...backend.assistant.diagnostics(),...require(core+'/proof-memory.cjs').status(),projectRestored:before?fs.readFileSync(projects.statePath).equals(before):!fs.existsSync(projects.statePath),removed:!fs.existsSync(root)};
 result.passed=!error&&result.cleanup.active===0&&result.cleanup.commands===0&&!result.cleanup.helperPid;
 }catch(e){result.cleanupError=e.stack;}result.completedAt=new Date().toISOString();save();console.error(JSON.stringify({passed:result.passed,status:result.state,checks:result.checks,error:result.error,cleanupError:result.cleanupError}));app.exit(result.passed?0:1);}
app.on('browser-window-created',(_event,window)=>{if(seen)return;seen=true;host=window;host.setOpacity(.01);host.setSkipTaskbar(true);host.showInactive();host.setSize(1440,900);host.webContents.once('did-finish-load',()=>setTimeout(async()=>{const ui=source=>host.webContents.executeJavaScript(source),until=async predicate=>{while(!await predicate()){if(ending)throw Error('Proof ended');await sleep(100);}},check=(name,condition)=>{assert(condition,name);result.checks.push(name);console.error(name);save();};try{
 host.unmaximize();host.setBounds({x:40,y:40,width:1440,height:900});host.showInactive();
 await until(()=>ui('!!document.getElementById("assistant-dock")'));await ui('ltProjects.openedFolder('+JSON.stringify(projects.info().current)+');ltAssistantUI.action("models")');await ui('ltReviewerUI.refresh()');await ui('ltAssistantUI.action("new")');
 check('The installed coding model is available in the actual composer',await ui('Array.from(document.getElementById("assistant-model").options).some(o=>o.value==='+JSON.stringify(model)+')'));
 check('Review has no per-task selector or Off option',await ui('!document.getElementById("assistant-review-task")'));
 // Explicit test model in the isolated profile; ordinary UI picks automatically.
 await ui('ltAssistant.invoke("settings",{reviewerModel:'+JSON.stringify(reviewer)+'}).then(s=>ltReviewerUI.apply(s));document.getElementById("assistant-model").value='+JSON.stringify(model)+';void 0');await ui('ltReviewerUI.refresh()');
 check('The actual task requires independent review without an opt-in',await ui('ltReviewerUI.taskOptions().then(o=>o.reviewAndImprove)'));
 const prompt='Update this existing counter. Change its heading to Run Verified Counter and make increment(n) add 2. Update counter.test.cjs to test 0 -> 2 and 40 -> 42. Keep the current design. Read current files before editing and save using file tools. Open index.html and start its live preview before running node --test counter.test.cjs. Verify the button interaction using check_preview on both desktop and mobile: clicking Add increases the displayed count by 2. Inspect the actual running preview. Finish when the counter works at both sizes and applicable tests pass.';
 result.prompt=prompt;await ui('document.getElementById("assistant-input").value='+JSON.stringify(prompt)+';ltAssistantUI.send()');await until(()=>backend.assistant.runtime.activeCount()===0);
 result.state=backend.assistant.runtime.state();const session=backend.assistant.runtime.load(result.state.sessionId);result.conversation=session;save();
 check('The real coding model saved journaled changes',session.journal.some(e=>e.status==='saved')&&fs.readFileSync(path.join(project,'app.js'),'utf8').includes('2'));
 check('The actual run reached a persisted reviewer report',session.reviewReports?.length>0);
 const reports=session.reviewReports,decisions=result.transport.filter(t=>t.operation==='decision'&&!t.error);
 check('Real System One requests include desktop and mobile evidence',decisions.some(t=>t.state.current.name==='desktop')&&decisions.some(t=>t.state.current.name==='mobile'));
 check('Tev1 received structured evidence with no images',decisions.every(t=>t.model===reviewer&&t.imageCount===0&&t.payloadBytes<=6000));
 check('Coding runner was released before reviewer inference',result.transport.findIndex(t=>t.operation==='unload'&&t.model===model)<result.transport.findIndex(t=>t.operation==='decision'));
 result.reportSummary=reports.map(r=>({status:r.status,findings:r.findings,uncertain:r.uncertain,unverified:r.unverified,tests:r.tests,behavior:r.behavior,results:r.results}));
 result.questions=session.events.filter(e=>e.type==='question');result.correctionRounds=session.messages.filter(m=>m.content?.startsWith('Correction round ')).length;
 result.ui=await ui('({status:document.getElementById("assistant-status")?.textContent,reports:Array.from(document.querySelectorAll("#assistant-history details")).map(d=>({summary:d.querySelector("summary")?.textContent,open:d.open})).filter(d=>d.summary?.startsWith("Review")),reviewerSelectorPresent:!!document.getElementById("assistant-review-task")})');
 const picture=await host.webContents.capturePage();result.screenshot=path.join(policy.root,'assistant-reviewer-ollama.png');fs.writeFileSync(result.screenshot,picture.toPNG());
 check('Report labels structured checks and leaves image appearance unverified',reports.every(r=>r.structuredChecksCompleted&&!r.imageReviewCompleted&&r.unverified.includes('Image appearance was not assessed')));
 // A genuine uncertainty pause is a valid invocation proof, not a successful correction.
 result.workflowPassed=result.state.status==='completed'&&reports.at(-1).status==='passed';await finish();
 }catch(error){await finish(error);}},800));});backend=require(core+'/main.js');
