// Server-authoritative game: clients send intents, the server validates, mutates state, broadcasts a view.
const FAST=!!process.env.FAST;
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{WebSocketServer}=require('ws');
const CITIES=[ // name,country,flag,price,set,currency,rate,[3 landmarks]
['Mumbai','India','🇮🇳',60,0,'₹',83,['🕌 Taj Mahal','🚪 Gateway of India','🐅 Bengal tiger']],
['Auckland','New Zealand','🇳🇿',100,1,'NZ$',1.65,['🥝 Kiwi bird','🗼 Sky Tower','⛵ Sailboat']],
['Cape Town','South Africa','🇿🇦',80,0,'R',18,['⛰️ Table Mountain','🐧 African penguin','🦁 Lion']],
['São Paulo','Brazil','🇧🇷',110,1,'R$',5,['✝️ Christ the Redeemer','🦜 Macaw','⚽ Football']],
['Berlin','Germany','🇩🇪',140,2,'€',.92,['🏛️ Brandenburg Gate','🧱 Berlin Wall','🥨 Pretzel']],
['Mexico City','Mexico','🇲🇽',90,0,'MX$',17,['🗿 Aztec pyramid','💀 Day of the Dead','🌵 Cactus']],
['Shanghai','China','🇨🇳',150,2,'¥',7.2,['🐼 Giant panda','🗼 Pearl Tower','🏮 Lantern']],
['Sydney','Australia','🇦🇺',180,3,'A$',1.5,['🦘 Kangaroo','🎭 Opera House','🐨 Koala']],
['Toronto','Canada','🇨🇦',160,2,'C$',1.36,['🗼 CN Tower','🍁 Maple leaf','🦫 Beaver']],
['Rome','Italy','🇮🇹',190,3,'€',.92,['🏟️ Colosseum','🍕 Pizza','⛲ Trevi Fountain']],
['Paris','France','🇫🇷',220,4,'€',.92,['🗼 Eiffel Tower','🥐 Croissant','🎨 Louvre']],
['Singapore','Singapore','🇸🇬',200,3,'S$',1.35,['🦁 Merlion','🌳 Supertrees','🛳️ Marina Bay Sands']],
['Tokyo','Japan','🇯🇵',260,4,'¥',150,['🗻 Mount Fuji','⛩️ Torii gate','🍣 Sushi']],
['Cairo','Egypt','🇪🇬',120,1,'E£',48,['🔺 Pyramids','🐪 Camel','🗿 Sphinx']],
['Zurich','Switzerland','🇨🇭',240,4,'CHF',.88,['🏔️ Swiss Alps','🧀 Fondue','⌚ Swiss watch']],
['London','UK','🇬🇧',280,5,'£',.79,['🎡 London Eye','🕰️ Big Ben','🚌 Double-decker']],
['Dubai','UAE','🇦🇪',300,5,'AED',3.67,['🏙️ Burj Khalifa','🐪 Camel','🏝️ Palm Jumeirah']],
['New York','USA','🇺🇸',320,5,'$',1,['🗽 Statue of Liberty','🌉 Brooklyn Bridge','🚕 Yellow cab']]];
const SETS=['#b5651d','#5bc0eb','#e86a92','#f29e4c','#e04f4f','#e0b33b'],TI=[1,2,3,4,5,7,8,10,11,13,14,15,16,17,19,20,22,23];
const CI=i=>TI.indexOf(i),TYPE=i=>CI(i)>=0?'city':i==0?'start':i==6?'port':(i==9||i==12)?'card':i==18?'audit':'tax';
const MUL=[1,3,6,10,15],AV=['🦁','🐯','🦅','🐺','🐉','🦊'],COL=['#ee5d50','#2bb3a0','#e0a93b','#6c8cff','#c470ff','#7bd34f'];
const rooms={},cl=new Map(),rnd=n=>Math.random()*n|0,uid=()=>crypto.randomBytes(8).toString('hex');
const setOf=i=>TI.filter(j=>CITIES[CI(j)][4]==CITIES[CI(i)][4]),nm=i=>CITIES[CI(i)][0],hc=i=>Math.round(CITIES[CI(i)][3]*.5/5)*5;
const mine=(r,p)=>TI.filter(i=>r.own[i]===p.id),price=(r,i)=>Math.round(CITIES[CI(i)][3]*r.pm/5)*5;
const full=(r,i)=>r.own[i]!=null&&setOf(i).every(j=>r.own[j]===r.own[i]);
const rent=(r,i)=>Math.round(CITIES[CI(i)][3]*.12*MUL[r.h[i]||0]*(full(r,i)?2:1)*r.rm[CITIES[CI(i)][4]]); // DOUBLE RENT for a complete colour set
const canBuild=(r,i,p)=>r.own[i]===p.id&&full(r,i)&&(r.h[i]||0)<4&&setOf(i).every(j=>(r.h[j]||0)>=(r.h[i]||0))&&p.cash>=hc(i); // even building
const canSell=(r,i)=>(r.h[i]||0)>0&&setOf(i).every(j=>(r.h[j]||0)<=r.h[i]);
const nw=(r,p)=>Math.round(p.cash+mine(r,p).reduce((a,i)=>a+CITIES[CI(i)][3]*r.pm+(r.h[i]||0)*hc(i),0));
const log=(r,m)=>{r.log.unshift(m);r.log.length>50&&r.log.pop();r.lc++};
const send=(w,m)=>w&&w.readyState==1&&w.send(JSON.stringify(m));

