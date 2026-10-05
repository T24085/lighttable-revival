'use strict';
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default,generate=require('@babel/generator').default,t=require('@babel/types'),crypto=require('crypto');
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
function literal(node){if(t.isStringLiteral(node)||t.isNumericLiteral(node)||t.isBooleanLiteral(node)||t.isNullLiteral(node))return {value:node.value??null};if(t.isUnaryExpression(node)&&['-','+'].includes(node.operator)&&t.isNumericLiteral(node.argument))return {value:node.operator==='-'?-node.argument.value:node.argument.value};return null;}
function compile(source,address,key){
 if(Buffer.byteLength(source)>2*1024*1024)return null;
 let ast;try{ast=parser.parse(source,{sourceType:'script'});}catch(_){return null;}
 let program,unsafe=false;traverse(ast,{Program(p){program=p;},WithStatement(){unsafe=true;},CallExpression(p){if(t.isIdentifier(p.node.callee,{name:'eval'}))unsafe=true;}});
 if(unsafe||program.scope.hasOwnBinding('globalThis')||program.scope.hasOwnBinding('__proto__'))return null;
 const functions=new Set(),constants=new Map();
 for(const [name,binding] of Object.entries(program.scope.bindings)){
  const node=binding.path.node;
  if(binding.path.isFunctionDeclaration()&&binding.path.parentPath.isProgram()&&!node.async&&!node.generator&&node.params.every(p=>t.isIdentifier(p))&&!binding.constantViolations.length)functions.add(name);
  if(binding.kind==='const'&&binding.path.isVariableDeclarator()&&binding.path.parentPath.parentPath.isProgram()&&t.isIdentifier(node.id)&&!binding.constantViolations.length&&binding.referencePaths.length&&binding.referencePaths.every(p=>!!p.getFunctionParent())){
   const value=literal(node.init);if(value)constants.set(name,value.value);
  }
 }
 if(!functions.size&&!constants.size||functions.size>128||constants.size>128)return null;
 const shape=t.cloneNode(ast,true);for(const node of shape.program.body){if(t.isFunctionDeclaration(node)&&functions.has(node.id.name))node.body=t.blockStatement([]);if(t.isVariableDeclaration(node))for(const item of node.declarations)if(t.isIdentifier(item.id)&&constants.has(item.id.name))item.init=t.nullLiteral();}
 const fingerprint=hash(generate(shape,{compact:true,comments:false}).code);
 const hot=t.memberExpression(t.identifier('globalThis'),t.stringLiteral(key),true),method=name=>t.memberExpression(t.cloneNode(hot),t.identifier(name));
 for(const [name] of constants)for(const reference of [...program.scope.bindings[name].referencePaths])reference.replaceWith(t.callExpression(method('value'),[t.stringLiteral(address),t.stringLiteral(name),t.identifier(name)]));
 const replacements=[];
 for(const node of ast.program.body)if(t.isFunctionDeclaration(node)&&functions.has(node.id.name)){
  const fn=t.functionExpression(null,node.params.map(p=>t.cloneNode(p)),t.cloneNode(node.body,true));fn.loc=node.loc;
  replacements.push(t.objectProperty(t.identifier(node.id.name),fn));
  const directives=node.body.directives.map(directive=>t.cloneNode(directive,true));node.body=t.blockStatement([t.returnStatement(t.callExpression(method('invoke'),[t.stringLiteral(address),t.stringLiteral(node.id.name),t.thisExpression(),t.identifier('arguments'),t.metaProperty(t.identifier('new'),t.identifier('target'))]))]);node.body.directives=directives;
 }
 const values=t.objectExpression([...constants].map(([name,value])=>t.objectProperty(t.stringLiteral(name),t.valueToNode(value))));
 ast.program.body.unshift(t.expressionStatement(t.callExpression(method('install'),[t.stringLiteral(address),t.objectExpression(replacements.map(p=>t.cloneNode(p,true))),t.cloneNode(values,true)])));
 const initial=generate(ast,{retainLines:true,sourceMaps:true,sourceFileName:address},source);
 const patch=t.file(t.program([t.expressionStatement(t.callExpression(method('patch'),[t.stringLiteral(address),t.objectExpression(replacements),values]))]));
 patch.program.directives=ast.program.directives.map(directive=>t.cloneNode(directive,true));
 const update=generate(patch,{retainLines:true,sourceMaps:true,sourceFileName:address},source);
 return {address,key,fingerprint,sourceHash:hash(source),code:initial.code,map:initial.map,patch:update.code,patchMap:update.map};
}
function runtime(key){return `(()=>{const scopes=new Map();const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);Object.defineProperty(globalThis,${JSON.stringify(key)},{value:Object.freeze({install(file,functions,values){if(scopes.size>=256&&!scopes.has(file))throw Error('Live scopes exceed 256 files');scopes.set(file,{functions,values});},value(file,name,original){const scope=scopes.get(file);return scope&&own(scope.values,name)?scope.values[name]:original;},invoke(file,name,receiver,args,target){const fn=scopes.get(file)?.functions[name];if(typeof fn!=='function')throw Error('Missing live function');return target?Reflect.construct(fn,args,target):Reflect.apply(fn,receiver,args);},patch(file,functions,values){const scope=scopes.get(file);if(!scope||Object.keys(functions).some(name=>!own(scope.functions,name)||typeof functions[name]!=='function')||Object.keys(values).some(name=>!own(scope.values,name)))throw Error('Live function layout changed');scope.functions=functions;scope.values=values;}})});})()`;}
module.exports={compile,runtime};
