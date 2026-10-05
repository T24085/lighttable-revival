'use strict';
// Visual editing helpers keep the source, syntax mode and saved generation intact.
window.ltEditing=(()=>{
 const tracked=new WeakSet();let enabled=true,active=null,marks=[],timer=null;
 const editor=()=>window.lt?.objs?.editor?.pool?.last_active?.(),cm=obj=>obj&&lt.objs.editor.__GT_cm_ed(obj);
 function clear(){for(const mark of marks)mark.clear();marks=[];}
 function schedule(){clearTimeout(timer);timer=setTimeout(color,180);}
 function color(){
  timer=null;clear();const view=cm(editor());if(!enabled||!view)return;
  // Bound decorations independently of the application's larger source budget.
  if(view.getValue().length>256*1024||view.lineCount()>10000)return;
  const opens='([{',closes=')]}',stack=[],decorations=[];let truncated=false;
  for(let line=view.firstLine();line<=view.lastLine()&&!truncated;line++)for(const token of view.getLineTokens(line)){
   if(/string|comment/.test(token.type||''))continue;
   for(let ch=token.start;ch<token.end;ch++){
    const value=view.getLine(line)[ch],opening=opens.indexOf(value),closing=closes.indexOf(value);if(opening<0&&closing<0)continue;
    if(decorations.length>=4096){truncated=true;break;}
    const item={line,ch,className:'revival-paren-'+(stack.length%6)};
    if(opening>=0){item.kind=opening;stack.push(item);}else if(stack.at(-1)?.kind===closing){item.className=stack.pop().className;}else item.className='revival-paren-mismatch';
    decorations.push(item);
   }
  }
  if(!truncated)for(const item of stack)item.className='revival-paren-mismatch';
  for(const item of decorations)marks.push(view.markText({line:item.line,ch:item.ch},{line:item.line,ch:item.ch+1},{className:item.className}));
 }
 function scan(){const view=cm(editor());if(view&&!tracked.has(view)){tracked.add(view);view.on('change',schedule);view.on('swapDoc',schedule);view.on('optionChange',(_view,option)=>{if(option==='mode')schedule();});}if(view!==active){active=view;schedule();}}
 function toggle(){enabled=!enabled;if(enabled)schedule();else{clearTimeout(timer);clear();}lt.objs.menu.main_menu();}
 function matchingTag(){const view=cm(editor());if(!view)return;const match=CodeMirror.findMatchingTag(view,view.getCursor());if(!match?.open||!match?.close)return;CodeMirror.commands.toMatchingTag(view);const cursor=view.getCursor();cursor.ch=Math.max(0,cursor.ch-1);view.setSelection(cursor,cursor);view.focus();}
 function initialize(){const style=document.createElement('style');style.textContent='.CodeMirror-matchingtag{background:rgba(145,198,255,.18)}.CodeMirror .revival-paren-0{color:#e5bf78!important}.CodeMirror .revival-paren-1{color:#91c6ff!important}.CodeMirror .revival-paren-2{color:#a3df9b!important}.CodeMirror .revival-paren-3{color:#d5a4ef!important}.CodeMirror .revival-paren-4{color:#72d7d0!important}.CodeMirror .revival-paren-5{color:#edaaa0!important}.CodeMirror .revival-paren-mismatch{color:#ff7b88!important;text-decoration:underline wavy #ff7b88}';document.head.append(style);setInterval(scan,200);scan();}
 return {initialize,toggle,matchingTag,enabled:()=>enabled,state:()=>({enabled,decorations:marks.length})};
})();
