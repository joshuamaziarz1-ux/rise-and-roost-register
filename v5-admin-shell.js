(()=>{
  function testQuery(){
    return new URLSearchParams(location.search).get('test')==='1'?'?test=1':'';
  }
  function openRegister(){
    location.href='register-v5.html'+testQuery();
  }
  function setup(){
    document.title='Rise & Roost Admin v5.0';
    document.querySelectorAll('.admin-top .sub').forEach(el=>el.textContent='Rise & Roost Admin v5.0');
    document.querySelectorAll('#settingsTab .danger-zone strong').forEach(el=>el.textContent='Rise & Roost Admin v5.0');

    const exit=document.getElementById('exitAdmin');
    if(exit){
      exit.textContent='Open Register';
      exit.onclick=openRegister;
    }

    const adminBtn=document.getElementById('adminBtn');
    if(adminBtn && document.getElementById('adminScreen')?.classList.contains('hidden')){
      adminBtn.click();
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(setup,60),{once:true});
  }else{
    setTimeout(setup,60);
  }
})();