import { h, field, request } from './dom.mjs';
const signupDraft={email:'',consent:false};
export function subscriptionForm() {
 const v=signupDraft;const status=h('p',{role:'status'});
 return h('section',{class:'section-inner sub-card', 'aria-label':'Fresh from the Roost'},h('h2',{},'Fresh from the Roost'),h('p',{},'Be the first to hear about fresh baked goods, upcoming preorder dates, and seasonal favorites.'),
  h('form',{onsubmit:async e=>{e.preventDefault();const submit=e.currentTarget.querySelector('button');submit.disabled=true;try {const r=await request('/api/marketing/signup',v);status.textContent=r.message;}catch(err){status.textContent=err.message;}finally{submit.disabled=false;}}},field('Email Address',v.email,x=>v.email=x,{type:'email',required:true,autocomplete:'email'}),field('I agree to receive bakery updates from Rise & Roost.',v.consent,x=>v.consent=x,{type:'checkbox',required:true}),h('button',{type:'submit'},'Sign Me Up')),status);
}
export function subscriptionAction() {
 const params=new URLSearchParams(location.hash.slice(1)),kind=params.has('confirm')?'confirm':params.has('unsubscribe')?'unsubscribe':null,token=kind&&params.get(kind);
 if(!kind)return null;
 history.replaceState(null,'',location.pathname);
 const status=h('p',{role:'status'});
 return h('section',{class:'section-inner sub-card'},h('h1',{},kind==='confirm'?'Confirm your subscription':'Unsubscribe'),h('button',{type:'button',onclick:async e=>{e.target.disabled=true;try{status.textContent=(await request('/api/marketing/'+kind,{token})).message;}catch(err){status.textContent=err.message;e.target.disabled=false;}}},kind==='confirm'?'Confirm My Subscription':'Unsubscribe'),status);
}
