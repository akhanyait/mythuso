import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const origin=process.env.KIT_ORIGIN||'http://127.0.0.1:8192';
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'/tmp/mythuso-scenes',size:{width:1440,height:1000}}});
 const page=await context.newPage();
 await page.goto(`${origin}/docs/design-review/life-kit/#patient`);
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Find your care',exact:false}).click();
 await page.waitForURL('**/#care');await page.waitForTimeout(1500);
 assert.equal(await page.locator('.n-service-row').count(),9);
 await page.getByRole('button',{name:'Family health',exact:true}).click();assert.equal(await page.locator('.n-service-row').count(),3);
 await page.getByRole('searchbox',{name:'Search care services'}).fill('zzzz');assert.match(await page.locator('.n-empty').innerText(),/No matching/);
 await page.getByRole('searchbox',{name:'Search care services'}).fill('Mother');assert.equal(await page.locator('.n-service-row').count(),1);
 await page.locator('.n-service-row').click();assert.match(await page.locator('#detail-body').innerText(),/not a booking/);await page.keyboard.press('Escape');
 await page.getByRole('searchbox',{name:'Search care services'}).fill('');await page.getByRole('button',{name:'All care',exact:true}).click();
 await page.getByRole('navigation',{name:'Design concepts'}).getByRole('link',{name:'ControlTower'}).click();await page.waitForTimeout(1500);
 await page.getByRole('link',{name:'Weekly review'}).click();await page.waitForURL('**/#activity');await page.waitForTimeout(1500);
 assert.equal(await page.locator('.n-day-row').count(),7);
 assert.equal(await page.locator('.n-week-metrics>div').first().locator('strong').innerText(),'104');
 await page.getByRole('button',{name:'Motion on',exact:true}).click();
 await page.getByRole('link',{name:'ControlTower overview'}).click();await page.waitForURL('**/#tower');assert.equal(await page.locator('html').getAttribute('data-motion'),'off');
 const video=page.video();await context.close();await video.saveAs('docs/design-review/life-kit/screenshots/new-designs-motion.webm');
 console.log('Care search/category/empty state, service detail, weekly sample totals, motion-off navigation passed. Motion walkthrough saved.');
}finally{await browser.close();}
