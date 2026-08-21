const SUPABASE_URL='https://coeqnnanqzlkkgkejbef.supabase.co';
const SUPABASE_KEY='sb_publishable_1qD2SXfcWcWJ7AcvrlmErQ_VI6GZg8c';
const VAPID_PUBLIC_KEY='BLslgxfKIfS7KfsMWDiCoC3KWa9dz5uaUwL9On4W2GKGQoSOQOSnKRRu1NP-hgLWEMd4SfIZJG5FvfNxvuo4LJI';
const $=id=>document.getElementById(id);
let client=null;

function ensureSupabaseClient(){
  if(client) return client;
  if(!window.supabase?.createClient){
    throw new Error('A biblioteca de login não carregou. Verifique a internet e abra o Prado Ponto novamente.');
  }
  client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  return client;
}
let me=null,branch=null,todayEvents=[],currentLocation=null,employeeDirectory=[],managerMap=null,mobileManagerMap=null,detailMap=null,externalLocationWatchId=null,lastExternalLocationSentAt=0,lastExternalSentCoords=null,lastExternalWasMoving=false,lastManagerPresenceBy=new Map(),lastManagerEmployees=[],lastManagerRows=[],lastManagerSchedules=new Map(),activeAttentionFilter=null,activeDetailEmployeeId=null,detailLiveReloadTimer=null,lastExternalGpsReceivedAt=null,lastExternalGpsSentAt=null,lastExternalGpsError=null,lastExternalGpsCoords=null,employeeSpeedAlertActive=false,lastEmployeeSpeedAlertAt=0;

const fmtTime=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fmtDate=iso=>new Date(iso).toLocaleDateString('pt-BR');
const startToday=()=>{const d=new Date();d.setHours(0,0,0,0);return d.toISOString()};
const endToday=()=>{const d=new Date();d.setHours(23,59,59,999);return d.toISOString()};
const initials=n=>(n||'PF').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();

function avatarHtml(person,sizeClass=''){
  const url=person?.avatar_url;
  const name=person?.full_name||'Funcionário';
  if(url){
    return `<span class="person-avatar ${sizeClass}"><img src="${esc(url)}" alt="Foto de ${esc(name)}" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="person-avatar ${sizeClass}"><span>${esc(initials(name))}</span></span>`;
}

function renderOwnAvatar(){
  if(!me) return;

  const top=$('avatar');
  const self=$('employeeSelfPhotoBtn');

  if(me.avatar_url){
    if(top){
      top.innerHTML=`<img src="${esc(me.avatar_url)}" alt="Sua foto" referrerpolicy="no-referrer">`;
      top.classList.add('has-photo');
    }
    if(self){
      self.innerHTML=`<img src="${esc(me.avatar_url)}" alt="Sua foto" referrerpolicy="no-referrer">`;
      self.classList.add('has-photo');
    }
  }else{
    const letters=initials(me.full_name);
    if(top){
      top.textContent=letters;
      top.classList.remove('has-photo');
    }
    if(self){
      self.innerHTML=`<span id="employeeSelfPhotoFallback">${esc(letters)}</span>`;
      self.classList.remove('has-photo');
    }
  }
}

function pickEmployeeAvatar(employeeId,isSelf=false){
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/jpeg,image/png,image/webp';
  input.style.display='none';
  input.onchange=async()=>{
    const file=input.files?.[0];
    if(!file){input.remove();return;}
    await uploadEmployeeAvatar(employeeId,file,isSelf);
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}

async function uploadEmployeeAvatar(employeeId,file,isSelf=false){
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)){
    alert('Use uma imagem JPG, PNG ou WEBP.');
    return;
  }
  if(file.size>5*1024*1024){
    alert('A foto deve ter no máximo 5 MB.');
    return;
  }

  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path=`${employeeId}/avatar.${ext}`;

  const {error:uploadError}=await client.storage
    .from('employee-avatars')
    .upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'});

  if(uploadError){
    alert('Não foi possível enviar a foto: '+uploadError.message);
    return;
  }

  const {data:pub}=client.storage.from('employee-avatars').getPublicUrl(path);
  const url=`${pub.publicUrl}?v=${Date.now()}`;

  if(isSelf){
    const {error}=await client.rpc('set_my_avatar',{p_avatar_url:url});
    if(error){
      alert('A foto foi enviada, mas não foi possível atualizar seu perfil: '+error.message);
      return;
    }
    me.avatar_url=url;
    renderOwnAvatar();
  }else{
    const {error}=await client.from('employees').update({avatar_url:url}).eq('id',employeeId);
    if(error){
      alert('A foto foi enviada, mas não foi possível atualizar o funcionário: '+error.message);
      return;
    }
    const emp=employeeDirectory.find(x=>x.id===employeeId);
    if(emp) emp.avatar_url=url;
    await loadEmployees();
    if(isManager()) await loadManagerHome();
  }
}

window.pickEmployeeAvatar=pickEmployeeAvatar;

const dayNames=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inviteLink(email){const u=new URL(window.location.origin);u.searchParams.set('email',email);u.searchParams.set('firstAccess','1');return u.toString()}
async function copyInvite(email){
  const link=inviteLink(email);
  try{await navigator.clipboard.writeText(link);alert('Link do funcionário copiado. Agora é só enviar por WhatsApp ou e-mail.')}
  catch{prompt('Copie este link:',link)}
}
window.copyInvite=copyInvite;

function setAuthMsg(msg,bad=false){$('authMsg').textContent=msg;$('authMsg').classList.toggle('bad',bad)}
function showAuth(){$('authScreen').classList.remove('hidden');$('appShell').classList.add('hidden')}
function showApp(){$('authScreen').classList.add('hidden');$('appShell').classList.remove('hidden')}
function isManager(){return ['admin','manager'].includes(me?.role)}


function shouldShowGarroPromo(date=new Date()){
  return date.getDay()===5 || date.getDate()===5 || date.getDate()===20;
}

function renderGarroPromo(){
  const promo=$('garroPromoBtn');
  if(!promo) return;
  promo.classList.toggle('hidden',!shouldShowGarroPromo());
}


async function loadProfile(){
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user) throw new Error('Não foi possível identificar o usuário autenticado.');

  let {data,error}=await client.from('employees')
    .select('id,company_id,branch_id,full_name,email,role,active,user_id,allow_external_after_checkin,avatar_url')
    .eq('user_id',user.id)
    .eq('active',true)
    .maybeSingle();

  if(!data && user.email){
    const fallback=await client.from('employees')
      .select('id,company_id,branch_id,full_name,email,role,active,user_id,allow_external_after_checkin,avatar_url')
      .ilike('email', user.email)
      .eq('active',true)
      .maybeSingle();
    data=fallback.data||null;
    error=fallback.error||null;

    if(data && !data.user_id){
      await client.from('employees').update({ user_id:user.id }).eq('id',data.id).is('user_id',null);
      data.user_id=user.id;
    }
  }

  if(error||!data) throw new Error('Seu login ainda não está vinculado a um funcionário ativo.');

  const googleAvatar=user.user_metadata?.avatar_url||user.user_metadata?.picture||null;
  if(googleAvatar && !data.avatar_url){
    const sync=await client.rpc('sync_my_avatar',{p_avatar_url:googleAvatar});
    if(!sync.error){
      data.avatar_url=googleAvatar;
    }
  }

  me=data;
  const {data:b}=await client.from('branches').select('id,name,address,latitude,longitude,geofence_radius_m').eq('id',me.branch_id).single();
  branch=b||null;
  renderBranchLocation();
  $('userName').textContent=me.full_name;
  $('userBranch').textContent=branch?.name||'Unidade';
  renderOwnAvatar();
  $('roleLabel').textContent=isManager()?'Painel do gestor':'Área do funcionário';
  renderGarroPromo();

  if(isManager()){
    updateManagerNotificationButtons().catch(()=>{});
    $('employeeBottomNav')?.classList.add('hidden');
    $('employeeNav').classList.add('hidden');
    $('managerNav').classList.remove('hidden');
    $('managerBottomNav')?.classList.remove('hidden');
    openView('managerHome');
  }else{
    $('managerBottomNav')?.classList.add('hidden');
    $('employeeBottomNav')?.classList.remove('hidden');
    $('managerNav').classList.add('hidden');
    $('employeeNav').classList.remove('hidden');
    openView('employeeHome');
    setTimeout(()=>checkWebPresence(false),500);
    setTimeout(()=>checkEndShiftThanks(),1200);
    setTimeout(()=>requestNotificationPermission(),2500);
    if(me.allow_external_after_checkin){ setTimeout(()=>startExternalLocationTracking(),1800); setTimeout(()=>renderExternalGpsDiagnostics(),2200); } else { $('externalGpsDiagnostics')?.classList.add('hidden'); }
  }
}





function playSpeedWarningTone(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    const ctx=new Ctx();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(980,ctx.currentTime);
    gain.gain.setValueAtTime(.0001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.16,ctx.currentTime+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.45);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+.5);
  }catch{}
}

function handleEmployeeSpeedAlert(speedValue){
  const speed=Number(speedValue);
  if(!Number.isFinite(speed)) return;

  if(speed<=55){
    employeeSpeedAlertActive=false;
    $('employeeSpeedAlert')?.classList.add('hidden');
    return;
  }

  if(speed<=60) return;

  const now=Date.now();
  if(employeeSpeedAlertActive && now-lastEmployeeSpeedAlertAt<120000) return;

  employeeSpeedAlertActive=true;
  lastEmployeeSpeedAlertAt=now;

  if($('employeeSpeedAlert')){
    $('employeeSpeedAlert').classList.remove('hidden');
    $('employeeSpeedAlertValue').textContent=`${Math.round(speed)} km/h`;
  }

  playSpeedWarningTone();

  if('Notification' in window && Notification.permission==='granted'){
    try{
      new Notification('Atenção à velocidade',{
        body:`Velocidade estimada em ${Math.round(speed)} km/h. Reduza com segurança.`,
        icon:'/icon-180.png',
        tag:'employee-speed-limit'
      });
    }catch{}
  }
}

function renderExternalGpsDiagnostics(){
  if(!$('gpsDiagStatus')) return;
  const active=externalLocationWatchId!==null;
  $('gpsDiagStatus').textContent=active?'GPS ativo':'GPS parado';
  $('gpsDiagStatus').classList.toggle('good',active);
  $('gpsDiagStatus').classList.toggle('bad',!active);

  $('gpsDiagReceived').textContent=lastExternalGpsReceivedAt
    ? new Date(lastExternalGpsReceivedAt).toLocaleTimeString('pt-BR')
    : '—';

  $('gpsDiagSent').textContent=lastExternalGpsSentAt
    ? new Date(lastExternalGpsSentAt).toLocaleTimeString('pt-BR')
    : '—';

  $('gpsDiagCoords').textContent=lastExternalGpsCoords
    ? `${Number(lastExternalGpsCoords.latitude).toFixed(6)}, ${Number(lastExternalGpsCoords.longitude).toFixed(6)}`
    : '—';

  $('gpsDiagError').textContent=lastExternalGpsError||'Nenhum erro registrado';
}

