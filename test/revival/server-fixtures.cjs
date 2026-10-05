'use strict';
const fs=require('fs'),path=require('path');
function fixture(root,options={}){
 fs.mkdirSync(root,{recursive:true});
 const helper=factor=>'globalThis.calculate = n => n * '+factor+';\nglobalThis.calculation = calculate(21);';
 const app=answer=>['globalThis.answer = '+answer+';','globalThis.fail = () => { throw new Error("served project failed"); };','document.querySelector("#value").textContent = String(answer);','console.log("HTTP_VALUE", answer);','globalThis.channel = new WebSocket(location.origin.replace("http:","ws:")+"/hmr");','channel.onmessage = event => event.data === "reload" ? location.reload() : event.data === "helper" ? fetch("/helper.js?update="+Date.now()).then(response=>response.text()).then(code=>(0,eval)(code)) : fetch("/value.json").then(response=>response.json()).then(value=>document.querySelector("#value").textContent=String(value.answer));'].join('\n');
 fs.writeFileSync(path.join(root,'helper.js'),helper(2).replace(/\n/g,'\r\n'));fs.writeFileSync(path.join(root,'app.js'),app(42));fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><meta charset="utf-8"><title>Live project fixture</title><link rel="stylesheet" href="/style.css"><h1>Live project report</h1><output id="value">Ready</output><script src="/helper.js"></script><script src="/app.js"></script>');fs.writeFileSync(path.join(root,'style.css'),'body{background:#10271f;color:#d9ede2;font:24px system-ui;padding:36px}output{font-size:80px}');
 const ws=require.resolve('../../deploy/core/node_modules/ws'),compiler=require.resolve('../../deploy/core/node_modules/esbuild');
 const server=`const http=require('http'),fs=require('fs'),zlib=require('zlib'),{WebSocketServer}=require(${JSON.stringify(ws)}),compiler=require(${JSON.stringify(compiler)});
const externalMaps=${options.sourceMaps==='external'},mapRequests=[];
function compiled(file,banner){const result=compiler.transformSync(fs.readFileSync(file,'utf8'),{loader:'js',sourcefile:file,sourcemap:externalMaps?'external':'inline',banner});if(externalMaps){const map=JSON.parse(result.map);map.sourceRoot='../';result.map=JSON.stringify(map);}return result;}
const server=http.createServer((request,response)=>{
 const pathname=new URL(request.url,'http://fixture').pathname;
 if(pathname==='/'){response.writeHead(fs.existsSync('broken-html.txt')?404:200,{'content-type':'text/html','content-encoding':'gzip'});response.end(zlib.gzipSync(fs.readFileSync('index.html')));}
 else if(pathname==='/app.js'){const send=()=>{const result=compiled('app.js','// transformed header\\n// second header');response.writeHead(200,{'content-type':'application/javascript',...(externalMaps?{SourceMap:'/maps/app.map'}:{})});response.end(result.code+(externalMaps?'\\n//# sourceMappingURL=ignored.map':''));};if(fs.existsSync('slow-page.txt')){const timer=setTimeout(send,2000);response.on('close',()=>clearTimeout(timer));}else send();}
 else if(pathname==='/helper.js'){const result=compiled('helper.js','// compiled watched helper');response.writeHead(200,{'content-type':'application/javascript'});response.end(result.code+(externalMaps?'\\n//# sourceMappingURL=maps/helper.map':''));}
 else if(pathname.startsWith('/maps/')&&externalMaps){mapRequests.push(pathname);const file=pathname==='/maps/app.map'?'app.js':'helper.js',result=compiled(file,file==='app.js'?'// transformed header\\n// second header':'// compiled watched helper'),broken=file==='helper.js'&&fs.existsSync('broken-map.txt');response.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});response.end(zlib.gzipSync(Buffer.from(broken?'{':")]}'\\n"+result.map)));}
 else if(pathname==='/map-stats'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(mapRequests));}
 else if(pathname==='/style.css'){response.writeHead(200,{'content-type':'text/css','content-encoding':'br'});response.end(zlib.brotliCompressSync(fs.readFileSync('style.css')));}
 else if(pathname==='/value.json'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({answer:Number(fs.readFileSync('app.js','utf8').match(/answer = (\\d+)/)[1])}));}
 else if(pathname==='/api'&&request.method==='POST'){const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({method:request.method,body:Buffer.concat(chunks).toString('utf8')}));});}
 else if(pathname==='/events'){response.writeHead(200,{'content-type':'text/event-stream'});response.write('data: 42\\n\\n');const timer=setInterval(()=>response.write(': alive\\n\\n'),1000);request.on('close',()=>clearInterval(timer));}
 else if(pathname==='/binary'){response.writeHead(200,{'content-type':'application/octet-stream'});response.end(Buffer.from([0,255,42]));}
 else if(pathname==='/huge'){response.writeHead(200,{'content-type':'text/plain'});response.end(Buffer.alloc(9*1024*1024,120));}
 else if(pathname==='/exit'){response.end('bye');setTimeout(()=>process.exit(0),20);}
 else{response.writeHead(404,{'content-type':'text/plain'});response.end('missing');}
});
const sockets=new WebSocketServer({server,path:'/hmr'});for(const file of ['app.js','helper.js','index.html'])fs.watch(file,()=>{for(const socket of sockets.clients)if(socket.readyState===1)socket.send(file==='index.html'?'reload':file==='helper.js'?'helper':'saved');});server.listen(0,'127.0.0.1',()=>console.log('SERVER_READY http://127.0.0.1:'+server.address().port));`;
 fs.writeFileSync(path.join(root,'server.cjs'),server);fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'lt-http-preview-fixture',version:'1.0.0',private:true,scripts:{dev:'node server.cjs'}},null,2));return {root,app,helper};
}
module.exports={fixture};
