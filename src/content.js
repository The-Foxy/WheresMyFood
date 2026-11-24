(() => {
  const version=chrome.runtime.getManifest().version;
  const existing=document.getElementById('sf-local-assistant-host');
  if(existing?.dataset.sfVersion===version && existing.dataset.sfExtensionId===chrome.runtime.id)return;
  if(existing){existing.dispatchEvent(new Event('sf-update-dispose'));existing.remove();}
  let disposed=false,stopFocus=null,updateLocked=false;
  // Only a fallback for flat source records without a parent food ID. Native
  // product links need no extension and open the site's own food detail page.
  import(chrome.runtime.getURL('src/food-focus.js')).then(({ installFoodFocus }) => {if(!disposed)stopFocus=installFoodFocus();}).catch(() => {});
  const host = document.createElement('div'); host.id = 'sf-local-assistant-host';host.dataset.sfVersion=version;host.dataset.sfExtensionId=chrome.runtime.id;
  const shadow = host.attachShadow({ mode: 'open' });
  const frame = document.createElement('div'); frame.className = 'sf-extension';
  const launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'sf-launcher'; const launcherIcon = document.createElement('img'); launcherIcon.src = chrome.runtime.getURL('icons/mark.svg'); launcherIcon.alt = ''; launcherIcon.width = 32; launcherIcon.height = 32; const launcherLabel = document.createElement('span'); launcherLabel.className = 'sf-launcher-label'; launcherLabel.textContent = 'غذام کو؟'; launcher.append(launcherIcon, launcherLabel); launcher.setAttribute('aria-label', 'باز کردن غذام کو؟');
  const panel = document.createElement('div'); panel.className = 'sf-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'غذام کو؟ — دستیار انتخاب غذا');
  frame.append(launcher, panel); shadow.append(frame); document.documentElement.append(host);
  let mounted = null, previousFocus = null;
  const send = async (message) => {
    const response = await chrome.runtime.sendMessage(message);
    if (!response) throw new Error('افزونه پاسخ نداد؛ صفحه رو تازه کن.');
    if (response.error) { const error = new Error(response.error); for (const key of ['fatal', 'retryAt', 'status']) error[key] = response[key]; throw error; }
    return response;
  };
  async function toggle() {
    const opening = panel.hidden;
    if (opening) previousFocus = shadow.activeElement ?? document.activeElement;
    panel.hidden = !opening; launcher.hidden = opening;
    if (opening && !mounted) {
      const { mountApp } = await import(chrome.runtime.getURL('src/app.js'));
      mounted = mountApp(panel, {
        renderMenu: async (code, signal, service='restaurant') => {
          const cancel = () => { void send({type:'SF_RENDER_CANCEL'}).catch(() => {}); };
          signal?.throwIfAborted(); signal?.addEventListener('abort',cancel,{once:true});
          try { return await send({type:'SF_RENDER',code,service}); }
          finally { signal?.removeEventListener('abort',cancel); }
        },
        context: () => send({ type: 'SF_CONTEXT' }),
        read: async (operation, value) => (await send({ type: 'SF_READ', operation, value })).data,
      }, {
        canStart:()=>!updateLocked,
        onIdle:()=>{void send({type:'SF_UPDATER_IDLE'}).catch(()=>{});},
        updater:{status:()=>send({type:'SF_UPDATER_STATUS'}),check:()=>send({type:'SF_UPDATER_CHECK'})},
        loadPreferences: async () => (await chrome.storage.local.get('foodFilters')).foodFilters ?? {},
        savePreferences: value => chrome.storage.local.set({ foodFilters: value }),
        onClose: () => { panel.hidden = true; launcher.hidden = false; previousFocus?.focus?.(); },
      });
    }
    if (opening) panel.querySelector('input')?.focus();
  }
  fetch(chrome.runtime.getURL('styles.css')).then(r => r.text()).then(css => { const style = document.createElement('style'); style.textContent = css; shadow.prepend(style); }).catch(() => { launcher.textContent = 'افزونه نیاز به Reload داره'; });
  launcher.onclick = () => void toggle();
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; launcher.hidden = false; launcher.focus(); } });
  const onMessage=(message,sender,reply)=>{
    if(disposed || sender.id!==chrome.runtime.id)return false;
    if(message?.type==='SF_TOGGLE')void toggle();
    if(message?.type==='SF_UPDATE_PROBE'){reply({busy:mounted?.busy??false,version});return false;}
    if(message?.type==='SF_UPDATE_LOCK'){
      if(mounted?.busy){reply({locked:false});return false;}
      updateLocked=true;reply({locked:true});return false;
    }
    if(message?.type==='SF_UPDATE_UNLOCK'){updateLocked=false;reply({ok:true});return false;}
  };
  const onStorage=(changes,area)=>{if(area==='local' && changes.foodUpdater)mounted?.setUpdateStatus(changes.foodUpdater.newValue);};
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorage);
  host.addEventListener('sf-update-dispose',()=>{
    disposed=true;mounted?.dispose();stopFocus?.();
    try{chrome.runtime.onMessage.removeListener(onMessage);chrome.storage.onChanged.removeListener(onStorage);}catch{/* Old extension context may already be invalidated. */}
  },{once:true});
})();
