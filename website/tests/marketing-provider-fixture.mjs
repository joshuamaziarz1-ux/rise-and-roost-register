import assert from 'node:assert/strict';
export function mockProvider(owner = 'owner@example.test') {
 const calls=[],contacts=[],segments=new Map(),broadcasts=new Map();let sends=0,unknown=false,extras=false;
 const list=data=>Response.json({data,has_more:false});
 const fetcher=async(url,opts)=>{
  const u=new URL(url),path=u.pathname,method=opts.method,body=opts.body?JSON.parse(opts.body):{};
  calls.push({path,method,body,key:opts.headers.Authorization});
  assert.equal(opts.headers.Authorization,'Bearer synthetic-marketing');assert.doesNotMatch(path,/^\/emails/);
  if(path==='/usage')return Response.json({contacts:{used:contacts.length,limit:1000},segments:{used:segments.size,limit:3}});
  if(path==='/domains')return list([{name:'rise-and-roost.com',status:'verified'}]);
  if(path==='/contacts'&&method==='GET')return list(contacts);
  if(path==='/contacts'&&method==='POST'){const c={id:crypto.randomUUID(),...body};contacts.push(c);return Response.json({id:c.id});}
  if(path.startsWith('/contacts/')&&method==='PATCH'){Object.assign(contacts.find(c=>c.id===path.split('/')[2]),body);return Response.json({id:path.split('/')[2]});}
  if(path==='/segments'&&method==='GET')return list([...segments.keys()].map(id=>({id})));
  if(path==='/segments'&&method==='POST'){const id=crypto.randomUUID();segments.set(id,[]);return Response.json({id});}
  if(/^\/contacts\/[^/]+\/segments\//.test(path)&&method==='POST'){const [, ,c, ,s]=path.split('/');segments.get(s).push(contacts.find(v=>v.id===c));return Response.json({id:c});}
  if(/^\/segments\/[^/]+\/contacts$/.test(path))return list([...segments.get(path.split('/')[2]),...(extras?[{id:'alien',email:'other@example.test',unsubscribed:false}]:[])]);
  if(path==='/broadcasts'&&method==='GET')return list([...broadcasts.keys()].map(id=>({id})));
  if(path==='/broadcasts'&&method==='POST'){assert.equal(body.send,false);const id=crypto.randomUUID();broadcasts.set(id,{...body,id,status:'draft'});return Response.json({id});}
  if(/^\/broadcasts\/[^/]+\/recipients$/.test(path)){assert.ok(u.searchParams.get('type'));return list(u.searchParams.get('type')==='delivered'?[{id:'cursor',email:owner}]:[]);}
  if(/^\/broadcasts\/[^/]+\/send$/.test(path)){sends++;broadcasts.get(path.split('/')[2]).status='sent';if(unknown)throw new Error('sensitive provider body');return Response.json({id:path.split('/')[2]});}
  if(/^\/broadcasts\/[^/]+$/.test(path))return Response.json(broadcasts.get(path.split('/')[2]));
  throw new Error('Unexpected endpoint '+path);
 };
 return {fetcher,calls,contacts,segments,broadcasts,get sends(){return sends},setUnknown:()=>unknown=true,setExtras:()=>extras=true};
}
