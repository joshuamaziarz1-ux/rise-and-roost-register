/* Recovery only: no private Admin snapshot cache. Supabase is authoritative. */
(()=>{
 const scope=()=>window.RR_CONFIG.url+'/'+window.RR_CONFIG.endpoint;
 const key=name=>'rr.v2.'+scope()+'.'+name;
 const copy=v=>JSON.parse(JSON.stringify(v));
 function get(storage,name){try{return JSON.parse(storage.getItem(key(name))||'null');}catch{return null;}}
 function put(storage,name,value,required=false){try{storage.setItem(key(name),JSON.stringify(value));return true;}catch{if(required)throw new Error('Browser recovery storage is unavailable. Reopen this page before saving.');return false;}}
 window.RRData={
 saveCatalog:catalog=>put(localStorage,'catalog',{savedAt:new Date().toISOString(),value:copy(catalog)}),getCatalog:()=>get(localStorage,'catalog'),
 setPendingAdmin:pending=>put(sessionStorage,'pendingAdmin',copy(pending),true),getPendingAdmin:()=>get(sessionStorage,'pendingAdmin'),clearPendingAdmin:()=>sessionStorage.removeItem(key('pendingAdmin')),
 archiveDraft:draft=>put(sessionStorage,'conflictAdmin',copy(draft),true),getDraft:()=>get(sessionStorage,'conflictAdmin'),clearPrivate:()=>{sessionStorage.removeItem(key('pendingAdmin'));sessionStorage.removeItem(key('conflictAdmin'));}
 };
})();