async function testExternalLocationNow(){
  if(!navigator.geolocation){
    lastExternalGpsError='Geolocalização indisponível neste aparelho.';
    renderExternalGpsDiagnostics();
    return;
  }

  const btn=$('gpsDiagTestBtn');
  if(btn){btn.disabled=true;btn.textContent='Testando...';}

  navigator.geolocation.getCurrentPosition(async pos=>{
    lastExternalGpsReceivedAt=Date.now();
    lastExternalGpsCoords={
      latitude:pos.coords.latitude,
      longitude:pos.coords.longitude,
      accuracy:pos.coords.accuracy
    };
    lastExternalGpsError=null;
    renderExternalGpsDiagnostics();

    try{
      await sendExternalLocationPosition(pos,true);
    }catch(e){
      lastExternalGpsError=e?.message||'Erro ao enviar localização.';
      renderExternalGpsDiagnostics();
    }finally{
      if(btn){btn.disabled=false;btn.textContent='Testar localização agora';}
    }
  },err=>{
    const msgs={
      1:'Permissão de localização negada.',
      2:'Localização indisponível.',
      3:'Tempo esgotado ao obter localização.'
    };
    lastExternalGpsError=msgs[err.code]||'Erro ao obter localização.';
    renderExternalGpsDiagnostics();
    if(btn){btn.disabled=false;btn.textContent='Testar localização agora';}
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}

async function sendExternalLocationPosition(pos,force=false){
  if(isManager() || !me?.allow_external_after_checkin || !pos?.coords) return;
  const now=Date.now();
  const currentCoords={
    latitude:pos.coords.latitude,
    longitude:pos.coords.longitude,
    accuracy:pos.coords.accuracy
  };

  lastExternalGpsReceivedAt=now;
  lastExternalGpsCoords=currentCoords;
  lastExternalGpsError=null;
  renderExternalGpsDiagnostics();

  const deviceSpeedKmh=pos.coords.speed!=null && Number.isFinite(Number(pos.coords.speed))
    ? Math.max(0,Number(pos.coords.speed)*3.6)
    : null;

  let movedM=null;
  if(lastExternalSentCoords){
    movedM=distanceM(
      lastExternalSentCoords.latitude,lastExternalSentCoords.longitude,
      currentCoords.latitude,currentCoords.longitude
    );
  }

  const moving=
    (deviceSpeedKmh!=null && deviceSpeedKmh>=5) ||
    (movedM!=null && movedM>=12) ||
    lastExternalWasMoving;

  const minIntervalMs=moving?5000:30000;
  if(!force && now-lastExternalLocationSentAt<minIntervalMs) return;

  lastExternalLocationSentAt=now;
  const {data,error}=await client.rpc('register_external_location',{
    p_latitude:currentCoords.latitude,
    p_longitude:currentCoords.longitude,
    p_accuracy_m:currentCoords.accuracy
  });

  if(error){
    lastExternalGpsError=String(error.message||'Erro ao enviar localização.');
    renderExternalGpsDiagnostics();
    const msg=lastExternalGpsError;
    if(msg.includes('shift_not_active') || msg.includes('external_location_not_enabled')){
      stopExternalLocationTracking();
    }
    throw error;
  }

  const savedRow=Array.isArray(data)?data[0]:data;
  if(savedRow?.speed_kmh!=null) handleEmployeeSpeedAlert(savedRow.speed_kmh);

  lastExternalSentCoords=currentCoords;
  lastExternalWasMoving=
    (deviceSpeedKmh!=null && deviceSpeedKmh>=3) ||
    (movedM!=null && movedM>=8);

  lastExternalGpsSentAt=Date.now();
  lastExternalGpsError=null;
  renderExternalGpsDiagnostics();
}

function stopExternalLocationTracking(){
  if(externalLocationWatchId!==null && navigator.geolocation){
    navigator.geolocation.clearWatch(externalLocationWatchId);
  }
  externalLocationWatchId=null;
  renderExternalGpsDiagnostics();
}

function startExternalLocationTracking(forceRestart=false){
  if(isManager() || !me?.allow_external_after_checkin || !navigator.geolocation) return;

  if(forceRestart) stopExternalLocationTracking();
  if(externalLocationWatchId!==null) return;

  navigator.geolocation.getCurrentPosition(
    pos=>sendExternalLocationPosition(pos).catch(()=>{}),
    ()=>{},
    {enableHighAccuracy:true,maximumAge:0,timeout:15000}
  );

  externalLocationWatchId=navigator.geolocation.watchPosition(
    pos=>sendExternalLocationPosition(pos).catch(()=>{}),
    err=>{
      const msgs={
        1:'Permissão de localização negada.',
        2:'Sinal de localização indisponível.',
        3:'GPS demorou demais para responder.'
      };
      lastExternalGpsError=msgs[err.code]||'Erro no rastreamento de localização.';
      renderExternalGpsDiagnostics();
    },
    {
      enableHighAccuracy:true,
      maximumAge:0,
      timeout:15000
    }
  );
  renderExternalGpsDiagnostics();
}

function resumeExternalLocationTracking(){
  if(!me || isManager() || !me.allow_external_after_checkin) return;
  lastExternalLocationSentAt=0;
  startExternalLocationTracking(true);
}

function renderBranchLocation(){
  if(!$('branchLocationStatus')) return;
  const configured=branch?.latitude!=null&&branch?.longitude!=null;
  $('branchLocationStatus').textContent=configured?'Configurado':'Não configurado';
  $('branchLat').textContent=configured?Number(branch.latitude).toFixed(6):'—';
  $('branchLng').textContent=configured?Number(branch.longitude).toFixed(6):'—';
  $('branchRadius').textContent=(branch?.geofence_radius_m||80)+' m';
  $('branchLocationMsg').textContent=configured
    ?'Centro do geofence salvo. Para alterar, esteja novamente na unidade e use o botão acima.'
    :'A localização ainda não foi definida.';
}

async function setBranchLocation(){
  if(!isManager()) return;
  if(!navigator.geolocation){
    $('branchLocationMsg').textContent='Este navegador não oferece geolocalização.';
    return;
  }
  const btn=$('setBranchLocationBtn');
  btn.disabled=true;
  $('branchLocationMsg').textContent='Obtendo localização precisa do aparelho...';
  navigator.geolocation.getCurrentPosition(async pos=>{
    const latitude=pos.coords.latitude;
    const longitude=pos.coords.longitude;
    const accuracy=pos.coords.accuracy;
    if(accuracy>100){
      btn.disabled=false;
      $('branchLocationMsg').textContent='Precisão insuficiente ('+Math.round(accuracy)+' m). Ative a localização precisa e tente novamente.';
      return;
    }
    const {data,error}=await client.from('branches')
      .update({latitude,longitude,geofence_radius_m:80})
      .eq('id',me.branch_id)
      .select('id,name,address,latitude,longitude,geofence_radius_m')
      .single();
    btn.disabled=false;
    if(error){
      $('branchLocationMsg').textContent='Erro ao salvar: '+error.message;
      return;
    }
    branch=data;
    renderBranchLocation();
    $('branchLocationMsg').textContent='Localização salva com precisão aproximada de '+Math.round(accuracy)+' m.';
  },err=>{
    btn.disabled=false;
    const msgs={
      1:'Permissão de localização negada. Libere o acesso à localização para este site e tente novamente.',
      2:'Não foi possível determinar a localização do aparelho.',
      3:'A localização demorou demais. Tente novamente em um local com melhor sinal.'
    };
    $('branchLocationMsg').textContent=msgs[err.code]||'Erro ao obter localização.';
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}


let presenceCheckRunning=false;
let lastPresenceCheckAt=0;

function showReceipt(row){
  if(!row?.receipt_code) return;
  $('receiptBox').classList.remove('hidden');
  $('receiptType').textContent=row.event_type==='check_in'?'Entrada':'Saída';
  $('receiptDate').textContent=fmtDate(row.occurred_at);
  $('receiptTime').textContent=fmtTime(row.occurred_at);
  $('receiptCode').textContent=row.receipt_code;
}

async function checkWebPresence(force=false){
  if(!me || isManager() || !navigator.geolocation || presenceCheckRunning) return;
  const now=Date.now();
  if(!force && now-lastPresenceCheckAt<60000) return;
  presenceCheckRunning=true;
  lastPresenceCheckAt=now;
  $('autoPresenceTitle').textContent='Obtendo localização...';
  $('autoPresenceMsg').textContent='Confirme a permissão de localização se o iPhone solicitar.';
  $('checkPresenceNowBtn').disabled=true;

  navigator.geolocation.getCurrentPosition(async pos=>{
    try{
      const {data,error}=await client.rpc('register_web_presence',{
        p_latitude:pos.coords.latitude,
        p_longitude:pos.coords.longitude,
        p_accuracy_m:pos.coords.accuracy
      });
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      const distance=Math.round(Number(row?.distance_m||0));
      if(row?.action==='registered'){
        showReceipt(row);
        const entering=row.event_type==='check_in';
        $('autoPresenceTitle').textContent=entering?'Entrada registrada':'Saída registrada';
        $('autoPresencePill').textContent=entering?'Na empresa':'Fora da empresa';
        $('autoPresenceMsg').textContent=`Registro automático concluído. Distância aproximada da unidade: ${distance} m.`;
        await loadToday();
        if(!entering) loadAndShowDailyReceipt();
      }else{
        const outside=distance>(branch?.geofence_radius_m||80);
        const externalShift=!!row?.is_present&&outside;
        $('autoPresenceTitle').textContent=externalShift?'Jornada ativa em serviço externo':row?.is_present?'Você está na empresa':'Você está fora da empresa';
        $('autoPresencePill').textContent=externalShift?'Serviço externo':row?.is_present?'Na empresa':'Fora da empresa';
        $('autoPresenceMsg').textContent=externalShift
          ?`Sua jornada continua ativa fora da unidade. A saída deverá ser registrada manualmente. Distância aproximada: ${distance} m.`
          :`Nenhuma nova batida necessária. Distância aproximada da unidade: ${distance} m.`;
      }
    }catch(e){
      let msg=e.message||'Não foi possível verificar a presença.';
      if(msg.includes('location_accuracy_too_low')) msg='A precisão da localização está baixa. Ative Localização Precisa para o Prado Ponto e tente novamente.';
      $('autoPresenceTitle').textContent='Não foi possível registrar';
      $('autoPresencePill').textContent='Atenção';
      $('autoPresenceMsg').textContent=msg;
    }finally{
      presenceCheckRunning=false;
      $('checkPresenceNowBtn').disabled=false;
    }
  },err=>{
    presenceCheckRunning=false;
    $('checkPresenceNowBtn').disabled=false;
    const msgs={
      1:'Permissão de localização negada. No iPhone, abra Ajustes > Privacidade e Segurança > Serviços de Localização > Safari/Prado Ponto e permita o acesso com Localização Precisa.',
      2:'Não foi possível obter sua localização. Verifique se os Serviços de Localização estão ativos.',
      3:'A localização demorou demais. Tente novamente.'
    };
    $('autoPresenceTitle').textContent='Localização necessária';
    $('autoPresencePill').textContent='Atenção';
    $('autoPresenceMsg').textContent=msgs[err.code]||'Erro ao obter localização.';
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}


function updateEmployeeMobileUI(){
  if(!$('employeeGreeting') || !me || isManager()) return;

  const first=(me.full_name||'').trim().split(/\s+/)[0]||'';
  $('employeeGreeting').textContent=first?`Olá, ${first}`:'Olá';

  const ins=todayEvents.filter(x=>x.event_type==='check_in');
  const outs=todayEvents.filter(x=>x.event_type==='check_out');
  const inside=todayEvents.length>0 && todayEvents[todayEvents.length-1].event_type==='check_in';

  const entry=ins.length?fmtTime(ins[0].occurred_at):'—';
  const exit=outs.length?fmtTime(outs[outs.length-1].occurred_at):'—';
  $('employeeEntryMini').textContent=entry;
  $('employeeExitMini').textContent=exit;
  $('employeeEventCountMobile').textContent=todayEvents.length;

  let worked=0;
  if(ins.length){
    const start=new Date(ins[0].occurred_at);
    const end=outs.length?new Date(outs[outs.length-1].occurred_at):new Date();
    worked=Math.max(0,Math.round((end-start)/60000));
  }
  $('employeeWorkedToday').textContent=formatMinutes(worked);

  $('employeeStatusLabel').textContent=inside?'Em jornada':'Fora da empresa';
  $('employeeStatusBadge').classList.toggle('on',inside);
  $('employeeStatusBadge').classList.toggle('off',!inside);

  $('employeeActionEyebrow').textContent=inside?'Jornada em andamento':'Pronto para começar?';
  $('employeeActionTitle').textContent=inside?'Registrar saída':'Registrar entrada';
  $('employeeActionHint').textContent=inside
    ?'Confirme sua saída ao encerrar o expediente.'
    :'A localização será verificada antes do registro.';
  $('employeeMainPunchText').textContent=inside?'Registrar saída':'Registrar entrada';
  $('employeeMainPunchIcon').textContent=inside?'✓':'→';
  $('employeeMainPunchBtn').classList.toggle('checkout',inside);

  const last=todayEvents.length?todayEvents[todayEvents.length-1]:null;
  $('employeeLastPunch').textContent=last
    ?`${last.event_type==='check_in'?'Entrada':'Saída'} às ${fmtTime(last.occurred_at)}`
    :'Nenhum registro hoje';
  $('employeeReceiptShortcut').disabled=!last?.receipt_code;

  if(currentLocation){
    $('employeeLocationSummary').textContent=currentLocation.verified?'Dentro da unidade':'Fora do raio';
    $('employeeLocationDetail').textContent=currentLocation.verified
      ?'Localização validada para o registro.'
      :'Sua localização atual está fora do raio configurado.';
  }else{
    $('employeeLocationSummary').textContent=inside?'Presença em andamento':'Aguardando verificação';
    $('employeeLocationDetail').textContent=inside
      ?'Sua jornada está ativa.'
      :'Abra o app na empresa para validar sua presença.';
  }
}

async function loadEmployeePlannedShift(){
  if(!$('employeePlannedShift') || !me || isManager()) return;
  const weekday=new Date().getDay();
  const {data}=await client.from('work_schedules')
    .select('start_time,break_start,break_end,end_time')
    .eq('employee_id',me.id)
    .eq('weekday',weekday)
    .maybeSingle();

  if(!data){
    $('employeePlannedShift').textContent='Sem jornada prevista hoje';
    $('employeeDaySummary').textContent='Hoje não há horário programado.';
    return;
  }

  const start=data.start_time?.slice(0,5)||'—';
  const end=data.end_time?.slice(0,5)||'—';
  $('employeePlannedShift').textContent=`${start} → ${end}`;
  $('employeeDaySummary').textContent=`Expediente previsto: ${start} às ${end}.`;
}

async function loadToday(){
  const {data,error}=await client.from('attendance_events').select('*').eq('employee_id',me.id)
    .gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true});
  if(error) throw error;
  todayEvents=data||[];
  renderToday();
}
function renderToday(){
  const ins=todayEvents.filter(x=>x.event_type==='check_in');
  const outs=todayEvents.filter(x=>x.event_type==='check_out');
  const inside=todayEvents.length>0&&todayEvents[todayEvents.length-1].event_type==='check_in';
  $('checkIn').textContent=ins.length?fmtTime(ins[0].occurred_at):'—';
  $('checkOut').textContent=outs.length?fmtTime(outs[outs.length-1].occurred_at):'—';
  $('eventCount').textContent=todayEvents.length;
  $('statusText').textContent=inside?'Na empresa':'Fora da empresa';
  $('statusHint').textContent=inside?'Último registro: entrada.':'Aguardando nova entrada.';
  $('statusOrb').classList.toggle('on',inside);
  $('checkInBtn').disabled=inside;
  $('checkOutBtn').disabled=!inside;
  $('timeline').innerHTML=todayEvents.length?[...todayEvents].reverse().map(e=>`<div class="event"><time>${fmtTime(e.occurred_at)}</time><div><strong>${e.event_type==='check_in'?'Entrada':'Saída'}</strong><small>${e.geofence_verified?'Geofence confirmado':'Sem validação de geofence'}</small></div></div>`).join(''):'<div class="empty">Nenhum ponto registrado hoje.</div>';
  updateEmployeeMobileUI();
}

async function saveEvent(type){
  $('savePill').textContent='Salvando...';
  const {data,error}=await client.rpc('register_manual_attendance',{
    p_event_type:type,
    p_latitude:currentLocation?.latitude??null,
    p_longitude:currentLocation?.longitude??null,
    p_accuracy_m:currentLocation?.accuracy??null
  });
  if(error){
    $('savePill').textContent='Erro';
    alert(error.message);
    return;
  }
  const row=Array.isArray(data)?data[0]:data;
  $('savePill').textContent='Salvo no Supabase';
  currentLocation=null;
  if(row?.receipt_code) showReceipt(row);
  await loadToday();
  updateEmployeeMobileUI();
  if(type==='check_out') loadAndShowDailyReceipt();
}

function distanceM(a,b,c,d){const R=6371e3,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function verifyLocation(){
  if(!navigator.geolocation)return alert('Geolocalização indisponível.');
  $('locationInfo').textContent='Localizando...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const loc={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,verified:false};
    if(branch?.latitude!=null&&branch?.longitude!=null){
      const d=distanceM(loc.latitude,loc.longitude,branch.latitude,branch.longitude);
      loc.verified=d<=(branch.geofence_radius_m||80);
      $('locationInfo').textContent=`Distância aproximada: ${Math.round(d)} m • ${loc.verified?'dentro':'fora'} do raio.`;
    }else $('locationInfo').textContent='Localização capturada; coordenadas da unidade ainda não configuradas.';
    currentLocation=loc;
    updateEmployeeMobileUI();
  },()=>{$('locationInfo').textContent='Não foi possível acessar a localização.'},{enableHighAccuracy:true,timeout:10000});
}

async function loadMyHistory(){
  const {data,error}=await client.from('attendance_events').select('event_type,occurred_at,geofence_verified').eq('employee_id',me.id).order('occurred_at',{ascending:false}).limit(100);
  if(error)return;
  $('historyBody').innerHTML=(data||[]).map(e=>`<tr><td>${fmtDate(e.occurred_at)}</td><td>${fmtTime(e.occurred_at)}</td><td>${e.event_type==='check_in'?'Entrada':'Saída'}</td><td>${e.geofence_verified?'Confirmado':'Não'}</td></tr>`).join('');
}

async function loadEmployees(){
  const {data,error}=await client.from('employees').select('id,full_name,email,role,active,user_id,allow_external_after_checkin,overtime_after_minutes,lunch_zero_counts_overtime,lunch_overtime_minutes,avatar_url').order('full_name');
  if(error){$('employeesBody').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return}
  const rows=data||[];
  employeeDirectory=rows;
  $('employeesBody').innerHTML=rows.map(e=>`<tr>
    <td><div class="manager-table-person">${avatarHtml(e,'manager-table-avatar')}<span>${esc(e.full_name)}</span></div></td><td>${esc(e.email||'—')}</td>
    <td>${e.role==='admin'?'Administrador':e.role==='manager'?'Gestor':'Funcionário'}</td>
    <td>${e.user_id?'Criado':'Pendente'}</td>
    <td><span class="badge ${e.active?'good':'neutral'}">${e.active?'Ativo':'Inativo'}</span></td>
    <td><div class="row-actions">
      ${e.email?`<button class="mini" onclick="copyInvite('${String(e.email).replace(/'/g,"\\'")}')">Copiar link</button>`:''}
      <button class="mini" onclick="pickEmployeeAvatar('${e.id}',false)">Foto</button>
      <button class="mini" data-schedule="${e.id}">Horários</button>
    </div></td>
  </tr>`).join('');
  $('scheduleEmployee').innerHTML='<option value="">Selecione...</option>'+rows.filter(e=>e.active).map(e=>`<option value="${e.id}">${esc(e.full_name)}</option>`).join('');
  if($('ruleEmployee')){
    const current=$('ruleEmployee').value;
    $('ruleEmployee').innerHTML='<option value="">Selecione...</option>'+rows.filter(e=>e.active).map(e=>`<option value="${e.id}">${esc(e.full_name)}</option>`).join('');
    if(rows.some(e=>e.id===current)) $('ruleEmployee').value=current;
  }
  document.querySelectorAll('[data-schedule]').forEach(btn=>btn.onclick=()=>{
    $('scheduleEmployee').value=btn.dataset.schedule;
    loadSchedulePreview();
    if($('ruleEmployee')){
      $('ruleEmployee').value=btn.dataset.schedule;
      loadEmployeeRules();
    }
    $('scheduleEmployee').scrollIntoView({behavior:'smooth',block:'center'});
  });
}

async function createEmployee(){
  const name=$('newName').value.trim(),email=$('newEmail').value.trim().toLowerCase(),role=$('newRole').value;
  if(!name||!email){$('employeeCreateMsg').textContent='Preencha nome e e-mail.';return}
  $('employeeCreateMsg').textContent='Criando cadastro...';
  const {error}=await client.from('employees').insert({company_id:me.company_id,branch_id:me.branch_id,full_name:name,email,role,active:true});
  if(error){$('employeeCreateMsg').textContent='Erro: '+error.message;return}
  $('employeeCreateMsg').textContent='Funcionário cadastrado. Use o botão Copiar link e envie o convite para ele entrar com Google.';
  $('newName').value='';$('newEmail').value='';$('newRole').value='employee';
  await loadEmployees();await loadManagerHome();
}




function loadEmployeeRules(){
  const id=$('ruleEmployee')?.value;
  const e=employeeDirectory.find(x=>x.id===id);
  if(!e){
    if($('ruleMsg')) $('ruleMsg').textContent='Selecione um funcionário para editar as regras.';
    return;
  }
  $('ruleExternal').checked=!!e.allow_external_after_checkin;
  $('ruleOvertimeAfter').value=e.overtime_after_minutes ?? 10;
  $('ruleLunchZero').checked=e.lunch_zero_counts_overtime !== false;
  $('ruleLunchMinutes').value=e.lunch_overtime_minutes ?? 60;
  $('ruleMsg').textContent=e.allow_external_after_checkin
    ?'Serviço externo liberado: sair do raio não encerra o expediente automaticamente.'
    :'Funcionário comum: sair do raio pode registrar a saída automática.';
}

async function saveEmployeeRules(){
  const id=$('ruleEmployee').value;
  if(!id){$('ruleMsg').textContent='Selecione um funcionário.';return}
  const payload={
    allow_external_after_checkin:$('ruleExternal').checked,
    overtime_after_minutes:Number($('ruleOvertimeAfter').value||10),
    lunch_zero_counts_overtime:$('ruleLunchZero').checked,
    lunch_overtime_minutes:Number($('ruleLunchMinutes').value||60)
  };
  $('ruleMsg').textContent='Salvando regras...';
  const {error}=await client.from('employees').update(payload).eq('id',id);
  if(error){$('ruleMsg').textContent='Erro: '+error.message;return}
  $('ruleMsg').textContent='Regras salvas com sucesso.';
  await loadEmployees();
  $('ruleEmployee').value=id;
  loadEmployeeRules();
  await loadManagerHome();
}

async function loadMySchedule(){
  const {data,error}=await client.from('work_schedules').select('weekday,start_time,break_start,break_end,end_time,tolerance_minutes').eq('employee_id',me.id).order('weekday');
  if(error||!(data||[]).length){$('mySchedule').innerHTML='<span class="muted">Nenhum horário definido ainda.</span>';return}
  $('mySchedule').innerHTML=(data||[]).map(s=>{
    const hasBreak=!!(s.break_start&&s.break_end);
    const hours=hasBreak
      ?`${s.start_time?.slice(0,5)||'—'} → ${s.break_start.slice(0,5)} / ${s.break_end.slice(0,5)} → ${s.end_time?.slice(0,5)||'—'}`
      :`${s.start_time?.slice(0,5)||'—'} → ${s.end_time?.slice(0,5)||'—'} • sem intervalo`;
    return `<div class="schedule-row"><strong>${dayNames[s.weekday]}</strong><span>${hours}</span><small>Tolerância ${s.tolerance_minutes} min</small></div>`;
  }).join('');
}


function updateDayRowState(row){
  const enabled=row.querySelector('.workDay').checked;
  row.querySelectorAll('input:not(.workDay)').forEach(input=>input.disabled=!enabled);
  row.style.opacity=enabled?'1':'.48';
}

function setDayRow(row, schedule=null, keepDefaults=false){
  const work=row.querySelector('.workDay');
  if(schedule){
    work.checked=true;
    row.querySelector('.dayStart').value=schedule.start_time?.slice(0,5)||'';
    row.querySelector('.dayBreakStart').value=schedule.break_start?.slice(0,5)||'';
    row.querySelector('.dayBreakEnd').value=schedule.break_end?.slice(0,5)||'';
    row.querySelector('.dayEnd').value=schedule.end_time?.slice(0,5)||'';
    row.querySelector('.dayTolerance').value=schedule.tolerance_minutes ?? 5;
  }else if(!keepDefaults){
    work.checked=false;
    row.querySelector('.dayStart').value='';
    row.querySelector('.dayBreakStart').value='';
    row.querySelector('.dayBreakEnd').value='';
    row.querySelector('.dayEnd').value='';
    row.querySelector('.dayTolerance').value=5;
  }
  updateDayRowState(row);
}

function renderSchedulePreview(data){
  $('schedulePreview').innerHTML=(data||[]).length?(data||[]).map(s=>{
    const hasBreak=!!(s.break_start&&s.break_end);
    const hours=hasBreak
      ?`${s.start_time?.slice(0,5)||'—'} → ${s.break_start.slice(0,5)} / ${s.break_end.slice(0,5)} → ${s.end_time?.slice(0,5)||'—'}`
      :`${s.start_time?.slice(0,5)||'—'} → ${s.end_time?.slice(0,5)||'—'} • sem intervalo`;
    return `<div class="schedule-row"><strong>${dayNames[s.weekday]}</strong><span>${hours}</span><small>${s.tolerance_minutes} min tolerância</small></div>`;
  }).join(''):'<span class="muted">Nenhum horário definido para este funcionário.</span>';
}

async function loadSchedulePreview(){
  const employeeId=$('scheduleEmployee').value;
  if(!employeeId){$('schedulePreview').innerHTML='';return}

  const {data,error}=await client.from('work_schedules')
    .select('weekday,start_time,break_start,break_end,end_time,tolerance_minutes')
    .eq('employee_id',employeeId).order('weekday');

  if(error){$('schedulePreview').textContent=error.message;return}

  const saved=(data||[]);
  const byDay=new Map(saved.map(s=>[Number(s.weekday),s]));
  document.querySelectorAll('.day-schedule-row').forEach(row=>{
    const weekday=Number(row.dataset.weekday);
    setDayRow(row,byDay.get(weekday)||null,saved.length===0);
  });
  renderSchedulePreview(saved);
  $('scheduleMsg').textContent='Edite cada dia individualmente e clique em Salvar jornada semanal.';
}

async function saveSchedule(){
  const employeeId=$('scheduleEmployee').value;
  if(!employeeId){$('scheduleMsg').textContent='Selecione um funcionário.';return}

  const activeRows=[];
  const inactiveDays=[];

  for(const row of document.querySelectorAll('.day-schedule-row')){
    const weekday=Number(row.dataset.weekday);
    const enabled=row.querySelector('.workDay').checked;
    if(!enabled){inactiveDays.push(weekday);continue}

    const start=row.querySelector('.dayStart').value||null;
    const breakStart=row.querySelector('.dayBreakStart').value||null;
    const breakEnd=row.querySelector('.dayBreakEnd').value||null;
    const end=row.querySelector('.dayEnd').value||null;
    const tolerance=Number(row.querySelector('.dayTolerance').value||5);

    if(!start||!end){$('scheduleMsg').textContent=`Preencha entrada e saída de ${dayNames[weekday]}.`;return}
    if((breakStart&&!breakEnd)||(!breakStart&&breakEnd)){
      $('scheduleMsg').textContent=`Preencha início e retorno do intervalo de ${dayNames[weekday]}, ou deixe os dois vazios.`;
      return;
    }

    activeRows.push({
      employee_id:employeeId,weekday,start_time:start,
      break_start:breakStart,break_end:breakEnd,end_time:end,
      tolerance_minutes:tolerance
    });
  }

  $('scheduleMsg').textContent='Salvando jornada semanal...';

  if(inactiveDays.length){
    const del=await client.from('work_schedules').delete().eq('employee_id',employeeId).in('weekday',inactiveDays);
    if(del.error){$('scheduleMsg').textContent='Erro: '+del.error.message;return}
  }

  if(activeRows.length){
    const up=await client.from('work_schedules').upsert(activeRows,{onConflict:'employee_id,weekday'});
    if(up.error){$('scheduleMsg').textContent='Erro: '+up.error.message;return}
  }

  $('scheduleMsg').textContent='Jornada semanal salva com sucesso.';
  await loadSchedulePreview();
}

document.querySelectorAll('.day-schedule-row .workDay').forEach(chk=>{
  chk.addEventListener('change',()=>updateDayRowState(chk.closest('.day-schedule-row')));
});


function formatMinutes(min){
  const n=Math.max(0,Number(min||0));
  const h=Math.floor(n/60),m=n%60;
  return h?`${h}h ${String(m).padStart(2,'0')}min`:`${m} min`;
}

function externalWorkerIcon(){
  return `<span class="external-worker-icon" title="Serviço externo" aria-label="Serviço externo">
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/>
    </svg>
  </span>`;
}

function openMapsDirections(lat,lng){
  if(lat==null||lng==null) return;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat+','+lng)}`,'_blank','noopener');
}

function buildManagerMap(employees,presenceBy){
  if(typeof L==='undefined' || !$('managerMap')) return;
  if(managerMap){managerMap.remove();managerMap=null}
  const center=(branch?.latitude!=null&&branch?.longitude!=null)?[Number(branch.latitude),Number(branch.longitude)]:[-23.55,-46.63];
  managerMap=L.map('managerMap',{zoomControl:true}).setView(center,14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'&copy; OpenStreetMap'
  }).addTo(managerMap);

  const bounds=[];
  if(branch?.latitude!=null&&branch?.longitude!=null){
    L.circle([Number(branch.latitude),Number(branch.longitude)],{
      radius:Number(branch.geofence_radius_m||80)
    }).addTo(managerMap).bindPopup('Unidade');
    bounds.push([Number(branch.latitude),Number(branch.longitude)]);
  }

  employees.filter(emp=>emp.allow_external_after_checkin).forEach(emp=>{
    const p=presenceBy.get(emp.id);
    if(p?.last_latitude==null||p?.last_longitude==null) return;
    const lat=Number(p.last_latitude),lng=Number(p.last_longitude);
    bounds.push([lat,lng]);
    L.marker([lat,lng]).addTo(managerMap)
      .bindPopup(`<strong>${esc(emp.full_name)}</strong><br>${p.is_present?'Jornada ativa':'Jornada encerrada'}<br>${speedLabel(p.last_speed_kmh)}<br>Última posição: ${p.last_location_at?fmtTime(p.last_location_at):'—'}`);
  });

  if(bounds.length>1) managerMap.fitBounds(bounds,{padding:[30,30],maxZoom:16});
  setTimeout(()=>managerMap?.invalidateSize(),100);
  $('mapUpdatedAt').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}


function localDateKey(value){
  return new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
}

function localWeekdayFromKey(dateKey){
  const d=new Date(dateKey+'T12:00:00-03:00');
  return d.getDay();
}

function localDateLabel(dateKey){
  return new Date(dateKey+'T12:00:00-03:00').toLocaleDateString('pt-BR',{
    day:'2-digit',month:'2-digit',weekday:'short'
  }).replace('.','');
}

function makeLocalShiftDate(dateKey,timeValue){
  if(!dateKey||!timeValue) return null;
  const time=String(timeValue).slice(0,5);
  return new Date(`${dateKey}T${time}:00-03:00`);
}

async function loadEmployeeOvertimeHistory(employeeId){
  if(!$('detailOvertimeChart')) return;

  $('detailOvertime30Total').textContent='—';
  $('detailOvertime30Days').textContent='—';
  $('detailOvertimeChart').innerHTML='<div class="overtime-empty">Calculando horas extras...</div>';

  const since=new Date();
  since.setDate(since.getDate()-29);
  since.setHours(0,0,0,0);

  const [{data:events,error:eventError},{data:schedules,error:scheduleError},{data:rule,error:ruleError},{data:snapshot,error:snapshotError}]=await Promise.all([
    client.from('attendance_events')
      .select('event_type,occurred_at')
      .eq('employee_id',employeeId)
      .gte('occurred_at',since.toISOString())
      .order('occurred_at',{ascending:true}),
    client.from('work_schedules')
      .select('weekday,end_time,break_start,break_end')
      .eq('employee_id',employeeId),
    client.from('employees')
      .select('overtime_after_minutes,lunch_zero_counts_overtime,lunch_overtime_minutes')
      .eq('id',employeeId)
      .single(),
    client.rpc('get_overtime_snapshot')
  ]);

  if(eventError||scheduleError||ruleError){
    $('detailOvertimeChart').innerHTML='<div class="overtime-empty">Não foi possível carregar o histórico agora.</div>';
    return;
  }

  const scheduleByDay=new Map((schedules||[]).map(s=>[Number(s.weekday),s]));
  const eventsByDate=new Map();

  (events||[]).forEach(ev=>{
    const key=localDateKey(ev.occurred_at);
    const arr=eventsByDate.get(key)||[];
    arr.push(ev);
    eventsByDate.set(key,arr);
  });

  const threshold=Number(rule?.overtime_after_minutes??10);
  const lunchZeroCounts=rule?.lunch_zero_counts_overtime!==false;
  const lunchExtraConfigured=Number(rule?.lunch_overtime_minutes??60);
  const todayKey=localDateKey(new Date());
  const todaySnapshot=(snapshot||[]).find(x=>x.employee_id===employeeId);

  const rows=[];

  for(const [dateKey,dayEvents] of eventsByDate.entries()){
    const schedule=scheduleByDay.get(localWeekdayFromKey(dateKey));
    if(!schedule?.end_time) continue;

    const ins=dayEvents.filter(e=>e.event_type==='check_in');
    const outs=dayEvents.filter(e=>e.event_type==='check_out');
    if(!ins.length) continue;

    let overtime=0;

    if(dateKey===todayKey && todaySnapshot){
      overtime=Number(todaySnapshot.total_overtime_minutes||0);
    }else if(outs.length){
      const lastOut=new Date(outs[outs.length-1].occurred_at);
      const end=makeLocalShiftDate(dateKey,schedule.end_time);
      if(end){
        const overtimeStart=new Date(end.getTime()+threshold*60000);
        overtime=Math.max(0,Math.floor((lastOut-overtimeStart)/60000));
      }

      if(
        lunchZeroCounts &&
        schedule.break_start?.slice(0,5)==='00:00' &&
        schedule.break_end?.slice(0,5)==='00:00'
      ){
        overtime+=lunchExtraConfigured;
      }
    }

    if(overtime>0){
      rows.push({dateKey,minutes:overtime});
    }
  }

  rows.sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  const total=rows.reduce((sum,r)=>sum+r.minutes,0);
  const max=Math.max(1,...rows.map(r=>r.minutes));

  $('detailOvertime30Total').textContent=formatMinutes(total);
  $('detailOvertime30Days').textContent=String(rows.length);

  if(!rows.length){
    $('detailOvertimeChart').innerHTML='<div class="overtime-empty">Nenhuma hora extra registrada nos últimos 30 dias.</div>';
    return;
  }

  $('detailOvertimeChart').innerHTML=rows.map(r=>{
    const width=Math.max(8,Math.round((r.minutes/max)*100));
    return `<div class="overtime-bar-row">
      <div class="overtime-bar-meta">
        <strong>${esc(localDateLabel(r.dateKey))}</strong>
        <span>${esc(formatMinutes(r.minutes))}</span>
      </div>
      <div class="overtime-bar-track">
        <div class="overtime-bar-fill" style="width:${width}%"></div>
      </div>
    </div>`;
  }).join('');
}

async function openEmployeeDetail(employeeId){
  activeDetailEmployeeId=employeeId;
  if(!detailLiveReloadTimer){
    detailLiveReloadTimer=setInterval(()=>{
      if(activeDetailEmployeeId && !$('employeeDetailModal')?.classList.contains('hidden')){
        const id=activeDetailEmployeeId;
        openEmployeeDetail(id).catch(()=>{});
      }
    },7000);
  }
  const emp=employeeDirectory.find(e=>e.id===employeeId);
  if(!emp) return;
  $('employeeDetailModal').classList.remove('hidden');
  $('detailEmployeeName').innerHTML=`${avatarHtml(emp,'detail-avatar')}<span>${esc(emp.full_name)}</span>`;
  $('detailEmployeeSummary').innerHTML='<span class="muted">Carregando dados...</span>';
  $('detailLocationTimeline').innerHTML='<span class="muted">Carregando localizações...</span>';
  loadEmployeeOvertimeHistory(employeeId).catch(err=>{
    console.error('employee_overtime_history_error',err);
    if($('detailOvertimeChart')) $('detailOvertimeChart').innerHTML='<div class="overtime-empty">Não foi possível carregar o histórico agora.</div>';
  });

  try{
  const [{data:events},{data:locations},{data:overtime},{data:schedule}]=await Promise.all([
    client.from('attendance_events').select('event_type,occurred_at,automatic,receipt_code').eq('employee_id',employeeId).gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true}),
    client.from('employee_location_updates').select('latitude,longitude,accuracy_m,speed_kmh,recorded_at').eq('employee_id',employeeId).gte('recorded_at',startToday()).lte('recorded_at',endToday()).order('recorded_at',{ascending:false}).limit(300),
    client.rpc('get_overtime_snapshot'),
    client.from('work_schedules').select('start_time,break_start,break_end,end_time,tolerance_minutes').eq('employee_id',employeeId).eq('weekday',new Date().getDay()).maybeSingle()
  ]);

  const arr=events||[];
  const locs=(locations||[]).slice().reverse();
  const ot=(overtime||[]).find(x=>x.employee_id===employeeId);
  const ins=arr.filter(x=>x.event_type==='check_in');
  const outs=arr.filter(x=>x.event_type==='check_out');

  let workedMinutes=0;
  if(ins.length){
    const startWorked=new Date(ins[0].occurred_at);
    const endWorked=outs.length?new Date(outs[outs.length-1].occurred_at):new Date();
    workedMinutes=minutesBetween(startWorked,endWorked);
  }
  const scheduleText=schedule?`${schedule.start_time?.slice(0,5)||'—'} → ${schedule.end_time?.slice(0,5)||'—'}`:'Sem jornada hoje';

  $('detailEmployeeSummary').innerHTML=`
    <div><span>Previsto</span><strong>${scheduleText}</strong></div>
    <div><span>Entrada</span><strong>${ins.length?fmtTime(ins[0].occurred_at):'—'}</strong></div>
    <div><span>Saída</span><strong>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</strong></div>
    <div><span>Tempo em jornada</span><strong>${formatMinutes(workedMinutes)}</strong></div>
    <div><span>Hora extra</span><strong>${formatMinutes(ot?.total_overtime_minutes||0)}</strong></div>
    <div><span>Almoço extra</span><strong>${formatMinutes(ot?.lunch_overtime_minutes||0)}</strong></div>
    <div><span>Status GPS</span><strong>${(()=>{
      const last=locs.length?locs[locs.length-1].recorded_at:null;
      return gpsLiveStatus(last,!!lastManagerPresenceBy.get(employeeId)?.is_present).label;
    })()}</strong></div>
    <div><span>Última posição</span><strong>${locs.length?locationAgeLabel(locs[locs.length-1].recorded_at):'Sem posição'}</strong></div>
    <div><span>Velocidade atual</span><strong>${locs.length?speedLabel(locs[locs.length-1].speed_kmh):'—'}</strong></div>
    <div><span>Precisão GPS</span><strong>${locs.length&&locs[locs.length-1].accuracy_m!=null?Math.round(Number(locs[locs.length-1].accuracy_m))+' m':'—'}</strong></div>
    <div><span>Registros hoje</span><strong>${arr.length}</strong></div>`;

  $('detailLocationTimeline').innerHTML=locs.length?locs.slice().reverse().map(l=>`
    <button class="location-row" onclick="focusEmployeeDetailMap()">
      <span><strong>${fmtTime(l.recorded_at)}</strong><small>${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}</small></span>
      <small>${speedLabel(l.speed_kmh)} • precisão ${l.accuracy_m!=null?Math.round(Number(l.accuracy_m))+' m':'—'} • ver no mapa interno</small>
    </button>`).join(''):'<span class="muted">Nenhuma localização externa registrada hoje.</span>';

  if(typeof L!=='undefined'){
    if(detailMap){detailMap.remove();detailMap=null}
    const center=locs.length?[Number(locs[locs.length-1].latitude),Number(locs[locs.length-1].longitude)]:
      (branch?.latitude!=null?[Number(branch.latitude),Number(branch.longitude)]:[-23.55,-46.63]);
    detailMap=L.map('detailEmployeeMap').setView(center,15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(detailMap);
    if(locs.length){
      const points=locs.map(l=>[Number(l.latitude),Number(l.longitude)]);
      L.polyline(points,{weight:5,opacity:.65}).addTo(detailMap);
      const lastLoc=locs[locs.length-1];
      L.marker(points[points.length-1]).addTo(detailMap)
        .bindPopup(`<strong>${esc(emp.full_name)}</strong><br>${speedLabel(lastLoc.speed_kmh)}<br>Atualizado ${locationAgeLabel(lastLoc.recorded_at)}`)
        .openPopup();
      if(points.length>1) detailMap.fitBounds(points,{padding:[25,25],maxZoom:17});
    }
    setTimeout(()=>detailMap?.invalidateSize(),100);
  }
  }catch(err){
    console.error('employee_detail_error',err);
    $('detailEmployeeSummary').innerHTML='<div><span>Status</span><strong>Erro ao carregar detalhes</strong></div>';
    $('detailLocationTimeline').innerHTML='<span class="muted">Não foi possível carregar as localizações agora.</span>';
  }
}


