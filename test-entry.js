(()=>{
  const add=()=>{
    const tabs=document.querySelector('#adminScreen .tabs');
    if(!tabs||document.getElementById('openTestLab'))return;
    const b=document.createElement('button');
    b.className='btn tab';
    b.id='openTestLab';
    b.textContent='Test Lab';
    b.onclick=()=>{location.href='test.html?v=1'};
    tabs.appendChild(b);
  };
  add();
  const oldRender=window.renderAll;
  if(typeof oldRender==='function')window.renderAll=function(){oldRender();add()};
})();