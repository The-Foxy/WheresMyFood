export const UPDATE_HOST='ir.wheresmyfood.updater';
export const UPDATE_KEY='foodUpdater';
const ALARM='food-update-check', RETRY='food-update-idle';
const CURRENT='https://snappfood.ir/*';
const explanations={
  no_release:'هنوز نسخه‌ای در گیت‌هاب منتشر نشده.', up_to_date:'آخرین نسخه نصبه.',
  checking:'داریم نسخهٔ جدید رو بررسی می‌کنیم…', waiting:'نسخهٔ جدید آماده‌ست؛ بعد از آزادشدن ابزار نصب می‌شه.',
  applying:'داریم نسخهٔ جدید رو نصب می‌کنیم؛ چند لحظه صبر کن.', updated:'نسخهٔ جدید نصب شد.',
  native_unavailable:'راه‌اندازی اولیهٔ آپدیتر انجام نشده یا در دسترس نیست.',
  native_host_missing:'Chrome فایل اتصال آپدیتر رو پیدا نکرد؛ ثبت میزبان باید بررسی بشه.',
  native_forbidden:'شناسهٔ این نسخه با نصب آپدیتر یکی نیست؛ فولدر نصب مدیریت‌شده رو انتخاب کن.',
  native_launch_failed:'Chrome اسکریپت آپدیتر رو پیدا کرده، ولی نتونسته اجراش کنه.',
  native_host_exited:'اسکریپت آپدیتر قبل از جواب بسته شد؛ گزارش آپدیتر رو بررسی می‌کنیم.',
  uncertain:'وضعیت نصب نیاز به بررسی دوباره داره؛ شروع جستجو موقتاً مکث کرده.',
  github_rate_limited:'گیت‌هاب فعلاً بررسی نسخه رو محدود کرده؛ بعداً دوباره بررسی می‌کنیم.',
  release_missing_digest:'اطلاعات صحت بستهٔ انتشار کامل نیست؛ نسخهٔ فعلی حفظ شد.',
  release_incomplete:'بستهٔ انتشار هنوز کامل نیست؛ نسخهٔ فعلی حفظ شد.',
  package_permissions_changed:'مجوزهای نسخهٔ جدید فرق کرده؛ نصب خودکار انجام نشد.',
};
export function updateText(status) {
  return explanations[status?.code] ?? explanations[status?.state] ?? (status?.state==='error' ? 'آپدیت انجام نشد؛ نسخهٔ فعلی حفظ شده. بعداً دوباره بررسی می‌کنیم.' : 'بررسی خودکار هر ۶ ساعت، وقتی مرورگر بازه.');
}
export function nativeError(message='') {
  if(/host.*not found/i.test(message))return 'native_host_missing';
  if(/forbidden|not allowed/i.test(message))return 'native_forbidden';
  if(/failed to start/i.test(message))return 'native_launch_failed';
  if(/host has exited|native host.*exited/i.test(message))return 'native_host_exited';
  return 'native_unavailable';
}

// A Native Messaging port keeps the MV3 worker alive only during a bounded
// update operation. There is no localhost server or permanently running helper.
export class NativeClient {
  constructor(api, timeout=180000) {
    this.api=api;this.timeout=timeout;this.pending=null;
    this.port=api.runtime.connectNative(UPDATE_HOST);
    this.port.onMessage.addListener(value=>{
      const request=this.pending;if(!request)return;
      this.pending=null;clearTimeout(request.timer);
      if(value?.protocol!==1)request.reject(Error('invalid_native_response'));
      else request.resolve(value);
    });
    this.port.onDisconnect.addListener(()=>{
      this.errorCode=nativeError(api.runtime.lastError?.message);
      this.closed=true;
      if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(this.errorCode));this.pending=null;}
    });
  }
  request(value) {
    if(this.closed || this.pending)return Promise.reject(Error(this.errorCode ?? 'native_unavailable'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=null;reject(Error('native_timeout'));this.close();},this.timeout);
      this.pending={resolve,reject,timer};
      try{this.port.postMessage(value);}catch{clearTimeout(timer);this.pending=null;reject(Error('native_unavailable'));}
    });
  }
  close(){try{this.port.disconnect();}catch{/* already disconnected */}}
}

