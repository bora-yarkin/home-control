/* The only file that talks to Home Assistant.
 Everything the panel needs from Home Assistant comes through `HA`, so a change in Home Assistant is fixed here and nowhere else:
 no other file sends a websocket message, calls a REST path or reads the connection. It uses only what Home Assistant documents
 for a custom panel (the `hass` object) and its public websocket commands. Home Assistant's own frontend registries are not read;
 the registries are loaded with the registry websocket commands and kept current by their update events.
 The commands, events and REST paths in use are listed in README.md. */
(function(){
"use strict";

var hass=null,facade=null,listeners=[],queued=false;
var registry={entities:{},devices:{},areas:{},floors:{}};
var RETRY_MS=[2000,5000,15000,30000];

/* ---- panel -> adapter ---- */

function attach(h){
 hass=h;
 if(!facade)start();
 bindConnection();
 schedule();
}

function onUpdate(fn){listeners.push(fn)}

/* One redraw per frame, however many state changes arrive. */
function schedule(){
 if(queued)return;
 queued=true;
 requestAnimationFrame(function(){queued=false;listeners.forEach(function(fn){try{fn()}catch(e){console.error("[dashboard]",e)}})});
}

/* ---- registries ---- */

/* Each registry is reduced to the fields the panel reads, keyed the way the panel looks things up. */
var SOURCES=[
 {key:"entities",list:"config/entity_registry/list",event:"entity_registry_updated",
  pick:function(e){return e.disabled_by?null:{entity_id:e.entity_id,device_id:e.device_id||null,area_id:e.area_id||null,platform:e.platform,unique_id:e.unique_id||null,entity_category:e.entity_category||null,hidden:!!e.hidden_by,name:e.name||e.original_name||null}},
  id:function(e){return e.entity_id}},
 {key:"devices",list:"config/device_registry/list",event:"device_registry_updated",
  pick:function(d){return{id:d.id,name:d.name,name_by_user:d.name_by_user||null,area_id:d.area_id||null,manufacturer:d.manufacturer||null,model:d.model||null}},
  id:function(d){return d.id}},
 {key:"areas",list:"config/area_registry/list",event:"area_registry_updated",
  pick:function(a){return{area_id:a.area_id,name:a.name,floor_id:a.floor_id||null}},
  id:function(a){return a.area_id}},
 {key:"floors",list:"config/floor_registry/list",event:"floor_registry_updated",
  pick:function(f){return{floor_id:f.floor_id,name:f.name,level:f.level}},
  id:function(f){return f.floor_id}}
];

/* A plus integration can declare in its home_control.json that its entities stand in for another integration's (it makes its own entity for each one, with the same unique id): the panel then shows only the plus integration's. An entity of a replaced integration is left out when an enabled entity of the integration that replaces it stands in for it; one it has no entity for stays. What each integration replaces is asked of Home Control once. */
var REPLACES={},replacesAsked=null;
function loadReplaces(){
 if(!replacesAsked)replacesAsked=ws({type:"home_control/plugins"}).then(function(r){
  var out={};
  ((r&&r.plugins)||[]).forEach(function(p){if(p&&p.id&&Array.isArray(p.replaces)&&p.replaces.length)out[p.id]=p.replaces});
  REPLACES=out;
 },function(){replacesAsked=null});
 return replacesAsked;
}
function withoutReplaced(rows){
 rows=rows||[];
 var stood={};
 rows.forEach(function(r){
  var replaced=REPLACES[r.platform];
  if(replaced&&!r.disabled_by&&r.unique_id)replaced.forEach(function(p){stood[p+"|"+r.entity_id.split(".")[0]+"|"+r.unique_id]=1});
 });
 return rows.filter(function(r){
  return !(r.unique_id&&stood[r.platform+"|"+r.entity_id.split(".")[0]+"|"+r.unique_id]);
 });
}

/* The enabled entities as the panel reads them, before a plus integration's replacements are left out. Kept so that a changed entity can be put in
 without asking for the whole registry again (it is the large one: every entity of the home). */
var known={};

function setEntities(picked){
 var out={};
 withoutReplaced(Object.keys(picked).map(function(id){return picked[id]})).forEach(function(r){out[r.entity_id]=r});
 registry.entities=out;
}

/* One registry's loads and updates run one after the other, so that an old answer never lands over a newer one. */
function inOrder(src,task){
 src.queue=(src.queue||Promise.resolve()).catch(function(){}).then(task);
 return src.queue;
}

function loadRegistry(src,attempt){
 return Promise.all([ws({type:src.list}),src.key==="entities"?loadReplaces():null]).then(function(answer){
  var picked={};
  (answer[0]||[]).forEach(function(r){var v=src.pick(r);if(v)picked[src.id(r)]=v});
  if(src.key==="entities"){known=picked;setEntities(picked)}
  else registry[src.key]=picked;
  cacheSoon();
  schedule();
 },function(err){
  var wait=RETRY_MS[Math.min(attempt,RETRY_MS.length-1)];
  console.warn("[dashboard] could not load "+src.list+", retrying in "+wait/1000+"s",err);
  return new Promise(function(res){setTimeout(res,wait)}).then(function(){return loadRegistry(src,attempt+1)});
 });
}

/* Registry commands change rarely, so a burst of events is answered with one update. A small registry is loaded again whole. */
function watchRegistry(src){
 var timer=0;
 hass.connection.subscribeEvents(function(){
  clearTimeout(timer);
  timer=setTimeout(function(){inOrder(src,function(){return loadRegistry(src,0)})},400);
 },src.event);
}

/* The entity registry is large, so a change is answered by asking for the entities the events named. An entity that the answer no longer has was
 removed or renamed. An event that does not name its entity, a failed answer and a burst of more than MAX_FETCH entities are answered with a full load. */
var MAX_FETCH=200;
function watchEntities(src){
 var timer=0,dirty={ids:{},full:false};
 function flush(){
  var ids=Object.keys(dirty.ids),full=dirty.full;
  dirty={ids:{},full:false};
  if(full||!ids.length||ids.length>MAX_FETCH)return loadRegistry(src,0);
  return ws({type:"config/entity_registry/get_entries",entity_ids:ids}).then(function(rows){
   ids.forEach(function(id){
    var v=rows&&rows[id]?src.pick(rows[id]):null;
    if(v)known[id]=v;else delete known[id];
   });
   setEntities(known);
   cacheSoon();
   schedule();
  },function(){return loadRegistry(src,0)});
 }
 hass.connection.subscribeEvents(function(ev){
  var d=ev&&ev.data;
  if(d&&typeof d.entity_id==="string"){
   dirty.ids[d.entity_id]=1;
   if(typeof d.old_entity_id==="string")dirty.ids[d.old_entity_id]=1;
  }else dirty.full=true;
  clearTimeout(timer);
  timer=setTimeout(function(){inOrder(src,flush)},400);
 },src.event);
}

/* ---- the last registries, kept on this device ----
 The registries of the last visit are drawn from at once while the real ones are asked for. They are this person's copy: kept under their user id,
 written only after all four registries came from Home Assistant, and ignored when the browser refuses storage or the copy is old or from another user. */
var CACHE_KEY="home_control_registry_v1",CACHE_MAX_AGE_MS=30*24*3600*1000,cacheTimer=0;

function cacheOwner(){return hass&&hass.user&&typeof hass.user.id==="string"?hass.user.id:null}

function readCache(){
 var owner=cacheOwner();
 if(!owner)return null;
 try{
  var c=JSON.parse(localStorage.getItem(CACHE_KEY));
  var plain=function(o){return o&&typeof o==="object"&&!Array.isArray(o)};
  if(!c||c.v!==1||c.user!==owner||!(Date.now()-c.at<CACHE_MAX_AGE_MS))return null;
  if(![c.entities,c.devices,c.areas,c.floors,c.replaces].every(plain))return null;
  return c;
 }catch(e){return null}
}

function cacheNow(){
 clearTimeout(cacheTimer);
 var owner=cacheOwner();
 if(!owner)return;
 try{
  localStorage.setItem(CACHE_KEY,JSON.stringify({v:1,user:owner,at:Date.now(),entities:known,devices:registry.devices,areas:registry.areas,floors:registry.floors,replaces:REPLACES}));
 }catch(e){}
}

/* Later changes are written a few seconds after the last one, so a burst is one write. */
function cacheSoon(){
 if(!registriesLoaded)return;
 clearTimeout(cacheTimer);
 cacheTimer=setTimeout(cacheNow,3000);
}

var ready=null,registriesLoaded=false;

function start(){
 facade=buildFacade();
 watchWake();
 var cached=readCache();
 if(cached){
  try{
   REPLACES=cached.replaces;
   known=cached.entities;
   setEntities(known);
   registry.devices=cached.devices;
   registry.areas=cached.areas;
   registry.floors=cached.floors;
  }catch(e){
   /* A copy that cannot be read is not used. */
   cached=null;
   REPLACES={};
   known={};
   registry={entities:{},devices:{},areas:{},floors:{}};
  }
 }
 var loaded=Promise.all(SOURCES.map(function(src){return inOrder(src,function(){return loadRegistry(src,0)})})).then(function(){
  registriesLoaded=true;
  /* The first complete load is kept at once: a page that is closed within seconds still leaves a copy for the next visit. */
  cacheNow();
  schedule();
  SOURCES.forEach(function(src){if(src.key==="entities")watchEntities(src);else watchRegistry(src)});
  /* After a dropped and restored connection the registries may have changed, and the events of that time were missed. */
  hass.connection.addEventListener("ready",function(){SOURCES.forEach(function(src){inOrder(src,function(){return loadRegistry(src,0)})})});
 });
 /* The panel starts once the registries are in, or after a short wait; the lists then fill in by themselves. With the last visit's registries in hand
  it does not wait at all. Anything built from the registries and saved (the first layout) waits for registriesLoaded(), which is true only once Home
  Assistant has answered. */
 ready=cached?Promise.resolve():Promise.race([loaded,new Promise(function(res){setTimeout(res,8000)})]);
}

/* ---- what the panel reads ---- */

/* Plain data only: states, settings, the signed-in user and the registries. Everything that sends something goes through
 the named functions below. */
function buildFacade(){
 return{
  get states(){return hass.states},
  get services(){return hass.services},
  get config(){return hass.config},
  get user(){return hass.user},
  get locale(){return hass.locale},
  get connected(){return isConnected()},
  get entities(){return registry.entities},
  get devices(){return registry.devices},
  get areas(){return registry.areas},
  get floors(){return registry.floors},
  callService:function(domain,service,data){return hass.callService(domain,service,data)}
 };
}

/* ---- websocket ---- */

/* Whether the connection is up, as the connection itself says. Home Assistant's `hass.connected` is a copy that it updates after the connection has
 said "ready", so a page that asks at that moment is told "down" for a connection that is already back. */
function isConnected(){
 var c=hass&&hass.connection;
 return c&&typeof c.connected==="boolean"?c.connected:hass.connected;
}

/* A command that failed because the connection was down or lost, as against one Home Assistant answered with a refusal. Home Assistant's errors carry a
 text code ("unauthorized", "not_found"); a lost connection comes with a number or none. */
function isTransportError(err){return !(err&&typeof err.code==="string")}

function ws(msg){return hass.connection.sendMessagePromise(msg)}
function subscribe(msg,callback){return hass.connection.subscribeMessage(callback,msg)}
function withType(type,params){return ws(Object.assign({type:type},params))}

/* Called when the connection to Home Assistant is lost and when it is back. */
function onConnection(lost,back){
 connHandlers.push({lost:lost,back:back});
 bindConnection();
}

/* Home Assistant can hand the panel a new connection object (after a sign-in renewal, for instance); the handlers follow it, so a "back" is never missed on the old one. */
var connHandlers=[];
function bindConnection(){
 var c=hass&&hass.connection;
 if(!c)return;
 /* Each handler is attached once to each connection it has not been attached to, whenever it was added: a handler added after another one is bound too. */
 connHandlers.forEach(function(x){
  if(x.bound===c)return;
  x.bound=c;
  c.addEventListener("disconnected",x.lost);
  c.addEventListener("ready",x.back);
 });
}

/* A phone that wakes up often finds its connection dead before the browser has noticed (it can take many seconds), and the page shows old states meanwhile. When the page comes back, Home Assistant is asked a ping: no answer within WAKE_MS and the connection is closed and made again at once, instead of waiting for the browser to give up on it. Either way the page is drawn again now. A connection that is already down is being remade by Home Assistant. */
var WAKE_MS = 2000,
  waking = false;
/* A page that was away for AWAY_MS or more is not asked. Home Assistant pings every 55 seconds and closes the connection of a page that does not
 answer (its websocket's heartbeat), and a phone suspends the page, so by then the connection is most likely gone and the ping would only wait out
 its two seconds. The connection is remade at once. */
var AWAY_MS = 60000,
  hiddenAt = 0;
function wake(){
 var c=hass&&hass.connection;
 schedule();
 if(document.hidden)return;
 var away=hiddenAt?Date.now()-hiddenAt:0;
 hiddenAt=0;
 if(!c||waking||!c.connected)return;
 if(away>=AWAY_MS){
  c.reconnect(true);
  return;
 }
 waking=true;
 var done=false;
 function finish(dead){
  if(done)return;
  done=true;
  clearTimeout(timer);
  waking=false;
  if(dead&&hass&&hass.connection===c&&c.connected)c.reconnect(true);
  schedule();
 }
 var timer=setTimeout(function(){finish(true)},WAKE_MS);
 c.ping().then(function(){finish(false)},function(){finish(false)});
}
function watchWake(){
 function away(){if(document.hidden&&!hiddenAt)hiddenAt=Date.now()}
 document.addEventListener("visibilitychange",away);
 window.addEventListener("pagehide",away);
 document.addEventListener("visibilitychange",wake);
 window.addEventListener("pageshow",wake);
 window.addEventListener("focus",wake);
 window.addEventListener("online",wake);
}

/* Settings saved in Home Assistant: scope is "user" (this user only) or "system" (everyone). Resolves to the saved value. */
var data={
 get:function(scope,key){return ws({type:"frontend/get_"+scope+"_data",key:key}).then(function(r){return r&&r.value})},
 set:function(scope,key,value){return ws({type:"frontend/set_"+scope+"_data",key:key,value:value})},
 /* Calls callback with the saved value now and again whenever anyone saves it. Resolves to the function that stops it. */
 subscribe:function(scope,key,callback){return subscribe({type:"frontend/subscribe_"+scope+"_data",key:key},function(ev){callback(ev&&ev.value)})}
};

/* A service whose answer is wanted (the response object). */
function serviceResponse(domain,service,serviceData){
 return ws({type:"call_service",domain:domain,service:service,service_data:serviceData,return_response:true}).then(function(r){return r&&r.response});
}

/* ---- camera ---- */

var camera={
 clientConfig:function(id){return ws({type:"camera/webrtc/get_client_config",entity_id:id})},
 /* Starts a WebRTC session; `callback` receives its events. Resolves to the function that ends it. */
 offer:function(id,sdp,callback){return subscribe({type:"camera/webrtc/offer",entity_id:id,offer:sdp},callback)},
 candidate:function(id,session,candidate){return ws({type:"camera/webrtc/candidate",entity_id:id,session_id:session,candidate:candidate})},
 hlsUrl:function(id){return ws({type:"camera/stream",entity_id:id}).then(function(r){return r.url})},
 snapshotUrl:function(id,token){return "/api/camera_proxy/"+id+"?token="+token}
};

/* ---- the address of the page ---- */

/* Home Assistant shows a panel inside a frame of its own, so the address bar belongs to Home Assistant. Only the part after
 the # is touched, and when the address is not reachable the page is kept for this browser tab instead. */
var route={
 get:function(){
  try{return decodeURIComponent(window.parent.location.hash.replace("#",""))}
  catch(e){try{return sessionStorage.getItem("dashboard_route")||""}catch(e2){return ""}}
 },
 set:function(key){
  try{window.parent.history.replaceState(null,"",window.parent.location.pathname+(key?"#"+encodeURIComponent(key):""))}
  catch(e){try{sessionStorage.setItem("dashboard_route",key||"")}catch(e2){}}
 }
};

/* ---- voice ---- */

/* The https address of this Home Assistant (its external URL), where a microphone can be used when the page itself is on plain http. null when there is none. */
function secureOrigin(){
 try{
  var u=new URL(hass&&hass.config&&hass.config.external_url||"");
  return u.protocol==="https:"?u.origin:null;
 }catch(e){return null}
}

/* The address of the panel, for a notification that opens it. */
function panelPath(){
 try{return window.parent.location.pathname||"/"}
 catch(e){return"/"}
}

/* ---- a short-lived signed address ---- */

/* An audio or video element cannot send Home Assistant's login header, so a stream that needs it is played from an address Home
 Assistant signs for a minute (`auth/sign_path`). */
function signPath(path){
 return ws({type:"auth/sign_path",path:path,expires:60}).then(function(r){return r.path});
}

/* ---- automations owned by the panel ---- */

/* The automation editor of Home Assistant saves through this REST path; there is no websocket command for it. */
var automations={
 get:function(id){return hass.callApi("GET","config/automation/config/"+id)},
 save:function(id,config){return hass.callApi("POST","config/automation/config/"+id,config)},
 remove:function(id){return hass.callApi("DELETE","config/automation/config/"+id)}
};

/* The pictures of image remotes: an administrator uploads one and gets its address; removing takes the file away again. */
var remotePictures={
 upload:function(file){
  var body=new FormData();body.append("file",file);
  return hass.fetchWithAuth("/api/home_control/remote_image",{method:"POST",body:body}).then(function(r){
   return r.json().then(function(j){if(!r.ok)throw new Error(j&&j.message||"Upload failed");return j.url})
  })
 },
 remove:function(url){
  var name=String(url).split("/").pop();
  return hass.fetchWithAuth("/api/home_control/remote_image/"+encodeURIComponent(name),{method:"DELETE"})
 }
};

var scripts={
 get:function(id){return hass.callApi("GET","config/script/config/"+id)},
 save:function(id,config){return hass.callApi("POST","config/script/config/"+id,config)},
 remove:function(id){return hass.callApi("DELETE","config/script/config/"+id)}
};

/* ---- light groups: Home Assistant's "Group" helper of the type light, made and changed through its own configuration flow ---- */

var FLOW="config/config_entries/flow",OPTFLOW="config/config_entries/options/flow";

/* A flow step that did not finish says why, in Home Assistant's words. */
function flowProblem(step){
 var e=step&&step.errors,k=e&&Object.keys(e)[0];
 return new Error(k?e[k]:"The step was not accepted")
}

/* Runs a flow to its end and gives up (deleting the open flow) when a step is not accepted, so no half-made flow stays open. */
function runFlow(base,start,steps){
 var id=null;
 function abort(err){return(id?hass.callApi("DELETE",base+"/"+id).catch(function(){}):Promise.resolve()).then(function(){throw err})}
 return hass.callApi("POST",base,start).then(function(first){
  id=first.flow_id;
  var chain=Promise.resolve(first);
  steps.forEach(function(body){
   chain=chain.then(function(prev){
    if(prev.type==="abort")throw new Error(prev.reason||"The flow was stopped");
    return hass.callApi("POST",base+"/"+id,typeof body==="function"?body(prev):body)
   })
  });
  return chain
 }).then(function(last){
  if(last.type!=="create_entry")throw flowProblem(last);
  id=null;
  return last
 }).catch(abort)
}

/* The entity a config entry made: its registry row appears a moment after the entry is created. */
function entityOfEntry(entryId,tries){
 return ws({type:"config/entity_registry/list"}).then(function(rows){
  var r=rows.filter(function(x){return x.config_entry_id===entryId})[0];
  if(r)return r.entity_id;
  if(tries<=0)throw new Error("The group was made, but its light did not appear");
  return new Promise(function(done){setTimeout(done,400)}).then(function(){return entityOfEntry(entryId,tries-1)})
 })
}

var lightGroups={
 /* Makes the helper and gives { entry_id, entity_id } once its light exists. `opts`: hide_members (default true: the members are shown by the group), all (default false: on when any is on). */
 create:function(name,members,opts){
  opts=opts||{};
  return runFlow(FLOW,{handler:"group",show_advanced_options:false},[
   {next_step_id:"light"},
   {name:name,entities:members,hide_members:opts.hide_members!==false,all:!!opts.all}
  ]).then(function(done){
   var entry=done.result&&done.result.entry_id||done.result;
   return entityOfEntry(entry,15).then(function(entity){return{entry_id:entry,entity_id:entity}})
  })
 },
 /* The helper behind a light, or null when the light is not a group made with this helper. */
 entryOf:function(entityId){
  return ws({type:"config/entity_registry/get",entity_id:entityId}).then(function(r){
   return r&&r.platform==="group"&&r.config_entry_id?r.config_entry_id:null
  },function(){return null})
 },
 /* What the helper is set to now, read from its own options form: { entities, hide_members, all }. */
 options:function(entryId){
  var id=null;
  return hass.callApi("POST",OPTFLOW,{handler:entryId,show_advanced_options:false}).then(function(form){
   id=form.flow_id;
   var cur={entities:[],hide_members:false,all:false};
   (form.data_schema||[]).forEach(function(f){
    var v=f.description&&f.description.suggested_value;
    if(v===undefined)v=f.default;
    if(f.name in cur&&v!==undefined)cur[f.name]=v
   });
   return hass.callApi("DELETE",OPTFLOW+"/"+id).catch(function(){}).then(function(){return cur})
  })
 },
 /* Changes the members and the two options (any of entities, hide_members, all). Home Assistant reloads the group. */
 update:function(entryId,changes){
  return lightGroups.options(entryId).then(function(cur){
   var data={entities:changes.entities||cur.entities,hide_members:changes.hide_members!==undefined?changes.hide_members:cur.hide_members,all:changes.all!==undefined?changes.all:cur.all};
   return runFlow(OPTFLOW,{handler:entryId,show_advanced_options:false},[data])
  })
 },
 /* The group's name, as the helper's settings in Home Assistant change it: the light's own name and the helper's title. */
 rename:function(entityId,entryId,name){
  return ws({type:"config/entity_registry/update",entity_id:entityId,name:name}).then(function(){
   return entryId?ws({type:"config_entries/update",entry_id:entryId,title:name}).catch(function(){}):null
  })
 },
 remove:function(entryId){return hass.callApi("DELETE","config/config_entries/entry/"+entryId)}
};

window.HA={
 attach:attach,
 onUpdate:onUpdate,
 ready:function(){return ready},
 registriesLoaded:function(){return registriesLoaded},
 hass:function(){return hass?facade:null},
 onConnection:onConnection,
 isTransportError:isTransportError,
 data:data,
 history:function(params){return withType("history/history_during_period",params)},
 logbook:function(params){return withType("logbook/get_events",params)},
 statistics:function(params){return withType("recorder/statistics_during_period",params)},
 users:function(){return ws({type:"config/auth/list"})},
 entityRegistry:function(){return ws({type:"config/entity_registry/list"}).then(function(rows){return loadReplaces().then(function(){return withoutReplaced(rows)})})},
 serviceResponse:serviceResponse,
 /* The effects catalogues Home Control offers (a plus integration's, and the files an administrator imported), and importing or removing a file. */
 effects:{
  sources:function(){return ws({type:"home_control/effects"}).then(function(r){return r&&r.sources})},
  importFile:function(content){return ws({type:"home_control/effects_import",content:content})},
  removeFile:function(id){return ws({type:"home_control/effects_delete",file_id:id})}
 },
 /* Sharing scenes with Siri, HomeKit and the Shortcuts app (administrators): the live scenes Home Control publishes as entities, and the HomeKit Bridge's list. */
 sharing:{
  published:function(){return ws({type:"home_control/published"})},
  publish:function(sceneId,on){return ws({type:"home_control/publish",scene_id:sceneId,publish:on})},
  homekit:function(entityIds){return ws({type:"home_control/homekit",entity_ids:entityIds})},
  expose:function(entryId,entityId,on,accessoryType){
   var msg={type:"home_control/homekit_expose",entry_id:entryId,entity_id:entityId,expose:on};
   if(accessoryType)msg.accessory_type=accessoryType;
   return ws(msg);
  },
  createBridge:function(){return ws({type:"home_control/homekit_create"})},
  tvHome:function(){return ws({type:"home_control/tv_home"})},
  setTvHome:function(entityId,call){return ws({type:"home_control/tv_home_set",entity_id:entityId,call:call})}
 },
 /* The plus integrations that bring a script of their own: [{ id, name, menu, version }]. */
 plugins:function(){return ws({type:"home_control/plugins"}).then(function(r){return r&&r.plugins})},
 camera:camera,
 route:route,
 signPath:signPath,
 secureOrigin:secureOrigin,
 panelPath:panelPath,
 automations:automations,
 scripts:scripts,
 remotePictures:remotePictures,
 lightGroups:lightGroups
};
})();
