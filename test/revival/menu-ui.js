// Call the renderer callbacks used by the native menu bridge. The Electron
// harness also dispatches Run and Stop through Menu.getApplicationMenu().
window.testMenuItem=label=>{
 const name=item=>item.label?.replace('&','');let item;
 if(Array.isArray(label)){
  let menu=window.ltProofMenu;
  for(const component of label){item=menu?.items.find(candidate=>name(candidate)===component);if(!item)throw Error('Missing menu path: '+label.join(' → '));menu=item.submenu;}
 }else{
  const matches=[];const find=menu=>{for(const candidate of menu.items){if(name(candidate)===label)matches.push(candidate);if(candidate.submenu)find(candidate.submenu);}};find(window.ltProofMenu);
  if(matches.length>1)throw Error('Ambiguous menu item; use its complete path: '+label);item=matches[0];
 }
 if(!item)throw Error('Missing menu item: '+label);
 return item;
};
window.testMenuClick=label=>{
 const item=testMenuItem(label);
 if(item.enabled===false)throw Error('Disabled menu item: '+label);
 if(typeof item.click!=='function')throw Error('Menu item has no action: '+label);
 return item.click();
};
void 0;
