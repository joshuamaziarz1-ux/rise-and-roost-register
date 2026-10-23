import {test,expect} from '@playwright/test';
import {shop} from './helpers.js';

test('Cart stays usable when a shared-store redraw lands during guest or member input',async({page},info)=>{
 await shop(page);await page.locator('[data-rr-plus="item-test"]').click();
 for(const member of [false,true]){
  if(member){
   await page.evaluate(()=>RRRoost.open());await page.locator('#rrPhoneSignIn').fill('2025550100');await page.locator('#rrPhoneGo').click();
   await expect(page.locator('#rrShopMemberBar')).toContainText('Test Member');
   await page.locator('[data-rr-plus="item-test"]').click();
  }
  for(const gesture of info.project.use.hasTouch?['click','tap']:['click']){
   await page.evaluate(()=>{
    const bar=document.getElementById('rr48CartBar');window.cartGestureClicks=0;
    bar.addEventListener('click',()=>window.cartGestureClicks++,{once:true});
    // Land the normal redraw callbacks inside input, rather than relying on
    // a timer race. WebKit used to deliver down/up but suppress the click.
    const redraw=()=>{renderCart();RRRoost.renderShopBanner();};
    bar.addEventListener('mouseover',redraw,{once:true});
    bar.addEventListener('pointerdown',redraw,{once:true});
   });
   await page.locator('#rr48CartBar')[gesture]();
   await expect(page.locator('#shopView')).toHaveClass(/rr48-cart-open/);
   await expect(page.locator('#payBtn')).toBeVisible();
   expect(await page.evaluate(()=>window.cartGestureClicks)).toBe(1);
   await expect(page.locator('#cartList .qnum')).toHaveText(member?'2':'1');
   await page.locator('#rr48KeepShopping').click();
   await expect(page.locator('#rr48CartBar')).toContainText(member?'2 ITEMS':'1 ITEM');
  }
 }
 await page.evaluate(()=>RRRoost.logout(false));
 await expect(page.locator('#rrShopMemberBar')).toContainText('Welcome, Guest');
 expect(await page.evaluate(()=>data.customers.length+data.sales.length)).toBe(0);
});
