import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await mkdir('screenshots',{recursive:true});
 for(const id of ['nodo-acceso','nodo-ambiente','nodo-asistente']){
  await page.goto(`${process.argv[2]??'http://127.0.0.1:5189'}/montajes?banco=${id}`);
  const svg=page.locator('[data-assembly-board]');await svg.waitFor();
  const all=await svg.locator('[data-wire]').count(),pending=await svg.locator('[data-wire-pending]').count();
  assert.ok(all>20&&pending>0);
  assert.equal(await svg.locator('[data-extra-board]').count(),id==='nodo-asistente'?1:0);
  assert.ok((await svg.textContent()).includes(id==='nodo-asistente'?'38 pines':'30 pines'));
  await page.screenshot({path:`screenshots/${id}-desktop.png`});
  await page.getByRole('button',{name:'Recorrer armado',exact:true}).click();
  assert.equal(await svg.locator('[data-wire]').count(),0);
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await svg.locator('[data-wire]').count(),1);
  assert.equal(await svg.locator('[data-wire-pending]').count(),0);
  await page.screenshot({path:`screenshots/${id}-paso.png`});
  await page.getByRole('button',{name:'Ver todo',exact:true}).click();
  await page.getByLabel('Ver conexiones pendientes').uncheck();
  assert.equal(await svg.locator('[data-wire]').count(),all-pending);
  await page.getByLabel('Ver conexiones pendientes').check();
  await page.getByRole('button',{name:'Materiales',exact:true}).click();
  const dialog=page.getByRole('dialog');assert.ok((await dialog.textContent()).includes('H–H'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Historial',exact:true}).click();
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  const exported=JSON.parse(await readFile(await(await download).path(),'utf8'));
  assert.equal(exported.bankId,id);assert.ok(exported.wires.some(w=>w.jumper==='H–H'));
  await page.getByLabel('Importar montaje JSON').setInputFiles({name:`${id}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),null);
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`screenshots/${id}-mobile.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:1000});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: 3 integrated scenes, 4 breadboards, H–H, conditional wires, progressive build, JSON round trips, storage preserved; desktop/mobile. No hardware.');
}finally{await browser.close();}
