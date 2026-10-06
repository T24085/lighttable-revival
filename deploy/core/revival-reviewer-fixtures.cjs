'use strict';
const shell=(content,css='')=>'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px Arial;background:#fff;color:#111}button{padding:12px;max-width:100%}'+css+'</style><h1>Counter</h1>'+content;
const fixtures=[
 ...['plain','responsive','long-page','canvas'].map(kind=>({id:'clean-'+kind,expected:'clean',html:shell('<button id="increment">Increment</button><output id="count">0</output>'+(kind==='long-page'?'<p style="margin-top:1200px">More content</p>':kind==='canvas'?'<canvas width="100" height="100"></canvas>':''))})),
 {id:'overflow-wide',expected:'overflow',html:shell('<button id="increment">Increment</button><output id="count">0</output><div style="width:1800px">Wide content</div>')},
 {id:'overflow-mobile',expected:'overflow',html:shell('<button id="increment">Increment</button><output id="count">0</output><div class="wide">Wide content</div>','@media(max-width:500px){.wide{width:700px}}')},
 {id:'clipped-heading',expected:'clipping',html:shell('<button id="increment">Increment</button><output id="count">0</output>','h1{width:30px;white-space:nowrap;overflow:hidden;height:20px}')},
 {id:'clipped-button',expected:'clipping',html:shell('<button id="increment">Increment the counter now</button><output id="count">0</output>','button{width:20px;height:20px;padding:0;overflow:hidden;white-space:nowrap}')},
 {id:'missing-button',expected:'missing_control',html:shell('<output id="count">0</output>')},
 {id:'hidden-button',expected:'missing_control',html:shell('<button id="increment" style="display:none">Increment</button><output id="count">0</output>')},
 {id:'regression-missing',expected:'missing_control',before:shell('<button id="increment">Increment</button><output id="count">0</output>'),html:shell('<output id="count">0</output>')},
 {id:'regression-fixed',expected:'clean',before:shell('<button id="increment">Increment</button><output id="count">0</output><div style="width:1800px">Wide content</div>'),html:shell('<button id="increment">Increment</button><output id="count">0</output>')}
];
const uncertaintyCases=[
 {id:'missing-behavior-receipts',goal:'Verify clicking Increment changes the count from 0 to 1. No interaction checks were performed.'},
 {id:'missing-acceptance-criteria',goal:'Verify all acceptance requirements are met. The acceptance requirements have not been supplied.'}
];
module.exports={fixtures,shell,uncertaintyCases};