function focusEmployeeDetailMap(){
  const mapEl=$('detailEmployeeMap');
  if(!mapEl) return;
  mapEl.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>detailMap?.invalidateSize(),250);
}

function closeEmployeeDetail(){
  $('employeeDetailModal')?.classList.add('hidden');
  activeDetailEmployeeId=null;
  if(detailLiveReloadTimer){clearInterval(detailLiveReloadTimer);detailLiveReloadTimer=null;}
  if(detailMap){detailMap.remove();detailMap=null}
}


function timeToday(value){
  if(!value) return null;
  const [h,m]=String(value).slice(0,5).split(':').map(Number);
  const d=new Date();
  d.setHours(h,m,0,0);
  return d;
}

function minutesBetween(a,b){
  if(!a||!b) return 0;
  return Math.max(0,Math.round((b-a)/60000));
}

function speedLabel(value){
  if(value==null || Number.isNaN(Number(value))) return 'Velocidade indisponível';
  const n=Math.max(0,Number(value));
  if(n<2) return 'Parado';
  return `${Math.round(n)} km/h`;
}


function gpsLiveStatus(ts,isPresent){
  if(!isPresent) return {label:'Jornada encerrada',cls:'neutral'};
  if(!ts) return {label:'Sem sinal GPS',cls:'bad'};
  const ageMs=Date.now()-new Date(ts).getTime();
  if(ageMs<=45000) return {label:'GPS ao vivo',cls:'good'};
  if(ageMs<=180000) return {label:'GPS atrasado',cls:'warn'};
  return {label:'GPS sem atualizar',cls:'bad'};
}

