'use strict';
const fs=require('fs'),path=require('path');
function write(root,name,source){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof source==='string'?source:JSON.stringify(source));return file;}
function install(root,name,json,files){const dir=path.join(root,'node_modules',name);write(dir,'package.json',{name,version:'1.0.0',main:'index.cjs',...json});for(const [file,source] of Object.entries(files))write(dir,file,source);return dir;}
function fixture(root){
 write(root,'package.json',{name:'light-table-package-test',version:'1.0.0'});
 install(root,'dual',{exports:{'.':{import:'./esm.js',require:'./index.cjs'},'./features/*':'./features/*.js','./hidden':null}}, {'esm.js':'export default 42;','index.cjs':'module.exports=43;','features/answer.js':'export default 44;','hidden.js':'export default 999;'});
 install(root,'@lt/math',{exports:{'.':'./index.cjs','./data':'./data.json'}},{'index.cjs':'module.exports={answer:45};','data.json':'{"answer":46}'});
 install(root,'leaf',{}, {'index.cjs':'module.exports=47;'});
 install(root,'consumer',{}, {'index.cjs':'module.exports=require("leaf");'});
 const outer=install(root,'outer',{}, {'index.cjs':'module.exports=require("leaf");'});
 install(outer,'leaf',{version:'2.0.0'},{'index.cjs':'module.exports=48;'});
 install(root,'browser-choice',{exports:{browser:'./browser.js',default:'./node.js'}},{'browser.js':'export default 49;','node.js':'import "node:fs";export default -1;'});
 install(root,'browser-map',{browser:{'./index.cjs':'./web.cjs'}},{'index.cjs':'module.exports=-1;','web.cjs':'module.exports=50;'});
 install(root,'browser-disabled',{browser:{fs:false}},{'index.cjs':'const fs=require("fs");module.exports=Object.keys(fs).length;'});
 install(root,'browser-alias',{browser:{leaf:'@lt/math'}},{'index.cjs':'module.exports=require("leaf").answer;'});
 install(root,'module-field',{main:'index.cjs',module:'esm.js'},{'index.cjs':'module.exports=51;','esm.js':'export default 52;'});
 install(root,'throws',{}, {'index.cjs':'module.exports=function broken(){\n  throw new Error("package failed");\n};'});
 install(root,'hang',{}, {'index.cjs':'while(true){}'});
 const actual=path.resolve(__dirname,'../../deploy/core/node_modules/acorn'),destination=path.join(root,'node_modules/acorn');
 fs.mkdirSync(destination,{recursive:true});fs.copyFileSync(path.join(actual,'package.json'),path.join(destination,'package.json'));
 for(const name of ['acorn.js','acorn.mjs'])fs.copyFileSync(path.join(actual,'dist',name),write(destination,'dist/'+name,''));
 return {root,entry:write(root,'package-entry.js',''),version:JSON.parse(fs.readFileSync(path.join(actual,'package.json'),'utf8')).version};
}
module.exports={fixture,write,install};