const srv=http.createServer((q,s)=>{if(q.url=='/healthz')return s.end('ok');fs.readFile(path.join(__dirname,'public','index.html'),(e,d)=>{s.writeHead(e?500:200,{'Content-Type':'text/html; charset=utf-8'});s.end(d)})});
const wss=new WebSocketServer({server:srv});

function view(r,p){const T={};TI.forEach(i=>{const o=r.own[i],c=CITIES[CI(i)];T[i]={o:o??null,h:r.h[i]||0,p:price(r,i),r:o!=null?rent(r,i):Math.round(c[3]*.12*r.rm[c[4]]),f:full(r,i),b:o!=null&&canBuild(r,i,r.players.find(q=>q.id===o)),s:o!=null&&canSell(r,i)}});
 return{code:r.code,phase:r.phase,host:r.players[0]&&r.players[0].id,cur:r.players[r.cur]&&r.players[r.cur].id,round:r.round,max:r.max,evt:r.evt,pm:r.pm,T,dice:r.dice,lc:r.lc,log:r.log.slice(0,25),cash0:r.cash0,winner:r.winner,
  auc:r.auc&&{i:r.auc.i,hi:r.auc.hi,w:r.auc.w&&r.auc.w.id,skip:r.auc.skip,left:r.auc.end-Date.now()},
  players:r.players.map(q=>({id:q.id,name:q.name,av:q.av,col:q.col,cash:q.cash,pos:q.pos,alive:q.alive,bot:q.bot,off:!q.bot&&!q.ws,nw:nw(r,q),paid:q.paid,got:q.got,bought:q.bought,turns:q.turns})),you:p&&p.id}}
function push(r){r.players.forEach(p=>send(p.ws,{t:'state',s:view(r,p)}));bot(r)}
function online(){const l=[...cl.values()].filter(c=>c.name).map(c=>({id:c.id,name:c.name,busy:!!c.room}));cl.forEach((c,w)=>send(w,{t:'online',l}))}
function addPlayer(r,c,name,bot){const used=r.players.map(p=>p.av),k=AV.findIndex(a=>!used.includes(a)),p={id:r.nid++,name,av:AV[k],col:COL[k],cash:r.cash0,pos:0,alive:true,bot,ws:bot?null:c.ws,tok:c&&c.tok,paid:0,got:0,bought:0,turns:0};r.players.push(p);if(c){c.room=r;c.p=p}return p}

function pay(r,p,a,to,why){a=Math.round(a);if(!p.alive)return;if(p.cash<a)liq(r,p,a);
 if(p.cash>=a){p.cash-=a;p.paid+=a;if(to){to.cash+=a;to.got+=a}log(r,`${p.name} paid $${a} ${why}`)}
 else{if(to){to.cash+=p.cash;to.got+=p.cash}p.paid+=p.cash;p.cash=0;p.alive=false;mine(r,p).forEach(i=>{delete r.own[i];r.h[i]=0});log(r,`💥 ${p.name} is bankrupt`)}}
