(()=>{
  const CLEAN='assets/rise-roost-logo.webp?v=4.8.6';
  const fixImg=img=>{
    if(!(img instanceof HTMLImageElement))return;
    const src=img.getAttribute('src')||'';
    if(src.includes('rise-roost-logo')&&!src.includes('rise-roost-logo.webp')){
      img.src=CLEAN;
    }
  };
  const fixTree=root=>{
    if(root instanceof HTMLImageElement)fixImg(root);
    if(root?.querySelectorAll)root.querySelectorAll('img').forEach(fixImg);
  };
  const run=()=>fixTree(document);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  new MutationObserver(records=>{
    for(const r of records){
      if(r.type==='attributes')fixImg(r.target);
      r.addedNodes.forEach(fixTree);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
})();