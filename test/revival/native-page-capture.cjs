'use strict';
const assert=require('assert/strict');
// Hidden native views can briefly reject bitmap observation after a resize.
// Retry that compositor error only, using the same WebContents throughout.
async function captureNativePage(contents){
 for(let attempt=1;attempt<=3;attempt++){
  let pixels;
  try{pixels=await contents.capturePage();}
  catch(error){
   if(!String(error?.message||error).includes('UnknownVizError')||attempt===3)throw error;
   await new Promise(resolve=>setTimeout(resolve,150));continue;
  }
  assert(pixels&&!pixels.isEmpty(),'Empty actual native-page screenshot');
  return pixels;
 }
}
// The original editor can send one pending panel bounds update after a test
// requests a full-size preview. Observe actual viewport, view and compositor
// geometry on the same renderer rather than accepting or resizing old pixels.
async function capturePreviewPage(preview,owner,{width=900,height=600,deadlineMs=8000}={}){
 assert(Number.isInteger(width)&&width>0&&width<=1800&&Number.isInteger(height)&&height>0&&height<=1800);
 assert(Number.isInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=8000);
 const view=preview.view(owner),contents=view.webContents,pid=contents.getOSProcessId(),attempts=[],deadline=Date.now()+deadlineMs;
 assert(pid>0,'Preview capture requires the existing native renderer');
 do{
  assert.equal(preview.view(owner),view,'Preview capture changed native view');
  assert.equal(contents.getOSProcessId(),pid,'Preview capture changed renderer');
  preview.bounds(owner,{x:0,y:0,width,height,visible:true});
  // Animation frames can pause in hidden previews. Waiting inside an evaluated
  // Promise consumes the user's execution budget and can stop the preview.
  // Observe its real compositor pixels after a bounded host-side delay instead.
  await new Promise(resolve=>setTimeout(resolve,150));
  const image=await captureNativePage(contents),size=image.getSize(),viewport=JSON.parse((await preview.evaluate(owner,'({width:innerWidth,height:innerHeight})')).result),bounds=view.getBounds();
  attempts.push({size,viewport,bounds,pid:contents.getOSProcessId()});
  assert.equal(preview.view(owner),view);assert.equal(contents.getOSProcessId(),pid);
  if([size,viewport,bounds].every(value=>value.width===width&&value.height===height))return {image,observations:{passed:true,webContentsId:contents.id,pid,deadlineMs,attempts}};
 }while(Date.now()<deadline);
 throw Error('Native preview viewport/frame did not reach the requested size: '+JSON.stringify({width,height,attempts}));
}
module.exports={captureNativePage,capturePreviewPage};
