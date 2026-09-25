// Run with the repository served at KIT_ORIGIN. Exercises the standalone deliverable, not the app.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const origin=process.env.KIT_ORIGIN||'http://127.0.0.1:8192';
const browser=await chromium.launch();
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
const results=[];
try {
 for(const width of [1440,720,390,320]){
  await page.setViewportSize({width,height:width===1440?1100:844});
  for(const screen of ['tower','dispatch','patient','gilbert','landing','kit','care','activity','province']){
   await page.goto(`${origin}/docs/design-review/life-kit/#${screen}`);await page.waitForTimeout(1400);
   await page.evaluate(()=>document.fonts.ready);
   const problems=await page.evaluate(()=>{
    const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    const overflow=[...document.querySelectorAll('main,section,.card,.shell,.review-bar,nav')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className||e.tagName);
    const small=[...document.querySelectorAll('main *,header *,aside *')].filter(visible).filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName);
    const targets=[...document.querySelectorAll('button,a,input,select,summary')].filter(visible).filter(e=>!e.classList.contains('skip')).filter(e=>e.getBoundingClientRect().height<44||e.getBoundingClientRect().width<44).map(e=>e.textContent.trim());
    const broken=[...document.images].filter(e=>!e.complete||e.naturalWidth===0).map(e=>e.src);
    return {overflow,small,targets,broken,documentOverflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.deepEqual(problems,{overflow:[],small:[],targets:[],broken:[],documentOverflow:false},`${screen}@${width}: ${JSON.stringify(problems)}`);
   results.push(`${screen} @ ${width}px: no overflow, undersized text/targets or broken images`);
   if(width===1440||width===390)await page.screenshot({path:new URL(`screenshots/${screen}-${width===1440?'desktop':'mobile'}.png`,import.meta.url).pathname,fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1100});
 await page.goto(`${origin}/docs/design-review/life-kit/#tower`);
 await page.getByRole('button',{name:'Open dispatch'}).click();await page.waitForURL('**/#dispatch');
 await page.getByRole('button',{name:'Incidents',exact:true}).click();assert.match(await page.locator('#queue-state').innerText(),/No incidents/);
 await page.getByRole('button',{name:'Understand this state'}).click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(e=>e.open),false);
 await page.goto(`${origin}/docs/design-review/life-kit/#gilbert`);
 await page.getByRole('button',{name:'How does care at home work?'}).click();assert.match(await page.locator('#answer').innerText(),/nurse-led/);
 await page.getByLabel('Ask GilbertOne').fill('Design test');await page.getByRole('button',{name:'Send preview message'}).click();assert.match(await page.locator('#answer').innerText(),/not sent or saved/);assert.equal(await page.getByLabel('Ask GilbertOne').inputValue(),'');
 await page.goto(`${origin}/docs/design-review/life-kit/#kit`);await page.getByRole('button',{name:'Compact',exact:true}).click();assert.match(await page.locator('#density-note').innerText(),/Compact:/);
 await page.getByRole('button',{name:'Motion on',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-motion'),'off');
 await page.getByRole('button',{name:'Motion off',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-motion'),'on');
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Replay entrance'}).click();assert.equal(await page.locator('main').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.reload();await page.keyboard.press('Tab');const focus=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);assert.notEqual(focus,'none');
 results.push('Navigation, queue filtering, modal/Escape, scripted prompts, form clearing, density explanation, reduced motion and keyboard focus: passed');
 assert.deepEqual(errors,[]);results.push('No browser page errors or HTTP failures');
 writeFileSync(new URL('verification.txt',import.meta.url),results.join('\n')+'\n');console.log(results.join('\n'));
}finally{await browser.close();}
