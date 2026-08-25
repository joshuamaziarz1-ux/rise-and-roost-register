(()=>{
  const s=document.createElement('script');
  s.src='v5base.js?v=5';
  s.onload=()=>{
    const oldBtn=document.querySelector('[data-admin-name="Ivan"]');
    if(oldBtn){oldBtn.dataset.adminName='Joshua';oldBtn.textContent='Joshua';}
    const hints=[...document.querySelectorAll('#settingsTab .hint')];
    hints.forEach(el=>{if(el.textContent.includes('Danielle and Ivan'))el.textContent=el.textContent.replace('Danielle and Ivan','Danielle and Joshua');});
  };
  document.body.appendChild(s);
})();