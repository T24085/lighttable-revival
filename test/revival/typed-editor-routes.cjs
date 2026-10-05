'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),acorn=require('../../deploy/core/node_modules/acorn');
const checks=[];
function declaration(file,name){const source=fs.readFileSync(path.join(__dirname,'../../deploy/core',file),'utf8'),pending=[acorn.parse(source,{ecmaVersion:'latest'})];while(pending.length){const node=pending.pop();if(!node||typeof node!=='object')continue;if(node.type==='FunctionDeclaration'&&node.id.name===name)return source.slice(node.start,node.end);for(const value of Object.values(node)){if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(value);}}throw Error('Missing production function '+name);}
const grammar=declaration('proof-ui.js','sourceLoader'),evaluate=declaration('revival-preview.js','evaluateSelection');
function selection(){
 let resolve,reject,loader='tsx';const transport=new Promise((ok,failed)=>{resolve=ok;reject=failed;}),editor={source:'typedDouble(21) as number',getValue(){return this.source;},getSelection(){return this.source;},getLine(){return this.source;},getCursor(){return {line:3,ch:9};},somethingSelected(){return true;}},calls=[],object={};
 const context={current:{id:'original',status:'running',stale:false,errors:[]},revision:1,autoReloading:null,pending:null,editor:()=>object,info:()=>({path:'E:\\fixture\\syntax.js'}),lt:{objs:{editor:{__GT_cm_ed:()=>editor}}},ltProofUI:{sourceLoader:()=>loader},window:{ltBrowserPreview:{evaluate(source,options){calls.push({source,options});return transport;}}},syncWatches(){},render(){},failure(error){throw error;}};
 vm.runInNewContext(evaluate+';globalThis.start=evaluateSelection;',context);return {context,editor,calls,resolve,reject,start:context.start,setLoader(value){loader=value;}};
}
(async()=>{let result;try{
 const context={documentInfo:object=>object,originalEditor:()=>null};vm.runInNewContext(grammar+';globalThis.loader=sourceLoader;',context);
 for(const [filename,mime,expected]of [['source.js','text/typescript-jsx','tsx'],['source.tsx','text/javascript','js'],['source.jsx','text/typescript','ts'],['SOURCE.MTS','plaintext','ts']])assert.equal(context.loader({path:filename,mime}),expected);
 checks.push('Editor-selected grammar takes precedence over its saved extension in both directions');
 let fixture=selection(),pending=fixture.start();assert.equal(fixture.calls[0].options.loader,'tsx');assert.equal(fixture.calls[0].options.bufferSource,fixture.editor.source);assert.equal(fixture.calls[0].options.lineOffset,3);assert.equal(fixture.calls[0].options.columnOffset,9);fixture.resolve({id:'original',status:'running',result:'63'});const actual=await pending;assert.equal(actual.result,'63');assert.equal(actual.stale,false);
 checks.push('Actual preview menu route forwards grammar and captured original selection coordinates');
 fixture=selection();pending=fixture.start();fixture.editor.source='typedDouble(20) as number';fixture.resolve({id:'original',status:'running',result:'63'});assert.equal((await pending).stale,true);assert.equal(fixture.context.current.result,'63');
 checks.push('An unwatched editor changed during selected evaluation cannot publish its old result as current');
 fixture=selection();pending=fixture.start();fixture.editor.source='updated source';const error=Error('Selected typed failure');error.location={path:'E:\\fixture\\syntax.js',line:4,column:10,source:'captured original'};fixture.reject(error);assert.equal((await pending).accepted,false);assert.equal(fixture.context.current.stale,true);assert.equal(fixture.context.current.errors[0].location.source,'captured original');
 checks.push('Selected errors preserve captured authored locations while reporting newer editor source as stale');
 fixture=selection();pending=fixture.start();fixture.setLoader('js');fixture.resolve({id:'original',status:'running',result:'63'});assert.equal((await pending).stale,true);assert.equal(fixture.editor.source,'typedDouble(21) as number');
 checks.push('A selection grammar changed with identical bytes cannot publish its old result as current');
 fixture=selection();pending=fixture.start();fixture.setLoader('ts');const grammarError=Error('Original TSX failure');grammarError.location={path:'E:\\fixture\\syntax.js',line:4,column:10,source:'captured TSX'};fixture.reject(grammarError);await pending;assert.equal(fixture.context.current.stale,true);assert.equal(fixture.context.current.errors[0].location.source,'captured TSX');
 checks.push('A pending selection error retains its original location after a grammar-only edit');
 fixture=selection();pending=fixture.start();fixture.context.revision++;fixture.context.current={id:'replacement',status:'running',result:'42',stale:false};fixture.resolve({id:'original',status:'running',result:'63'});assert.equal((await pending).reason,'replaced');assert.equal(fixture.context.current.result,'42');assert.equal(fixture.context.current.stale,false);
 checks.push('A stopped or replaced preview keeps ownership when an older selected result arrives');
 result={passed:true,checks};
 }catch(error){result={passed:false,checks,error:error.stack};process.exitCode=1;}finally{const file=path.resolve(__dirname,'../../.revival/typed-editor-routes-result.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}})();
