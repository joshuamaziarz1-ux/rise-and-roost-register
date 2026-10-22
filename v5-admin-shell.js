(()=>{
  function openRegister(){
    location.href='register-cloud-beta.html';
  }
  function setup(){
    document.title='Rise & Roost Admin v5.2.0-rc.2';
    document.querySelectorAll('.admin-top .sub').forEach(el=>el.textContent='Rise & Roost Admin v5.2.0-rc.2');
    document.querySelectorAll('#settingsTab .danger-zone strong').forEach(el=>el.textContent='Rise & Roost Admin v5.2.0-rc.2');

    const exit=document.getElementById('exitAdmin');
    if(exit){
      exit.textContent='Open Register';
      exit.onclick=openRegister;
    }

    const adminBtn=document.getElementById('adminBtn');
    if(!window.__RR_CLOUD_MODE && adminBtn && document.getElementById('adminScreen')?.classList.contains('hidden')){
      adminBtn.click();
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(setup,60),{once:true});
  }else{
    setTimeout(setup,60);
  }
})();