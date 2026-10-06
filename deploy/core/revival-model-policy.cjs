'use strict';
// Keep the temporary removal consistent for named and renamed Clef weights.
function clef(name,metadata={}){
 return /(?:^|\/)clef(?:-flash)?(?:[:/-]|$)/i.test(name||'')||
  Object.entries(metadata.model_info||{}).some(([key,value])=>/\.decision\.type$/.test(key)&&String(value).toLowerCase()==='clef')||
  (Array.isArray(metadata.model_info?.['general.tags'])&&metadata.model_info['general.tags'].includes('clef'));
}
module.exports={clef};
