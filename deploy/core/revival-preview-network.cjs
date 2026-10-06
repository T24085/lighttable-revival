'use strict';
const assetTypes=new Set(['script','stylesheet','image','font']);
function httpsAsset(address,type,method='GET'){
 if(!assetTypes.has(type)||!['GET','HEAD'].includes(method))return false;
 try{const url=new URL(address);return url.protocol==='https:'&&!url.username&&!url.password;}catch(_){return false;}
}
function allowed(request,origin,serverMode=false){
 if(request.resourceType==='subFrame')return false;
 return request.url.startsWith(origin+'/')||serverMode&&request.url.startsWith(origin.replace(/^http:/,'ws:')+'/')||httpsAsset(request.url,request.resourceType,request.method);
}
function hasAssets(html){
 const pending=[require('parse5').parse(html)];
 while(pending.length){const node=pending.pop();pending.push(...(node.childNodes||[]));const attrs=new Map((node.attrs||[]).map(a=>[a.name,a.value]));const url=node.tagName==='script'||node.tagName==='img'?attrs.get('src'):node.tagName==='link'&&/stylesheet/i.test(attrs.get('rel')||'')?attrs.get('href'):null;if(url&&httpsAsset(url,'script'))return true;}
 return /url\(\s*['"]?https:\/\//i.test(html);
}
const csp="default-src 'self'; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' https: data:; connect-src 'self'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'none'";
module.exports={httpsAsset,allowed,hasAssets,csp};
