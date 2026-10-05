'use strict';
// Shared setup for the focused wrapper and full original-editor harness.
// Construction writes only a new owned OS temp directory and never grants access.
const fs=require('fs'),path=require('path'),os=require('os');
const inside=(file,root)=>{const relative=path.relative(root,file);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
function asciiJSON(value){return JSON.stringify(value).replace(/[^\x00-\x7f]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));}
function create(){
 const sourceRoot=path.resolve(__dirname,'../..'),tempBase=fs.realpathSync(os.tmpdir()),runtime=path.join(sourceRoot,'.revival');
 const implicitRoots=[path.join(sourceRoot,'deploy'),...['proof-user','test-user','proof-files','test-proof-files'].map(name=>path.join(runtime,name))];
 if(implicitRoots.some(root=>inside(tempBase,root)))throw Error('Startup fixture temp location is inside an implicit proof root');
 const fixtureRoot=fs.mkdtempSync(path.join(tempBase,'lt-open-targets-'));
 if(implicitRoots.some(root=>inside(fixtureRoot,root)))throw Error('Startup fixture must be outside the implicit proof roots');
 const unicode='\u03a9 \ud83d\ude00',entry=path.join(fixtureRoot,'startup '+unicode+' answer.js'),missing=path.join(fixtureRoot,'new startup file.js'),directory=path.join(fixtureRoot,'workspace folder');
 fs.mkdirSync(directory);
 const files=[
  [entry,'// Original startup '+unicode+"\r\nconsole.log('Startup selected');\r\n21 * 2;\r\n"],
  [path.join(fixtureRoot,'queued before ready.js'),'// Queued before renderer initialization\r\n40 + 2;\r\n'],
  [path.join(fixtureRoot,'later response.mjs'),'21 * 3;\r\n'],
  [path.join(fixtureRoot,'sibling.js'),'throw Error("Sibling was not selected");'],
  [path.join(fixtureRoot,'notes2026'),'Numeric filename remains whole.'],
  [path.join(fixtureRoot,'second window.js'),'// Target for focused second original window\r\n42;\r\n'],
  [path.join(fixtureRoot,'survivor window.js'),'// Delivered after first original window closes\r\n63;\r\n'],
  [path.join(directory,'folder-only.txt'),'Original workspace folder is visible.']
 ];
 for(const [file,source] of files)fs.writeFileSync(file,source,'utf8');
 const linkTarget=path.join(fixtureRoot,'link-target'),link=path.join(fixtureRoot,'link');fs.mkdirSync(linkTarget);
 fs.writeFileSync(path.join(linkTarget,'blocked.js'),'throw Error("Linked target must remain refused");','utf8');
 fs.symlinkSync(linkTarget,link,process.platform==='win32'?'junction':'dir');
 return {fixtureRoot,entry,missing,directory,link,arguments:[directory,missing,entry+':2',entry+':2','--enable-logging']};
}
module.exports={create,asciiJSON};
if(require.main===module){
 if(process.argv.length!==2)throw Error('The startup fixture factory takes no arguments');
 process.stdout.write(asciiJSON(create())+'\n');
}
