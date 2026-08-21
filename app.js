const SUPABASE_URL='https://coeqnnanqzlkkgkejbef.supabase.co';
const SUPABASE_KEY='sb_publishable_1qD2SXfcWcWJ7AcvrlmErQ_VI6GZg8c';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let me=null,branch=null,todayEvents=[],currentLocation=null,employeeDirectory=[],managerMap=null,detailMap=null,externalLocationWatchId=null,lastExternalLocationSentAt=0;

const fmtTime=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fmtDate=iso=>new Date(iso).toLocaleDateString('pt-BR');
const startToday=()=>{const d=new Date();d.setHours(0,0,0,0);return d.toISOString()};
const endToday=()=>{const d=new Date();d.setHours(23,59,59,999);return d.toISOString()};
const initials=n=>(n||'PF').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
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

async function loadProfile(){
  const {data:{user},error:userError}=await client.auth.getUser();
  if(userError||!user) throw new Error('Não foi possível identificar o usuário autenticado.');

  let {data,error}=await client.from('employees')
    .select('id,company_id,branch_id,full_name,email,role,active,user_id,allow_external_after_checkin')
    .eq('user_id',user.id)
    .eq('active',true)
    .maybeSingle();

  if(!data && user.email){
    const fallback=await client.from('employees')
      .select('id,company_id,branch_id,full_name,email,role,active,user_id,allow_external_after_checkin')
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
  me=data;
  const {data:b}=await client.from('branches').select('id,name,address,latitude,longitude,geofence_radius_m').eq('id',me.branch_id).single();
  branch=b||null;
  renderBranchLocation();
  $('userName').textContent=me.full_name;
  $('userBranch').textContent=branch?.name||'Unidade';
  $('avatar').textContent=initials(me.full_name);
  $('roleLabel').textContent=isManager()?'Painel do gestor':'Área do funcionário';

  if(isManager()){
    $('employeeNav').classList.add('hidden');
    $('managerNav').classList.remove('hidden');
    openView('managerHome');
  }else{
    $('managerNav').classList.add('hidden');
    $('employeeNav').classList.remove('hidden');
    openView('employeeHome');
    setTimeout(()=>checkWebPresence(false),500);
    setTimeout(()=>checkEndShiftThanks(),1200);
    setTimeout(()=>requestNotificationPermission(),2500);
    if(me.allow_external_after_checkin) setTimeout(()=>startExternalLocationTracking(),1800);
  }
}



function startExternalLocationTracking(){
  if(isManager() || !me?.allow_external_after_checkin || !navigator.geolocation || externalLocationWatchId!==null) return;

  externalLocationWatchId=navigator.geolocation.watchPosition(async pos=>{
    const now=Date.now();
    if(now-lastExternalLocationSentAt<60000) return;
    if(document.visibilityState==='hidden') return;

    lastExternalLocationSentAt=now;
    const {error}=await client.rpc('register_external_location',{
      p_latitude:pos.coords.latitude,
      p_longitude:pos.coords.longitude,
      p_accuracy_m:pos.coords.accuracy
    });

    if(error){
      const msg=String(error.message||'');
      if(msg.includes('shift_not_active') || msg.includes('external_location_not_enabled')){
        if(externalLocationWatchId!==null){
          navigator.geolocation.clearWatch(externalLocationWatchId);
          externalLocationWatchId=null;
        }
      }
    }
  },()=>{},{
    enableHighAccuracy:true,
    maximumAge:30000,
    timeout:20000
  });
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
  },()=>{$('locationInfo').textContent='Não foi possível acessar a localização.'},{enableHighAccuracy:true,timeout:10000});
}

async function loadMyHistory(){
  const {data,error}=await client.from('attendance_events').select('event_type,occurred_at,geofence_verified').eq('employee_id',me.id).order('occurred_at',{ascending:false}).limit(100);
  if(error)return;
  $('historyBody').innerHTML=(data||[]).map(e=>`<tr><td>${fmtDate(e.occurred_at)}</td><td>${fmtTime(e.occurred_at)}</td><td>${e.event_type==='check_in'?'Entrada':'Saída'}</td><td>${e.geofence_verified?'Confirmado':'Não'}</td></tr>`).join('');
}