function locationAgeLabel(ts){
  if(!ts) return 'Sem atualização';
  const mins=Math.max(0,Math.floor((Date.now()-new Date(ts).getTime())/60000));
  if(mins<1) return 'agora';
  if(mins===1) return 'há 1 min';
  if(mins<60) return `há ${mins} min`;
  const h=Math.floor(mins/60);
  return `há ${h}h`;
}

function attentionLabel(row){
  const parts=[];
  if(row.isLate) parts.push('Atrasado');
  if(row.overtimeMinutes>0 && row.onShift) parts.push(`Hora extra ${formatMinutes(row.overtimeMinutes)}`);
  if(row.isExternalActive) parts.push('Serviço externo');
  if(row.openShiftLate) parts.push('Sem saída');
  return parts.join(' • ');
}

function renderAttentionPanel(rows){
  const late=rows.filter(r=>r.isLate);
  const overtime=rows.filter(r=>r.overtimeMinutes>0&&r.onShift);
  const external=rows.filter(r=>r.isExternalActive);
  const openShift=rows.filter(r=>r.openShiftLate);

  if($('lateTotal')) $('lateTotal').textContent=late.length;
  if($('attentionOvertimeTotal')) $('attentionOvertimeTotal').textContent=overtime.length;
  if($('attentionExternalTotal')) $('attentionExternalTotal').textContent=external.length;
  if($('openShiftTotal')) $('openShiftTotal').textContent=openShift.length;

  const attentionRows=rows.filter(r=>r.isLate||r.openShiftLate||(r.overtimeMinutes>0&&r.onShift)||r.isExternalActive);
  if(!$('attentionList')) return;

  $('attentionList').innerHTML=attentionRows.length?attentionRows.slice(0,6).map(r=>`
    <button class="attention-person" onclick="openEmployeeDetail('${r.emp.id}')">
      <div class="attention-person-main">
        ${avatarHtml(r.emp,'attention-avatar-photo')}
        <span><strong>${esc(r.emp.full_name)}</strong><small>${attentionLabel(r)}</small></span>
      </div>
      <b>›</b>
    </button>`).join(''):'<div class="all-good-card"><strong>Tudo em ordem</strong><small>Nenhuma exceção importante agora.</small></div>';
}