function liq(r,p,a){for(const i of mine(r,p))while((r.h[i]||0)>0&&p.cash<a){r.h[i]--;p.cash+=hc(i)/2|0}
 for(const i of mine(r,p)){if(p.cash>=a)break;delete r.own[i];r.h[i]=0;p.cash+=Math.round(CITIES[CI(i)][3]*.5);log(r,`${p.name} sold ${nm(i)} to the bank`)}}
const gain=(r,p,a)=>{a=Math.round(a);p.cash+=a;p.got+=a;log(r,`${p.name} earned $${a}`)};
function event(r){r.rm=r.rm.map(v=>1+(v-1)*.6);r.pm=1+(r.pm-1)*.7;const s=rnd(6),E=[['Inflation: rents rise worldwide',()=>r.rm=r.rm.map(v=>v*1.2)],['Recession: rents and prices fall',()=>{r.rm=r.rm.map(v=>v*.7);r.pm*=.9}],['Tourism boom: one colour set earns far more',()=>{r.rm[s]*=1.6}],['Market crash: property prices plunge',()=>{r.pm*=.75;r.rm=r.rm.map(v=>v*.85)}],['Trade boom: prices climb',()=>{r.pm*=1.15}],['Calm markets',()=>{}]],e=E[rnd(6)];e[1]();r.evt=e[0];log(r,'🌐 '+e[0])}
const CARDS=[['Export contract won. Collect $120.',(r,p)=>gain(r,p,120)],['Patent licensed abroad. Collect $90.',(r,p)=>gain(r,p,90)],['Tourism surge: $15 per city you own.',(r,p)=>gain(r,p,15*mine(r,p).length)],
['Trade treaty: $35 per colour set you hold a city in.',(r,p)=>gain(r,p,35*new Set(mine(r,p).map(i=>CITIES[CI(i)][4])).size)],
['Anniversary: every player pays you $20.',(r,p)=>r.players.forEach(q=>q!==p&&pay(r,q,20,p,'(gift)'))],
['Supply chain disruption. Pay $80.',(r,p)=>pay(r,p,80,null,'(supply chain)')],['Cyber attack. Pay $110.',(r,p)=>pay(r,p,110,null,'(cyber attack)')],['Regulatory penalty. Pay $60.',(r,p)=>pay(r,p,60,null,'(penalty)')],
['Shareholder dividend: pay every player $25.',(r,p)=>r.players.forEach(q=>q!==p&&q.alive&&pay(r,p,25,q,'(dividend)'))],
['Fast-track flight to a random city.',(r,p)=>{const t=TI[rnd(18)];if(t<=p.pos){p.cash+=150;p.got+=150}p.pos=t;land(r,p)}]];
function land(r,p){if(!p.alive)return;const i=p.pos,t=TYPE(i);
 if(t=='city'){const o=r.own[i];if(o==null){r.phase='buy';return}if(o!==p.id)pay(r,p,rent(r,i),r.players.find(q=>q.id===o),'rent in '+nm(i))}
 else if(t=='card'){const c=CARDS[rnd(CARDS.length)];log(r,`🎴 ${p.name}: ${c[0]}`);c[1](r,p);if(r.phase=='buy')return}
 else if(t=='tax')pay(r,p,75,null,'luxury tax');else if(t=='audit')pay(r,p,Math.min(200,p.cash*.1),null,'tax audit');
 r.phase=p.alive?'act':'roll';if(!p.alive)next(r)}
