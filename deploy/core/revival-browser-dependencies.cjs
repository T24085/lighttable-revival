'use strict';
const acorn=require('acorn');
const limits=Object.freeze({sourceBytes:2*1024*1024+256*1024});
function analyze(source,options={}){
 if(typeof source!=='string')throw TypeError('Browser dependency source must be JavaScript text');
 if(Buffer.byteLength(source)>limits.sourceBytes)throw Error('Browser dependency source exceeds 2 MiB plus its 256 KiB instrumentation budget');
 const classic=options.classic!==false,globals=options.globals||new Set();
 if(!(globals instanceof Set))throw TypeError('Browser dependency globals must be a Set');
 const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:classic?'script':'module',locations:true}),calls=[],assignments=[],annex=[],scopes=[],references=[];let dynamic=false;
 function scope(parent,type,strict=parent?.strict||false){const item={parent,type,strict,bindings:new Set()};scopes.push(item);return item;}
 const strictBody=node=>node?.body?.some((item,index,body)=>item.type==='ExpressionStatement'&&item.directive==='use strict'&&body.slice(0,index).every(before=>before.type==='ExpressionStatement'&&before.directive));
 const program=scope(null,'program',!classic||strictBody(ast));
 function variableScope(item){while(!['program','function','static'].includes(item.type))item=item.parent;return item;}
 function declare(pattern,item){if(!pattern)return;switch(pattern.type){case 'Identifier':item.bindings.add(pattern.name);break;case 'RestElement':declare(pattern.argument,item);break;case 'AssignmentPattern':declare(pattern.left,item);break;case 'ArrayPattern':for(const child of pattern.elements)declare(child,item);break;case 'ObjectPattern':for(const child of pattern.properties)declare(child.type==='RestElement'?child.argument:child.value,item);break;}}
 function patternExpressions(pattern,item){if(!pattern)return;switch(pattern.type){case 'AssignmentPattern':patternExpressions(pattern.left,item);visit(pattern.right,item);break;case 'RestElement':patternExpressions(pattern.argument,item);break;case 'ArrayPattern':for(const child of pattern.elements)patternExpressions(child,item);break;case 'ObjectPattern':for(const child of pattern.properties){if(child.type==='RestElement')patternExpressions(child.argument,item);else{if(child.computed)visit(child.key,item);patternExpressions(child.value,item);}}break;}}
 function functionNode(node,parent){
  const named=node.type==='FunctionExpression'&&node.id?scope(parent,'function-name'):parent;if(named!==parent)declare(node.id,named);
  const strict=parent.strict||node.body.type==='BlockStatement'&&strictBody(node.body),parameters=scope(named,'parameters',strict);
  for(const parameter of node.params)declare(parameter,parameters);
  // Parameter initializers cannot see declarations from the function body.
  for(const parameter of node.params)patternExpressions(parameter,parameters);
  const body=scope(parameters,'function',strict);if(node.body.type==='BlockStatement')for(const child of node.body.body)visit(child,body);else visit(node.body,body);
 }
 function visit(node,item,parent=null,field=null){
  if(!node||typeof node.type!=='string')return;
  if(options.bindingReferences&&node.type==='Identifier'){
   const nameOnly=parent&&(parent.type==='MemberExpression'&&field==='property'&&!parent.computed||['Property','MethodDefinition','PropertyDefinition'].includes(parent.type)&&field==='key'&&!parent.computed||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)&&field==='label'||parent.type==='MetaProperty'||/^(?:Import|Export).*Specifier$/.test(parent.type));
   if(!nameOnly)references.push({node,item,shorthand:parent?.type==='Property'&&parent.shorthand&&field==='value'});
  }
  switch(node.type){
   case 'Program':for(const child of node.body)visit(child,item);return;
   case 'BlockStatement':{const block=scope(item,'block');for(const child of node.body)visit(child,block);return;}
   case 'StaticBlock':{const block=scope(item,'static',true);for(const child of node.body)visit(child,block);return;}
   case 'FunctionDeclaration':declare(node.id,item);if(!item.strict&&!node.async&&!node.generator&&['block','loop','switch'].includes(item.type))annex.push({item,name:node.id.name});functionNode(node,item);return;
   case 'FunctionExpression':case 'ArrowFunctionExpression':functionNode(node,item);return;
   case 'VariableDeclaration':for(const declaration of node.declarations){declare(declaration.id,node.kind==='var'?variableScope(item):item);patternExpressions(declaration.id,item);visit(declaration.init,item);}return;
   case 'ClassDeclaration':declare(node.id,item); // The class name also binds its own extends/field/method expressions.
   case 'ClassExpression':{const inner=scope(item,'class',true);declare(node.id,inner);visit(node.superClass,inner);visit(node.body,inner);return;}
   case 'CatchClause':{const caught=scope(item,'catch');declare(node.param,caught);patternExpressions(node.param,caught);visit(node.body,caught);return;}
   case 'ForStatement':{const loop=scope(item,'loop');visit(node.init,loop);visit(node.test,loop);visit(node.update,loop);visit(node.body,loop);return;}
   case 'ForInStatement':case 'ForOfStatement':{const loop=scope(item,'loop');if(node.left.type!=='VariableDeclaration')assignments.push({node:node.left,item:loop});visit(node.left,loop);visit(node.right,loop);visit(node.body,loop);return;}
   case 'SwitchStatement':{visit(node.discriminant,item);const switched=scope(item,'switch');for(const child of node.cases){visit(child.test,switched);for(const statement of child.consequent)visit(statement,switched);}return;}
   case 'WithStatement':dynamic=true;visit(node.object,item);visit(node.body,scope(item,'with'));return;
   case 'ImportDeclaration':for(const specifier of node.specifiers)declare(specifier.local,item);return;
   case 'CallExpression':calls.push({node,item});break;
   case 'ImportExpression':calls.push({node,item});break;
   case 'AssignmentExpression':assignments.push({node:node.left,item});break;
   case 'UpdateExpression':case 'UnaryExpression':if(node.type==='UpdateExpression'||node.operator==='delete')assignments.push({node:node.argument,item});break;
  }
  for(const [name,value] of Object.entries(node)){if(['loc','start','end'].includes(name))continue;if(Array.isArray(value))for(const child of value)visit(child,item,node,name);else if(value&&typeof value==='object')visit(value,item,node,name);}
 }
 visit(ast,program);
 // Sloppy block functions also create a var binding unless an intervening
 // lexical declaration prevents Annex B's replacement declaration.
 for(const {item,name} of annex){const target=variableScope(item);let parent=item.parent,blocked=false;while(parent&&parent!==target){if(parent.bindings.has(name)){blocked=true;break;}parent=parent.parent;}if(!blocked)target.bindings.add(name);}
 function binding(item,name){for(let current=item;current;current=current.parent)if(current.bindings.has(name))return current;return globals.has(name)?'previous-script':null;}
 function uncertain(item){for(let current=item;current;current=current.parent)if(current.type==='with')return true;return false;}
 function globalObject(node,item){return node?.type==='ThisExpression'||node?.type==='Identifier'&&['window','globalThis','self'].includes(node.name)&&[null,program,'previous-script'].includes(binding(item,node.name));}
 function writesRequire(node,item){if(!node)return false;if(node.type==='Identifier')return node.name==='require'&&[null,program,'previous-script'].includes(binding(item,'require'));if(node.type==='MemberExpression')return globalObject(node.object,item)&&(node.computed?node.property.type==='Literal'&&node.property.value==='require':node.property.name==='require');if(node.type==='RestElement')return writesRequire(node.argument,item);if(node.type==='AssignmentPattern')return writesRequire(node.left,item);if(node.type==='ArrayPattern')return node.elements.some(child=>writesRequire(child,item));if(node.type==='ObjectPattern')return node.properties.some(child=>writesRequire(child.type==='RestElement'?child.argument:child.value,item));return false;}
 for(const assignment of assignments)if(writesRequire(assignment.node,assignment.item))dynamic=true;
 const dependencies=[];
 for(const {node,item} of calls){
  if(node.type==='ImportExpression'){if(node.source.type==='Literal'&&typeof node.source.value==='string')dependencies.push({kind:'dynamic-import',specifier:node.source.value,from:node.start,to:node.end,node});continue;}
  if(node.callee.type==='Identifier'&&node.callee.name==='eval'&&!node.optional)dynamic=true;
  if(node.callee.type==='Identifier'&&node.callee.name==='require'&&!binding(item,'require')&&!uncertain(item)&&node.arguments[0]?.type==='Literal'&&typeof node.arguments[0].value==='string')dependencies.push({kind:'require-call',specifier:node.arguments[0].value,from:node.callee.start,to:node.callee.end,node});
 }
 dependencies.sort((a,b)=>a.from-b.from||a.to-b.to);
 return {ast,dependencies,globalBindings:new Set(program.bindings),dynamic,...(options.bindingReferences?{bindingReferences:references.filter(reference=>binding(reference.item,reference.node.name)===program&&!uncertain(reference.item)).map(({item,...reference})=>reference)}:{})};
}
function importBindings(source){const result=analyze(source,{classic:false,bindingReferences:true});return {ast:result.ast,bindings:result.ast.body.filter(node=>node.type==='ImportDeclaration').flatMap(declaration=>declaration.specifiers.map(node=>({node,declaration,references:result.bindingReferences.filter(reference=>reference.node.name===node.local.name)})))};}
module.exports={analyze,importBindings,limits};