function applyManagerTeamFilter(){
  const filter=$('managerTeamFilter')?.value||'all';
  let rows=lastManagerRows.slice();
  if(filter==='attention') rows=rows.filter(r=>r.isLate||r.openShiftLate||(r.overtimeMinutes>0&&r.onShift));
  if(filter==='active') rows=rows.filter(r=>r.onShift);
  if(filter==='external') rows=rows.filter(r=>r.isExternal);
  if(filter==='overtime') rows=rows.filter(r=>r.overtimeMinutes>0);

  if(activeAttentionFilter==='late') rows=rows.filter(r=>r.isLate);
  if(activeAttentionFilter==='overtime') rows=rows.filter(r=>r.overtimeMinutes>0&&r.onShift);
  if(activeAttentionFilter==='external') rows=rows.filter(r=>r.isExternalActive);
  if(activeAttentionFilter==='open_shift') rows=rows.filter(r=>r.openShiftLate);

  renderManagerEmployeeRows(rows);
}

function renderManagerEmployeeRows(rows){
  const cards=[];
  const tableRows=[];

  rows.forEach(r=>{
    const {emp,ins,outs,p,overtimeMinutes,lunchExtra,isExternal,onShift,isExternalActive,hasLocation,status,statusClass,locText,locTime,schedule,isLate,openShiftLate}=r;
    const issueChip=isLate?'<span class="issue-chip">Atraso</span>':openShiftLate?'<span class="issue-chip">Sem saída</span>':overtimeMinutes>0?'<span class="issue-chip">Hora extra</span>':'';
    const planned=schedule?`${schedule.start_time?.slice(0,5)||'—'} → ${schedule.end_time?.slice(0,5)||'—'}`:'Sem jornada hoje';

    cards.push(`<article class="employee-work-card">
      <div class="employee-work-top">
        <div class="employee-name-line">${avatarHtml(emp,'employee-card-avatar')}${isExternal?externalWorkerIcon():''}<div><strong>${esc(emp.full_name)}</strong><small>${isExternal?'Serviço externo autorizado':'Equipe interna'}</small></div></div>
        <div class="employee-status-stack"><span class="badge ${statusClass}">${status}</span>${issueChip}</div>
      </div>
      <div class="planned-line"><span>Previsto hoje</span><strong>${planned}</strong></div>
      <div class="employee-work-metrics">
        <div><span>Entrada</span><strong>${ins.length?fmtTime(ins[0].occurred_at):'—'}</strong></div>
        <div><span>Saída</span><strong>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</strong></div>
        <div><span>Hora extra hoje</span><strong class="${overtimeMinutes>0?'overtime-value':''}">${formatMinutes(overtimeMinutes)}</strong></div>
        <div><span>Almoço extra</span><strong>${formatMinutes(lunchExtra)}</strong></div>
      </div>
      <div class="employee-overtime30" data-employee-overtime30="${emp.id}">
        <div class="employee-overtime30-head">
          <div><span>Horas extras • 30 dias</span><strong>Calculando...</strong></div>
          <button class="mini" onclick="openEmployeeDetail('${emp.id}')">Ver dias</button>
        </div>
        <div class="employee-overtime30-days">Carregando histórico...</div>
      </div>
      ${isExternal?(()=>{
        const live=gpsLiveStatus(p?.last_location_at,onShift);
        return `<div class="employee-location-box manager-live-gps-box">
          <div class="manager-live-gps-head">
            <span>GPS do funcionário</span>
            <b class="manager-live-gps-pill ${live.cls}">${live.label}</b>
          </div>
          <strong>${hasLocation?locText:'Sem posição disponível'}</strong>
          <small>${hasLocation?`${speedLabel(p.last_speed_kmh)} • ${locationAgeLabel(p.last_location_at)} • precisão ${p.last_accuracy_m!=null?Math.round(Number(p.last_accuracy_m))+' m':'—'}`:'Aguardando sinal do celular'}</small>
        </div>`;
      })():''}
      <div class="employee-work-actions">
        <button class="ghost" onclick="openEmployeeDetail('${emp.id}')">Ver jornada completa</button>
        ${hasLocation?`<button class="primary" onclick="openEmployeeDetail('${emp.id}')">Ver percurso</button>`:''}
      </div>
    </article>`);

    tableRows.push(`<tr>
      <td><div class="manager-table-person">${avatarHtml(emp,'manager-table-avatar')}<span>${isExternal?externalWorkerIcon():''}${esc(emp.full_name)}</span></div></td>
      <td>${ins.length?fmtTime(ins[0].occurred_at):'—'}</td>
      <td>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</td>
      <td>${formatMinutes(overtimeMinutes)}</td>
      <td><strong data-employee-overtime30-table="${emp.id}">—</strong></td>
      <td><span class="badge ${statusClass}">${status}</span></td>
      <td>${isExternal?(hasLocation?`<button class="mini" onclick="openEmployeeDetail('${emp.id}')">${speedLabel(p.last_speed_kmh)} • ${locationAgeLabel(p.last_location_at)}</button>`:'Sem posição'):'—'}</td>
    </tr>`);
  });

  $('managerEmployeeCards').innerHTML=cards.length?cards.join(''):'<div class="empty-mobile-state">Nenhum funcionário neste filtro.</div>';
  $('teamBody').innerHTML=tableRows.join('');
}


async function loadManagerOvertime30Summaries(){
  if(!isManager()) return;

  const since=new Date();
  since.setDate(since.getDate()-29);
  since.setHours(0,0,0,0);

  const [{data:events,error:eventError},{data:schedules,error:scheduleError},{data:employees,error:employeeError},{data:snapshot,error:snapshotError}]=await Promise.all([
    client.from('attendance_events')
      .select('employee_id,event_type,occurred_at')
      .gte('occurred_at',since.toISOString())
      .order('occurred_at',{ascending:true}),
    client.from('work_schedules')
      .select('employee_id,weekday,end_time,break_start,break_end'),
    client.from('employees')
      .select('id,overtime_after_minutes,lunch_zero_counts_overtime,lunch_overtime_minutes')
      .eq('active',true),
    client.rpc('get_overtime_snapshot')
  ]);

  if(eventError||scheduleError||employeeError) return;

  const employeeRule=new Map((employees||[]).map(e=>[e.id,e]));
  const scheduleMap=new Map();
  (schedules||[]).forEach(s=>scheduleMap.set(`${s.employee_id}:${Number(s.weekday)}`,s));
  const snapshotMap=new Map((snapshot||[]).map(s=>[s.employee_id,s]));
  const grouped=new Map();

  (events||[]).forEach(ev=>{
    const key=localDateKey(ev.occurred_at);
    const k=`${ev.employee_id}:${key}`;
    const arr=grouped.get(k)||[];
    arr.push(ev);
    grouped.set(k,arr);
  });

  const todayKey=localDateKey(new Date());
  const results=new Map();

  for(const [key,dayEvents] of grouped.entries()){
    const split=key.lastIndexOf(':');
    const employeeId=key.slice(0,split);
    const dateKey=key.slice(split+1);
    const rule=employeeRule.get(employeeId);
    const schedule=scheduleMap.get(`${employeeId}:${localWeekdayFromKey(dateKey)}`);
    if(!rule||!schedule?.end_time) continue;

    const ins=dayEvents.filter(e=>e.event_type==='check_in');
    const outs=dayEvents.filter(e=>e.event_type==='check_out');
    if(!ins.length) continue;

    let overtime=0;
    if(dateKey===todayKey){
      overtime=Number(snapshotMap.get(employeeId)?.total_overtime_minutes||0);
    }else if(outs.length){
      const lastOut=new Date(outs[outs.length-1].occurred_at);
      const end=makeLocalShiftDate(dateKey,schedule.end_time);
      if(end){
        const threshold=Number(rule.overtime_after_minutes??10);
        const overtimeStart=new Date(end.getTime()+threshold*60000);
        overtime=Math.max(0,Math.floor((lastOut-overtimeStart)/60000));
      }

      if(
        rule.lunch_zero_counts_overtime!==false &&
        schedule.break_start?.slice(0,5)==='00:00' &&
        schedule.break_end?.slice(0,5)==='00:00'
      ){
        overtime+=Number(rule.lunch_overtime_minutes??60);
      }
    }

    if(overtime>0){
      const row=results.get(employeeId)||{total:0,days:[]};
      row.total+=overtime;
      row.days.push({dateKey,minutes:overtime});
      results.set(employeeId,row);
    }
  }

  document.querySelectorAll('[data-employee-overtime30]').forEach(el=>{
    const id=el.dataset.employeeOvertime30;
    const r=results.get(id)||{total:0,days:[]};
    const totalEl=el.querySelector('.employee-overtime30-head strong');
    const daysEl=el.querySelector('.employee-overtime30-days');
    if(totalEl) totalEl.textContent=formatMinutes(r.total);
    if(daysEl){
      daysEl.innerHTML=r.days.length
        ? r.days.slice(-4).reverse().map(d=>`<span>${esc(localDateLabel(d.dateKey))} • <b>${esc(formatMinutes(d.minutes))}</b></span>`).join('')
        : '<span>Nenhuma hora extra nos últimos 30 dias.</span>';
    }
  });

  document.querySelectorAll('[data-employee-overtime30-table]').forEach(el=>{
    const r=results.get(el.dataset.employeeOvertime30Table)||{total:0};
    el.textContent=formatMinutes(r.total);
  });
}

