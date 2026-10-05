'use strict';
// source(key, roots) is a synthetic ESM entry in the same split build as page
// modules. Roots use ordinal lt-classic-root:N requests; their resolver retains
// the original importer and require-call/dynamic-import kind. Before project
// HTML runs, import this entry then configure aliases[N] as namespace:path.
// Replace an unbound require identifier with key.select(N, require); preserve
// its original call/optional-call parentheses and arguments. import(N, ...args)
// keeps native Promise/namespace caching. Computed or aliased fallback require
// and import options need future planner support and fail explicitly here.
function install(key,thunks,kinds){
 const host=globalThis,define=Object.defineProperty,own=Object.hasOwn,isArray=Array.isArray,integer=Number.isSafeInteger,apply=Reflect.apply,NativeError=Error,NativeTypeError=TypeError,NativeMap=Map;
 const get=Function.call.bind(Map.prototype.get),set=Function.call.bind(Map.prototype.set),has=Function.call.bind(Map.prototype.has),reject=Promise.reject.bind(Promise);
 const cache=new NativeMap(),selected=new NativeMap();let aliases=null,memoize=null;
 function invalid(message){return new NativeTypeError(message);}
 function root(id,kind){if(!integer(id)||id<0||id>=thunks.length||kinds[id]!==kind)throw invalid('Invalid planned classic dependency');if(aliases===null)throw new NativeError('Classic dependency aliases are not configured');return thunks[id];}
 function requireRoot(id){const thunk=root(id,'require'),canonical=aliases[id];if(!memoize[id])return thunk();if(has(cache,canonical))return get(cache,canonical);const value=thunk();set(cache,canonical,value);return value;}
 function fallback(){throw invalid('Unplanned classic require call. Use a literal require("package") call and run the preview again. Computed and aliased require calls are not supported yet.');}
 function select(id,callee){if(callee!==fallback)return callee;root(id,'require');if(!has(selected,id))set(selected,id,function(){return requireRoot(id);});return get(selected,id);}
 function call(id,callee,args){if(!isArray(args))throw invalid('Classic dependency arguments must be an array');return callee===fallback?apply(select(id,callee),undefined,args):apply(callee,undefined,args);}
 function dynamic(id,_specifier,options){if(options!==undefined)return reject(invalid('Classic package import options are not supported yet. Use import("package") without options.'));try{return root(id,'import')();}catch(error){return reject(error);}}
 function configure(next,flags){
  if(!next||typeof next!=='object'||isArray(next)&&next.length!==thunks.length)throw invalid('Invalid classic dependency aliases');const copy=[];
  for(let id=0;id<thunks.length;id++){if(!own(next,id)||typeof next[id]!=='string'||!next[id].length||next[id].length>8192)throw invalid('Invalid classic dependency alias');copy[id]=next[id];}
  if(flags!==undefined&&(!isArray(flags)||flags.length!==thunks.length))throw invalid('Invalid classic dependency memoization');const saved=[];
  for(let id=0;id<thunks.length;id++){const value=flags===undefined?true:flags[id];if(typeof value!=='boolean')throw invalid('Invalid classic dependency memoization');saved[id]=value;}
  if(aliases!==null){for(let id=0;id<copy.length;id++){if(copy[id]!==aliases[id])throw invalid('Classic dependency aliases cannot change during a preview');if(saved[id]!==memoize[id])throw invalid('Classic dependency memoization cannot change during a preview');}return;}
  aliases=copy;memoize=saved;
 }
 const registry={select,call,import:dynamic,configure,fallback};
 if(kinds.includes('require'))define(host,'require',{value:fallback,writable:true,configurable:true,enumerable:false});define(host,key,{value:registry,writable:false,configurable:false,enumerable:false});
}
function source(key,roots){
 if(typeof key!=='string'||!/^__lt_classic_[a-f0-9]{32}$/.test(key))throw Error('Invalid classic dependency registry key');
 if(!Array.isArray(roots)||roots.length>256)throw Error('Classic previews support at most 256 planned dependency roots');
 const kinds=roots.map(item=>{const kind=item?.kind;return kind==='require'||kind==='require-call'?'require':kind==='import'||kind==='dynamic-import'?'import':null;});
 if(kinds.some(kind=>kind===null))throw Error('Invalid classic dependency root kind');
 const thunks=kinds.map((kind,id)=>'()=>'+(kind==='require'?'require':'import')+'('+JSON.stringify('lt-classic-root:'+id)+')');
 return '('+install.toString()+')('+JSON.stringify(key)+',['+thunks.join(',')+'],'+JSON.stringify(kinds)+');';
}
module.exports={source};