async function loadEmployees(){
  const {data,error}=await client.from('employees').select('id,full_name,email,role,active,user_id,allow_external_after_checkin,overtime_after_minutes,lunch_zero_counts_overtime,lunch_overtime_minutes').order('full_name');
  if(error){$('employeesBody').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return}
  const rows=data||[];
  employeeDirectory=rows;
  $('employeesBody').innerHTML=rows.map(e=>`<tr>
    <td>${esc(e.full_name)}</td><td>${esc(e.email||'—')}</td>
    <td>${e.role==='admin'?'Administrador':e.role==='manager'?'Gestor':'Funcionário'}</td>
    <td>${e.user_id?'Criado':'Pendente'}</td>
    <td><span class="badge ${e.active?'good':'neutral'}">${e.active?'Ativo':'Inativo'}</span></td>
    <td><div class="row-actions">
      ${e.email?`<button class="mini" onclick="copyInvite('${String(e.email).replace(/'/g,"\\'")}')">Copiar link</button>`:''}
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
      .bindPopup(`<strong>${esc(emp.full_name)}</strong><br>${p.is_present?'Jornada ativa':'Jornada encerrada'}<br>Última posição: ${p.last_location_at?fmtTime(p.last_location_at):'—'}`);
  });

  if(bounds.length>1) managerMap.fitBounds(bounds,{padding:[30,30],maxZoom:16});
  setTimeout(()=>managerMap?.invalidateSize(),100);
  $('mapUpdatedAt').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

async function openEmployeeDetail(employeeId){
  const emp=employeeDirectory.find(e=>e.id===employeeId);
  if(!emp) return;
  $('employeeDetailModal').classList.remove('hidden');
  $('detailEmployeeName').textContent=emp.full_name;
  $('detailEmployeeSummary').innerHTML='<span class="muted">Carregando dados...</span>';
  $('detailLocationTimeline').innerHTML='<span class="muted">Carregando localizações...</span>';

  const [{data:events},{data:locations},{data:overtime}]=await Promise.all([
    client.from('attendance_events').select('event_type,occurred_at,automatic,receipt_code').eq('employee_id',employeeId).gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true}),
    client.from('employee_location_updates').select('latitude,longitude,accuracy_m,recorded_at').eq('employee_id',employeeId).gte('recorded_at',startToday()).lte('recorded_at',endToday()).order('recorded_at',{ascending:true}).limit(300),
    client.rpc('get_overtime_snapshot')
  ]);

  const arr=events||[];
  const ot=(overtime||[]).find(x=>x.employee_id===employeeId);
  const ins=arr.filter(x=>x.event_type==='check_in');
  const outs=arr.filter(x=>x.event_type==='check_out');

  $('detailEmployeeSummary').innerHTML=`
    <div><span>Entrada</span><strong>${ins.length?fmtTime(ins[0].occurred_at):'—'}</strong></div>
    <div><span>Saída</span><strong>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</strong></div>
    <div><span>Hora extra</span><strong>${formatMinutes(ot?.total_overtime_minutes||0)}</strong></div>
    <div><span>Almoço extra</span><strong>${formatMinutes(ot?.lunch_overtime_minutes||0)}</strong></div>`;

  const locs=locations||[];
  $('detailLocationTimeline').innerHTML=locs.length?locs.slice().reverse().map(l=>`
    <button class="location-row" onclick="openMapsDirections(${Number(l.latitude)},${Number(l.longitude)})">
      <span><strong>${fmtTime(l.recorded_at)}</strong><small>${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}</small></span>
      <small>Precisão ${l.accuracy_m!=null?Math.round(Number(l.accuracy_m))+' m':'—'} • abrir mapa</small>
    </button>`).join(''):'<span class="muted">Nenhuma localização externa registrada hoje.</span>';

  if(typeof L!=='undefined'){
    if(detailMap){detailMap.remove();detailMap=null}
    const center=locs.length?[Number(locs[locs.length-1].latitude),Number(locs[locs.length-1].longitude)]:
      (branch?.latitude!=null?[Number(branch.latitude),Number(branch.longitude)]:[-23.55,-46.63]);
    detailMap=L.map('detailEmployeeMap').setView(center,15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(detailMap);
    if(locs.length){
      const points=locs.map(l=>[Number(l.latitude),Number(l.longitude)]);
      L.polyline(points).addTo(detailMap);
      L.marker(points[points.length-1]).addTo(detailMap).bindPopup('Última localização').openPopup();
      if(points.length>1) detailMap.fitBounds(points,{padding:[25,25],maxZoom:17});
    }
    setTimeout(()=>detailMap?.invalidateSize(),100);
  }
}

function closeEmployeeDetail(){
  $('employeeDetailModal')?.classList.add('hidden');
  if(detailMap){detailMap.remove();detailMap=null}
}

