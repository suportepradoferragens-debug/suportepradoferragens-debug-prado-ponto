const state={inside:false,checkIn:null,checkOut:null,events:[],settings:{lat:-23.5015,lng:-47.4526,radius:80,presenceRequired:true}};
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const nowTime=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
function distanceM(a,b,c,d){const R=6371e3,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function addEvent(type,detail){const t=nowTime();state.events.unshift({type,time:t,detail}); if(type==='Entrada')state.checkIn=t;if(type==='Saída')state.checkOut=t;render()}
function setInside(v,source='Simulação'){if(v===state.inside)return;state.inside=v;if(v){if(!state.checkIn)addEvent('Entrada',`${source} • Geofence + aparelho + presença confirmados`)}else if(state.checkIn&&!state.checkOut){addEvent('Saída',`${source} • ausência confirmada após saída do perímetro`) }render()}
function render(){
 $('statusText').textContent=state.inside?'Na empresa':'Fora da empresa';
 $('statusHint').textContent=state.inside?'Presença confirmada. Ponto protegido por múltiplos sinais.':'Aguardando detecção de presença.';
 $('statusOrb').classList.toggle('on',state.inside);['geoDot','deviceDot','presenceDot'].forEach(id=>$(id).classList.toggle('on',state.inside||id==='deviceDot'));
 $('geoPill').textContent=state.inside?'Presença confirmada':'GPS aguardando';
 $('geoText').textContent=state.inside?'Dentro do raio permitido':'Não verificado';$('presenceText').textContent=state.inside?'Sinal confirmado':'Wi‑Fi / Beacon aguardando';
 $('checkIn').textContent=state.checkIn||'—';$('checkOut').textContent=state.checkOut||'—';$('mgrCheckIn').textContent=state.checkIn||'—';$('mgrCheckOut').textContent=state.checkOut||'—';
 $('mgrStatus').textContent=state.inside?'Trabalhando':state.checkOut?'Saiu':'Aguardando';$('mgrStatus').className='badge '+(state.inside?'good':'neutral');
 if(state.checkIn&&!state.checkOut){const [h,m]=state.checkIn.split(':').map(Number);const start=new Date();start.setHours(h,m,0,0);const mins=Math.max(0,Math.floor((Date.now()-start)/60000));$('worked').textContent=`${Math.floor(mins/60)}h${pad(mins%60)}`}else $('worked').textContent=state.checkOut?'Jornada fechada':'0h00';
 $('timeline').innerHTML=state.events.length?state.events.map(e=>`<div class="event"><time>${e.time}</time><div><strong>${e.type}</strong><small>${e.detail}</small></div></div>`).join(''):'<div class="empty">Nenhum ponto registrado hoje.</div>';
}
$('simulateIn').onclick=()=>setInside(true);$('simulateOut').onclick=()=>setInside(false);
$('useLocation').onclick=()=>{if(!navigator.geolocation)return alert('Geolocalização não disponível neste navegador.');$('geoPill').textContent='Localizando...';navigator.geolocation.getCurrentPosition(pos=>{const d=distanceM(pos.coords.latitude,pos.coords.longitude,state.settings.lat,state.settings.lng);$('geoText').textContent=`Distância aproximada: ${Math.round(d)} m`;if(d<=state.settings.radius){$('presenceText').textContent=state.settings.presenceRequired?'No MVP, confirme via simulação do Beacon/Wi‑Fi':'Presença física não exigida'; if(!state.settings.presenceRequired)setInside(true,'GPS real')}else setInside(false,'GPS real')},err=>{alert('Não foi possível acessar a localização. Verifique a permissão do navegador.');$('geoPill').textContent='GPS sem permissão'})};
$('saveSettings').onclick=()=>{state.settings.lat=Number($('lat').value);state.settings.lng=Number($('lng').value);state.settings.radius=Number($('radius').value);state.settings.presenceRequired=$('presenceRequired').checked;alert('Regras salvas neste protótipo.')};
document.querySelectorAll('.nav').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));$(btn.dataset.view).classList.add('active-view');const map={employee:['Meu ponto','Registro automático por presença'],manager:['Painel gestor','Presença e jornada da equipe'],settings:['Configurações','Regras da unidade e segurança']};$('pageTitle').textContent=map[btn.dataset.view][0];$('pageSubtitle').textContent=map[btn.dataset.view][1]});
render();setInterval(render,30000);
