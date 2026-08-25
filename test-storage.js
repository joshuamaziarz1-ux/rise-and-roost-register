(()=>{
  const isTest=location.pathname.endsWith('/test.html')||new URLSearchParams(location.search).get('test')==='1';
  if(!isTest)return;
  const map={
    riseRoostRegisterDataV2:'riseRoostRegisterTESTDataV2',
    riseRoostRegisterDataV1:'riseRoostRegisterTESTDataV1',
    riseRoostRegisterPinV1:'riseRoostRegisterTESTPinV1'
  };
  const gp=Storage.prototype.getItem,sp=Storage.prototype.setItem,rp=Storage.prototype.removeItem;
  window.__rrLiveStorage={
    get:key=>gp.call(localStorage,key),
    set:(key,val)=>sp.call(localStorage,key,val),
    remove:key=>rp.call(localStorage,key)
  };
  Storage.prototype.getItem=function(key){return gp.call(this,this===localStorage&&map[key]?map[key]:key)};
  Storage.prototype.setItem=function(key,val){return sp.call(this,this===localStorage&&map[key]?map[key]:key,val)};
  Storage.prototype.removeItem=function(key){return rp.call(this,this===localStorage&&map[key]?map[key]:key)};
  window.__RR_TEST_MODE=true;
})();