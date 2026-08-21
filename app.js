const SUPABASE_URL='https://coeqnnanqzlkkgkejbef.supabase.co';
const SUPABASE_KEY='sb_publishable_1qD2SXfcWcWJ7AcvrlmErQ_VI6GZg8c';
const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let me=null, branch=null, todayEvents=[], currentLocation=null;

const fmt=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const startToday=()=>{const d=new Date();d.setHours(0,0,0,0);return d.toISOString()};
const endToday=()=>{const d=new Date();d.setHours(23,59,59,999);return d.toISOString()};
function setMsg(msg,bad=false){$('authMsg').textContent=msg;$('authMsg').classList.toggle('bad',bad)}
function initials(name){return (name||'PF').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}
function showAuth(){ $('authScreen').classList.remove('hidden'); $('appShell').classList.add('hidden') }
function showApp(){ $('authScreen').classList.add('hidden'); $('appShell').classList.remove('hidden') }

async function loadProfile(){
  const {data,error}=await client.from('employees').select('id,full_name,email,role,active,branch_id').single();
  if(error||!data){throw new Error('Seu login existe, mas ainda não está vinculado a um funcionário ativo.')}
  me=data;
  $('userName').textContent=me.full_name;
  $('avatar').textContent=initials(me.full_name);
  document.querySelectorAll('.manager-only').forEach(el=>el.style.display=['admin','manager'].includes(me.role)?'block':'none');
  const b=await client.from('branches').select('id,name,address,latitude,longitude,geofence_radius_m').eq('id',me.branch_id).single();
  branch=b.data||null;
  if(branch){
    $('userBranch').textContent=branch.name||'Unidade';
    $('branchName').textContent=branch.name||'Unidade';
    $('branchAddress').textContent=branch.address||'Endereço não informado';
    $('branchRadius').textContent=`${branch.geofence_radius_m||80} m`;
    if(branch.latitude!=null&&branch.longitude!=null){
      $('branchCoords').textContent=`${branch.latitude}, ${branch.longitude}`;
      $('coordsDot').classList.add('on');
    }
  }
}

async function loadToday(){
  const {data,error}=await client.from('attendance_events')
    .select('id,event_type,occurred_at,latitude,longitude,accuracy_m,geofence_verified,source,notes')
    .eq('employee_id',me.id).gte('occurred_at',startToday()).lte('occurred_at',endToday())
    .order('occurred_at',{ascending:true});
  if(error) throw error;
  todayEvents=data||[];
  renderToday();
}

function renderToday(){
  const ins=todayEvents.filter(e=>e.event_type==='check_in');
  const outs=todayEvents.filter(e=>e.event_type==='check_out');
  const inside=todayEvents.length>0 && todayEvents[todayEvents.length-1].event_type==='check_in';
  $('checkIn').textContent=ins.length?fmt(ins[0].occurred_at):'—';
  $('checkOut').textContent=outs.length?fmt(outs[outs.length-1].occurred_at):'—';
  $('eventCount').textContent=String(todayEvents.length);
  $('statusText').textContent=inside?'Na empresa':'Fora da empresa';
  $('statusHint').textContent=inside?'Último registro: entrada.':'Aguardando nova entrada.';
  $('statusOrb').classList.toggle('on',inside);
  $('checkInBtn').disabled=inside;
  $('checkOutBtn').disabled=!inside;
  $('timeline').innerHTML=todayEvents.length?[...todayEvents].reverse().map(e=>{
    const label=e.event_type==='check_in'?'Entrada':'Saída';
    const detail=[e.source==='app'?'Aplicativo':'Registro',e.geofence_verified?'Geofence confirmado':null].filter(Boolean).join(' • ');
    return `<div class="event"><time>${fmt(e.occurred_at)}</time><div><strong>${label}</strong><small>${detail}</small></div></div>`
  }).join(''):'<div class="empty">Nenhum ponto registrado hoje.</div>';
}

async function saveEvent(type){
  $('savePill').textContent='Salvando...';
  const payload={
    employee_id:me.id,
    branch_id:me.branch_id,
    event_type:type,
    source:'app',
    automatic:false,
    latitude:currentLocation?.latitude??null,
    longitude:currentLocation?.longitude??null,
    accuracy_m:currentLocation?.accuracy??null,
    geofence_verified:currentLocation?.verified??false,
    wifi_verified:false,
    bluetooth_verified:false,
    device_verified:false
  };
  const {error}=await client.from('attendance_events').insert(payload);
  if(error){$('savePill').textContent='Erro ao salvar';alert(error.message);return}
  $('savePill').textContent='Salvo no Supabase';
  currentLocation=null;
  await loadToday();
  if(['admin','manager'].includes(me.role)) await loadManager();
}