export class UpdateCoordinator {
  constructor(api,{native=()=>new NativeClient(api),hasActiveRequests=()=>false}={}) {
    this.api=api;this.native=native;this.hasActiveRequests=hasActiveRequests;
    this.applying=false;this.running=null;
  }
  async status(){return (await this.api.storage.local.get(UPDATE_KEY))[UPDATE_KEY] ?? {state:'idle'};}
  async save(state,extra={}) {
    const status={state,...extra,checkedAt:Date.now()};
    await this.api.storage.local.set({[UPDATE_KEY]:status});return status;
  }
  async retry(){await this.api.alarms.create(RETRY,{delayInMinutes:1});}
  async unlock() {
    const tabs=await this.api.tabs.query({url:CURRENT});
    await Promise.all(tabs.map(tab=>this.api.tabs.sendMessage(tab.id,{type:'SF_UPDATE_UNLOCK'},{frameId:0}).catch(()=>{})));
  }
  async idle() {
    if(this.hasActiveRequests())return false;
    const tabs=await this.api.tabs.query({url:CURRENT});
    for(const tab of tabs) {
      try{if((await this.api.tabs.sendMessage(tab.id,{type:'SF_UPDATE_PROBE'},{frameId:0}))?.busy!==false)return false;}
      catch{if((await this.api.tabs.query({url:CURRENT})).some(x=>x.id===tab.id))return false;}
    }
    return true;
  }
  async lock() {
    this.applying=true; // The background transport rejects new reads from now on.
    if(this.hasActiveRequests())return false;
    const tabs=await this.api.tabs.query({url:CURRENT});
    for(const tab of tabs) {
      try{if((await this.api.tabs.sendMessage(tab.id,{type:'SF_UPDATE_LOCK'},{frameId:0}))?.locked!==true)return false;}
      catch{if((await this.api.tabs.query({url:CURRENT})).some(x=>x.id===tab.id))return false;}
    }
    return !this.hasActiveRequests();
  }
  run(){if(!this.running)this.running=this.execute().finally(()=>{this.running=null;});return this.running;}
  async execute() {
    let client=null,committed=false,uncertain=false,locked=false;
    const current=this.api.runtime.getManifest().version;
    const previous=await this.status();
    let recovering=previous.state==='uncertain';
    try{
      if(previous.state==='uncertain') {
        this.applying=true;client=this.native();
        const installed=await client.request({action:'status'});
        if(installed.status!=='installed')throw Error('native_unavailable');
        if(installed.version!==current){committed=true;await this.save('updated',{version:installed.version});this.api.runtime.reload();return;}
        recovering=false;this.applying=false;await this.unlock();
      }
      if(previous.state==='waiting' && !(await this.idle())){await this.retry();return previous;}
      await this.save('checking');client ??= this.native();
      const candidate=await client.request({action:'prepare',version:current});
      if(candidate.status==='error')return await this.save('error',{code:candidate.code});
      if(['no_release','up_to_date'].includes(candidate.status))return await this.save(candidate.status,{version:current});
      if(!['ready','reload_required'].includes(candidate.status) || typeof candidate.version!=='string')throw Error('invalid_native_response');
      locked=true;
      if(!(await this.lock())){await this.retry();return await this.save('waiting',{version:candidate.version});}
      if(candidate.status==='reload_required'){
        committed=true;await this.save('updated',{version:candidate.version});this.api.runtime.reload();return;
      }
      await this.save('applying',{version:candidate.version});
      let result;
      try{result=await client.request({action:'apply',token:candidate.token});}
      catch{
        // A lost acknowledgement must not lead to an unsafe unlock or another
        // apply. Ask a fresh helper process to recover/read the installation.
        client.close();client=this.native();
        try{
          const actual=await client.request({action:'status'});
          if(actual.status==='installed' && actual.version===candidate.version)result={status:'applied',version:actual.version};
          else if(actual.status==='installed' && actual.version===current)throw Error('apply_failed');
          else {uncertain=true;throw Error('uncertain');}
        }catch(e){if(e.message!=='apply_failed')uncertain=true;throw e;}
      }
      if(result.status!=='applied' || result.version!==candidate.version)throw Error(result.code ?? 'apply_failed');
      committed=true;await this.save('updated',{version:result.version});
      this.api.runtime.reload();
    }catch(e){
      if(recovering || uncertain){this.applying=true;uncertain=true;await this.retry();return await this.save('uncertain');}
      return await this.save('error',{code:e.message==='native_unavailable'?'native_unavailable':e.message});
    }finally{
      client?.close();
      if(!committed && !uncertain){this.applying=false;if(locked)await this.unlock();}
    }
  }
}

export function installAutoUpdater(api,options={}) {
  const coordinator=new UpdateCoordinator(api,options);
  let restoring=true;
  const restore=coordinator.status().then(status=>{coordinator.applying=status.state==='uncertain';}).finally(()=>{restoring=false;});
  const check=()=>restore.then(()=>coordinator.run());
  const reattach=async()=>{
    for(const tab of await api.tabs.query({url:CURRENT})) {
      try{await api.scripting.executeScript({target:{tabId:tab.id},files:['src/content.js']});}catch{/* Tab may have closed/navigated. */}
    }
  };
  const schedule=async()=>{
    if(!await api.alarms.get(ALARM))await api.alarms.create(ALARM,{delayInMinutes:1,periodInMinutes:360});
  };
  api.alarms.onAlarm.addListener(alarm=>{if([ALARM,RETRY].includes(alarm.name))void check();});
  api.runtime.onInstalled.addListener(()=>{void schedule();void reattach();});
  api.runtime.onStartup.addListener(()=>{void schedule();void reattach();void check();});
  void schedule();
  return {check,status:()=>coordinator.status(),isApplying:()=>restoring||coordinator.applying,
    idle:async()=>{if((await coordinator.status()).state==='waiting')await coordinator.retry();},reattach};
}
