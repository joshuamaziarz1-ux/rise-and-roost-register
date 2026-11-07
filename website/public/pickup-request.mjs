import { h, button, field, notify } from './dom.mjs';
import { pickupLabel } from './model.mjs';
const drafts=new Map();
export function pickupRequest(order, submit, busy=false) {
  if (!order || order.resolution || !['pending','preparing','ready'].includes(order.status)) return null;
  const pending=order.messages?.find(m=>m.pickupRequestStatus==='pending');
  if(pending) return h('section',{class:'sub-card',role:'status'},h('h2',{},'Your request has been sent!'),h('p',{},'Danielle will review your pickup change request. Your original pickup time will remain scheduled until the change is approved.'));
  let values=drafts.get(order.id); if(!values){values={date:'',time:'',message:'',requestId:crypto.randomUUID(),open:false};drafts.set(order.id,values);}
  return h('details',{class:'sub-card',id:'pickup-request',open:values.open,ontoggle:e=>values.open=e.target.open},h('summary',{},'Request Pickup Change'),
    h('p',{},order.orderNumber), order.pickupCustomerName ? h('p',{},order.pickupCustomerName) : null,h('p',{},'Current pickup: '+pickupLabel(order.pickup)),
    h('form',{onsubmit:async e=>{e.preventDefault(); try { if(await submit(values)){drafts.delete(order.id);notify('Your request has been sent!');} } catch(err){notify(err.message,true);}}},
      field('Requested new pickup date',values.date,v=>values.date=v,{type:'date',required:true}),
      field('Requested new pickup time',values.time,v=>values.time=v,{type:'time',required:true}),
      field('Message (optional)',values.message,v=>values.message=v,{type:'textarea',maxlength:2000}),
      h('p',{},'Your original pickup time remains scheduled until Danielle approves a change.'),
      h('button',{type:'submit',disabled:busy},'Send Request')));
}
