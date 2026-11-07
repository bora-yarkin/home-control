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

/* Hue Plus makes its own entity for each entity of the Hue integration (the same unique id), so with Hue Plus installed the panel shows only Hue Plus's: an entity of the Hue integration is left out when a Hue Plus entity stands in for it. One Hue Plus has no entity for (a module switched off) stays. */
function withoutHue(rows){
 rows=rows||[];
 var stood={};
 rows.forEach(function(r){
  if(r.platform==="hue_plus"&&!r.disabled_by&&r.unique_id)stood[r.entity_id.split(".")[0]+"|"+r.unique_id]=1;
 });
 return rows.filter(function(r){
  return !(r.platform==="hue"&&r.unique_id&&stood[r.entity_id.split(".")[0]+"|"+r.unique_id]);
 });
}

function loadRegistry(src,attempt){
 return ws({type:src.list}).then(function(rows){
  var out={};
  (src.key==="entities"?withoutHue(rows):rows||[]).forEach(function(r){var v=src.pick(r);if(v)out[src.id(r)]=v});
  registry[src.key]=out;
  schedule();
 },function(err){
  var wait=RETRY_MS[Math.min(attempt,RETRY_MS.length-1)];
  console.warn("[dashboard] could not load "+src.list+", retrying in "+wait/1000+"s",err);
  return new Promise(function(res){setTimeout(res,wait)}).then(function(){return loadRegistry(src,attempt+1)});
 });
}

/* Registry commands change rarely, so a burst of events is answered with one reload. */
function watchRegistry(src){
 var timer=0;
 hass.connection.subscribeEvents(function(){
  clearTimeout(timer);
  timer=setTimeout(function(){loadRegistry(src,0)},400);
 },src.event);
}

var ready=null,registriesLoaded=false;

function start(){
 facade=buildFacade();
 var loaded=Promise.all(SOURCES.map(function(src){return loadRegistry(src,0)})).then(function(){
  registriesLoaded=true;
  schedule();
  SOURCES.forEach(watchRegistry);
  /* After a dropped and restored connection the registries may have changed. */
  hass.connection.addEventListener("ready",function(){SOURCES.forEach(function(src){loadRegistry(src,0)})});
 });
 /* The panel starts once the registries are in, or after a short wait; the lists then fill in by themselves.
  Anything built from the registries and saved (the first layout) waits for registriesLoaded(). */
 ready=Promise.race([loaded,new Promise(function(res){setTimeout(res,8000)})]);
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
  get connected(){return hass.connected},
  get entities(){return registry.entities},
  get devices(){return registry.devices},
  get areas(){return registry.areas},
  get floors(){return registry.floors},
  callService:function(domain,service,data){return hass.callService(domain,service,data)}
 };
}

/* ---- websocket ---- */

function ws(msg){return hass.connection.sendMessagePromise(msg)}
function subscribe(msg,callback){return hass.connection.subscribeMessage(callback,msg)}
function withType(type,params){return ws(Object.assign({type:type},params))}

/* Called when the connection to Home Assistant is lost and when it is back. */
function onConnection(lost,back){
 connHandlers.push({lost:lost,back:back});
 bindConnection();
}

/* Home Assistant can hand the panel a new connection object (after a sign-in renewal, for instance); the handlers follow it, so a "back" is never missed on the old one. */
var connHandlers=[],connBound=null;
function bindConnection(){
 var c=hass&&hass.connection;
 if(!c||c===connBound||!connHandlers.length)return;
 connBound=c;
 connHandlers.forEach(function(x){c.addEventListener("disconnected",x.lost);c.addEventListener("ready",x.back)});
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

window.HA={
 attach:attach,
 onUpdate:onUpdate,
 ready:function(){return ready},
 registriesLoaded:function(){return registriesLoaded},
 hass:function(){return hass?facade:null},
 onConnection:onConnection,
 data:data,
 history:function(params){return withType("history/history_during_period",params)},
 logbook:function(params){return withType("logbook/get_events",params)},
 statistics:function(params){return withType("recorder/statistics_during_period",params)},
 users:function(){return ws({type:"config/auth/list"})},
 entityRegistry:function(){return ws({type:"config/entity_registry/list"}).then(withoutHue)},
 serviceResponse:serviceResponse,
 /* The effects catalogues Home Control offers (a plus integration's, and the files an administrator imported), and importing or removing a file. */
 effects:{
  sources:function(){return ws({type:"home_control/effects"}).then(function(r){return r&&r.sources})},
  importFile:function(content){return ws({type:"home_control/effects_import",content:content})},
  removeFile:function(id){return ws({type:"home_control/effects_delete",file_id:id})}
 },
 camera:camera,
 route:route,
 signPath:signPath,
 automations:automations,
 scripts:scripts,
 remotePictures:remotePictures
};
})();
