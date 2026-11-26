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
 appleText:function(configEntryId,text){return["apple_tv","set_keyboard_text",{config_entry_id:configEntryId,text:text}]},
 /* Text typed for a TV, by its integration: a call as [domain, service, data], or null when that integration has no way (the remote entity is asked for the others, see textKey). */
 textCall:function(platform,mediaId,configEntryId,text){
  if(platform==="samsungtv_smart")return media.samsungText(mediaId,text);
  if(platform==="apple_tv")return media.appleText(configEntryId,text);
  return null;
 },
 /* The same as a command of the TV's remote entity, or null. */
 textKey:function(platform,text){
  if(platform==="androidtv_remote")return"text:"+text;
  return remote.text(remote.family(platform),text);
 },
 /* An integration that gives a TV of this platform more than the one in use, when it is not installed; `platforms` are those of every entity. */
 better:function(platform,platforms){return platform==="samsungtv"&&platforms.indexOf("samsungtv_smart")<0?"samsungtv_smart":null}
};

/* ---- integrations that say whether a sleepy device still answers ---- */

var presence={
 /* Platforms whose connectivity binary_sensor means "the device answers" (Fast Matter switch pings sleepy Matter remotes). */
 platforms:["fast_matter_switch"]
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


/* ---- the keys of a remote entity, for the remote builder ---- */

/* Which keys a remote entity understands depends on the integration behind it. Each family lists its keys by group as [command, label, icon, colour]; the commands are the ones the integration documents
   (Home Assistant's pages for each), and a family the dashboard does not know takes any command typed in. Only Samsung (samsungtv_smart), Apple TV and Android TV Remote are used with the real device by the author; the
   others follow their documentation and are untested. `how` says how a key is sent: "key" is remote.send_command on the remote entity, "webos" is webostv.button on the media player. */
function K(c,l,i,k){return[c,l,i||"",k||""]}
function digits(prefix,suffix){var a=[];for(var n=0;n<10;n++)a.push(K(prefix+n+(suffix||""),String(n)));return a}
var KEYS={
 samsung:{label:"Samsung TV",how:"key",groups:[
  ["nav",[K("KEY_UP","Up","up"),K("KEY_DOWN","Down","down"),K("KEY_LEFT","Left","left"),K("KEY_RIGHT","Right","right"),K("KEY_ENTER","OK"),K("KEY_RETURN","Back","back"),K("KEY_HOME","Home","home"),K("KEY_MENU","Menu","cog"),K("KEY_EXIT","Exit","close"),K("KEY_INFO","Info","info"),K("KEY_GUIDE","Guide"),K("KEY_TOOLS","Tools","tune")]],
  ["power",[K("KEY_POWER","Power","power"),K("KEY_SOURCE","Source","swap"),K("KEY_HDMI","HDMI")]],
  ["volume",[K("KEY_VOLUP","Volume up","volup"),K("KEY_VOLDOWN","Volume down","voldown"),K("KEY_MUTE","Mute","mute"),K("KEY_CHUP","Channel up","chup"),K("KEY_CHDOWN","Channel down","chdown"),K("KEY_CH_LIST","Channels"),K("KEY_PRECH","Previous")]],
  ["numbers",digits("KEY_")],
  ["media",[K("KEY_PLAY","Play","play"),K("KEY_PAUSE","Pause","pause"),K("KEY_STOP","Stop","stop"),K("KEY_REWIND","Rewind","prev"),K("KEY_FF","Forward","next"),K("KEY_REC","Record","rec")]],
  ["colours",[K("KEY_RED","","","red"),K("KEY_GREEN","","","green"),K("KEY_YELLOW","","","yellow"),K("KEY_CYAN","","","blue")]],
  ["other",[K("KEY_CAPTION","Subtitles"),K("KEY_PICTURE_SIZE","Picture size"),K("KEY_SLEEP","Sleep"),K("KEY_FAVCH","Favourites")]]]},
 apple:{label:"Apple TV",how:"key",groups:[
  ["nav",[K("up","Up","up"),K("down","Down","down"),K("left","Left","left"),K("right","Right","right"),K("select","OK"),K("menu","Back","back"),K("home","Home","home"),K("top_menu","TV app","tv"),K("control_center","Control centre","cog")]],
  ["power",[K("wakeup","Wake","power"),K("suspend","Sleep","moon"),K("turn_on","Turn on"),K("turn_off","Turn off")]],
  ["volume",[K("volume_up","Volume up","volup"),K("volume_down","Volume down","voldown")]],
  ["media",[K("play","Play","play"),K("pause","Pause","pause"),K("previous","Previous","prev"),K("next","Next","next"),K("skip_backward","Back 10 s","prev"),K("skip_forward","Forward 10 s","next")]]]},
 android:{label:"Android TV",how:"key",groups:[
  ["nav",[K("DPAD_UP","Up","up"),K("DPAD_DOWN","Down","down"),K("DPAD_LEFT","Left","left"),K("DPAD_RIGHT","Right","right"),K("DPAD_CENTER","OK"),K("BACK","Back","back"),K("HOME","Home","home"),K("MENU","Menu","cog"),K("SETTINGS","Settings","tune"),K("SEARCH","Search","search"),K("INFO","Info","info"),K("GUIDE","Guide")]],
  ["power",[K("POWER","Power","power"),K("TV","TV","tv")]],
  ["volume",[K("VOLUME_UP","Volume up","volup"),K("VOLUME_DOWN","Volume down","voldown"),K("VOLUME_MUTE","Mute","mute"),K("CHANNEL_UP","Channel up","chup"),K("CHANNEL_DOWN","Channel down","chdown")]],
  ["numbers",digits("")],
  ["media",[K("MEDIA_PLAY_PAUSE","Play/pause","playpause"),K("MEDIA_PLAY","Play","play"),K("MEDIA_PAUSE","Pause","pause"),K("MEDIA_STOP","Stop","stop"),K("MEDIA_PREVIOUS","Previous","prev"),K("MEDIA_NEXT","Next","next"),K("MEDIA_REWIND","Rewind","prev"),K("MEDIA_FAST_FORWARD","Forward","next"),K("MEDIA_RECORD","Record","rec")]],
  ["colours",[K("PROG_RED","","","red"),K("PROG_GREEN","","","green"),K("PROG_YELLOW","","","yellow"),K("PROG_BLUE","","","blue")]]]},
 roku:{label:"Roku",how:"key",groups:[
  ["nav",[K("up","Up","up"),K("down","Down","down"),K("left","Left","left"),K("right","Right","right"),K("select","OK"),K("back","Back","back"),K("home","Home","home"),K("info","Info","info"),K("search","Search","search"),K("replay","Replay","restart")]],
  ["power",[K("power","Power","power"),K("input_hdmi1","HDMI 1"),K("input_hdmi2","HDMI 2"),K("input_hdmi3","HDMI 3"),K("input_hdmi4","HDMI 4"),K("input_av1","AV"),K("input_tuner","Tuner")]],
  ["volume",[K("volume_up","Volume up","volup"),K("volume_down","Volume down","voldown"),K("volume_mute","Mute","mute"),K("channel_up","Channel up","chup"),K("channel_down","Channel down","chdown")]],
  ["media",[K("play","Play/pause","playpause"),K("reverse","Rewind","prev"),K("forward","Forward","next")]]]},
 bravia:{label:"Sony Bravia",how:"key",groups:[
  ["nav",[K("Up","Up","up"),K("Down","Down","down"),K("Left","Left","left"),K("Right","Right","right"),K("Confirm","OK"),K("Return","Back","back"),K("Home","Home","home"),K("Exit","Exit","close"),K("ActionMenu","Menu","cog"),K("SyncMenu","Sync menu")]],
  ["numbers",digits("Num")],
  ["media",[K("Rewind","Rewind","prev"),K("Forward","Forward","next")]]]},
 philips:{label:"Philips TV",how:"key",groups:[
  ["nav",[K("CursorUp","Up","up"),K("CursorDown","Down","down"),K("CursorLeft","Left","left"),K("CursorRight","Right","right"),K("Confirm","OK"),K("Back","Back","back"),K("Home","Home","home"),K("Exit","Exit","close"),K("Options","Options","cog"),K("Info","Info","info"),K("TvGuide","Guide"),K("Source","Source","swap"),K("Find","Search","search")]],
  ["power",[K("Standby","Standby","power"),K("PowerOn","On"),K("PowerOff","Off"),K("AmbilightOnOff","Ambilight","lights")]],
  ["volume",[K("VolumeUp","Volume up","volup"),K("VolumeDown","Volume down","voldown"),K("Mute","Mute","mute"),K("ChannelStepUp","Channel up","chup"),K("ChannelStepDown","Channel down","chdown")]],
  ["numbers",digits("Digit")],
  ["media",[K("Play","Play","play"),K("Pause","Pause","pause"),K("PlayPause","Play/pause","playpause"),K("Stop","Stop","stop"),K("Rewind","Rewind","prev"),K("FastForward","Forward","next"),K("Record","Record","rec")]],
  ["colours",[K("RedColour","","","red"),K("GreenColour","","","green"),K("YellowColour","","","yellow"),K("BlueColour","","","blue")]]]},
 vizio:{label:"Vizio",how:"key",groups:[
  ["nav",[K("up","Up","up"),K("down","Down","down"),K("left","Left","left"),K("right","Right","right"),K("ok","OK"),K("back","Back","back"),K("exit","Exit","close"),K("menu","Menu","cog"),K("info","Info","info"),K("guide","Guide"),K("smartcast","SmartCast","apps"),K("input_next","Input","swap")]],
  ["power",[K("pow_toggle","Power","power"),K("pow_on","On"),K("pow_off","Off")]],
  ["volume",[K("vol_up","Volume up","volup"),K("vol_down","Volume down","voldown"),K("mute_toggle","Mute","mute"),K("ch_up","Channel up","chup"),K("ch_down","Channel down","chdown"),K("ch_prev","Previous channel")]],
  ["numbers",digits("num_")],
  ["media",[K("play","Play","play"),K("pause","Pause","pause"),K("seek_back","Rewind","prev"),K("seek_fwd","Forward","next")]]]},
 adb:{label:"Fire TV and Android (adb)",how:"key",groups:[
  ["nav",[K("UP","Up","up"),K("DOWN","Down","down"),K("LEFT","Left","left"),K("RIGHT","Right","right"),K("CENTER","OK"),K("BACK","Back","back"),K("HOME","Home","home"),K("MENU","Menu","cog"),K("SETTINGS","Settings","tune"),K("SEARCH","Search","search")]],
  ["power",[K("POWER","Power","power"),K("SLEEP","Sleep","moon"),K("WAKEUP","Wake"),K("INPUT","Input","swap"),K("HDMI1","HDMI 1"),K("HDMI2","HDMI 2"),K("HDMI3","HDMI 3"),K("HDMI4","HDMI 4")]],
  ["volume",[K("VOLUME_UP","Volume up","volup"),K("VOLUME_DOWN","Volume down","voldown"),K("MUTE","Mute","mute")]],
  ["media",[K("REWIND","Rewind","prev"),K("FAST_FORWARD","Forward","next")]],
  ["colours",[K("RED","","","red"),K("GREEN","","","green"),K("YELLOW","","","yellow"),K("BLUE","","","blue")]]]},
 webos:{label:"LG webOS",how:"webos",groups:[
  ["nav",[K("UP","Up","up"),K("DOWN","Down","down"),K("LEFT","Left","left"),K("RIGHT","Right","right"),K("ENTER","OK"),K("BACK","Back","back"),K("HOME","Home","home"),K("EXIT","Exit","close"),K("MENU","Menu","cog"),K("INFO","Info","info")]],
  ["volume",[K("VOLUMEUP","Volume up","volup"),K("VOLUMEDOWN","Volume down","voldown"),K("MUTE","Mute","mute"),K("CHANNELUP","Channel up","chup"),K("CHANNELDOWN","Channel down","chdown")]],
  ["numbers",digits("")],
  ["media",[K("PLAY","Play","play"),K("PAUSE","Pause","pause")]],
  ["colours",[K("RED","","","red"),K("GREEN","","","green"),K("YELLOW","","","yellow"),K("BLUE","","","blue")]]]}
};
var PLATFORM_FAMILY={samsungtv:"samsung",samsungtv_smart:"samsung",apple_tv:"apple",androidtv_remote:"android",roku:"roku",braviatv:"bravia",philips_js:"philips",vizio:"vizio",androidtv:"adb",webostv:"webos"};

/* The keys a native-style remote needs, per family: power, mute, the four arrows, OK, back, home, menu, volume, channels and play/pause. A role a family has no key for is left to the media player's own services (volume, power,
   play and pause). These come from the integrations' documentation and are not tested on a real device; the remote says so. */
var ROLES={
 roku:{power:"power",mute:"volume_mute",up:"up",down:"down",left:"left",right:"right",ok:"select",back:"back",home:"home",menu:"info",volup:"volume_up",voldown:"volume_down",chup:"channel_up",chdown:"channel_down",playpause:"play",text:function(t){return"Lit_"+t}},
 bravia:{up:"Up",down:"Down",left:"Left",right:"Right",ok:"Confirm",back:"Return",home:"Home",menu:"ActionMenu"},
 philips:{power:"Standby",mute:"Mute",up:"CursorUp",down:"CursorDown",left:"CursorLeft",right:"CursorRight",ok:"Confirm",back:"Back",home:"Home",menu:"Options",volup:"VolumeUp",voldown:"VolumeDown",chup:"ChannelStepUp",chdown:"ChannelStepDown",playpause:"PlayPause"},
 vizio:{power:"pow_toggle",mute:"mute_toggle",up:"up",down:"down",left:"left",right:"right",ok:"ok",back:"back",home:"smartcast",menu:"menu",volup:"vol_up",voldown:"vol_down",chup:"ch_up",chdown:"ch_down",playpause:"play"},
 adb:{power:"POWER",mute:"MUTE",up:"UP",down:"DOWN",left:"LEFT",right:"RIGHT",ok:"CENTER",back:"BACK",home:"HOME",menu:"MENU",volup:"VOLUME_UP",voldown:"VOLUME_DOWN"},
 webos:{up:"UP",down:"DOWN",left:"LEFT",right:"RIGHT",ok:"ENTER",back:"BACK",home:"HOME",menu:"MENU",volup:"VOLUMEUP",voldown:"VOLUMEDOWN",mute:"MUTE",chup:"CHANNELUP",chdown:"CHANNELDOWN",playpause:"PLAY"}
};
var remote={
 /* The family of an integration's platform (see KEYS), or "" when the dashboard has no list for it. */
 family:function(platform){return PLATFORM_FAMILY[platform]||""},
 label:function(family){return KEYS[family]?KEYS[family].label:""},
 how:function(family){return KEYS[family]?KEYS[family].how:"key"},
 /* [group, [[command, label, icon, colour], ...]] for a family. */
 groups:function(family){return KEYS[family]?KEYS[family].groups:[]},
 families:function(){return Object.keys(KEYS)},
 /* The key of a role for a family ("" when the family has none), and whether the family is one with a native-style remote that is only built from documentation. */
 role:function(family,role){var r=ROLES[family];return r&&typeof r[role]==="string"?r[role]:""},
 text:function(family,t){var r=ROLES[family];return r&&r.text?r.text(t):null},
 experimental:function(family){return !!ROLES[family]},
 /* A key sent to the media player itself (a family whose `how` is "webos"), as [domain, service, data]. */
 button:function(mediaId,key){return["webostv","button",{entity_id:mediaId,button:key}]}
};

/* The key a TV's own remote has for Home, per native-style remote kind (the others have theirs in ROLES). */
var HOME_KEYS={samsung:"KEY_HOME",android:"HOME",apple:"home"};

/* The call of a TV's Home key, as [domain, service, data] for the caller to send (or keep): the key of the TV's remote, or the webOS button. null when the
   TV's integration has no such key or there is no remote entity to send it to. */
media.homeCall=function(platform,model,mediaId,remoteId){
 var kind=media.kind(platform,model),fam=remote.family(platform),key="",how="key";
 if(kind!=="generic")key=HOME_KEYS[kind]||"";
 else if(fam){key=remote.role(fam,"home");how=remote.how(fam)}
 if(!key)return null;
 if(how==="webos")return remote.button(mediaId,key);
 return remoteId?["remote","send_command",{entity_id:remoteId,command:key}]:null;
};

window.Integrations={media:media,vacuum:vacuum,remote:remote,presence:presence};
})();
