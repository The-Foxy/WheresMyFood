import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UpdateCoordinator,NativeClient,UPDATE_KEY,updateText,nativeError} from '../src/auto-update.js';

function fixture({busy=false,unknown=false,inflight=false,handler=null}={}) {
  const state={},calls=[],messages=[],alarms=[];let reloads=0;
  const api={
    runtime:{getManifest:()=>({version:'1.0.0'}),reload:()=>{reloads++;}},
    storage:{local:{get:async key=>({[key]:state[key]}),set:async value=>Object.assign(state,value)}},
    alarms:{create:async(name,value)=>alarms.push([name,value])},
    tabs:{query:async()=>[{id:1},{id:2}],sendMessage:async(id,message)=>{
      messages.push([id,message.type]);
      if(unknown && id===2 && message.type!=='SF_UPDATE_UNLOCK')throw Error('no content script');
      if(message.type==='SF_UPDATE_PROBE')return{busy};
      if(message.type==='SF_UPDATE_LOCK')return{locked:!busy};
      return{ok:true};
    }},
  };
  const native=()=>({request:async request=>{
    calls.push(request);
    return handler?handler(request):request.action==='prepare'?{status:'ready',version:'1.0.1',token:'test-token'}:{status:'applied',version:'1.0.1'};
  },close(){}});
  const coordinator=new UpdateCoordinator(api,{native,hasActiveRequests:()=>inflight});
  return{api,coordinator,calls,messages,state,alarms,get reloads(){return reloads;}};
}

test('native update commits only after every Snappfood tab is locked, then reloads once',async()=>{
  const f=fixture({handler:request=>{
    if(request.action==='prepare')return{status:'ready',version:'1.0.1',token:'commit-once'};
    assert.deepEqual(f.messages,[[1,'SF_UPDATE_LOCK'],[2,'SF_UPDATE_LOCK']]);
    assert.equal(f.coordinator.applying,true);assert.equal(request.token,'commit-once');
    return{status:'applied',version:'1.0.1'};
  }});
  await f.coordinator.run();assert.equal(f.reloads,1);assert.equal(f.state[UPDATE_KEY].state,'updated');
  assert.deepEqual(f.calls.map(x=>x.action),['prepare','apply']);
  assert.ok(!f.messages.some(([,type])=>type==='SF_UPDATE_UNLOCK'));
});
test('busy or unresponsive tabs defer installation and release acquired locks',async()=>{
  for(const options of [{busy:true},{unknown:true},{inflight:true}]) {
    const f=fixture(options);await f.coordinator.run();
    assert.equal(f.reloads,0);assert.deepEqual(f.calls.map(x=>x.action),['prepare']);
    assert.equal(f.state[UPDATE_KEY].state,'waiting');assert.equal(f.coordinator.applying,false);
    assert.ok(f.alarms.some(([,v])=>v.delayInMinutes===1));
    assert.ok(f.messages.some(([,type])=>type==='SF_UPDATE_UNLOCK'));
  }
});
test('new scan that starts during download is caught by the final tab lock',async()=>{
  const f=fixture();let scanned=false;
  f.api.tabs.sendMessage=async(id,message)=>message.type==='SF_UPDATE_LOCK'?{locked:!scanned}:{ok:true};
  f.coordinator.native=()=>({request:async request=>{
    f.calls.push(request);scanned=true;return{status:'ready',version:'1.0.1',token:'abc'};
  },close(){}});
  await f.coordinator.run();assert.equal(f.reloads,0);assert.equal(f.calls.length,1);assert.equal(f.state[UPDATE_KEY].state,'waiting');
});
test('pending updates do not repeatedly download/check GitHub while a scan is busy',async()=>{
  const f=fixture({busy:true});f.state[UPDATE_KEY]={state:'waiting',version:'1.0.1'};
  await f.coordinator.run();assert.equal(f.calls.length,0);assert.equal(f.state[UPDATE_KEY].state,'waiting');
});
test('no release or matching version is a successful check, without locking or reloading',async()=>{
  for(const status of ['no_release','up_to_date']){
    const f=fixture({handler:()=>({status,version:'1.0.0'})});await f.coordinator.run();
    assert.equal(f.state[UPDATE_KEY].state,status);assert.equal(f.reloads,0);assert.equal(f.messages.length,0);
  }
});
test('missing helper and invalid packages show honest status, never attempt commit',async()=>{
  const absent=fixture({handler:()=>{throw Error('native_unavailable');}});await absent.coordinator.run();
  assert.equal(absent.state[UPDATE_KEY].code,'native_unavailable');assert.equal(absent.reloads,0);
  assert.match(updateText(absent.state[UPDATE_KEY]),/راه‌اندازی/);
  const corrupt=fixture({handler:()=>({status:'error',code:'package_digest_mismatch'})});await corrupt.coordinator.run();
  assert.equal(corrupt.state[UPDATE_KEY].code,'package_digest_mismatch');assert.equal(corrupt.reloads,0);
});
test('simultaneous alarm/manual checks share one native session',async()=>{
  const f=fixture();const a=f.coordinator.run(),b=f.coordinator.run();assert.equal(a,b);
  await Promise.all([a,b]);assert.equal(f.calls.length,2);assert.equal(f.reloads,1);
});
test('lost commit acknowledgement checks installed version before reloading',async()=>{
  const f=fixture({handler:r=>{
    if(r.action==='prepare')return{status:'ready',version:'1.0.1',token:'abc'};
    if(r.action==='apply')throw Error('port closed');
    return{status:'installed',version:'1.0.1'};
  }});
  await f.coordinator.run();assert.equal(f.reloads,1);assert.deepEqual(f.calls.map(x=>x.action),['prepare','apply','status']);
});
test('unconfirmed commit fails closed and recovers on the next check',async()=>{
  let recover=false;
  const f=fixture({handler:r=>{
    if(r.action==='prepare')return{status:'ready',version:'1.0.1',token:'abc'};
    if(recover)return{status:'installed',version:'1.0.1'};
    throw Error('host unavailable');
  }});
  await f.coordinator.run();assert.equal(f.state[UPDATE_KEY].state,'uncertain');assert.equal(f.coordinator.applying,true);
  assert.ok(!f.messages.some(([,type])=>type==='SF_UPDATE_UNLOCK'));assert.equal(f.reloads,0);
  recover=true;await f.coordinator.run();assert.equal(f.reloads,1);assert.equal(f.state[UPDATE_KEY].state,'updated');
});