function distanceM(a,b,c,d){const R=6371e3,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function verifyLocation(){
  if(!navigator.geolocation){alert('Geolocalização não disponível neste navegador.');return}
  $('locationInfo').textContent='Localizando...';
  navigator.geolocation.getCurrentPosition(pos=>{
    const loc={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,verified:false};
    if(branch?.latitude!=null&&branch?.longitude!=null){
      const d=distanceM(loc.latitude,loc.longitude,branch.latitude,branch.longitude);
      loc.verified=d<=(branch.geofence_radius_m||80);
      $('locationInfo').textContent=`Distância aproximada: ${Math.round(d)} m • ${loc.verified?'dentro':'fora'} do raio.`;
    }else{
      $('locationInfo').textContent='Localização capturada. As coordenadas da unidade ainda precisam ser configuradas para validar o raio.';
    }
    currentLocation=loc;
  },()=>{$('locationInfo').textContent='Não foi possível acessar a localização. Verifique a permissão do navegador.'},{enableHighAccuracy:true,timeout:10000});
}

async function loadManager(){
  if(!['admin','manager'].includes(me.role)) return;
  const [{data:emps,error:e1},{data:events,error:e2}]=await Promise.all([
    client.from('employees').select('id,full_name,active').eq('active',true).order('full_name'),
    client.from('attendance_events').select('employee_id,event_type,occurred_at').gte('occurred_at',startToday()).lte('occurred_at',endToday()).order('occurred_at',{ascending:true})
  ]);
  if(e1||e2){console.error(e1||e2);return}
  const by=new Map();
  (events||[]).forEach(ev=>{const arr=by.get(ev.employee_id)||[];arr.push(ev);by.set(ev.employee_id,arr)});
  let present=0;
  $('teamBody').innerHTML=(emps||[]).map(emp=>{
    const arr=by.get(emp.id)||[];
    const ins=arr.filter(x=>x.event_type==='check_in');
    const outs=arr.filter(x=>x.event_type==='check_out');
    const inside=arr.length&&arr[arr.length-1].event_type==='check_in';
    if(inside) present++;
    return `<tr><td>${emp.full_name}</td><td>${ins.length?fmt(ins[0].occurred_at):'—'}</td><td>${outs.length?fmt(outs[outs.length-1].occurred_at):'—'}</td><td><span class="badge ${inside?'good':'neutral'}">${inside?'Presente':arr.length?'Saiu':'Sem registro'}</span></td></tr>`
  }).join('');
  $('employeeTotal').textContent=String((emps||[]).length);
  $('presentTotal').textContent=String(present);
  $('todayTotal').textContent=String((events||[]).length);
}

async function boot(){
  const {data:{session}}=await client.auth.getSession();
  if(!session){showAuth();return}
  try{
    await loadProfile();showApp();await loadToday();
    if(['admin','manager'].includes(me.role)) await loadManager();
  }catch(e){await client.auth.signOut();showAuth();setMsg(e.message,true)}
}

$('loginBtn').onclick=async()=>{
  setMsg('Entrando...');
  const email=$('email').value.trim(),password=$('password').value;
  if(!email||!password){setMsg('Informe e-mail e senha.',true);return}
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error){setMsg('Não foi possível entrar. Confira o e-mail e a senha.',true);return}
  await boot();
};

$('signupBtn').onclick=async()=>{
  setMsg('Criando acesso...');
  const email=$('email').value.trim(),password=$('password').value;
  if(!email||password.length<6){setMsg('Informe o e-mail cadastrado e uma senha com pelo menos 6 caracteres.',true);return}
  const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
  if(error){setMsg(error.message,true);return}
  if(data.session){setMsg('Acesso criado. Entrando...');await boot()}
  else setMsg('Acesso criado. Confira seu e-mail e confirme o cadastro antes de entrar.');
};

$('logoutBtn').onclick=async()=>{await client.auth.signOut();location.reload()};
$('checkInBtn').onclick=()=>saveEvent('check_in');
$('checkOutBtn').onclick=()=>saveEvent('check_out');
$('useLocation').onclick=verifyLocation;

document.querySelectorAll('.nav[data-view]').forEach(btn=>btn.onclick=async()=>{
  document.querySelectorAll('.nav[data-view]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));$(btn.dataset.view).classList.add('active-view');
  const map={employee:['Meu ponto','Registros salvos no Supabase'],manager:['Painel gestor','Presença e jornada da equipe'],settings:['Unidade','Configuração do local de trabalho']};
  $('pageTitle').textContent=map[btn.dataset.view][0];$('pageSubtitle').textContent=map[btn.dataset.view][1];
  if(btn.dataset.view==='manager') await loadManager();
});
client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')showAuth()});
boot();
