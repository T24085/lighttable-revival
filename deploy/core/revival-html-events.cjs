'use strict';
// Executable content attributes observed in the pinned Chromium secure context.
// An on-prefixed IDL property alone does not make its HTML/SVG attribute active.
const HTML='http://www.w3.org/1999/xhtml',SVG='http://www.w3.org/2000/svg',MATH='http://www.w3.org/1998/Math/MathML';
const common=new Set(('onabort onanimationcancel onanimationend onanimationiteration onanimationstart onauxclick onbeforecopy onbeforecut onbeforeinput onbeforepaste onbeforetoggle onblur oncancel oncanplay oncanplaythrough onchange onclick onclose oncommand oncontentvisibilityautostatechange oncontextlost oncontextmenu oncontextrestored oncopy oncuechange oncut ondblclick ondrag ondragend ondragenter ondragleave ondragover ondragstart ondrop ondurationchange onemptied onended onerror onfocus onformdata ongotpointercapture oninput oninvalid onkeydown onkeypress onkeyup onload onloadeddata onloadedmetadata onloadstart onlostpointercapture onmousedown onmouseenter onmouseleave onmousemove onmouseout onmouseover onmouseup onmousewheel onpaste onpause onplay onplaying onpointercancel onpointerdown onpointerenter onpointerleave onpointermove onpointerout onpointerover onpointerrawupdate onpointerup onprogress onratechange onreset onresize onscroll onscrollend onscrollsnapchange onscrollsnapchanging onsecuritypolicyviolation onseeked onseeking onselect onselectionchange onselectstart onslotchange onstalled onsubmit onsuspend ontimeupdate ontoggle onvolumechange onwaiting onwebkitanimationend onwebkitanimationiteration onwebkitanimationstart onwebkitfullscreenchange onwebkitfullscreenerror onwebkittransitionend onwheel').split(' '));
const windowAttributes='onafterprint onbeforeprint onbeforeunload onhashchange onlanguagechange onmessage onmessageerror onoffline ononline onpagehide onpageshow onpopstate onstorage onunload'.split(' ');
const body=new Set([...common].filter(name=>name!=='onselectionchange').concat(windowAttributes)),frameset=new Set([...common,...windowAttributes.filter(name=>name!=='onmessageerror')]),outerSVGProfile=new Set([...common,'onunload']),smil=new Set([...common,'onbegin','onend','onrepeat']),input=new Set([...common,'onsearch']),none=new Set();
const animationTags=new Set(['animate','animateMotion','animateTransform','set']);
function outerSVG(node){if(node?.namespaceURI!==SVG||node.tagName!=='svg')return false;for(let parent=node.parentNode;parent;parent=parent.parentNode)if(parent.namespaceURI===SVG)return false;return true;}
function profile(node){
 if(node?.namespaceURI===HTML)return node.tagName==='body'?body:node.tagName==='frameset'?frameset:node.tagName==='input'?input:common;
 if(node?.namespaceURI===SVG)return outerSVG(node)?outerSVGProfile:animationTags.has(node.tagName)?smil:common;
 return node?.namespaceURI===MATH?common:none;
}
function recognizes(node,name){return profile(node).has(name);}
function windowError(node,name){return name==='onerror'&&(node?.namespaceURI===HTML&&['body','frameset'].includes(node.tagName)||node?.namespaceURI===SVG&&node.tagName==='svg');}
module.exports=Object.assign(new Set([...common,...body,...frameset,...outerSVGProfile,...smil,...input]),{recognizes,windowError,outerSVG,profile,profiles:{common,body,frameset,outerSVG:outerSVGProfile,smil,input}});
