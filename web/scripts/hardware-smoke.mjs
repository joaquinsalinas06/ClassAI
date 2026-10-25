// Real browser regression of isolated banks, drafts and exports. No hardware access.
// node scripts/hardware-smoke.mjs http://127.0.0.1:5188
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const base = process.argv[2] ?? "http://127.0.0.1:5188";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${base}/montajes?guia=nfc`);
  const canvas = page.locator('.hardware-canvas');
  await canvas.locator('[data-assembly-board]').waitFor();
  assert.equal(await canvas.locator('[data-wire]').count(),12);
  assert.equal(await page.locator('[data-mission-diagram="nfc"]').count(),0, 'NFC opens the physical assembly directly');
  assert.ok(!(await canvas.textContent()).includes('DHT11'));
  assert.ok(!(await canvas.textContent()).includes('PIR'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),null);
  await mkdir('screenshots',{recursive:true});
  await page.screenshot({path:'screenshots/montajes-nfc-desktop.png'});

  await page.getByRole('button',{name:'Recorrer armado',exact:true}).click();
  assert.equal(await canvas.locator('[data-wire]').count(),0);
  await page.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.equal(await canvas.locator('[data-wire]').count(),1);
  const dl = page.waitForEvent('download');
  await page.getByRole('button',{name:'SVG',exact:true}).click();
  const svg=await readFile(await (await dl).path(),'utf8');
  assert.ok(svg.includes('PN532'));
  assert.equal((svg.match(/data-wire=/g)??[]).length,12, 'SVG exports every wire even during a step');
  await page.getByRole('button',{name:'Ver todo',exact:true}).click();
  await page.getByRole('button',{name:'Materiales',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('heading',{name:'Materiales de este banco'}).waitFor();
  assert.ok((await dialog.textContent()).includes('PN532'));
  assert.ok(!(await dialog.textContent()).includes('DHT11'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByLabel('Nombre del montaje').fill('Mi NFC conservado');
  await page.keyboard.press('Escape');
  await page.locator('[data-bank-id="ambiente"]').click();
  await page.locator('[data-mission="ambiente"]').waitFor();
  assert.ok((await canvas.textContent()).includes('DHT11'));
  assert.ok(!(await canvas.textContent()).includes('PN532'));
  await page.locator('[data-bank-id="nfc"]').click();
  await page.locator('[data-mission="nfc"]').waitFor();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del montaje').inputValue(),'Mi NFC conservado');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Historial',exact:true}).click();
  await page.getByLabel('Descripción de la revisión').fill('Solo QA del visor, sin ensayo físico');
  await page.getByRole('button',{name:'Guardar revisión local',exact:true}).click();
  const saved=await page.evaluate(()=>localStorage.getItem('classai.hardware.v1'));
  await page.reload();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del montaje').inputValue(),'Mi NFC conservado');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Historial',exact:true}).click();
  await page.getByLabel('Importar montaje JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});
  await dialog.getByRole('status').filter({hasText:'Importación rechazada'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),saved);
  const jsonEvent=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  const exported=JSON.parse(await readFile(await (await jsonEvent).path(),'utf8'));
  assert.equal(exported.revisions.length,1);
  await dialog.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByLabel('Nombre del montaje').fill('Cambio que se recuperará');
  await dialog.getByRole('button',{name:'Historial',exact:true}).click();
  await page.getByRole('button',{name:'Recuperar en borrador',exact:true}).click();
  await dialog.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del montaje').inputValue(),'Mi NFC conservado');
  await page.getByRole('button',{name:'Deshacer',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del montaje').inputValue(),'Cambio que se recuperará');
  await dialog.getByRole('button',{name:'Historial',exact:true}).click();
  await page.getByLabel('Importar montaje JSON').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),saved);
  await page.keyboard.press('Escape');

  // Recovering an NFC revision while browsing ambient must also change the route.
  await page.locator('[data-bank-id="ambiente"]').click();
  await page.locator('[data-mission="ambiente"]').waitFor();
  await page.getByRole('button',{name:'Historial',exact:true}).click();
  await page.getByRole('button',{name:'Recuperar en borrador',exact:true}).click();
  await page.locator('[data-mission="nfc"]').waitFor();
  assert.ok((await canvas.textContent()).includes('PN532'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),saved);
  await page.keyboard.press('Escape');

  const ids=await page.locator('[data-bank-id]').evaluateAll(xs=>xs.map(x=>x.dataset.bankId));
  assert.equal(ids.length,16);
  for(const id of ids){
    await page.locator(`[data-bank-id="${id}"]`).click();
    await page.locator(`[data-mission="${id}"]`).waitFor();
    if(['nfc','ambiente','dht11','pir','led-boton','leds','ruido','microfono','matriz','buzzer','ventilador','pantalla','audio-salida'].includes(id)) assert.equal(await canvas.locator('[data-assembly-board]').count(),1);
    else {await canvas.locator(`[data-mission-diagram="${id}"]`).waitFor();assert.equal(await canvas.locator('[data-assembly-board]').count(),0);}
  }
  for(const id of ['led-boton','dht11','pir','ruido','microfono','leds','matriz','buzzer','ventilador','pantalla','audio-salida']) {
    await page.locator(`[data-bank-id="${id}"]`).click();
    await page.locator(`[data-mission="${id}"]`).waitFor();
    await page.getByRole('button',{name:'Historial',exact:true}).click();
    const download=page.waitForEvent('download');
    await dialog.getByRole('button',{name:'Exportar JSON',exact:true}).click();
    const bank=JSON.parse(await readFile(await (await download).path(),'utf8'));
    assert.equal(bank.bankId,id);
    await page.getByLabel('Importar montaje JSON').setInputFiles({name:`${id}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bank))});
    assert.equal(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1')),saved);
    await page.keyboard.press('Escape');
    await page.screenshot({path:`screenshots/montajes-${id}-desktop.png`});
  }
  await page.locator('[data-bank-id="ruido"]').click();
  await page.locator('[data-mission="ruido"]').waitFor();
  assert.equal(await canvas.locator('svg[data-assembly-board] > title').count(),0,'blank-canvas hover must not cover the circuit');
  for(const label of ['AO','G','+','DO'])assert.ok((await canvas.textContent()).includes(label));
  assert.equal(await canvas.locator('[data-wire]').count(),2,'only the confirmed ground network is drawn');
  assert.ok(!/(NO CONECTAR|SIN CABLE|ESPERA|Libre)/.test(await canvas.textContent()));

  await page.locator('[data-bank-id="ventilador"]').click();
  await page.locator('[data-mission="ventilador"]').waitFor();
  const fanText=await canvas.textContent();
  assert.ok(fanText.includes('Rojo = + · negro = −'));
  assert.ok(fanText.includes('COM1')&&fanText.includes('NO1')&&fanText.includes('NC1'));
  assert.ok(!/(NO CONECTAR|SIN CABLE|FAN DESCONECTADO|Libre)/.test(fanText));
  assert.ok(!fanText.includes('Fuente externa propuesta'));
  assert.equal(await canvas.locator('[data-wire]').count(),3);

  await page.locator('[data-bank-id="audio-salida"]').click();
  await page.locator('[data-mission="audio-salida"]').waitFor();
  assert.ok(!(await canvas.textContent()).includes('Fuente externa regulada'));
  await page.locator('[data-bank-id="led-boton"]').click();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByLabel('Nombre del montaje').fill('LED draft kept');
  await page.keyboard.press('Escape');
  await page.locator('[data-bank-id="microfono"]').click();
  await page.goBack();
  await page.locator('[data-mission="led-boton"]').waitFor();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del montaje').inputValue(),'LED draft kept');
  await page.keyboard.press('Escape');
  await page.goForward();
  await page.locator('[data-mission="microfono"]').waitFor();
  assert.ok(!(await canvas.textContent()).includes('DHT11'));
  await page.locator('[data-bank-id="nfc"]').click();
  await page.locator('[data-mission="nfc"]').waitFor();
  await page.locator('[data-bank-id="ambiente"]').click();
  await page.locator('[data-mission="ambiente"]').waitFor();
  await page.goBack();
  await page.locator('[data-mission="nfc"]').waitFor();
  assert.ok((await canvas.textContent()).includes('PN532'));
  assert.ok(!(await canvas.textContent()).includes('DHT11'));
  await page.goForward();
  await page.locator('[data-mission="ambiente"]').waitFor();
  assert.ok((await canvas.textContent()).includes('DHT11'));
  await page.screenshot({path:'screenshots/montajes-ambiente-desktop.png'});

  await page.locator('[data-bank-id="audio-salida"]').click();
  await page.locator('[data-mission="audio-salida"]').waitFor();
  await page.screenshot({path:'screenshots/montajes-audio-desktop.png'});
  await page.locator('[data-bank-id="nfc"]').click();
  await page.locator('[data-mission="nfc"]').waitFor();
  await page.getByRole('button',{name:'Pines y cables',exact:true}).click();
  await dialog.getByRole('table',{name:'Mapeo de pines del banco'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[role=dialog]').getAnimations().every(a=>a.playState !== 'running'));
  await page.screenshot({path:'screenshots/montajes-pines-desktop.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Usar tema oscuro',exact:true}).click();
  await page.screenshot({path:'screenshots/montajes-nfc-dark.png'});
  await page.setViewportSize({width:1024,height:768});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
  await page.screenshot({path:'screenshots/montajes-nfc-1024.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Elegir banco de prueba').selectOption('ambiente');
  await page.locator('[data-mission="ambiente"]').waitFor();
  assert.ok((await canvas.textContent()).includes('DHT11'));
  await page.getByLabel('Elegir banco de prueba').selectOption('nfc');
  await page.locator('[data-mission="nfc"]').waitFor();
  assert.ok((await canvas.textContent()).includes('PN532'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
  await page.getByRole('button',{name:'Detalles',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role=dialog]').getAnimations().every(a=>a.playState !== 'running'));
  await page.screenshot({path:'screenshots/montajes-nfc-mobile-details.png'});
  await page.keyboard.press('Escape');
  await page.screenshot({path:'screenshots/montajes-nfc-mobile.png'});
  for(const id of ['led-boton','dht11','pir','ruido','microfono','leds','matriz','buzzer','ventilador','iluminacion','pantalla','audio-salida']) {
    await page.getByLabel('Elegir banco de prueba').selectOption(id);
    await page.locator(`[data-mission="${id}"]`).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),true);
    await page.screenshot({path:`screenshots/montajes-${id}-mobile.png`});
  }
  // Inspect all physical banks at tablet width in both themes, preserving saved data.
  await page.setViewportSize({width:768,height:1024});
  for(const theme of ['dark','light']) {
    if(theme==='light')await page.getByRole('button',{name:'Usar tema claro',exact:true}).click();
    for(const id of ['led-boton','dht11','pir','ruido','microfono','leds','matriz','buzzer','ventilador','pantalla','audio-salida']) {
      await page.getByLabel('Elegir banco de prueba').selectOption(id);
      await page.locator(`[data-mission="${id}"]`).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      // SVG filters with zero-height/width bounding boxes hide straight conductors.
      assert.equal(await canvas.locator('[data-wire-color][filter]').count(),0);
      await page.screenshot({path:`screenshots/montajes-${id}-tablet-${theme}.png`});
    }
  }
  await page.setViewportSize({width:390,height:844});
  // Editing a conditional wire must preserve its electrical blocker.
  await page.getByLabel('Elegir banco de prueba').selectOption('ruido');
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await dialog.getByRole('button',{name:'Editar',exact:true}).nth(1).click();
  await page.getByLabel('Color del cable').selectOption('purple');
  await page.getByRole('button',{name:'Aplicar cable',exact:true}).click();
  await dialog.getByRole('button',{name:'Historial',exact:true}).click();
  const changedEvent=page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Exportar JSON',exact:true}).click();
  const changed=JSON.parse(await readFile(await(await changedEvent).path(),'utf8'));
  assert.ok(changed.wires[0].pending);
  assert.equal(changed.wires[0].jumper,'M–H');
  assert.equal(changed.wires[0].color,'purple');
  await page.getByLabel('Descripción de la revisión').fill('B-08 QA; condiciones eléctricas conservadas');
  await page.getByRole('button',{name:'Guardar revisión local',exact:true}).click();
  await page.reload();
  await page.locator('[data-mission="ruido"]').waitFor();
  assert.ok(!(await canvas.textContent()).includes('DHT11'));
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1'))).bankId,'ruido');
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('classai.hardware.v1'))).revisions.length,2);
  assert.deepEqual(errors,[]);
  console.log('PASS: 16 isolated banks, 13 physical references, steps, SVG, JSON, drafts, saved revisions, history navigation, drawer, dark theme, desktop/mobile; no hardware access');
} finally {await browser.close();}
