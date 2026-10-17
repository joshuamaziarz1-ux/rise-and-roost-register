(()=>{
  const VERSION=1;
  const KEYS={
    catalog:'riseRoostPersistentCatalogV1',
    admin:'riseRoostPersistentAdminV1',
    pendingAdmin:'riseRoostPersistentPendingAdminV1',
    conflictAdmin:'riseRoostPersistentConflictAdminV1'
  };
  const memory=new Map();

  function clone(value){
    if(value===undefined)return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function read(key){
    try{
      const raw=localStorage.getItem(key);
      if(raw)return JSON.parse(raw);
    }catch(e){}
    return memory.has(key)?clone(memory.get(key)):null;
  }

  function write(key,value){
    const record=clone(value);
    memory.set(key,record);
    try{
      localStorage.setItem(key,JSON.stringify(record));
      return true;
    }catch(e){
      console.warn('Rise & Roost persistent cache could not write to localStorage.',e);
      return false;
    }
  }

  function remove(key){
    memory.delete(key);
    try{localStorage.removeItem(key)}catch(e){}
  }

  function envelope(value,meta={}){
    return {
      version:VERSION,
      savedAt:new Date().toISOString(),
      ...meta,
      value:clone(value)
    };
  }

  function saveCatalog(catalog){
    if(!catalog||typeof catalog!=='object')return false;
    return write(KEYS.catalog,envelope(catalog,{revision:Number(catalog.revision||0)}));
  }

  function getCatalog(){
    const r=read(KEYS.catalog);
    return r&&r.version===VERSION?r:null;
  }

  function saveAdmin(data,revision){
    if(!data||typeof data!=='object')return false;
    return write(KEYS.admin,envelope(data,{revision:Number(revision||0)}));
  }

  function getAdmin(){
    const r=read(KEYS.admin);
    return r&&r.version===VERSION?r:null;
  }

  function setPendingAdmin(data,revision){
    if(!data||typeof data!=='object')return false;
    return write(KEYS.pendingAdmin,envelope(data,{revision:Number(revision||0)}));
  }

  function getPendingAdmin(){
    const r=read(KEYS.pendingAdmin);
    return r&&r.version===VERSION?r:null;
  }

  function clearPendingAdmin(){
    remove(KEYS.pendingAdmin);
  }

  function archivePendingConflict(reason='revision-conflict'){
    const pending=getPendingAdmin();
    if(!pending)return null;
    write(KEYS.conflictAdmin,{...pending,conflictAt:new Date().toISOString(),reason});
    clearPendingAdmin();
    return pending;
  }

  function getConflictAdmin(){
    const r=read(KEYS.conflictAdmin);
    return r&&r.version===VERSION?r:null;
  }

  function clearConflictAdmin(){
    remove(KEYS.conflictAdmin);
  }

  function status(){
    const catalog=getCatalog();
    const admin=getAdmin();
    const pending=getPendingAdmin();
    return {
      version:VERSION,
      catalogSavedAt:catalog?.savedAt||null,
      catalogRevision:Number(catalog?.revision||0),
      adminSavedAt:admin?.savedAt||null,
      adminRevision:Number(admin?.revision||0),
      pendingAdmin:!!pending,
      pendingRevision:Number(pending?.revision||0)
    };
  }

  window.RRData={
    version:VERSION,
    clone,
    saveCatalog,
    getCatalog,
    saveAdmin,
    getAdmin,
    setPendingAdmin,
    getPendingAdmin,
    clearPendingAdmin,
    archivePendingConflict,
    getConflictAdmin,
    clearConflictAdmin,
    status
  };
})();