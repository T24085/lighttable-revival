'use strict';
const acorn=require('acorn'),path=require('path');
const transparent=new Set(['ParenthesizedExpression','TSAsExpression','TSTypeAssertion','TSNonNullExpression','TSSatisfiesExpression','TSInstantiationExpression']);
const metadata=new Set(['loc','range','tokens','comments','leadingComments','trailingComments','innerComments','extra','errors']);
function loader(filename=''){const extension=path.extname(filename||'').toLowerCase();return extension==='.tsx'?'tsx':extension==='.jsx'?'jsx':['.ts','.mts','.cts'].includes(extension)?'ts':'js';}
function effectiveLoader(filename,hint){if(hint!==undefined&&!['js','jsx','ts','tsx'].includes(hint))throw Error('Unsupported source grammar');return hint===undefined?loader(filename):hint;}
function grammar(options){if(options.loader!==undefined&&!['js','jsx','ts','tsx'].includes(options.loader))throw Error('Unsupported source grammar');return options.loader||loader(options.filename);}
function parse(source,options={}){
 const selected=grammar(options);
 if(selected==='js'){
  const settings={ecmaVersion:'latest',locations:options.locations!==false,preserveParens:!!options.preserveParens,...options};for(const name of ['filename','loader','ast','tokens'])delete settings[name];
  if(settings.sourceType&&settings.sourceType!=='unambiguous')return acorn.parse(source,settings);
  try{return acorn.parse(source,{...settings,sourceType:'script'});}catch(_){return acorn.parse(source,{...settings,sourceType:'module'});}
 }
 const plugins=['estree'];if(selected==='ts'||selected==='tsx')plugins.push('typescript');if(selected==='jsx'||selected==='tsx')plugins.push('jsx');
 try{
  const file=require('@babel/parser').parse(source,{sourceType:options.sourceType||'unambiguous',sourceFilename:options.filename,plugins,createImportExpressions:true,createParenthesizedExpressions:!!options.preserveParens,tokens:!!options.tokens,allowReturnOutsideFunction:!!options.allowReturnOutsideFunction,allowAwaitOutsideFunction:!!options.allowAwaitOutsideFunction,allowNewTargetOutsideFunction:!!options.allowNewTargetOutsideFunction,errorRecovery:false});
  if(options.tokens)file.program.tokens=file.tokens;return file.program;
 }catch(error){if(!Number.isInteger(error.pos)&&Number.isInteger(error.loc?.index))error.pos=error.loc.index;throw error;}
}
function tokens(source,options={}){
 if(grammar(options)==='js'){const settings={ecmaVersion:'latest',sourceType:options.sourceType==='script'?'script':'module',...options};for(const name of ['filename','loader','ast','tokens'])delete settings[name];return acorn.tokenizer(source,settings);}
 return parse(source,{...options,tokens:true}).tokens.filter(token=>token.end>token.start&&!/^Comment/.test(typeof token.type==='string'?token.type:token.type?.label||''));
}
function runtimeExpression(node){while(node&&transparent.has(node.type))node=node.expression;return node;}
function isExpression(node){return !!node&&node.type!=='JSXEmptyExpression'&&(transparent.has(node.type)||/Expression$/.test(node.type)||['Identifier','Literal','TemplateLiteral','JSXElement','JSXFragment'].includes(node.type));}
function isTypeOnly(node){
 if(!node)return false;if(node.declare||node.isTypeOnly||node.importKind==='type'||node.exportKind==='type')return true;
 if(!node.type?.startsWith('TS'))return false;
 if(transparent.has(node.type))return false;
 if(node.type==='TSModuleDeclaration')return !!node.global||node.id?.type==='Literal';
 return !['TSModuleBlock','TSEnumDeclaration','TSEnumMember','TSParameterProperty','TSExportAssignment','TSImportEqualsDeclaration'].includes(node.type);
}
function children(node){return Object.entries(node).filter(([name])=>!metadata.has(name));}
function expression(source,from,to,options={}){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>source.length||from>=to)throw Error('Invalid original expression range');
 const ast=options.ast||parse(source,{...options,preserveParens:true});let selected;
 const pending=[ast];while(pending.length){const node=pending.pop();if(!node||typeof node.type!=='string'||node.start>from||node.end<to||isTypeOnly(node))continue;if(node.start===from&&node.end===to&&isExpression(node))selected=node;for(const [,value] of children(node)){if(Array.isArray(value))pending.push(...value);else if(value&&typeof value==='object')pending.push(value);}}
 if(selected)return selected;const error=Error('Select one complete original value expression');error.pos=from;error.loc=require('./revival-js-locations.cjs').location(source,from);throw error;
}
module.exports={parse,tokens,expression,runtimeExpression,loader,effectiveLoader,isExpression,isTypeOnly,children,transparent};