function event(){const listeners=[];return{addListener:f=>listeners.push(f),emit:value=>listeners.forEach(f=>f(value))};}
test('native port exchanges bounded requests and does not confuse invalid protocol or disconnection with success',async()=>{
  const port={onMessage:event(),onDisconnect:event(),postMessage(value){this.sent=value;},disconnect(){this.onDisconnect.emit();}};
  const client=new NativeClient({runtime:{connectNative:()=>port}},1000);
  const pending=client.request({action:'status'});assert.deepEqual(port.sent,{action:'status'});
  port.onMessage.emit({protocol:1,status:'installed',version:'1.0.0'});assert.equal((await pending).version,'1.0.0');
  const invalid=client.request({action:'status'});port.onMessage.emit({protocol:99,status:'installed'});await assert.rejects(invalid,/invalid_native/);
  const disconnected=client.request({action:'status'});port.onDisconnect.emit();await assert.rejects(disconnected,/native_unavailable/);
  client.close();
});
test('wrong extension identity is distinguished from a missing or failed native host',()=>{
  assert.equal(nativeError('Access to the specified native messaging host is forbidden.'),'native_forbidden');
  assert.equal(nativeError('Specified native messaging host not found.'),'native_host_missing');
  assert.equal(nativeError('Failed to start native messaging host.'),'native_launch_failed');
  assert.equal(nativeError('Native host has exited.'),'native_host_exited');
  assert.match(updateText({code:'native_forbidden'}),/شناسه/);
});
test('rating select renders all expected minimum rating options including 3+',()=>{
  const appSource=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(appSource,/<option value="0">فرقی نداره<\/option><option value="3">۳ به بالا<\/option>/);
  assert.match(appSource,/sf-version-btn/);
  assert.match(appSource,/sf-update-popover/);
  assert.ok(!appSource.includes('داخل مرورگر خودت'));
  assert.ok(!appSource.includes('بررسی دقیق‌تر قیمت'));
  assert.ok(!appSource.includes('verifyPrices'));
});
