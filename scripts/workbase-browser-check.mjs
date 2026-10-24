// Focused touch/DOM integration check, using the Chrome already installed on
// GitHub's Ubuntu runner. No browser download or additional project dependency.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(path.join(tmpdir(),'sperrkreis-ui-'));
const browser=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const bundle=await build({absWorkingDir:root,stdin:{contents:`
  import {AnimationWorkshop} from './docs/src/animation-workshop.js';
  import {ModelPass} from './docs/src/model-pass.js';
  import {PlayerModels} from './docs/src/player-models.js';
  import {QuaterniusAssets} from './docs/src/quaternius-assets.js';
  const pass=new ModelPass(),library=new QuaterniusAssets(),models=new PlayerModels(pass,library);
  const game={renderer:{zombieModels:{pass},modelLibrary:library,playerModels:models},setPaused(){},ui:{hidePause(){}}};
  window.workbase=new AnimationWorkshop(game);window.workbase.open();
  let previous=performance.now();function frame(now){window.workbase.frame(Math.min(.05,(now-previous)/1000));previous=now;requestAnimationFrame(frame);}requestAnimationFrame(frame);
`,resolveDir:root,sourcefile:'workbase-browser-entry.js'},bundle:true,format:'esm',platform:'browser',write:false,logLevel:'silent'});
const badAssets=[],errors=[];
const server=createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://localhost').pathname;
    if(name.includes('/build/assets/'))badAssets.push(name);
    if(name==='/harness.html'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/harness.js"></script>');return;}
    if(name==='/harness.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
    const file=path.resolve(root,'docs','.'+decodeURIComponent(name));if(!file.startsWith(path.join(root,'docs')+path.sep))throw Error('Invalid path');
    res.setHeader('content-type',name.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));
  }catch(_){res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${temporary}`,'about:blank'],{stdio:'ignore'});
chrome.on('error',error=>errors.push(error.message));
let socket,sequence=0;const pending=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=30000){const deadline=Date.now()+timeout;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(_){}await delay(100);}throw Error('Timed out: '+label+(errors.length?' · '+errors.join(' · '):''));}
function send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function ready(){await until(()=>evaluate('Boolean(window.workbase && !workbase.busy && workbase.replay.entity && workbase.camera && !workbase.pendingReset)'), 'workbase ready');}
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const select=(name,value)=>evaluate(`(()=>{const n=document.querySelector('[data-aw="${name}"]');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
try{
  const port=await until(async()=>Number((await readFile(path.join(temporary,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome debugging port');
  const tabs=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=tabs.find(t=>t.type==='page');assert.ok(page);
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const request=pending.get(msg.id);pending.delete(msg.id);if(request){if(msg.error)request.reject(Error(msg.error.message));else request.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);});
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await send('Page.navigate',{url:base+'/harness.html'});await ready();
  assert.equal(await evaluate('workbase.mode'),'pose');
  const layout=await evaluate(`(()=>{const v=workbase.el.canvas.getBoundingClientRect(),e=workbase.el.values.closest('.aw-edit').getBoundingClientRect();return{height:e.height,bottom:e.bottom,model:v.height};})()`);
  assert.ok(layout.height>70&&layout.bottom<=845&&layout.model>=160,JSON.stringify(layout));
  const start=await evaluate(`(()=>{const h=workbase.handles.find(h=>h.channel==='weapon'),r=workbase.el.canvas.getBoundingClientRect();return{x:h.x+r.left,y:h.y+r.top};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+18,y:start.y-10,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ready();
  assert.equal(await evaluate('workbase.project.undoStack.length'),1,'one touch drag is one undo operation');
  const edited=await evaluate('JSON.stringify(workbase.project.document)');assert.ok(await evaluate('Math.abs(workbase.currentValues().weapon[0])>.005'));
  assert.equal(await evaluate('Object.keys(workbase.project.document.profiles[workbase.key()].tracks).length'),0,'a pose drag never creates timeline endpoints');
  await click('[data-aw="undo"]');await ready();assert.equal(await evaluate('workbase.project.undoStack.length'),0);
  await click('[data-aw="redo"]');await ready();assert.equal(await evaluate('JSON.stringify(workbase.project.document)'),edited);
  await click('[data-aw="save"]');assert.equal(await evaluate('JSON.stringify(workbase.project.saved)'),edited);
  await send('Page.reload');await ready();assert.equal(await evaluate('JSON.stringify(workbase.project.document)'),edited,'draft survives a real page reload');
  await click('[data-aw="apply"]');assert.ok(await evaluate(`Object.keys(JSON.parse(localStorage.getItem('sperrkreis-animation-workshop-v1-active')).profiles).length>0`));
  await click('[data-aw-mode="animation"]');await ready();await select('track','reload');await ready();
  await evaluate(`workbase.el.timeline.value='.5';workbase.el.timeline.dispatchEvent(new Event('input',{bubbles:true}));`);await until(()=>evaluate('workbase.replay.steps>0'),'reload scrub');
  assert.ok(await evaluate('Boolean(workbase.replay.player.combat.reload)'));
  await click('[data-aw-mode="test"]');await ready();assert.equal(await evaluate('workbase.canEdit()'),false);
  await select('sex','female');await ready();await select('weapon','revolver_44');await ready();assert.equal(await evaluate('workbase.replay.entity.modelSex'),'female');assert.ok(await evaluate('Boolean(workbase.replay.entity.weapon)'));
  await click('[data-aw-mode="pose"]');await ready();
  if(process.env.WORKBASE_SCREENSHOT){const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.WORKBASE_SCREENSHOT,Buffer.from(result.data,'base64'));}
  assert.deepEqual(badAssets,[]);assert.deepEqual(errors,[]);console.log('Workbase browser check passed: mobile layout, real touch drag, undo/redo, save/reload, activation, reload scrub, read-only tests and both rigs.');
}finally{socket?.close();chrome.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});}
