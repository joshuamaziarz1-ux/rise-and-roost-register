(()=>{
  const add=()=>{
    const tabs=document.querySelector('#adminScreen .tabs');
    if(!tabs||document.getElementById('openTestLab'))return;
    const b=document.createElement('button');
    b.className='btn tab';
    b.id='openTestLab';
    b.textContent='Test Lab';
    b.onclick=()=>{location.href='test.html?v=4.5'};
    tabs.appendChild(b);
  };
  add();
  const oldRender=window.renderAll;
  if(typeof oldRender==='function')window.renderAll=function(){oldRender();add()};
  if(!document.getElementById('rr45Features')){
    const s=document.createElement('script');
    s.id='rr45Features';
    s.src='v4.5-features.js?v=4.5.1';
    document.body.appendChild(s);
  }
})();