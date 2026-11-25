/** A signal only. Each tab reads the current moderated catalog from the server. */
const changeKey='rmt-catalog-changed';

export function announceCatalogChange(){
  window.dispatchEvent(new Event(changeKey));
  try{window.localStorage.setItem(changeKey,crypto.randomUUID());}catch{/* Focus and foreground refresh also work without storage. */}
}

export function listenForCatalogChanges(refresh:()=>void){
  const fromAnotherTab=(event:StorageEvent)=>{if(event.key===changeKey)refresh();};
  window.addEventListener(changeKey,refresh);
  window.addEventListener('storage',fromAnotherTab);
  return ()=>{
    window.removeEventListener(changeKey,refresh);
    window.removeEventListener('storage',fromAnotherTab);
  };
}