function doRoll(r){const p=r.players[r.cur],a=1+rnd(6),b=1+rnd(6);r.dice={a,b,seq:++r.ds};p.turns++;log(r,`${p.name} rolled ${a}+${b}`);p.pos+=a+b;if(p.pos>=24){p.pos-=24;p.cash+=150;p.got+=150;log(r,`${p.name} passed Start: +$150`)}land(r,p);push(r)}
function next(r){if(r.players.filter(q=>q.alive).length<2)return fin(r);const prev=r.cur;let c=prev;do c=(c+1)%r.players.length;while(!r.players[c].alive);r.cur=c;r.phase='roll';if(c<=prev){r.round++;if(r.round>r.max)return fin(r);event(r)}}
function fin(r){r.phase='over';r.winner=[...r.players].filter(q=>q.alive).sort((a,b)=>nw(r,b)-nw(r,a))[0].id}
function buy(r,p){const i=p.pos,a=price(r,i);p.cash-=a;p.paid+=a;r.own[i]=p.id;r.h[i]=0;p.bought++;r.phase='act';log(r,`${p.name} bought ${nm(i)} for $${a}`)}
function auction(r,i,skip){r.auc={i,hi:0,w:null,skip,end:Date.now()+(FAST?400:12000)};r.phase='auction';log(r,'Auction: '+nm(i));clearTimeout(r.tm);r.tm=setTimeout(()=>auction.fin(r),FAST?400:12000)}
function bid(r,p,amt){const a=r.auc;if(r.phase!='auction'||p.id==a.skip||!p.alive||amt<a.hi+10||amt>p.cash)return;a.hi=amt;a.w=p;a.end=Math.max(a.end,Date.now()+(FAST?300:6000));const left=a.end-Date.now();clearTimeout(r.tm);r.tm=setTimeout(()=>auction.fin(r),left)}
// shared auction finish (re-armed timer after bids)
auction.fin=r=>{const a=r.auc;if(!a)return;if(a.w){a.w.cash-=a.hi;a.w.paid+=a.hi;r.own[a.i]=a.w.id;r.h[a.i]=0;a.w.bought++;log(r,`${a.w.name} won ${nm(a.i)} for $${a.hi}`)}else log(r,'No bids');r.auc=null;r.phase='act';push(r)};
function act(r,p,m){const my=r.players[r.cur]===p,live=r.phase=='roll'||r.phase=='act';
 if(m.a=='roll'&&my&&r.phase=='roll')return doRoll(r);
 if(m.a=='buy'&&my&&r.phase=='buy'&&p.cash>=price(r,p.pos))buy(r,p);
 else if(m.a=='pass'&&my&&r.phase=='buy')auction(r,p.pos,p.id);
 else if(m.a=='bid')bid(r,p,+m.amt|0);
 else if(m.a=='build'&&my&&live&&TI.includes(m.i)&&canBuild(r,m.i,p)){p.cash-=hc(m.i);p.paid+=hc(m.i);r.h[m.i]=(r.h[m.i]||0)+1;log(r,`${p.name} built a house in ${nm(m.i)}`)}
 else if(m.a=='sell'&&my&&live&&TI.includes(m.i)&&r.own[m.i]===p.id&&canSell(r,m.i)){r.h[m.i]--;p.cash+=hc(m.i)/2|0;log(r,`${p.name} sold a house in ${nm(m.i)}`)}
 else if(m.a=='end'&&my&&r.phase=='act')next(r);
 push(r)}
function bot(r){clearTimeout(r.bt);if(r.phase=='lobby'||r.phase=='over')return;r.bt=setTimeout(()=>{const auto=q=>q.bot||!q.ws,p=r.players[r.cur];
 if(r.phase=='auction'){const a=r.auc,q=a&&r.players.find(q=>q.alive&&auto(q)&&q.id!=a.skip&&a.w!==q&&q.cash>=a.hi+10&&a.hi+10<=price(r,a.i)*.9);if(q){bid(r,q,a.hi+10);push(r)}return}
 if(!auto(p))return;if(r.phase=='roll')return doRoll(r);
 if(r.phase=='buy'){p.cash-price(r,p.pos)>=120?buy(r,p):auction(r,p.pos,p.id);return push(r)}
 if(r.phase=='act'){const i=TI.find(i=>canBuild(r,i,p)&&p.cash-hc(i)>=150);if(i!=null){act(r,p,{a:'build',i});return}next(r);push(r)}},FAST?40:1300)}

