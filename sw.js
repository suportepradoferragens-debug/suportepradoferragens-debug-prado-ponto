const CACHE='prado-ponto-v37';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',()=>{});


self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch{}
  const title=data.title||'Prado Ponto';
  const options={
    body:data.body||'Novo registro de ponto.',
    icon:'/icon-180.png',
    badge:'/icon-180.png',
    tag:data.tag||'prado-ponto',
    renotify:true,
    data:{url:data.url||'/'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'/';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client){
          client.navigate(target).catch(()=>{});
          return client.focus();
        }
      }
      if(clients.openWindow) return clients.openWindow(target);
    })
  );
});