async function loadManagerHome(){
  const weekday=new Date().getDay();
  try{
  const [{data:emps,error:empsError},{data:events,error:eventsError},{data:presence,error:presenceError},{data:overtime,error:overtimeError},{data:schedules,error:schedulesError}]=await Promise.all([
    client.from('employees').select('id,full_name,email,active,allow_external_after_checkin,overtime_after_minutes,avatar_url').eq('active',true).order('full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at').gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true}),
    client.from('employee_presence').select('employee_id,is_present,last_seen_at,wifi_verified,geofence_verified,last_latitude,last_longitude,last_accuracy_m,last_location_at,last_speed_kmh,updated_at'),
    client.rpc('get_overtime_snapshot'),
    client.from('work_schedules').select('employee_id,weekday,start_time,break_start,break_end,end_time,tolerance_minutes').eq('weekday',weekday)
  ]);

  const employees=emps||[];
  employeeDirectory=employeeDirectory.length?employeeDirectory:employees;
  lastManagerEmployees=employees;

  const by=new Map();
  (events||[]).forEach(ev=>{const arr=by.get(ev.employee_id)||[];arr.push(ev);by.set(ev.employee_id,arr)});
  const presenceBy=new Map((presence||[]).map(p=>[p.employee_id,p]));
  lastManagerPresenceBy=presenceBy;
  const overtimeBy=new Map((overtime||[]).map(o=>[o.employee_id,o]));
  const scheduleBy=new Map((schedules||[]).map(s=>[s.employee_id,s]));
  lastManagerSchedules=scheduleBy;

  const now=new Date();
  let activeShift=0,overtimeNow=0,external=0;
  const rows=[];

  employees.forEach(emp=>{
    const arr=by.get(emp.id)||[];
    const ins=arr.filter(x=>x.event_type==='check_in');
    const outs=arr.filter(x=>x.event_type==='check_out');
    const p=presenceBy.get(emp.id);
    const ot=overtimeBy.get(emp.id);
    const schedule=scheduleBy.get(emp.id)||null;
    const onShift=!!p?.is_present;
    const overtimeMinutes=Number(ot?.total_overtime_minutes||0);
    const lunchExtra=Number(ot?.lunch_overtime_minutes||0);
    const isExternal=!!emp.allow_external_after_checkin;
    const hasLocation=p?.last_latitude!=null&&p?.last_longitude!=null;
    const isExternalActive=isExternal&&onShift&&!p?.geofence_verified;
    const status=isExternalActive?'Em serviço externo':onShift?'Em jornada':'Fora da empresa';
    const statusClass=onShift?'good':'neutral';
    const locText=hasLocation?`${Number(p.last_latitude).toFixed(5)}, ${Number(p.last_longitude).toFixed(5)}`:(isExternal?'Sem posição recente':'Não aplicável');
    const locTime=p?.last_location_at?fmtTime(p.last_location_at):'—';

    let isLate=false,openShiftLate=false;
    if(schedule){
      const start=timeToday(schedule.start_time);
      const end=timeToday(schedule.end_time);
      const tolerance=Number(schedule.tolerance_minutes||0);
      if(start && now > new Date(start.getTime()+tolerance*60000) && ins.length===0) isLate=true;
      const extraLimit=Number(emp.overtime_after_minutes??10);
      if(end && onShift && now > new Date(end.getTime()+extraLimit*60000)) openShiftLate=true;
    }

    if(onShift) activeShift++;
    if(overtimeMinutes>0&&onShift) overtimeNow++;
    if(isExternal) external++;

    rows.push({emp,arr,ins,outs,p,ot,schedule,onShift,overtimeMinutes,lunchExtra,isExternal,hasLocation,isExternalActive,status,statusClass,locText,locTime,isLate,openShiftLate});
  });

  lastManagerRows=rows;
  renderAttentionPanel(rows);
  renderManagerEmployeeRows(rows);
  loadManagerOvertime30Summaries().catch(err=>console.error('manager_overtime30_error',err));

  $('employeeTotal').textContent=employees.length;
  $('presentTotal').textContent=activeShift;
  $('overtimeTotal').textContent=overtimeNow;
  $('externalTotal').textContent=external;

  if($('mobileMapSummary')){
    $('mobileMapSummary').textContent=external
      ?`${external} funcionário${external===1?'':'s'} externo${external===1?'':'s'} • GPS ao vivo otimizado, velocidade e percurso recente no painel do gestor.`
      :'Nenhum funcionário externo configurado.';
  }

  buildManagerMap(employees,presenceBy);
  }catch(err){
    console.error('manager_dashboard_error',err);
    if($('attentionList')){
      $('attentionList').innerHTML='<div class="all-good-card"><strong>Não foi possível atualizar o painel</strong><small>Tente tocar em Atualizar. Os registros de ponto continuam preservados.</small></div>';
    }
  }
}

function updateManagerBottomNav(viewId){
  document.querySelectorAll('#managerBottomNav [data-mobile-manager-view]').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.mobileManagerView===viewId);
  });
  document.querySelectorAll('#managerBottomNav [data-mobile-manager-action]').forEach(btn=>{
    btn.classList.remove('active');
  });
}

async function buildMobileManagerMap(){
  if(typeof L==='undefined' || !$('mobileManagerMap')) return;
  if(mobileManagerMap){ mobileManagerMap.remove(); mobileManagerMap=null; }

  const center=(branch?.latitude!=null&&branch?.longitude!=null)
    ? [Number(branch.latitude),Number(branch.longitude)]
    : [-23.55,-46.63];

  mobileManagerMap=L.map('mobileManagerMap',{zoomControl:true}).setView(center,14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'&copy; OpenStreetMap'
  }).addTo(mobileManagerMap);

  const bounds=[];
  if(branch?.latitude!=null&&branch?.longitude!=null){
    L.circle([Number(branch.latitude),Number(branch.longitude)],{
      radius:Number(branch.geofence_radius_m||80)
    }).addTo(mobileManagerMap).bindPopup('Unidade');
    bounds.push([Number(branch.latitude),Number(branch.longitude)]);
  }

  let trailRows=[];
  try{
    const {data}=await client.from('employee_location_updates')
      .select('employee_id,latitude,longitude,accuracy_m,speed_kmh,recorded_at')
      .gte('recorded_at',startToday())
      .lte('recorded_at',endToday())
      .order('recorded_at',{ascending:false})
      .limit(1000);
    trailRows=(data||[]).slice().reverse();
  }catch{}

  const trailsByEmployee=new Map();
  trailRows.forEach(row=>{
    const arr=trailsByEmployee.get(row.employee_id)||[];
    arr.push(row);
    trailsByEmployee.set(row.employee_id,arr);
  });

  const people=[];
  lastManagerEmployees.filter(emp=>emp.allow_external_after_checkin).forEach(emp=>{
    const p=lastManagerPresenceBy.get(emp.id);
    const trail=trailsByEmployee.get(emp.id)||[];

    if(trail.length>1){
      const points=trail.map(x=>[Number(x.latitude),Number(x.longitude)]);
      L.polyline(points,{weight:4,opacity:.55}).addTo(mobileManagerMap);
      points.forEach(pt=>bounds.push(pt));
    }

    if(p?.last_latitude==null || p?.last_longitude==null) return;
    const lat=Number(p.last_latitude), lng=Number(p.last_longitude);
    bounds.push([lat,lng]);

    L.marker([lat,lng]).addTo(mobileManagerMap)
      .bindPopup(`<strong>${esc(emp.full_name)}</strong><br>${p.is_present?'Jornada ativa':'Jornada encerrada'}<br><strong>${speedLabel(p.last_speed_kmh)}</strong><br>Atualizado ${p.last_location_at?locationAgeLabel(p.last_location_at):'—'}`);

    const live=gpsLiveStatus(p.last_location_at,p.is_present);
    people.push(`<button class="mobile-map-person" onclick="openEmployeeDetail('${emp.id}')">
      ${avatarHtml(emp,'attention-avatar-photo')}
      <span>
        <strong>${esc(emp.full_name)}</strong>
        <small><b class="manager-live-gps-inline ${live.cls}">${live.label}</b> • ${speedLabel(p.last_speed_kmh)} • ${p.last_location_at?locationAgeLabel(p.last_location_at):'sem atualização'}</small>
      </span>
      <b>›</b>
    </button>`);
  });

  if($('mobileMapPeople')){
    $('mobileMapPeople').innerHTML=people.length
      ? people.join('')
      : '<div class="empty-mobile-state">Nenhuma localização externa disponível agora.</div>';
  }

  if(bounds.length>1) mobileManagerMap.fitBounds(bounds,{padding:[24,24],maxZoom:16});
  setTimeout(()=>mobileManagerMap?.invalidateSize(),120);
}
function openMobileMap(){
  if(!$('mobileMapSheet')) return;
  $('mobileMapSheet').classList.remove('hidden');
  document.body.classList.add('mobile-sheet-open');
  buildMobileManagerMap().catch(()=>{});
}

function closeMobileMap(){
  $('mobileMapSheet')?.classList.add('hidden');
  document.body.classList.remove('mobile-sheet-open');
  if(mobileManagerMap){ mobileManagerMap.remove(); mobileManagerMap=null; }
}

async function loadManagerRecords(){
  const [{data:emps},{data:events,error}]=await Promise.all([
    client.from('employees').select('id,full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at,geofence_verified,wifi_verified,automatic,receipt_code').order('occurred_at',{ascending:false}).limit(200)
  ]);
  if(error)return;
  const names=new Map((emps||[]).map(e=>[e.id,e.full_name]));
  $('recordsBody').innerHTML=(events||[]).map(e=>`<tr><td>${names.get(e.employee_id)||'Funcionário'}</td><td>${fmtDate(e.occurred_at)}</td><td>${fmtTime(e.occurred_at)}</td><td>${e.event_type==='check_in'?'Entrada':'Saída'}${e.automatic?'<br><small>Automático</small>':''}${e.receipt_code?`<br><small>${e.receipt_code}</small>`:''}</td><td>${e.wifi_verified?'Wi‑Fi':e.geofence_verified?'Localização':'Não'}</td></tr>`).join('');
}



let managerAudioContext=null;
let lastDailyReceipt=null;


function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}

async function ensureUserPushSubscription(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    throw new Error('Este aparelho não oferece Web Push para o Prado Ponto.');
  }

  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone===true;
  if(isIOS && !standalone){
    throw new Error('No iPhone, instale o Prado Ponto na Tela de Início para receber notificações.');
  }

  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription){
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const json=subscription.toJSON();
  const {error}=await client.rpc('save_user_push_subscription',{
    p_endpoint:subscription.endpoint,
    p_p256dh:json.keys?.p256dh||'',
    p_auth:json.keys?.auth||'',
    p_user_agent:navigator.userAgent
  });
  if(error) throw error;
  return subscription;
}

async function ensureManagerPushSubscription(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    throw new Error('Este aparelho não oferece Web Push para o Prado Ponto.');
  }

  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone===true;

  if(isIOS && !standalone){
    throw new Error('No iPhone, instale o Prado Ponto na Tela de Início antes de ativar notificações.');
  }

  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();

  if(!subscription){
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const json=subscription.toJSON();
  const {error}=await client.rpc('save_manager_push_subscription',{
    p_endpoint:subscription.endpoint,
    p_p256dh:json.keys?.p256dh||'',
    p_auth:json.keys?.auth||'',
    p_user_agent:navigator.userAgent
  });
  if(error) throw error;
  return subscription;
}