function startGame(r){r.players.forEach((p,k)=>p.id=k);r.phase='roll';r.cur=0;log(r,'Game started');push(r)}
function leave(c){const r=c.room;if(!r)return;const p=c.p;c.room=null;c.p=null;
 if(r.phase=='lobby'){r.players=r.players.filter(q=>q!==p);if(!r.players.some(q=>!q.bot)){delete rooms[r.code];return}push(r)}else{p.ws=null;if(!r.players.some(q=>q.ws))r.idle=Date.now();push(r)}}
function handle(c,m){const r=c.room;
 if(m.a=='hello'){c.name=String(m.name||'Guest').slice(0,12);c.tok=m.tok;
  if(!r)for(const R of Object.values(rooms)){const p=R.players.find(q=>!q.bot&&q.tok&&q.tok===c.tok&&!q.ws);if(p){p.ws=c.ws;c.room=R;c.p=p;send(c.ws,{t:'joined',code:R.code});push(R)}}
  return online()}
 if(m.a=='create'&&!r){let code;do code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[rnd(24)]).join('');while(rooms[code]);
  const R=rooms[code]={code,phase:'lobby',players:[],own:{},h:{},cur:0,round:1,max:30,rm:[1,1,1,1,1,1],pm:1,evt:'Calm markets',log:[],lc:0,ds:0,nid:0,cash0:1500,idle:0};addPlayer(R,c,c.name,false);send(c.ws,{t:'joined',code});push(R);return online()}
 if(m.a=='join'&&!r){const R=rooms[String(m.code).toUpperCase()];if(!R)return send(c.ws,{t:'err',m:'Room not found.'});if(R.phase!='lobby'||R.players.length>=6)return send(c.ws,{t:'err',m:'That room is full or already started.'});addPlayer(R,c,c.name,false);send(c.ws,{t:'joined',code:R.code});push(R);return online()}
 if(m.a=='invite'&&r&&r.phase=='lobby'){const t=[...cl.values()].find(x=>x.id==m.to&&!x.room);if(t)send(t.ws,{t:'invite',from:c.name,code:r.code})}
 if(m.a=='decline'){const t=[...cl.values()].find(x=>x.name==m.from);t&&send(t.ws,{t:'err',m:c.name+' declined your invitation.'})}
 if(!r)return;
 if(r.phase=='lobby'){const host=r.players[0]===c.p;
  if(m.a=='bot'&&host&&r.players.length<6)addPlayer(r,null,'Bot '+(r.players.length+1),true);
  else if(m.a=='cash'&&host)r.cash0=Math.min(10000,Math.max(500,+m.v|0)),r.players.forEach(q=>q.cash=r.cash0);
  else if(m.a=='start'&&host&&r.players.length>1)return startGame(r);
  else if(m.a=='kick'&&host&&r.players[m.k]&&r.players[m.k]!==c.p){const q=r.players[m.k];send(q.ws,{t:'err',m:'The host removed you.'});if(q.ws){const x=cl.get(q.ws);x.room=null;x.p=null}r.players.splice(m.k,1)}
  else if(m.a=='leave'){leave(c);return online()}
  return push(r)}
 if(m.a=='leave'){leave(c);return online()}
 if(m.a=='again'&&r.phase=='over'&&r.players[0]===c.p){delete rooms[r.code];r.players.forEach(q=>{const x=cl.get(q.ws);x&&(x.room=null)});return online()}
 c.p&&act(r,c.p,m)}
wss.on('connection',ws=>{const c={id:uid(),ws,name:'',room:null,p:null};cl.set(ws,c);send(ws,{t:'hi',C:CITIES,SC:SETS,TI});
 ws.on('message',d=>{try{handle(c,JSON.parse(d))}catch(e){console.error(e)}});ws.on('close',()=>{leave(c);cl.delete(ws);online()})});
setInterval(()=>{for(const k in rooms)if(rooms[k].idle&&Date.now()-rooms[k].idle>18e5)delete rooms[k]},6e5);
if(require.main===module)srv.listen(process.env.PORT||3000,()=>console.log('Capital Quest on',process.env.PORT||3000));
module.exports={rent,full,canBuild,canSell,pay,hc,TI,CITIES,act,srv,wss};
