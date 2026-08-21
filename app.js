const SUPABASE_URL='https://coeqnnanqzlkkgkejbef.supabase.co';
const SUPABASE_KEY='sb_publishable_1qD2SXfcWcWJ7AcvrlmErQ_VI6GZg8c';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let me=null,branch=null,todayEvents=[],currentLocation=null;

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
  const {data,error}=await client.from('employees').select('id,company_id,branch_id,full_name,email,role,active,user_id').single();
  if(error||!data) throw new Error('Seu login ainda não está vinculado a um funcionário ativo.');
  me=data;
  const {data:b}=await client.from('branches').select('id,name,address,latitude,longitude,geofence_radius_m').eq('id',me.branch_id).single();
  branch=b||null;
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
  }
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
  const payload={employee_id:me.id,branch_id:me.branch_id,event_type:type,source:'app',automatic:false,
    latitude:currentLocation?.latitude??null,longitude:currentLocation?.longitude??null,accuracy_m:currentLocation?.accuracy??null,
    geofence_verified:currentLocation?.verified??false,wifi_verified:false,bluetooth_verified:false,device_verified:false};
  const {error}=await client.from('attendance_events').insert(payload);
  if(error){$('savePill').textContent='Erro';alert(error.message);return}
  $('savePill').textContent='Salvo no Supabase';currentLocation=null;await loadToday();
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
  const {data,error}=await client.from('employees').select('id,full_name,email,role,active,user_id').order('full_name');
  if(error){$('employeesBody').innerHTML=`<tr><td colspan="6">${esc(error.message)}</td></tr>`;return}
  const rows=data||[];
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
  document.querySelectorAll('[data-schedule]').forEach(btn=>btn.onclick=()=>{
    $('scheduleEmployee').value=btn.dataset.schedule;
    loadSchedulePreview();
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


async function loadMySchedule(){
  const {data,error}=await client.from('work_schedules').select('weekday,start_time,break_start,break_end,end_time,tolerance_minutes').eq('employee_id',me.id).order('weekday');
  if(error||!(data||[]).length){$('mySchedule').innerHTML='<span class="muted">Nenhum horário definido ainda.</span>';return}
  $('mySchedule').innerHTML=(data||[]).map(s=>`<div class="schedule-row"><strong>${dayNames[s.weekday]}</strong><span>${s.start_time?.slice(0,5)||'—'} → ${s.break_start?.slice(0,5)||'—'} / ${s.break_end?.slice(0,5)||'—'} → ${s.end_time?.slice(0,5)||'—'}</span><small>Tolerância ${s.tolerance_minutes} min</small></div>`).join('');
}

async function loadSchedulePreview(){
  const employeeId=$('scheduleEmployee').value;
  if(!employeeId){$('schedulePreview').innerHTML='';return}
  const {data,error}=await client.from('work_schedules').select('weekday,start_time,break_start,break_end,end_time,tolerance_minutes').eq('employee_id',employeeId).order('weekday');
  if(error){$('schedulePreview').textContent=error.message;return}
  $('schedulePreview').innerHTML=(data||[]).length?(data||[]).map(s=>`<div class="schedule-row"><strong>${dayNames[s.weekday]}</strong><span>${s.start_time?.slice(0,5)||'—'} → ${s.break_start?.slice(0,5)||'—'} / ${s.break_end?.slice(0,5)||'—'} → ${s.end_time?.slice(0,5)||'—'}</span><small>${s.tolerance_minutes} min tolerância</small></div>`).join(''):'<span class="muted">Nenhum horário definido para este funcionário.</span>';
}

async function saveSchedule(){
  const employeeId=$('scheduleEmployee').value;
  const days=[...document.querySelectorAll('.dayCheck:checked')].map(x=>Number(x.value));
  if(!employeeId){$('scheduleMsg').textContent='Selecione um funcionário.';return}
  if(!days.length){$('scheduleMsg').textContent='Selecione pelo menos um dia.';return}
  const rows=days.map(weekday=>({
    employee_id:employeeId,
    weekday,
    start_time:$('scheduleStart').value||null,
    break_start:$('scheduleBreakStart').value||null,
    break_end:$('scheduleBreakEnd').value||null,
    end_time:$('scheduleEnd').value||null,
    tolerance_minutes:Number($('scheduleTolerance').value||5)
  }));
  $('scheduleMsg').textContent='Salvando horários...';
  const {error}=await client.from('work_schedules').upsert(rows,{onConflict:'employee_id,weekday'});
  if(error){$('scheduleMsg').textContent='Erro: '+error.message;return}
  $('scheduleMsg').textContent='Horários salvos com sucesso.';
  await loadSchedulePreview();
}

async function clearSchedule(){
  const employeeId=$('scheduleEmployee').value;
  const days=[...document.querySelectorAll('.dayCheck:checked')].map(x=>Number(x.value));
  if(!employeeId||!days.length){$('scheduleMsg').textContent='Selecione funcionário e dias.';return}
  if(!confirm('Remover os horários dos dias selecionados?')) return;
  const {error}=await client.from('work_schedules').delete().eq('employee_id',employeeId).in('weekday',days);
  $('scheduleMsg').textContent=error?'Erro: '+error.message:'Horários removidos.';
  if(!error) await loadSchedulePreview();
}

async function loadManagerHome(){
  const [{data:emps},{data:events}]=await Promise.all([
    client.from('employees').select('id,full_name,active').eq('active',true).order('full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at').gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true})
  ]);
  const by=new Map();(events||[]).forEach(ev=>{const arr=by.get(ev.employee_id)||[];arr.push(ev);by.set(ev.employee_id,arr)});
  let present=0;
  $('teamBody').innerHTML=(emps||[]).map(emp=>{
    const arr=by.get(emp.id)||[],ins=arr.filter(x=>x.event_type==='check_in'),outs=arr.filter(x=>x.event_type==='check_out');
    const inside=arr.length&&arr[arr.length-1].event_type==='check_in';if(inside)present++;
    return `<tr><td>${emp.full_name}</td><td>${ins.length?fmtTime(ins[0].occurred_at):'—'}</td><td>${outs.length?fmtTime(outs[outs.length-1].occurred_at):'—'}</td><td><span class="badge ${inside?'good':'neutral'}">${inside?'Presente':arr.length?'Saiu':'Sem registro'}</span></td></tr>`;
  }).join('');
  $('employeeTotal').textContent=(emps||[]).length;$('presentTotal').textContent=present;$('todayTotal').textContent=(events||[]).length;
}

