(()=>{
  // Keep the home-screen Join the Roost path working even though the Roost hub button is now My Roost.
  const joinLink=document.getElementById('joinFromCheckin');
  if(joinLink){
    joinLink.onclick=()=>{
      ['kioskHome','shopView','pickupView','cartonView','roostHub','myRoostView','feedbackView'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
      const j=document.getElementById('joinView');if(!j)return;
      j.classList.remove('hidden');
      j.querySelector('.join-form')?.classList.remove('hidden');
      ['joinName','joinPhone','joinEmail'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=''});
      const p=document.getElementById('joinPickupAlerts');if(p)p.checked=true;
      const s=document.getElementById('joinStoreUpdates');if(s)s.checked=false;
      const r=document.getElementById('joinResult');if(r)r.innerHTML='';
      window.scrollTo(0,0);
    };
  }

  // Make sure Test Lab remains a real navigation button after the extra admin tab wiring.
  const testBtn=document.getElementById('openTestLab');
  if(testBtn)testBtn.onclick=()=>{location.href='test.html?v=4.5'};

  // Small count bubble styling for new customer messages.
  const style=document.createElement('style');
  style.textContent='.alert-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;margin-left:4px;border-radius:999px;background:#8a3d35;color:#fff;font-size:.72rem;vertical-align:middle}';
  document.head.appendChild(style);
})();