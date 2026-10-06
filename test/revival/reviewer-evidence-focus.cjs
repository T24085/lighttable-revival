"use strict";
const assert=require('node:assert/strict'),{collect}=require('../../deploy/core/revival-reviewer-evidence.cjs');
const checks=[];
function fixture({failDom=false,failRestore=false,abort}={}){
 const calls=[],status={id:'fixture',project:{files:[]}},wc={isDestroyed:()=>false,debugger:{sendCommand:async(method,args={})=>{
  calls.push({method,...args});
  if(method==='Emulation.clearDeviceMetricsOverride'&&failRestore)throw Error('Viewport restore failed');
  if(method!=='Runtime.evaluate')return {};
  const source=args.expression;let value;
  if(source==='({x:scrollX,y:scrollY})')value={x:14,y:29};
  else if(source.includes('const elements=')){if(failDom)throw Error('DOM capture failed');value={text:'Counter',elements:[]};}
  else if(source.includes('frames:f.length'))value={sampleMs:50,frames:10,focusEmulated:true};
  else if(source.includes('s.tick=t=>'))abort?.abort(Error('Stopped during measurement'));
  return {result:{value}};
 }}};
 return {calls,wc,status,current:async()=>true};
}
async function check(name,fn){await fn();checks.push(name);}
(async()=>{
 await check('Successful collection restores focus override, viewport and scroll after both measured viewports',async()=>{const f=fixture(),e=await collect({...f,sampleMs:0});assert.equal(e.viewports.length,2);assert(e.viewports.every(v=>v.performance.focusEmulated));assert.deepEqual(f.calls.filter(c=>c.method==='Emulation.setFocusEmulationEnabled').map(c=>c.enabled),[true,false]);assert(f.calls.some(c=>c.expression==='scrollTo(14,29)'));assert(f.calls.some(c=>c.method==='Emulation.clearDeviceMetricsOverride'));});
 await check('Stop during actual sampling cleanup releases the animation observer and focus override',async()=>{const abort=new AbortController(),f=fixture({abort});await assert.rejects(collect({...f,sampleMs:1000,signal:abort.signal}));assert(f.calls.some(c=>c.expression?.includes('cancelAnimationFrame')));assert.equal(f.calls.filter(c=>c.method==='Emulation.setFocusEmulationEnabled').at(-1).enabled,false);assert(f.calls.some(c=>c.expression==='scrollTo(14,29)'));});
 await check('A DOM capture error restores the measurement conditions without returning false evidence',async()=>{const f=fixture({failDom:true});await assert.rejects(collect({...f,sampleMs:0}),/DOM capture failed/);assert.equal(f.calls.filter(c=>c.method==='Emulation.setFocusEmulationEnabled').at(-1).enabled,false);});
 await check('Focus cleanup still runs when restoring viewport metrics fails',async()=>{const f=fixture({failRestore:true});await assert.rejects(collect({...f,sampleMs:0}),/Viewport restore failed/);assert.equal(f.calls.filter(c=>c.method==='Emulation.setFocusEmulationEnabled').at(-1).enabled,false);});
 console.log(JSON.stringify({passed:true,checks},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