async function enableManagerNotifications(){
  if(!isManager()) return;

  try{
    if(!('Notification' in window)){
      throw new Error('Notificações não são compatíveis com este aparelho.');
    }

    const permission=Notification.permission==='granted'
      ? 'granted'
      : await Notification.requestPermission();

    if(permission!=='granted'){
      throw new Error('Permissão de notificações não autorizada.');
    }

    await ensureManagerPushSubscription();

    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){
        managerAudioContext=managerAudioContext||new Ctx();
        if(managerAudioContext.state==='suspended') await managerAudioContext.resume();
        playManagerPunchSound();
      }
    }catch{}

    updateManagerNotificationButtons();
    alert('Notificações ativadas. Este aparelho poderá receber avisos de ponto mesmo com o Prado Ponto fechado.');
  }catch(e){
    updateManagerNotificationButtons();
    alert(e?.message||'Não foi possível ativar as notificações.');
  }
}

async function updateManagerNotificationButtons(){
  let enabled=false;
  try{
    if('Notification' in window && Notification.permission==='granted' && 'serviceWorker' in navigator && 'PushManager' in window){
      const reg=await navigator.serviceWorker.ready;
      enabled=!!(await reg.pushManager.getSubscription());
    }
  }catch{}
  const text=enabled?'Notificações ativas':'Ativar notificações';
  ['enableManagerNotificationsBtn','enableManagerNotificationsDesktopBtn'].forEach(id=>{
    const el=$(id);
    if(!el) return;
    el.textContent=text;
    el.classList.toggle('notifications-on',enabled);
  });
}

function playManagerPunchSound(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    managerAudioContext=managerAudioContext||new Ctx();
    if(managerAudioContext.state!=='running') return;
    const osc=managerAudioContext.createOscillator();
    const gain=managerAudioContext.createGain();
    osc.type='sine';
    osc.frequency.setValueAtTime(880,managerAudioContext.currentTime);
    gain.gain.setValueAtTime(.0001,managerAudioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.18,managerAudioContext.currentTime+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,managerAudioContext.currentTime+.28);
    osc.connect(gain);
    gain.connect(managerAudioContext.destination);
    osc.start();
    osc.stop(managerAudioContext.currentTime+.3);
  }catch{}
}

function showManagerPunchToast(row){
  const toast=$('managerPunchToast');
  if(!toast) return;
  const type=row.event_type==='check_in'?'Entrada':'Saída';
  $('managerPunchToastTitle').textContent=`${type} registrada`;
  $('managerPunchToastText').textContent=`${row.employee_name} • ${fmtTime(row.occurred_at)}`;
  toast.classList.remove('hidden');
  clearTimeout(showManagerPunchToast.timer);
  showManagerPunchToast.timer=setTimeout(()=>toast.classList.add('hidden'),6000);
}

function handleManagerPunchNotification(row){
  if(!isManager()||!row) return;

  const speeding=row.event_type==='speeding' || row.alert_kind==='speed_limit';
  if(speeding){
    const speed=Math.round(Number(row.speed_kmh||0));
    const toast=$('managerPunchToast');
    if(toast){
      $('managerPunchToastTitle').textContent='Alerta de velocidade';
      $('managerPunchToastText').textContent=`${row.employee_name} • ${speed} km/h`;
      toast.classList.remove('hidden');
      clearTimeout(showManagerPunchToast.timer);
      showManagerPunchToast.timer=setTimeout(()=>toast.classList.add('hidden'),8000);
    }
    playManagerPunchSound();

    if('Notification' in window && Notification.permission==='granted'){
      try{
        new Notification(`Velocidade acima de 60 km/h • ${row.employee_name}`,{
          body:`Velocidade estimada: ${speed} km/h.`,
          icon:'/icon-180.png',
          tag:`speed-${row.id||Date.now()}`
        });
      }catch{}
    }
    return;
  }

  const type=row.event_type==='check_in'?'Entrada':'Saída';
  showManagerPunchToast(row);
  playManagerPunchSound();

  if('Notification' in window && Notification.permission==='granted'){
    try{
      new Notification(`${type} • ${row.employee_name}`,{
        body:`Ponto registrado às ${fmtTime(row.occurred_at)}.`,
        icon:'/icon-180.png',
        tag:`punch-${row.attendance_event_id||row.id||Date.now()}`
      });
    }catch{}
  }
}

function showDailyReceipt(receipt){
  if(!receipt) return;
  lastDailyReceipt=receipt;
  $('dailyReceiptEmployee').textContent=me?.full_name||'Funcionário';
  $('dailyReceiptDate').textContent=new Date(receipt.work_date+'T12:00:00').toLocaleDateString('pt-BR');
  $('dailyReceiptIn').textContent=receipt.first_check_in?fmtTime(receipt.first_check_in):'—';
  $('dailyReceiptOut').textContent=receipt.last_check_out?fmtTime(receipt.last_check_out):'—';
  $('dailyReceiptWorked').textContent=formatMinutes(receipt.worked_minutes||0);
  $('dailyReceiptOvertime').textContent=formatMinutes(receipt.overtime_minutes||0);
  $('dailyReceiptCode').textContent=receipt.receipt_code||'—';
  $('dailyReceiptModal').classList.remove('hidden');

  if('Notification' in window && Notification.permission==='granted'){
    try{
      new Notification('Comprovante de jornada disponível',{
        body:`Expediente concluído. Saída ${receipt.last_check_out?fmtTime(receipt.last_check_out):''}.`,
        icon:'/icon-180.png',
        tag:`daily-receipt-${receipt.work_date}`
      });
    }catch{}
  }
}

async function loadAndShowDailyReceipt(){
  if(!me||isManager()) return;
  await new Promise(r=>setTimeout(r,220));
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const {data,error}=await client.from('daily_attendance_receipts')
    .select('work_date,first_check_in,last_check_out,worked_minutes,overtime_minutes,receipt_code')
    .eq('employee_id',me.id)
    .eq('work_date',today)
    .maybeSingle();
  if(error||!data) return;
  showDailyReceipt(data);
}

function closeDailyReceipt(){
  $('dailyReceiptModal')?.classList.add('hidden');
}

async function copyDailyReceipt(){
  if(!lastDailyReceipt) return;
  const r=lastDailyReceipt;
  const text=[
    'PRADO PONTO — COMPROVANTE DE JORNADA',
    `Funcionário: ${me?.full_name||'Funcionário'}`,
    `Data: ${new Date(r.work_date+'T12:00:00').toLocaleDateString('pt-BR')}`,
    `Entrada: ${r.first_check_in?fmtTime(r.first_check_in):'—'}`,
    `Saída: ${r.last_check_out?fmtTime(r.last_check_out):'—'}`,
    `Tempo trabalhado: ${formatMinutes(r.worked_minutes||0)}`,
    `Hora extra: ${formatMinutes(r.overtime_minutes||0)}`,
    `Código: ${r.receipt_code||'—'}`
  ].join('\n');
  try{
    await navigator.clipboard.writeText(text);
    alert('Comprovante copiado.');
  }catch{
    prompt('Copie o comprovante:',text);
  }
}

function parseTimeToToday(value){
  if(!value) return null;
  const [h,m]=value.slice(0,5).split(':').map(Number);
  const d=new Date();
  d.setHours(h,m,0,0);
  return d;
}

async function checkEndShiftThanks(){
  if(!me || isManager() || !$('endShiftThanks')) return;

  const now=new Date();
  const weekday=now.getDay();
  const {data,error}=await client.from('work_schedules')
    .select('end_time')
    .eq('employee_id',me.id)
    .eq('weekday',weekday)
    .maybeSingle();

  if(error || !data?.end_time) return;

  const end=parseTimeToToday(data.end_time);
  if(!end || now<end) return;

  const key=`prado-thanks-${me.id}-${now.toISOString().slice(0,10)}`;
  if(localStorage.getItem(key)==='1') return;

  $('endShiftThanks').classList.remove('hidden');
  localStorage.setItem(key,'1');

  if('Notification' in window && Notification.permission==='granted'){
    try{
      new Notification('Jornada concluída', {
        body:'Obrigado pelo seu esforço e comprometimento hoje. Seu trabalho faz a diferença.',
        icon:'/icon-180.png'
      });
    }catch{}
  }
}

async function requestNotificationPermission(){
  if(!('Notification' in window)) return;
  try{
    let permission=Notification.permission;
    if(permission==='default') permission=await Notification.requestPermission();
    if(permission==='granted') await ensureUserPushSubscription();
  }catch(e){
    console.warn('employee_push_subscription_error',e?.message||e);
  }
}


let currentMirrorRows=[];

