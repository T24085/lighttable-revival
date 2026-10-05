'use strict';
const servers=new Map(),key=(owner,id)=>owner+':'+id;
function register(owner,id,provider){const identity=key(owner,id),registration={provider};servers.set(identity,registration);return ()=>{if(servers.get(identity)===registration)servers.delete(identity);};}
function server(owner,id){return servers.get(key(owner,id))?.provider||null;}
module.exports={register,server};