async function loadManagerRecords(){
  const [{data:emps},{data:events,error}]=await Promise.all([
    client.from('employees').select('id,full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at,geofence_verified').order('occurred_at',{ascending:false}).limit(200)
  ]);
  if(error)return;
  const names=new Map((emps||[]).map(e=>[e.id,e.full_name]));
  $('recordsBody').innerHTML=(events||[]).map(e=>`<tr><td>${names.get(e.employee_id)||'Funcionário'}</td><td>${fmtDate(e.occurred_at)}</td><td>${fmtTime(e.occurred_at)}</td><td>${e.event_type==='check_in'?'Entrada':'Saída'}</td><td>${e.geofence_verified?'Confirmado':'Não'}</td></tr>`).join('');
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
$('createEmployeeBtn').onclick=createEmployee;
$('refreshEmployees').onclick=loadEmployees;
$('scheduleEmployee').onchange=loadSchedulePreview;
$('saveScheduleBtn').onclick=saveSchedule;
$('clearScheduleBtn').onclick=clearSchedule;
document.querySelectorAll('.nav[data-view]').forEach(btn=>btn.onclick=()=>openView(btn.dataset.view));
client.auth.onAuthStateChange((e)=>{if(e==='SIGNED_OUT')showAuth()});
const inviteEmail=new URLSearchParams(location.search).get('email');
if(inviteEmail){
  $('inviteIdentity').classList.remove('hidden');
  $('inviteEmailLabel').textContent=inviteEmail;
  $('authIntro').textContent='Use no Google exatamente a conta abaixo para acessar seu ponto.';
  setAuthMsg('Convite reconhecido. Toque em Continuar com Google.');
}
boot();