async function loadManagerHome(){
  const [{data:emps},{data:events},{data:presence},{data:overtime}]=await Promise.all([
    client.from('employees').select('id,full_name,email,active,allow_external_after_checkin,overtime_after_minutes').eq('active',true).order('full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at').gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true}),
    client.from('employee_presence').select('employee_id,is_present,last_seen_at,wifi_verified,geofence_verified,last_latitude,last_longitude,last_accuracy_m,last_location_at,updated_at'),
    client.rpc('get_overtime_snapshot')
  ]);

  const employees=emps||[];
  employeeDirectory=employeeDirectory.length?employeeDirectory:employees;
  const by=new Map();
  (events||[]).forEach(ev=>{const arr=by.get(ev.employee_id)||[];arr.push(ev);by.set(ev.employee_id,arr)});
  const presenceBy=new Map((presence||[]).map(p=>[p.employee_id,p]));
  const overtimeBy=new Map((overtime||[]).map(o=>[o.employee_id,o]));

  let activeShift=0,overtimeNow=0,external=0;
  const cards=[];
  const tableRows=[];

  employees.forEach(emp=>{
    const arr=by.get(emp.id)||[];
    const ins=arr.filter(x=>x.event_type==='check_in');
    const outs=arr.filter(x=>x.event_type==='check_out');
    const p=presenceBy.get(emp.id);
    const ot=overtimeBy.get(emp.id);
    const onShift=!!p?.is_present;
    const overtimeMinutes=Number(ot?.total_overtime_minutes||0);
    const lunchExtra=Number(ot?.lunch_overtime_minutes||0);
    const isExternal=!!emp.allow_external_after_checkin;
    const hasLocation=p?.last_latitude!=null&&p?.last_longitude!=null;
    const outside=isExternal&&onShift&&!p?.geofence_verified;

    if(onShift) activeShift++;
    if(overtimeMinutes>0&&onShift) overtimeNow++;
    if(isExternal) external++;

    const status=outside?'Em serviço externo':onShift?'Em jornada':'Fora da empresa';
    const statusClass=onShift?'good':'neutral';
    const locText=hasLocation
      ?`${Number(p.last_latitude).toFixed(5)}, ${Number(p.last_longitude).toFixed(5)}`
      :(isExternal?'Sem posição recente':'Não aplicável');
    const locTime=p?.last_location_at?fmtTime(p.last_location_at):'—';

    cards.push(`<article class="employee-work-card">
      <div class="employee-work-top">
        <div class="employee-name-line">${isExternal?externalWorkerIcon():''}<div><strong>${esc(emp.full_name)}</strong><small>${isExternal?'Serviço externo autorizado':'Equipe interna'}</small></div></div>
        <span class="badge ${statusClass}">${status}</span>
      </div>
      <div class="employee-work-metrics">
        <div><span>Entrada</span><strong>${ins.length?fmtTime(ins[0].occurred_at):'—'}</strong></div>
        <div><span>Saída</span><strong>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</strong></div>
        <div><span>Hora extra</span><strong class="${overtimeMinutes>0?'overtime-value':''}">${formatMinutes(overtimeMinutes)}</strong></div>
        <div><span>Almoço extra</span><strong>${formatMinutes(lunchExtra)}</strong></div>
      </div>
      ${isExternal?`<div class="employee-location-box">
        <span>Última localização</span>
        <strong>${locText}</strong>
        <small>${hasLocation?'Atualizada às '+locTime:'Aguardando atualização do aplicativo'}</small>
      </div>`:''}
      <div class="employee-work-actions">
        <button class="ghost" onclick="openEmployeeDetail('${emp.id}')">Ver jornada completa</button>
        ${hasLocation?`<button class="primary" onclick="openMapsDirections(${Number(p.last_latitude)},${Number(p.last_longitude)})">Abrir localização</button>`:''}
      </div>
    </article>`);

    tableRows.push(`<tr>
      <td>${isExternal?externalWorkerIcon():''}${esc(emp.full_name)}</td>
      <td>${ins.length?fmtTime(ins[0].occurred_at):'—'}</td>
      <td>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</td>
      <td>${formatMinutes(overtimeMinutes)}</td>
      <td><span class="badge ${statusClass}">${status}</span></td>
      <td>${isExternal?(hasLocation?`<button class="mini" onclick="openMapsDirections(${Number(p.last_latitude)},${Number(p.last_longitude)})">${locTime}</button>`:'Sem posição'):'—'}</td>
    </tr>`);
  });

  $('managerEmployeeCards').innerHTML=cards.join('');
  $('teamBody').innerHTML=tableRows.join('');
  $('employeeTotal').textContent=employees.length;
  $('presentTotal').textContent=activeShift;
  $('overtimeTotal').textContent=overtimeNow;
  $('externalTotal').textContent=external;
  buildManagerMap(employees,presenceBy);
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
  if(!('Notification' in window) || Notification.permission!=='default') return;
  try{ await Notification.requestPermission(); }catch{}
}

