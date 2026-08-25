(()=>{
  const s=document.createElement('script');
  s.src='v5base.js?v=5.2';
  s.onload=()=>{
    const fixLabels=()=>{
      const oldBtn=document.querySelector('[data-admin-name="Ivan"]');
      if(oldBtn){oldBtn.dataset.adminName='Joshua';oldBtn.textContent='Joshua';}
      const hints=[...document.querySelectorAll('#settingsTab .hint')];
      hints.forEach(el=>{if(el.textContent.includes('Danielle and Ivan'))el.textContent=el.textContent.replace('Danielle and Ivan','Danielle and Joshua');});
      document.title='Rise & Roost Register v5.2';
      document.querySelectorAll('.version').forEach(el=>el.textContent='Rise & Roost Register v5.2');
      const adminSub=document.querySelector('#adminScreen .admin-top .sub');
      if(adminSub&&adminSub.textContent.includes('Register v5'))adminSub.textContent=adminSub.textContent.replace('Register v5','Register v5.2');
      const versionStrong=document.querySelector('#settingsTab .danger-zone strong');
      if(versionStrong)versionStrong.textContent='Rise & Roost Register v5.2';
    };
    fixLabels();
    const observer=new MutationObserver(fixLabels);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  };
  document.body.appendChild(s);
})();