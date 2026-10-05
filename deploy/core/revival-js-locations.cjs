'use strict';
// Runtime and compiler coordinates follow JavaScript's four line terminators.
// Authored HTML/editor coordinates use their own CR/LF helpers instead.
const terminator=char=>char==='\r'||char==='\n'||char==='\u2028'||char==='\u2029';
function lineStarts(source){const starts=[0];for(const match of source.matchAll(/\r\n|[\r\n\u2028\u2029]/g))starts.push(match.index+match[0].length);return starts;}
function point(source,starts,line,column){
 if(!Number.isSafeInteger(line)||line<1||line>starts.length||!Number.isSafeInteger(column)||column<0)return -1;
 let end=starts[line]??source.length;while(end>starts[line-1]&&terminator(source[end-1]))end--;
 const index=starts[line-1]+column;return index<=end?index:-1;
}
function indexFromLocation(source,line,column){
 if(!Number.isSafeInteger(line)||line<1||!Number.isSafeInteger(column)||column<0)return -1;
 let index=0,current=1;
 while(index<source.length&&current<line){const char=source[index++];if(terminator(char)){if(char==='\r'&&source[index]==='\n')index++;current++;}}
 if(current!==line)return -1;
 let end=index;while(end<source.length&&!terminator(source[end]))end++;
 return column<=end-index?index+column:-1;
}
function location(source,index){
 if(!Number.isSafeInteger(index)||index<0||index>source.length)throw Error('JavaScript location exceeds its source');
 let line=1,start=0;
 for(let at=0;at<index;at++){const char=source[at];if(terminator(char)){if(char==='\r'&&source[at+1]==='\n'&&at+1<index)at++;line++;start=at+1;}}
 return {line,column:index-start};
}
module.exports={lineStarts,point,indexFromLocation,location};
