import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test('public HTTPS storefront and PIN-only Studio deny anonymous administration',async({page},info)=>{
 await page.goto('/');await expect(page.getByRole('link',{name:'Start Shopping',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Start Shopping',exact:true}).click();await expect(page.locator('.product-card').first()).toBeVisible();
 await page.goto('/studio');await expect(page.getByRole('heading',{name:'Website Studio',exact:true})).toBeVisible();
 for(const name of ['Workspace ID','Private access key','Email address'])await expect(page.getByLabel(name,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Hi, Danielle!',exact:true})).toHaveCount(0);
 expect((await page.request.get('/api/manage/snapshot')).status()).toBe(401);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await mkdir('qa-results/pin-hosted',{recursive:true});await page.screenshot({path:`qa-results/pin-hosted/studio-${info.project.name}.png`,fullPage:true});
});
