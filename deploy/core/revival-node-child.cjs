'use strict';
// Inherited contexts never read project stdin or use its message channel.
const context=require('./revival-node-context.cjs');
context.normalizeArgv(__filename);
const config=context.childConfiguration();
try{context.install(config,true);}catch(error){context.persistDiagnostic(config,error);throw error;}
