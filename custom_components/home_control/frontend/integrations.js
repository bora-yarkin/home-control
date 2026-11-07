/* Everything that is specific to one Home Assistant integration lives here. When an integration changes a service or an attribute,
 this is the only file to look at. It works on plain data and returns plain data or promises; it draws nothing and reads nothing
 from the page. Home Assistant itself is reached only through window.HA.

 xiaomi_miot + robot_vacuum_map   robot vacuum: rooms, room cleaning, no-go zones, live map
 samsungtv_smart / samsungtv      TV remote, typing on the TV (only samsungtv_smart can type)
 apple_tv                         Apple TV remote, typing on the Apple TV
 androidtv_remote                 Android TV remote
 Hue (scenes, the Spotify sync, the sync box, gradient styles) is Hue Plus's: it registers them through the plugin API (docs/plugin-api.md). */
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

window.Integrations={media:media,vacuum:vacuum};
})();
