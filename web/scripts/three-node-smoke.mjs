// Browser check with synthetic API/SSE data; no hardware, credentials or broker.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let disconnected=false;
 const stamp=()=>new Date().toISOString();
 const nodes=()=>['access','environment','assistant'].map(role=>({v:1,room:'a101',device:`a101-${role}`,role,
  status:role==='access'&&disconnected?'offline':'online',status_at:stamp(),received_at:stamp(),
  telemetry:{v:1,room:'a101',device:`a101-${role}`,role,session_id:null,ts:null,uptime_ms:70000,
   comfort:role==='environment'?85:null,state:'OK',params_version:0,lux:null,temp_c:role==='environment'?23.4:null,
   rh_pct:role==='environment'?55:null,noise_rel:role==='environment'?.2:null,light_rel:role==='access'?null:role==='environment'?.6:.3,
   presence:false,fan_on:false,agent_online:true,voice_state:'idle',received_at:stamp()}}));
 const config={v:1,room:'a101',params_version:0,temp_c:[21,24],rh_pct:[40,60],lux:[300,500],noise_rel_max:.5,
  weights:{temp:.35,rh:.2,lux:.2,noise:.25},ok_min:80,regular_min:60,source:{temp:'default',noise:'default',lux:'default'}};
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());const path=url.pathname.replace('/api','');
  if(path==='/live/a101')return route.fulfill({status:200,contentType:'text/event-stream',body:nodes().map(node=>`event: node\ndata: ${JSON.stringify(node)}\n\n`).join('')});
  const data=path==='/rooms'?[{id:'a101',name:'A101',status:'online',current_session_id:null,last_telemetry:null}]:
   path==='/rooms/a101/nodes'?nodes():path==='/classes/current'?{room:'a101',session:null,latest_reading:null}:
   path==='/comfort/params/a101'?{room:'a101',current:config,history:[]}:{status:'ok',database:'available',data:[],found:false};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(`${process.argv[2]??'http://127.0.0.1:5189'}/aula/a101`);
 await page.getByRole('heading',{name:'Nodos por zona',exact:true}).waitFor();
 await page.getByText('Luz relativa: 60 % · sin calibrar a lux',{exact:true}).waitFor();
 assert.equal(await page.getByText('Luz relativa: 30 % · sin calibrar a lux',{exact:true}).count(),1);
 assert.equal(await page.getByText('Sin movimiento',{exact:true}).count(),1);
 disconnected=true;
 await page.reload();
 await page.getByRole('heading',{name:'Nodos por zona',exact:true}).waitFor();
 assert.equal(await page.getByText('Sin conexión',{exact:true}).count(),1);
 await mkdir('screenshots',{recursive:true});
 await page.screenshot({path:'screenshots/three-nodes-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'screenshots/three-nodes-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS: three zones, independent offline status, two relative light readings, no occupancy claim; desktop/mobile. Synthetic data only.');
}finally{await browser.close();}
