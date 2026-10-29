/* Everything that is specific to one Home Assistant integration lives here. When an integration changes a service or an attribute,
 this is the only file to look at. It works on plain data and returns plain data or promises; it draws nothing and reads nothing
 from the page. Home Assistant itself is reached only through window.HA.

 xiaomi_miot + robot_vacuum_map   robot vacuum: rooms, room cleaning, no-go zones, live map
 samsungtv_smart / samsungtv      TV remote, typing on the TV (only samsungtv_smart can type)
 apple_tv                         Apple TV remote, typing on the Apple TV
 androidtv_remote                 Android TV remote
 hue                              scenes: which one is on, playing, speed, brightness
 hue_plus (sync module)           Hue's Spotify sync: which entities belong to one bridge
 hue_plus (sync box)              Hue Play HDMI Sync Box: which entities belong to one box */
(function(){
"use strict";

function sleep(ms){return new Promise(function(res){setTimeout(res,ms)})}

/* ---- media players ---- */

var media={
 /* Which remote layout a media player gets, from its integration and the model of its device. */
 kind:function(platform,model){
  if(platform==="samsungtv_smart"||platform==="samsungtv")return"samsung";
  if(platform==="androidtv_remote")return"android";
  if(platform==="apple_tv"&&!/homepod/i.test(model||""))return"apple";
  return"generic";
 },
 /* The built-in samsungtv integration has no text input. */
 samsungCanType:function(platform){return platform==="samsungtv_smart"},
 /* The settings button: samsungtv_smart sends KEY_MORE, which opens the settings and the menu at the bottom left; the built-in integration sends KEY_MENU. */
 samsungSettingsKey:function(platform){return platform==="samsungtv_smart"?"KEY_MORE":"KEY_MENU"},
 /* This function returns a service call as [domain, service, data] for the caller to send. */
 samsungText:function(media,text){return["media_player","play_media",{entity_id:media,media_content_type:"send_text",media_content_id:text}]},
 appleText:function(configEntryId,text){return["apple_tv","set_keyboard_text",{config_entry_id:configEntryId,text:text}]}
};

/* ---- robot vacuum ---- */

/* xiaomi_miot action numbers and the values its room settings use. */
var VAC_SIID=2,ACT_ROOM_SETTINGS=10,ACT_CLEAN_ROOMS=13,PROP_NO_GO_ZONES=11,PROP_VIRTUAL_WALLS=12;
var LEVELS={
 mode:{"Sweep":1,"Mop":2,"Sweep Mop":3,"Sweep Before Mopping":4},
 fan:{"Silent":1,"Basic":2,"Strong":3,"Full Speed":4},
 water:{"Off":0,"Level1":1,"Level2":2,"Level3":3}
};

/* xiaomi_miot answers every action with success and puts the real result in its response, so a refusal such as
 "No response from the device" is read from there. One repeat covers a missed packet. */
function action(entityId,aiid,params){
 var tries=0;
 function go(){
  return window.HA.serviceResponse("xiaomi_miot","call_action",{entity_id:entityId,siid:VAC_SIID,aiid:aiid,params:params}).then(function(x){
   if(!x||x.code===0)return;
   if(tries++===0)return sleep(1500).then(go);
   throw new Error(x.error||"code "+x.code);
  });
 }
 return go();
}

var vacuum={
 /* The rooms the vacuum knows, from its "vacuum_extend.room_info" attribute: [{id, name}]. */
 rooms:function(attributes){
  try{
   var info=JSON.parse(attributes["vacuum_extend.room_info"]||"{}"),rows=info.room_attrs||[];
   if(rows.length>1&&Array.isArray(rows[0])){
    var head=rows[0],idCol=head.indexOf("id"),nameCol=head.indexOf("room_name");
    return rows.slice(1).filter(function(r){return r[nameCol]&&String(r[nameCol]).trim()!==""}).map(function(r){return{id:String(r[idCol]),name:r[nameCol]}});
   }
  }catch(e){}
  return[];
 },

 /* The vacuum's own "stop and go charge" button, if it has one. 'h' is the HA facade. */
 dockButton:function(h,id){
  var e=h.entities[id],deviceId=e&&e.device_id;
  return Object.keys(h.entities).filter(function(i){return i.indexOf("button.")===0&&h.entities[i].device_id===deviceId&&/stop_and_gocharge/.test(i)})[0];
 },

 /* Saves one room's settings on the vacuum. 'prefs' uses the names Home Assistant shows: fan, water, mode, and times. */
 setRoom:function(id,roomId,roomName,prefs){
  return action(id,ACT_ROOM_SETTINGS,[JSON.stringify({room_attrs:[{id:roomId,room_name:roomName||"",
   fan_level:LEVELS.fan[prefs.fan]||4,water_level:LEVELS.water[prefs.water]||0,clean_mode:LEVELS.mode[prefs.mode]||1,
   clean_times:prefs.times||1,mop_mode:0,on:true}]})]);
 },

 /* Starts cleaning the rooms (numbers) in 'roomIds'. */
 cleanRooms:function(id,roomIds){return action(id,ACT_CLEAN_ROOMS,[JSON.stringify({room:roomIds})])},

 /* No-go zones and virtual walls: [{wall, items}], where items are the raw shapes from the vacuum. */
 zones:function(id){
  return window.HA.serviceResponse("xiaomi_miot","get_properties",{entity_id:id,mapping:[{siid:VAC_SIID,piid:PROP_NO_GO_ZONES},{siid:VAC_SIID,piid:PROP_VIRTUAL_WALLS}]}).then(function(r){
   var o=r||{},out=[];
   Object.keys(o).forEach(function(k){
    var wall=/wall/.test(k),j;
    try{j=JSON.parse(o[k])}catch(e){return}
    out.push({wall:wall,items:(wall?j.restricted_walls:j.forbidden_regions||j.restricted_sweep_areas)||[]});
   });
   return out;
  });
 },

 /* The robot_vacuum_map image entity that shows this vacuum: the one named after the vacuum's device, or the only one there is. */
 mapImage:function(h,id){
  var e=h.entities[id],dv=e&&h.devices[e.device_id],
   slug=dv?String(dv.name_by_user||dv.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""):"",
   list=Object.keys(h.states).filter(function(i){return i.indexOf("image.")===0&&h.states[i].attributes.calibration_points});
  return list.filter(function(i){return slug&&i.indexOf(slug)>=0})[0]||(list.length===1?list[0]:null);
 },

 /* The sensor robot_vacuum_map keeps next to its map image with the robot's position. */
 positionSensor:function(mapImage){return mapImage.replace(/^image\./,"sensor.").replace(/_live_map$/,"_vacuum_position")}
};

/* ---- scenes ---- */

var scenes={
 /* Philips Hue: a scene entity says nothing about being on, but the room has a "Scene" select entity (same device) whose state is the name of the scene that is on. */
 isHue:function(h,id){var e=h.entities[id];return id.indexOf("scene.")===0&&!!e&&e.platform==="hue"},
 /* The light that stands for the whole room of a Hue scene: the Hue group light on the same device. Its "dynamics" attribute says whether a live scene is playing. */
 group:function(h,id){
  var e=h.entities[id];
  if(!e||!e.device_id)return null;
  return Object.keys(h.states).filter(function(k){var x=h.entities[k];return k.indexOf("light.")===0&&x&&x.device_id===e.device_id&&h.states[k].attributes.is_hue_group})[0]||null;
 },
 /* The service call that starts a scene live, at a speed (0 to 100) and brightness (1 to 255). It is the only way to change a scene's speed; dynamic:false does not stop a live scene. */
 start:function(id,speed,brightness){
  return["hue","activate_scene",{entity_id:id,dynamic:true,speed:Math.max(0,Math.min(100,Math.round(speed))),brightness:Math.max(1,Math.min(255,Math.round(brightness)))}];
 },
 /* The Hue app sets a scene's speed in 12 steps. The service takes 0 to 100, so step 1 is 0 and step 12 is 100. */
 speedSteps:12,
 stepToSpeed:function(step){return Math.round((step-1)/(this.speedSteps-1)*100)},
 speedToStep:function(speed){return Math.max(1,Math.min(this.speedSteps,Math.round(speed/100*(this.speedSteps-1))+1))},
 /* Each Hue light reports "dynamic_palette" in its dynamics attribute while a live scene plays on it (an off light keeps the word). */
 playing:function(h,grp){
  return !!grp&&(h.states[grp].attributes.entity_id||[]).some(function(m){var s=h.states[m];return s&&s.state==="on"&&s.attributes.dynamics==="dynamic_palette"});
 },
 /* Freezing a live scene: every light that is on is told the colour and brightness it shows right now, as a plain command. Hue then stops animating it. Returns service calls as [domain, service, data]. */
 freeze:function(h,grp){
  var out=[];
  (h.states[grp].attributes.entity_id||[]).forEach(function(m){
   var s=h.states[m];
   if(!s||s.state!=="on")return;
   var a=s.attributes,d={entity_id:m,transition:0};
   if(a.brightness)d.brightness=a.brightness;
   if(a.color_mode==="color_temp"&&a.color_temp_kelvin)d.color_temp_kelvin=a.color_temp_kelvin;
   else if(a.xy_color)d.xy_color=a.xy_color;
   else if(a.hs_color)d.hs_color=a.hs_color;
   out.push(["light","turn_on",d]);
  });
  return out;
 },
 active:function(h,id){
  var nm=h.states[id]&&h.states[id].attributes.name,e=h.entities[id];
  if(!nm||!e||e.platform!=="hue"||!e.device_id)return false;
  return Object.keys(h.states).some(function(k){
   var se=h.entities[k];
   return k.indexOf("select.")===0&&se&&se.platform==="hue"&&se.device_id===e.device_id&&(h.states[k].attributes.options||[]).indexOf(nm)>=0&&h.states[k].state===nm;
  });
 }
};

/* ---- Hue Spotify sync (the sync module of the Philips Hue Plus integration) ---- */

var huesync={
 /* What each of its entities is for. The registry's unique_id of an entity is "<bridge>_sync_<key>". */
 keys:["sync","now_playing","brightness","light_delay","intensity","palette","style","area"],
 keyOf:function(h,id){
  var e=h.entities[id];
  if(!e||e.platform!=="hue_plus"||!e.unique_id)return null;
  return huesync.keys.filter(function(k){var tail="_sync_"+k;return e.unique_id.length>tail.length&&e.unique_id.slice(-tail.length)===tail})[0]||null;
 },
 /* The entities of the bridge that owns entity `id`, as {sync, now_playing, brightness, light_delay, intensity, palette, style, area}
  (a key is missing when that entity is disabled), or null when `id` is not a sync entity. */
 entities:function(h,id){
  var key=huesync.keyOf(h,id);
  if(!key)return null;
  var uid=h.entities[id].unique_id,bridge=uid.slice(0,uid.length-key.length-6),out={};
  Object.keys(h.entities).forEach(function(k){
   var e=h.entities[k],kk=e.platform==="hue_plus"&&e.unique_id&&e.unique_id.indexOf(bridge+"_sync_")===0?huesync.keyOf(h,k):null;
   if(kk&&e.unique_id===bridge+"_sync_"+kk)out[kk]=k;
  });
  return out.sync?out:null;
 },
 isSync:function(h,id){return huesync.keyOf(h,id)==="sync"}
};

/* ---- Hue Play HDMI Sync Box (an entry of the Philips Hue Plus integration) ---- */

var huesyncbox={
 /* What each of its entities is for. The registry's unique_id of an entity is "<box>_syncbox_<key>". */
 keys:["sync","mode","source","intensity","brightness","hdmi_signal"],
 keyOf:function(h,id){
  var e=h.entities[id];
  if(!e||e.platform!=="hue_plus"||!e.unique_id)return null;
  var at=e.unique_id.indexOf("_syncbox_");
  if(at<0)return null;
  var key=e.unique_id.slice(at+9);
  return huesyncbox.keys.indexOf(key)>=0?key:null;
 },
 /* The entities of the box that owns entity `id`, as {sync, mode, source, intensity, brightness, hdmi_signal}, or null when `id` is not
  an entity of a sync box (or the box has no sync switch). */
 entities:function(h,id){
  var key=huesyncbox.keyOf(h,id);
  if(!key)return null;
  var uid=h.entities[id].unique_id,box=uid.slice(0,uid.indexOf("_syncbox_")),out={};
  Object.keys(h.entities).forEach(function(k){
   var e=h.entities[k],kk=e.platform==="hue_plus"&&e.unique_id&&e.unique_id.indexOf(box+"_syncbox_")===0?huesyncbox.keyOf(h,k):null;
   if(kk&&e.unique_id===box+"_syncbox_"+kk)out[kk]=k;
  });
  return out.sync?out:null;
 },
 isBox:function(h,id){return huesyncbox.keyOf(h,id)==="sync"}
};

/* ---- Philips Hue Plus (what it offers, so a screen shows only what exists) ---- */

var hueplus={
 /* The entities of the bridge, by what they are for. The registry's unique_id of one is "<bridge>_<key>"; the bridge id is read from the Zigbee
  channel sensor, which a bridge always has. Returns {key: entity_id}, or null when no bridge of Hue Plus has its bridge module on. */
 BRIDGE_KEYS:["auto_update","auto_update_time","check_update","search","zigbee_channel","matter_fabrics","authorized_apps","home_and_away","firmware","bridge_update","update_state","device_search","service_internet","service_remoteaccess"],
 bridge:function(h){
  var tail="_zigbee_channel",ids=Object.keys(h.entities||{}),uid=null;
  for(var i=0;i<ids.length&&!uid;i++){
   var e=h.entities[ids[i]];
   if(e.platform==="hue_plus"&&e.unique_id&&e.unique_id.length>tail.length&&e.unique_id.slice(-tail.length)===tail)uid=e.unique_id.slice(0,-tail.length);
  }
  if(!uid)return null;
  var out={};
  ids.forEach(function(id){
   var e=h.entities[id];
   if(e.platform!=="hue_plus"||!e.unique_id||e.unique_id.indexOf(uid+"_")!==0)return;
   var key=e.unique_id.slice(uid.length+1);
   if(hueplus.BRIDGE_KEYS.indexOf(key)>=0)out[key]=id;
  });
  return out;
 },
 /* The lights of Hue Plus (not rooms, zones or gradient zones): entity ids whose state carries the bridge's id of the light. */
 lights:function(h){
  return Object.keys(h.entities||{}).filter(function(id){
   var e=h.entities[id],s=h.states[id];
   return e.platform==="hue_plus"&&id.indexOf("light.")===0&&s&&s.attributes&&s.attributes.hue_light_id;
  });
 },
 /* What belongs to one light: its power-on select, identify button and firmware update (the registry's unique_id ends with the light's id, or with the id of its device for the update). */
 forLight:function(h,id){
  var hue=h.states[id]&&h.states[id].attributes.hue_light_id,out={};
  if(!hue)return out;
  Object.keys(h.entities||{}).forEach(function(k){
   var e=h.entities[k];
   if(e.platform!=="hue_plus"||!e.unique_id||e.device_id!==h.entities[id].device_id)return;
   if(e.unique_id.slice(-("_powerup_"+hue).length)==="_powerup_"+hue)out.powerup=k;
   else if(e.unique_id.slice(-("_identify_"+hue).length)==="_identify_"+hue)out.identify=k;
   else if(k.indexOf("update.")===0)out.update=k;
  });
  return out;
 },
 /* Firmware updates of Hue Plus's devices: update entity ids. */
 updates:function(h){
  return Object.keys(h.entities||{}).filter(function(id){return id.indexOf("update.")===0&&h.entities[id].platform==="hue_plus"});
 },
 /* What the bridge itself holds (lists of automations, entertainment areas, ...), asked for when a page opens. */
 resources:function(kinds){return window.HA.serviceResponse("hue_plus","get_resources",{kinds:kinds})},
 /* Whether the integration is installed and offers this service (its modules that are switched off register nothing extra, but the
  service list of Home Assistant only has what is loaded). */
 has:function(h,service){return !!(h&&h.services&&h.services.hue_plus&&h.services.hue_plus[service])}
};

window.Integrations={media:media,vacuum:vacuum,scenes:scenes,huesync:huesync,huesyncbox:huesyncbox,hueplus:hueplus};
})();