function openView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
  $(id).classList.add('active-view');
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  const map={
    employeeHome:['Meu ponto','Registro da minha jornada'],
    employeeHistory:['Meu histórico','Meus registros de ponto'],
    managerHome:['Painel do gestor','Visão geral da equipe'],
    employees:['Funcionários','Cadastro e acesso da equipe'],
    managerRecords:['Registros','Histórico de pontos da equipe']
  };
  $('pageTitle').textContent=map[id][0];$('pageSubtitle').textContent=map[id][1];
  if(id==='employeeHistory')loadMyHistory();
  if(id==='managerHome')loadManagerHome();
  if(id==='employees')loadEmployees();
  if(id==='managerRecords')loadManagerRecords();
}

async function boot(){
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
    if(!isManager()){await loadToday();await loadMySchedule()}
  }catch(e){
    await client.auth.signOut();
    showAuth();
    setAuthMsg('Seu Google foi autenticado, mas este e-mail ainda não está cadastrado como funcionário. Peça um convite ao gestor.',true);
  }
}

$('googleLoginBtn').addEventListener('click', async (ev)=>{
  ev.preventDefault();
  const btn=$('googleLoginBtn');
  btn.disabled=true;
  setAuthMsg('Abrindo o Google...');
  const inviteEmail=new URLSearchParams(location.search).get('email');
  if(inviteEmail) sessionStorage.setItem('pradoInviteEmail',inviteEmail.toLowerCase());
  try{
    const {data,error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo:window.location.origin,
        skipBrowserRedirect:true
      }
    });
    if(error) throw error;
    if(!data?.url) throw new Error('O Supabase não retornou a URL de login do Google.');
    window.location.assign(data.url);
  }catch(err){
    btn.disabled=false;
    setAuthMsg('Não foi possível abrir o Google: '+(err?.message||'erro desconhecido'),true);
  }
});
$('logoutBtn').onclick=async()=>{await client.auth.signOut();location.reload()};
$('checkInBtn').onclick=()=>saveEvent('check_in');
$('checkOutBtn').onclick=()=>saveEvent('check_out');
$('useLocation').onclick=verifyLocation;
if($('setBranchLocationBtn')) $('setBranchLocationBtn').onclick=setBranchLocation;
if($('checkPresenceNowBtn')) $('checkPresenceNowBtn').onclick=()=>checkWebPresence(true);
$('createEmployeeBtn').onclick=createEmployee;
$('refreshEmployees').onclick=loadEmployees;
$('scheduleEmployee').onchange=loadSchedulePreview;
$('saveScheduleBtn').onclick=saveSchedule;
if($('ruleEmployee')) $('ruleEmployee').onchange=loadEmployeeRules;
if($('saveEmployeeRulesBtn')) $('saveEmployeeRulesBtn').onclick=saveEmployeeRules;
if($('closeThanksBtn')) $('closeThanksBtn').onclick=()=>$('endShiftThanks').classList.add('hidden');
if($('refreshManagerDashboard')) $('refreshManagerDashboard').onclick=loadManagerHome;
document.querySelectorAll('[data-close-detail]').forEach(el=>el.onclick=closeEmployeeDetail);
setInterval(()=>{ if(me&&!isManager()) checkEndShiftThanks(); },60000);
setInterval(()=>{ if(me&&isManager()&&document.visibilityState==='visible') loadManagerHome(); },60000);
document.querySelectorAll('.nav[data-view]').forEach(btn=>btn.onclick=()=>openView(btn.dataset.view));
client.auth.onAuthStateChange((e)=>{if(e==='SIGNED_OUT')showAuth()});
client.channel('manager-presence-live')
  .on('postgres_changes',{event:'*',schema:'public',table:'employee_presence'},()=>{
    if(me&&isManager()&&$('managerHome')?.classList.contains('active-view')) loadManagerHome();
  })
  .subscribe();
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
  }else if(document.visibilityState==='visible'&&me&&isManager()){
    loadManagerHome();
  }
});
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
boot();
