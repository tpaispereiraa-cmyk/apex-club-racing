// Preserve live controls, focus and expanded panels while changing telemetry text.
// Markup is produced solely by the game's own data/templates.
export function updateMarkup(root,html){
  const template=document.createElement('template');template.innerHTML=html;
  function children(parent,desired){
    for(let i=0;i<desired.childNodes.length;i++){
      const next=desired.childNodes[i];let current=parent.childNodes[i];
      const key=next.nodeType===1?next.getAttribute('data-follow'):null;
      if(key&&current?.getAttribute?.('data-follow')!==key){const existing=[...parent.children].find(n=>n.getAttribute('data-follow')===key);if(existing)parent.insertBefore(existing,current||null);current=parent.childNodes[i];}
      if(!current){parent.append(next.cloneNode(true));continue;}
      if(current.nodeType!==next.nodeType||current.nodeName!==next.nodeName){current.replaceWith(next.cloneNode(true));continue;}
      if(next.nodeType===3){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;continue;}
      if(next.nodeType!==1)continue;
      for(const attribute of [...current.attributes])if(!next.hasAttribute(attribute.name))current.removeAttribute(attribute.name);
      for(const attribute of [...next.attributes])if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
      children(current,next);
    }
    while(parent.childNodes.length>desired.childNodes.length)parent.lastChild.remove();
  }
  children(root,template.content);
}