function isoDateInputValue(d){
  const x=new Date(d);
  const y=x.getFullYear();
  const m=String(x.getMonth()+1).padStart(2,'0');
  const day=String(x.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function initMirrorPeriod(){
  if(!$('mirrorStartDate')||!$('mirrorEndDate')) return;
  if($('mirrorStartDate').value && $('mirrorEndDate').value) return;
  const now=new Date();
  const first=new Date(now.getFullYear(),now.getMonth(),1);
  $('mirrorStartDate').value=isoDateInputValue(first);
  $('mirrorEndDate').value=isoDateInputValue(now);
}

function updateEmployeeBottomNav(viewId){
  document.querySelectorAll('#employeeBottomNav [data-mobile-employee-view]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.mobileEmployeeView===viewId);
  });
}

async function loadMyMirror(){
  if(!me||isManager()||!$('mirrorList')) return;
  const start=$('mirrorStartDate').value;
  const end=$('mirrorEndDate').value;
  if(!start||!end){
    $('mirrorList').innerHTML='<div class="overtime-empty">Informe a data inicial e final.</div>';
    return;
  }
  if(start>end){
    $('mirrorList').innerHTML='<div class="overtime-empty">A data inicial não pode ser maior que a data final.</div>';
    return;
  }

  currentMirrorRows=[];
  $('mirrorDaysTotal').textContent='0';
  $('mirrorWorkedTotal').textContent='0 min';
  $('mirrorOvertimeTotal').textContent='0 min';
  $('mirrorList').innerHTML='<div class="overtime-empty">Carregando espelho...</div>';

  const from=new Date(start+'T00:00:00-03:00');
  const to=new Date(end+'T23:59:59.999-03:00');

  const [{data:events,error:eventError},{data:schedules,error:scheduleError},{data:rule,error:ruleError}]=await Promise.all([
    client.from('attendance_events')
      .select('event_type,occurred_at,receipt_code')
      .eq('employee_id',me.id)
      .gte('occurred_at',from.toISOString())
      .lte('occurred_at',to.toISOString())
      .order('occurred_at',{ascending:true}),
    client.from('work_schedules')
      .select('weekday,end_time,break_start,break_end')
      .eq('employee_id',me.id),
    client.from('employees')
      .select('overtime_after_minutes,lunch_zero_counts_overtime,lunch_overtime_minutes')
      .eq('id',me.id)
      .single()
  ]);

  if(eventError||scheduleError||ruleError){
    console.error('employee_mirror_load_error',{eventError,scheduleError,ruleError});
    $('mirrorList').innerHTML='<div class="overtime-empty">Não foi possível carregar o espelho agora. Tente novamente em alguns segundos.</div>';
    return;
  }

  const scheduleByDay=new Map((schedules||[]).map(s=>[Number(s.weekday),s]));
  const grouped=new Map();
  (events||[]).forEach(ev=>{
    const key=localDateKey(ev.occurred_at);
    const arr=grouped.get(key)||[];
    arr.push(ev);
    grouped.set(key,arr);
  });

  const rows=[];
  for(const [dateKey,dayEvents] of grouped.entries()){
    const ins=dayEvents.filter(e=>e.event_type==='check_in');
    const outs=dayEvents.filter(e=>e.event_type==='check_out');
    const firstIn=ins[0]?.occurred_at||null;
    const lastOut=outs.length?outs[outs.length-1].occurred_at:null;
    let worked=0;
    let overtime=0;

    if(firstIn && lastOut){
      worked=Math.max(0,Math.floor((new Date(lastOut)-new Date(firstIn))/60000));
      const schedule=scheduleByDay.get(localWeekdayFromKey(dateKey));
      if(schedule?.end_time){
        const endDate=makeLocalShiftDate(dateKey,schedule.end_time);
        const threshold=Number(rule?.overtime_after_minutes??10);
        const overtimeStart=endDate?new Date(endDate.getTime()+threshold*60000):null;
        if(overtimeStart){
          overtime=Math.max(0,Math.floor((new Date(lastOut)-overtimeStart)/60000));
        }
        if(
          rule?.lunch_zero_counts_overtime!==false &&
          schedule.break_start?.slice(0,5)==='00:00' &&
          schedule.break_end?.slice(0,5)==='00:00'
        ){
          overtime+=Number(rule?.lunch_overtime_minutes??60);
        }
      }
    }

    rows.push({
      dateKey,
      firstIn,
      lastOut,
      worked,
      overtime,
      events:dayEvents.length
    });
  }

  rows.sort((a,b)=>a.dateKey.localeCompare(b.dateKey));
  currentMirrorRows=rows;

  const workedTotal=rows.reduce((s,r)=>s+r.worked,0);
  const overtimeTotal=rows.reduce((s,r)=>s+r.overtime,0);

  $('mirrorDaysTotal').textContent=String(rows.length);
  $('mirrorWorkedTotal').textContent=formatMinutes(workedTotal);
  $('mirrorOvertimeTotal').textContent=formatMinutes(overtimeTotal);

  $('mirrorList').innerHTML=rows.length?rows.map(r=>`
    <article class="mirror-day-card">
      <div class="mirror-day-date">
        <strong>${esc(new Date(r.dateKey+'T12:00:00-03:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.',''))}</strong>
        <span>${r.events} registro${r.events===1?'':'s'}</span>
      </div>
      <div class="mirror-day-times">
        <div><span>Entrada</span><strong>${r.firstIn?fmtTime(r.firstIn):'—'}</strong></div>
        <div><span>Saída</span><strong>${r.lastOut?fmtTime(r.lastOut):'—'}</strong></div>
        <div><span>Trabalhado</span><strong>${formatMinutes(r.worked)}</strong></div>
        <div><span>Extra</span><strong>${formatMinutes(r.overtime)}</strong></div>
      </div>
    </article>
  `).join(''):'<div class="overtime-empty">Nenhum registro encontrado neste período.</div>';
}

async function downloadMyMirrorPdf(){
  await loadMyMirror();
  if(!currentMirrorRows.length){
    alert('Não há registros neste período.');
    return;
  }

  if(!window.jspdf?.jsPDF){
    alert('O gerador de PDF não carregou. Verifique a internet e tente novamente.');
    return;
  }

  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const start=$('mirrorStartDate').value;
  const end=$('mirrorEndDate').value;

  doc.setFont('helvetica','bold');
  doc.setFontSize(16);
  doc.text('PRADO PONTO - ESPELHO DE PONTO',14,16);

  doc.setFont('helvetica','normal');
  doc.setFontSize(10);
  doc.text(`Funcionario: ${String(me.full_name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}`,14,23);
  doc.text(`Periodo: ${new Date(start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(end+'T12:00:00').toLocaleDateString('pt-BR')}`,14,28);

  let y=38;
  doc.setFont('helvetica','bold');
  doc.text('Data',14,y);
  doc.text('Entrada',48,y);
  doc.text('Saida',78,y);
  doc.text('Trabalhado',108,y);
  doc.text('Extra',154,y);
  y+=4;
  doc.line(14,y,196,y);
  y+=6;

  doc.setFont('helvetica','normal');
  currentMirrorRows.forEach(r=>{
    if(y>280){
      doc.addPage();
      y=18;
    }
    doc.text(new Date(r.dateKey+'T12:00:00').toLocaleDateString('pt-BR'),14,y);
    doc.text(r.firstIn?fmtTime(r.firstIn):'-',48,y);
    doc.text(r.lastOut?fmtTime(r.lastOut):'-',78,y);
    doc.text(formatMinutes(r.worked).replace('min','m'),108,y);
    doc.text(formatMinutes(r.overtime).replace('min','m'),154,y);
    y+=7;
  });

  y+=3;
  if(y>270){doc.addPage();y=18;}
  doc.line(14,y,196,y);
  y+=7;

  const workedTotal=currentMirrorRows.reduce((s,r)=>s+r.worked,0);
  const overtimeTotal=currentMirrorRows.reduce((s,r)=>s+r.overtime,0);
  doc.setFont('helvetica','bold');
  doc.text(`Total trabalhado: ${formatMinutes(workedTotal)}`,14,y);
  y+=6;
  doc.text(`Total de horas extras: ${formatMinutes(overtimeTotal)}`,14,y);

  const filename=`espelho-ponto-${start}-a-${end}.pdf`;
  doc.save(filename);
}

function openView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
  $(id).classList.add('active-view');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  const map={
    employeeHome:['Meu ponto','Registro da minha jornada'],
    employeeHistory:['Meu histórico','Meus registros de ponto'],
    employeeMirror:['Espelho do ponto','Baixar meu espelho de ponto'],
    managerHome:['Painel do gestor','Visão geral da equipe'],
    employees:['Funcionários','Cadastro e acesso da equipe'],
    managerRecords:['Registros','Histórico de pontos da equipe']
  };
  const pageMeta=map[id]||['Prado Ponto',''];
  $('pageTitle').textContent=pageMeta[0];
  $('pageSubtitle').textContent=pageMeta[1];
  if(id==='employeeHistory')loadMyHistory();
  if(id==='employeeMirror'){
    initMirrorPeriod();
    loadMyMirror();
  }
  if(id==='managerHome')loadManagerHome();
  if(id==='employees')loadEmployees();
  if(id==='managerRecords')loadManagerRecords();
  if(isManager()) updateManagerBottomNav(id);
  else updateEmployeeBottomNav(id);
}

async function boot(){
  try{ ensureSupabaseClient(); }
  catch(e){
    showAuth();
    setAuthMsg(e.message||'Não foi possível iniciar o login.',true);
    return;
  }
  const {data:{session}}=await client.auth.getSession();
  if(!session){showAuth();return}
  const invited=(sessionStorage.getItem('pradoInviteEmail')||new URLSearchParams(location.search).get('email')||'').toLowerCase();
  const signedEmail=(session.user?.email||'').toLowerCase();
  if(invited && signedEmail && invited!==signedEmail){
    await client.auth.signOut();
    showAuth();
    setAuthMsg(`Este convite foi criado para ${invited}. Entre no Google com essa conta.`,true);
    return;
  }
  try{
    await loadProfile();
    sessionStorage.removeItem('pradoInviteEmail');
    history.replaceState({},'',location.pathname);
    showApp();
    if(!isManager()){renderOwnAvatar();await loadToday();await loadMySchedule();await loadEmployeePlannedShift();updateEmployeeMobileUI()}
  }catch(e){
    console.error('boot_profile_error',e);
    showAuth();
    const msg=String(e?.message||'Erro ao carregar o perfil.');
    if(msg.includes('não está vinculado') || msg.includes('não cadastrado')){
      setAuthMsg('Seu Google foi autenticado, mas este e-mail ainda não está cadastrado como funcionário. Peça um convite ao gestor.',true);
    }else{
      setAuthMsg('Login confirmado, mas houve um erro ao abrir o painel: '+msg,true);
    }
  }
}

$('logoutBtn').onclick=async()=>{await client.auth.signOut();location.reload()};
$('checkInBtn').onclick=()=>saveEvent('check_in');
$('checkOutBtn').onclick=()=>saveEvent('check_out');
$('useLocation').onclick=verifyLocation;
if($('setBranchLocationBtn')) $('setBranchLocationBtn').onclick=setBranchLocation;
if($('checkPresenceNowBtn')) $('checkPresenceNowBtn').onclick=()=>checkWebPresence(true);

if($('changeOwnAvatarBtn')) $('changeOwnAvatarBtn').onclick=()=>pickEmployeeAvatar(me.id,true);
if($('employeeSelfPhotoBtn')) $('employeeSelfPhotoBtn').onclick=()=>pickEmployeeAvatar(me.id,true);
if($('employeeMainPunchBtn')) $('employeeMainPunchBtn').onclick=()=>{
  const inside=todayEvents.length>0&&todayEvents[todayEvents.length-1].event_type==='check_in';
  saveEvent(inside?'check_out':'check_in');
};
if($('openEmployeeMirrorBtn')) $('openEmployeeMirrorBtn').onclick=()=>openView('employeeMirror');
if($('openEmployeeHistoryBtn')) $('openEmployeeHistoryBtn').onclick=()=>openView('employeeHistory');
if($('loadMirrorBtn')) $('loadMirrorBtn').onclick=loadMyMirror;
if($('downloadMirrorPdfBtn')) $('downloadMirrorPdfBtn').onclick=downloadMyMirrorPdf;
document.querySelectorAll('[data-mobile-employee-view]').forEach(btn=>{
  btn.onclick=()=>openView(btn.dataset.mobileEmployeeView);
});

if($('employeeReceiptShortcut')) $('employeeReceiptShortcut').onclick=()=>{
  const last=[...todayEvents].reverse().find(x=>x.receipt_code);
  if(last) showReceipt(last);
};

$('createEmployeeBtn').onclick=createEmployee;
$('refreshEmployees').onclick=loadEmployees;
$('scheduleEmployee').onchange=loadSchedulePreview;
$('saveScheduleBtn').onclick=saveSchedule;
if($('ruleEmployee')) $('ruleEmployee').onchange=loadEmployeeRules;
if($('saveEmployeeRulesBtn')) $('saveEmployeeRulesBtn').onclick=saveEmployeeRules;
if($('closeThanksBtn')) $('closeThanksBtn').onclick=()=>$('endShiftThanks').classList.add('hidden');
if($('refreshManagerDashboard')) $('refreshManagerDashboard').onclick=loadManagerHome;
if($('mobileRefreshBtn')) $('mobileRefreshBtn').onclick=loadManagerHome;
if($('enableManagerNotificationsBtn')) $('enableManagerNotificationsBtn').onclick=enableManagerNotifications;
if($('enableManagerNotificationsDesktopBtn')) $('enableManagerNotificationsDesktopBtn').onclick=enableManagerNotifications;
document.querySelectorAll('[data-close-daily-receipt]').forEach(el=>el.onclick=closeDailyReceipt);
if($('copyDailyReceiptBtn')) $('copyDailyReceiptBtn').onclick=copyDailyReceipt;

if($('openMobileMapBtn')) $('openMobileMapBtn').onclick=openMobileMap;
if($('closeMobileMapBtn')) $('closeMobileMapBtn').onclick=closeMobileMap;
document.querySelectorAll('[data-mobile-manager-view]').forEach(btn=>{
  btn.onclick=()=>openView(btn.dataset.mobileManagerView);
});
document.querySelectorAll('[data-mobile-manager-action="map"]').forEach(btn=>{
  btn.onclick=openMobileMap;
});
if($('managerTeamFilter')) $('managerTeamFilter').onchange=()=>{
  activeAttentionFilter=null;
  document.querySelectorAll('.attention-card').forEach(b=>b.classList.remove('selected'));
  applyManagerTeamFilter();
};
document.querySelectorAll('.attention-card').forEach(btn=>{
  btn.onclick=()=>{
    const value=btn.dataset.attention;
    activeAttentionFilter=activeAttentionFilter===value?null:value;
    document.querySelectorAll('.attention-card').forEach(b=>b.classList.toggle('selected',activeAttentionFilter===b.dataset.attention));
    applyManagerTeamFilter();
    $('managerEmployeeCards')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
});
document.querySelectorAll('[data-close-detail]').forEach(el=>el.onclick=closeEmployeeDetail);
setInterval(()=>{ if(me&&!isManager()) checkEndShiftThanks(); },60000);
setInterval(()=>{ if(me) renderGarroPromo(); },60000);
setInterval(()=>{ if(me&&isManager()&&document.visibilityState==='visible') loadManagerHome(); },7000);
document.querySelectorAll('.nav[data-view]').forEach(btn=>btn.onclick=()=>openView(btn.dataset.view));
try{ ensureSupabaseClient(); }catch(e){
  setAuthMsg(e.message||'Não foi possível carregar o login.',true);
}
client?.auth.onAuthStateChange((e)=>{if(e==='SIGNED_OUT')showAuth()});
if(client){
  client.channel('manager-presence-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'employee_presence'},()=>{
      if(me&&isManager()&&$('managerHome')?.classList.contains('active-view')){
        loadManagerHome();
        if(!$('mobileMapSheet')?.classList.contains('hidden')){
          buildMobileManagerMap().catch(()=>{});
        }
        if(activeDetailEmployeeId && !$('employeeDetailModal')?.classList.contains('hidden')){
          openEmployeeDetail(activeDetailEmployeeId).catch(()=>{});
        }
      }
    })
    .subscribe();

  client.channel('manager-punch-live')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'manager_notifications'},payload=>{
      if(me&&isManager()) handleManagerPunchNotification(payload.new);
    })
    .subscribe();
}
const inviteEmail=new URLSearchParams(location.search).get('email');
if(inviteEmail){
  $('inviteIdentity').classList.remove('hidden');
  $('inviteEmailLabel').textContent=inviteEmail;
  $('authIntro').textContent='Use no Google exatamente a conta abaixo para acessar seu ponto.';
  setAuthMsg('Convite reconhecido. Toque em Continuar com Google.');
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&me&&!isManager()){
    checkWebPresence(false);
    checkEndShiftThanks();
    resumeExternalLocationTracking();
  }else if(document.visibilityState==='visible'&&me&&isManager()){
    loadManagerHome();
  }
});

window.addEventListener('focus',()=>{
  if(me&&!isManager()) resumeExternalLocationTracking();
});

window.addEventListener('pageshow',()=>{
  if(me&&!isManager()) resumeExternalLocationTracking();
});
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
boot();
