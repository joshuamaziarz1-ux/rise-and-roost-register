(()=>{
function fixAdminNames(){
  const oldBtn=document.querySelector('[data-admin-name="Ivan"]');
  if(oldBtn){oldBtn.dataset.adminName='Joshua';oldBtn.textContent='Joshua';}
  const settingsHint=[...document.querySelectorAll('#settingsTab .hint')].find(el=>el.textContent.includes('Danielle and Ivan'));
  if(settingsHint)settingsHint.textContent=settingsHint.textContent.replace('Danielle and Ivan','Danielle and Joshua');
}
fixAdminNames();
const observer=new MutationObserver(fixAdminNames);
observer.observe(document.body,{childList:true,subtree:true});
})();