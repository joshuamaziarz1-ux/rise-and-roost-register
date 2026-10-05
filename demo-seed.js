(()=>{
  const q=new URLSearchParams(location.search);
  if(q.get('demo')!=='1')return;
  const key='riseRoostRegisterTESTDataV2';
  if(localStorage.getItem(key))return;

  const now=new Date().toISOString();
  const data={
    brands:[{id:'brand_demo_roost',name:'Rise & Roost',active:true}],
    items:[
      {id:'item_demo_eggs',brandId:'brand_demo_roost',name:'Farm Fresh Eggs - Dozen',price:4,stock:18,lowStock:4,active:true,category:'eggs'},
      {id:'item_demo_bread',brandId:'brand_demo_roost',name:'Sourdough Bread',price:7,stock:8,lowStock:2,active:true,category:'baked'},
      {id:'item_demo_raisin',brandId:'brand_demo_roost',name:'Raisin Sourdough',price:10,stock:4,lowStock:1,active:true,category:'baked'},
      {id:'item_demo_honey',brandId:'brand_demo_roost',name:'Local Honey',price:8,stock:6,lowStock:2,active:true,category:'other'},
      {id:'item_demo_jam',brandId:'brand_demo_roost',name:'Strawberry Jam',price:6,stock:10,lowStock:2,active:true,category:'other'}
    ],
    sales:[],
    pickups:[],
    stockLog:[],
    customers:[
      {id:'customer_demo_danielle',name:'Danielle Demo',phone:'2605550123',cartonCredits:0,roostCredits:3,totalCartons:3,freeDozens:0,createdAt:now,updatedAt:now}
    ],
    cartonReturns:[],
    cartonRewards:[],
    roostReturns:[],
    comments:[],
    roostReturnTypes:[
      {id:'egg-carton',name:'Egg Carton',credit:1,active:true},
      {id:'jar',name:'Jar',credit:1,active:true},
      {id:'bottle',name:'Bottle',credit:1,active:true}
    ],
    settings:{}
  };
  localStorage.setItem(key,JSON.stringify(data));
})();