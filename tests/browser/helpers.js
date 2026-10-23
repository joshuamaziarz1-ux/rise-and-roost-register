import {expect} from '@playwright/test';
export const ADMIN='11111111-1111-4111-8111-111111111111';
export async function adminLogin(page){
 await page.addInitScript(id=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:'test-admin-token',refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id,email:'admin@test.invalid',aud:'authenticated'}})),ADMIN);
 await page.goto('/admin-cloud-beta.html');await expect(page.locator('#rrCloudGate')).toHaveCount(0);await expect(page.locator('body')).toHaveAttribute('data-cloud','online');
}
export async function shop(page){await page.goto('/register-cloud-beta.html');await expect(page.locator('body')).toHaveAttribute('data-cloud','online');await page.locator('#rr48StartShop').click();}
export async function rpc(page,action,payload={},admin=false){const response=await page.request.post('/functions/v1/rise-roost-sync',{data:{action,...payload},headers:admin?{authorization:'Bearer test-admin-token'}:{}});expect(response.ok(),await response.text()).toBe(true);return response.json();}
export async function settled(page){await page.waitForTimeout(4500);await page.evaluate(()=>document.fonts.ready);}
