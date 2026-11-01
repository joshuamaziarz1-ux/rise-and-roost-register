import { h, button, request } from './dom.mjs';
export async function start(root) {
  let setupToken=new URLSearchParams(location.hash.slice(1)).get('setup')||'';
  const setup=location.pathname==='/studio/setup'&&!!setupToken;
  history.replaceState({},'',setup?'/studio/setup':'/studio');
  document.title='Rise & Roost Website Studio';
  async function dashboard(){
    const state=await request('/api/studio');
    history.replaceState({},'','/studio');
    await (await import('./management.mjs')).start(root,state);
  }
  function screen(configured=true,message=''){
    let busy=false;
    const feedback=h('p',{role:'status','aria-live':'polite'},message);
    const pin=h('input',{id:'owner-pin',type:'password',inputmode:'numeric',pattern:'[0-9]{4}',minlength:4,maxlength:4,required:true,autocomplete:setup?'new-password':'current-password','aria-label':setup?'Choose a 4-digit PIN':'Owner PIN'});
    const confirm=setup?h('input',{type:'password',inputmode:'numeric',pattern:'[0-9]{4}',minlength:4,maxlength:4,required:true,autocomplete:'new-password','aria-label':'Confirm PIN'}):null;
    const submit=h('button',{type:'submit',class:'primary-link'},setup?'Save PIN and open Studio':'Open Studio');
    const form=h('form',{onsubmit:async event=>{
      event.preventDefault();if(busy)return;busy=true;submit.disabled=true;feedback.textContent='';
      try{
        await request('/api/studio-pin/'+(setup?'setup':'unlock'),{pin:pin.value,...(setup?{confirmPin:confirm.value,setupToken}:{})});
        pin.value='';if(confirm)confirm.value='';setupToken='';await dashboard();
      }catch(e){pin.value='';if(confirm)confirm.value='';feedback.textContent=e.message;pin.focus();}
      finally{busy=false;submit.disabled=false;}
    }},h('label',{class:'field'},h('span',{},setup?'Choose a 4-digit PIN':'Owner PIN'),pin),setup?h('label',{class:'field'},h('span',{},'Confirm PIN'),confirm):null,submit,feedback);
    root.replaceChildren(h('main',{class:'studio-login'},h('img',{src:'/assets/logo.webp',alt:'Rise & Roost',width:84,height:84}),h('h1',{},setup?'Set your testing PIN':'Website Studio'),h('p',{},setup?'Choose the PIN you and Danielle will use on your devices.':configured?'Enter your owner PIN. This device will stay signed in.':'Your testing PIN needs its private setup link first.'),setup||configured?form:null,h('a',{href:'/'},'Visit website')));
  }
  if(setup){screen();return;}
  try{
    const status=await request('/api/studio-pin/status');
    if(status.authenticated)await dashboard();else screen(status.configured);
  }catch(e){screen(false,e.message);}
}
