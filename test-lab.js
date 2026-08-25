(()=>{
  const testDataKey='riseRoostRegisterTESTDataV2';
  const testPinKey='riseRoostRegisterTESTPinV1';
  document.title='Rise & Roost TEST LAB';

  const style=document.createElement('style');
  style.textContent=`
    .test-banner{position:sticky;top:0;z-index:100;background:#4b3427;color:#fff;padding:10px 12px;text-align:center;font-weight:950;letter-spacing:.02em}
    .test-toolbar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;padding:10px;background:#efe4d8;border-bottom:1px solid var(--line)}
    .test-toolbar .btn{min-height:40px}
    .test-note{max-width:900px;margin:10px auto;padding:12px 14px;border:2px solid #b68b5d;border-radius:14px;background:#fff8ef;font-weight:800;text-align:center}
  `;
  document.head.appendChild(style);

  const banner=document.createElement('div');
  banner.className='test-banner';
  banner.textContent='TEST LAB — NOTHING HERE CHANGES THE LIVE REGISTER';
  document.body.prepend(banner);

  const toolbar=document.createElement('div');
  toolbar.className='test-toolbar';
  toolbar.innerHTML=`
    <button class="btn primary" id="testSamples">Load Sample Data</button>
    <button class="btn" id="testCopyLive">Copy Live Store Into Test</button>
    <button class="btn danger" id="testReset">Reset Test Data</button>
    <button class="btn ghost" id="testBackLive">Back to Live Register</button>
  `;
  banner.after(toolbar);

  const note=document.createElement('div');
  note.className='test-note';
  note.textContent='Use this page for fake sales, fake pickups, carton returns, inventory changes, and future features. Test data is stored separately from your real store data.';
  toolbar.after(note);

  document.querySelectorAll('.version').forEach(x=>x.textContent='Rise & Roost TEST LAB');
  const topSub=document.querySelector('.top .sub');if(topSub)topSub.textContent='TEST MODE · Separate Data';
  const adminSub=document.querySelector('.admin-top .sub');if(adminSub)adminSub.textContent='TEST MODE · Separate Data';
  const ver=document.querySelector('#settingsTab .danger-zone strong');if(ver)ver.textContent='Rise & Roost TEST LAB';

  function sampleData(){
    const eggs='item_test_eggs',bread='item_test_bread',honey='item_test_honey',jam='item_test_jam',rbrand='brand_test_roost',sbrand='brand_test_sample';
    data=migrate({
      brands:[
        {id:rbrand,name:'Rise & Roost',active:true},
        {id:sbrand,name:'Sample Homestead',active:true}
      ],
      items:[
        {id:eggs,brandId:rbrand,name:'Farm Fresh Eggs - Dozen',price:4,stock:24,lowStock:4,active:true},
        {id:bread,brandId:rbrand,name:'Sourdough Bread',price:7,stock:10,lowStock:2,active:true},
        {id:honey,brandId:rbrand,name:'Local Honey',price:8,stock:8,lowStock:2,active:true},
        {id:jam,brandId:sbrand,name:'Strawberry Jam',price:6,stock:12,lowStock:2,active:true}
      ],
      sales:[],pickups:[],stockLog:[],
      customers:[
        {id:'customer_taylor_test',name:'Taylor Test',phone:'2605550101',email:'taylor@example.com',cartonCredits:11,totalCartons:11,freeDozens:0,createdAt:new Date().toISOString()},
        {id:'customer_mary_test',name:'Mary Test',phone:'2605550102',email:'mary@example.com',cartonCredits:5,totalCartons:5,freeDozens:0,createdAt:new Date().toISOString()}
      ],
      cartonReturns:[],cartonRewards:[],
      cartonSettings:{cartonsPerFreeDozen:12,rewardItemId:eggs}
    });
    persist();cart={};pickupDraft=[];renderAll();
    alert('Sample test data loaded. Taylor Test has 11 carton credits so you can test earning a free dozen with one return.');
  }

  function copyLive(){
    const raw=window.__rrLiveStorage?.get('riseRoostRegisterDataV2');
    if(!raw)return alert('There is no live register data saved on this device yet.');
    if(!confirm('Copy the current LIVE store data into the Test Lab?\n\nThis makes a separate copy. Changes in Test Lab will NOT affect the live register.'))return;
    window.__rrLiveStorage.set(testDataKey,raw);
    location.reload();
  }

  function resetTest(){
    if(!confirm('Delete ALL Test Lab data and start fresh?\n\nYour LIVE register will not be changed.'))return;
    window.__rrLiveStorage?.remove(testDataKey);
    window.__rrLiveStorage?.remove('riseRoostRegisterTESTDataV1');
    window.__rrLiveStorage?.remove(testPinKey);
    location.reload();
  }

  $('testSamples').onclick=sampleData;
  $('testCopyLive').onclick=copyLive;
  $('testReset').onclick=resetTest;
  $('testBackLive').onclick=()=>{location.href='index.html?v=4.2'};

  // Test Lab is already behind the live Admin section, so no second PIN is needed here.
  if($('adminBtn'))$('adminBtn').onclick=()=>{$('adminScreen').classList.remove('hidden');renderAdmin();showTab('dashboard')};
})();