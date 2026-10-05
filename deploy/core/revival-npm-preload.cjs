'use strict';
// This is a launch gate, not a project runtime hook. Descendants inherit the
// Windows job; only the root npm process waits for quota verification.
const fs=require('node:fs');
require('./revival-preload-argv.cjs').normalizeArgv(__filename);
const signal=JSON.parse(fs.readFileSync(0,'utf8'));
if(signal?.ready!==true)throw Error('npm launch was not released by Light Table.');
if(signal.install===true){
 process.execArgv=process.execArgv.filter(flag=>!['--max-old-space-size=96','--max-semi-space-size=4'].includes(flag));
 require('./revival-json-stream.cjs').install(process.argv[1]);
}
