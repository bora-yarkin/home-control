/* Everything that is specific to one Home Assistant integration lives here. When an integration changes a service or an attribute,
 this is the only file to look at. It works on plain data and returns plain data or promises; it draws nothing and reads nothing
 from the page. Home Assistant itself is reached only through window.HA.

 xiaomi_miot + robot_vacuum_map   robot vacuum: rooms, room cleaning, no-go zones, live map
 samsungtv_smart / samsungtv      TV remote, typing on the TV (only samsungtv_smart can type)
 vizio                            typing on the TV
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
  if(platform==="vizio")return["vizio","send_text",{entity_id:mediaId,text:text}];
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
/* the dashboard's own words when they are loaded; the key itself where this file is read alone */
function T(k){return typeof _T==="function"?_T(k):k}
function K(c,l,i,k){return[c,l,i||"",k||""]}
function digits(prefix,suffix){var a=[];for(var n=0;n<10;n++)a.push(K(prefix+n+(suffix||""),String(n)));return a}
var KEYS={
 samsung:{label:T("rk_samsung_tv"),how:"key",groups:[
  ["nav",[K("KEY_UP",T("rk_up"),"up"),K("KEY_DOWN",T("rk_down"),"down"),K("KEY_LEFT",T("rk_left"),"left"),K("KEY_RIGHT",T("rk_right"),"right"),K("KEY_ENTER",T("rk_ok")),K("KEY_RETURN",T("rk_back"),"back"),K("KEY_HOME",T("rk_home"),"home"),K("KEY_MENU",T("rk_menu"),"cog"),K("KEY_EXIT",T("rk_exit"),"close"),K("KEY_INFO",T("rk_info"),"info"),K("KEY_GUIDE",T("rk_guide")),K("KEY_TOOLS",T("rk_tools"),"tune")]],
  ["power",[K("KEY_POWER",T("rk_power"),"power"),K("KEY_SOURCE",T("rk_source"),"swap"),K("KEY_HDMI",T("rk_hdmi"))]],
  ["volume",[K("KEY_VOLUP",T("rk_volume_up"),"volup"),K("KEY_VOLDOWN",T("rk_volume_down"),"voldown"),K("KEY_MUTE",T("rk_mute"),"mute"),K("KEY_CHUP",T("rk_channel_up"),"chup"),K("KEY_CHDOWN",T("rk_channel_down"),"chdown"),K("KEY_CH_LIST",T("rk_channels")),K("KEY_PRECH",T("rk_previous"))]],
  ["numbers",digits("KEY_")],
  ["media",[K("KEY_PLAY",T("rk_play"),"play"),K("KEY_PAUSE",T("rk_pause"),"pause"),K("KEY_STOP",T("rk_stop"),"stop"),K("KEY_REWIND",T("rk_rewind"),"prev"),K("KEY_FF",T("rk_forward"),"next"),K("KEY_REC",T("rk_record"),"rec")]],
  ["colours",[K("KEY_RED","","","red"),K("KEY_GREEN","","","green"),K("KEY_YELLOW","","","yellow"),K("KEY_CYAN","","","blue")]],
  ["other",[K("KEY_CAPTION",T("rk_subtitles")),K("KEY_PICTURE_SIZE",T("rk_picture_size")),K("KEY_SLEEP",T("rk_sleep")),K("KEY_FAVCH",T("rk_favourites"))]]]},
 apple:{label:T("rk_apple_tv"),how:"key",groups:[
  ["nav",[K("up",T("rk_up"),"up"),K("down",T("rk_down"),"down"),K("left",T("rk_left"),"left"),K("right",T("rk_right"),"right"),K("select",T("rk_ok")),K("menu",T("rk_back"),"back"),K("home",T("rk_home"),"home"),K("top_menu",T("rk_tv_app"),"tv"),K("control_center",T("rk_control_centre"),"cog")]],
  ["power",[K("wakeup",T("rk_wake"),"power"),K("suspend",T("rk_sleep"),"moon"),K("turn_on",T("rk_turn_on")),K("turn_off",T("rk_turn_off"))]],
  ["volume",[K("volume_up",T("rk_volume_up"),"volup"),K("volume_down",T("rk_volume_down"),"voldown")]],
  ["media",[K("play",T("rk_play"),"play"),K("pause",T("rk_pause"),"pause"),K("previous",T("rk_previous"),"prev"),K("next",T("rk_next"),"next"),K("skip_backward",T("rk_back_10_s"),"prev"),K("skip_forward",T("rk_forward_10_s"),"next")]]]},
 android:{label:T("rk_android_tv"),how:"key",groups:[
  ["nav",[K("DPAD_UP",T("rk_up"),"up"),K("DPAD_DOWN",T("rk_down"),"down"),K("DPAD_LEFT",T("rk_left"),"left"),K("DPAD_RIGHT",T("rk_right"),"right"),K("DPAD_CENTER",T("rk_ok")),K("BACK",T("rk_back"),"back"),K("HOME",T("rk_home"),"home"),K("MENU",T("rk_menu"),"cog"),K("SETTINGS",T("rk_settings"),"tune"),K("SEARCH",T("rk_search"),"search"),K("INFO",T("rk_info"),"info"),K("GUIDE",T("rk_guide"))]],
  ["power",[K("POWER",T("rk_power"),"power"),K("TV",T("rk_tv"),"tv")]],
  ["volume",[K("VOLUME_UP",T("rk_volume_up"),"volup"),K("VOLUME_DOWN",T("rk_volume_down"),"voldown"),K("VOLUME_MUTE",T("rk_mute"),"mute"),K("CHANNEL_UP",T("rk_channel_up"),"chup"),K("CHANNEL_DOWN",T("rk_channel_down"),"chdown")]],
  ["numbers",digits("")],
  ["media",[K("MEDIA_PLAY_PAUSE",T("rk_play_pause"),"playpause"),K("MEDIA_PLAY",T("rk_play"),"play"),K("MEDIA_PAUSE",T("rk_pause"),"pause"),K("MEDIA_STOP",T("rk_stop"),"stop"),K("MEDIA_PREVIOUS",T("rk_previous"),"prev"),K("MEDIA_NEXT",T("rk_next"),"next"),K("MEDIA_REWIND",T("rk_rewind"),"prev"),K("MEDIA_FAST_FORWARD",T("rk_forward"),"next"),K("MEDIA_RECORD",T("rk_record"),"rec")]],
  ["colours",[K("PROG_RED","","","red"),K("PROG_GREEN","","","green"),K("PROG_YELLOW","","","yellow"),K("PROG_BLUE","","","blue")]]]},
 roku:{label:T("rk_roku"),how:"key",groups:[
  ["nav",[K("up",T("rk_up"),"up"),K("down",T("rk_down"),"down"),K("left",T("rk_left"),"left"),K("right",T("rk_right"),"right"),K("select",T("rk_ok")),K("back",T("rk_back"),"back"),K("home",T("rk_home"),"home"),K("info",T("rk_info"),"info"),K("search",T("rk_search"),"search"),K("replay",T("rk_replay"),"restart")]],
  ["power",[K("power",T("rk_power"),"power"),K("input_hdmi1",T("rk_hdmi_1")),K("input_hdmi2",T("rk_hdmi_2")),K("input_hdmi3",T("rk_hdmi_3")),K("input_hdmi4",T("rk_hdmi_4")),K("input_av1",T("rk_av")),K("input_tuner",T("rk_tuner"))]],
  ["volume",[K("volume_up",T("rk_volume_up"),"volup"),K("volume_down",T("rk_volume_down"),"voldown"),K("volume_mute",T("rk_mute"),"mute"),K("channel_up",T("rk_channel_up"),"chup"),K("channel_down",T("rk_channel_down"),"chdown")]],
  ["media",[K("play",T("rk_play_pause"),"playpause"),K("reverse",T("rk_rewind"),"prev"),K("forward",T("rk_forward"),"next")]]]},
 bravia:{label:T("rk_sony_bravia"),how:"key",groups:[
  ["nav",[K("Up",T("rk_up"),"up"),K("Down",T("rk_down"),"down"),K("Left",T("rk_left"),"left"),K("Right",T("rk_right"),"right"),K("Confirm",T("rk_ok")),K("Return",T("rk_back"),"back"),K("Home",T("rk_home"),"home"),K("Exit",T("rk_exit"),"close"),K("ActionMenu",T("rk_menu"),"cog"),K("SyncMenu",T("rk_sync_menu"))]],
  ["numbers",digits("Num")],
  ["media",[K("Rewind",T("rk_rewind"),"prev"),K("Forward",T("rk_forward"),"next")]]]},
 philips:{label:T("rk_philips_tv"),how:"key",groups:[
  ["nav",[K("CursorUp",T("rk_up"),"up"),K("CursorDown",T("rk_down"),"down"),K("CursorLeft",T("rk_left"),"left"),K("CursorRight",T("rk_right"),"right"),K("Confirm",T("rk_ok")),K("Back",T("rk_back"),"back"),K("Home",T("rk_home"),"home"),K("Exit",T("rk_exit"),"close"),K("Options",T("rk_options"),"cog"),K("Info",T("rk_info"),"info"),K("TvGuide",T("rk_guide")),K("Source",T("rk_source"),"swap"),K("Find",T("rk_search"),"search")]],
  ["power",[K("Standby",T("rk_standby"),"power"),K("PowerOn",T("rk_on")),K("PowerOff",T("rk_off")),K("AmbilightOnOff",T("rk_ambilight"),"lights")]],
  ["volume",[K("VolumeUp",T("rk_volume_up"),"volup"),K("VolumeDown",T("rk_volume_down"),"voldown"),K("Mute",T("rk_mute"),"mute"),K("ChannelStepUp",T("rk_channel_up"),"chup"),K("ChannelStepDown",T("rk_channel_down"),"chdown")]],
  ["numbers",digits("Digit")],
  ["media",[K("Play",T("rk_play"),"play"),K("Pause",T("rk_pause"),"pause"),K("PlayPause",T("rk_play_pause"),"playpause"),K("Stop",T("rk_stop"),"stop"),K("Rewind",T("rk_rewind"),"prev"),K("FastForward",T("rk_forward"),"next"),K("Record",T("rk_record"),"rec")]],
  ["colours",[K("RedColour","","","red"),K("GreenColour","","","green"),K("YellowColour","","","yellow"),K("BlueColour","","","blue")]]]},
 vizio:{label:T("rk_vizio"),how:"key",groups:[
  ["nav",[K("up",T("rk_up"),"up"),K("down",T("rk_down"),"down"),K("left",T("rk_left"),"left"),K("right",T("rk_right"),"right"),K("ok",T("rk_ok")),K("back",T("rk_back"),"back"),K("exit",T("rk_exit"),"close"),K("menu",T("rk_menu"),"cog"),K("info",T("rk_info"),"info"),K("guide",T("rk_guide")),K("smartcast",T("rk_smartcast"),"apps"),K("input_next",T("rk_input"),"swap")]],
  ["power",[K("pow_toggle",T("rk_power"),"power"),K("pow_on",T("rk_on")),K("pow_off",T("rk_off"))]],
  ["volume",[K("vol_up",T("rk_volume_up"),"volup"),K("vol_down",T("rk_volume_down"),"voldown"),K("mute_toggle",T("rk_mute"),"mute"),K("ch_up",T("rk_channel_up"),"chup"),K("ch_down",T("rk_channel_down"),"chdown"),K("ch_prev",T("rk_previous_channel"))]],
  ["numbers",digits("num_")],
  ["media",[K("play",T("rk_play"),"play"),K("pause",T("rk_pause"),"pause"),K("seek_back",T("rk_rewind"),"prev"),K("seek_fwd",T("rk_forward"),"next")]]]},
 adb:{label:T("rk_fire_tv_and_android_adb"),how:"key",groups:[
  ["nav",[K("UP",T("rk_up"),"up"),K("DOWN",T("rk_down"),"down"),K("LEFT",T("rk_left"),"left"),K("RIGHT",T("rk_right"),"right"),K("CENTER",T("rk_ok")),K("BACK",T("rk_back"),"back"),K("HOME",T("rk_home"),"home"),K("MENU",T("rk_menu"),"cog"),K("SETTINGS",T("rk_settings"),"tune"),K("SEARCH",T("rk_search"),"search")]],
  ["power",[K("POWER",T("rk_power"),"power"),K("SLEEP",T("rk_sleep"),"moon"),K("WAKEUP",T("rk_wake")),K("INPUT",T("rk_input"),"swap"),K("HDMI1",T("rk_hdmi_1")),K("HDMI2",T("rk_hdmi_2")),K("HDMI3",T("rk_hdmi_3")),K("HDMI4",T("rk_hdmi_4"))]],
  ["volume",[K("VOLUME_UP",T("rk_volume_up"),"volup"),K("VOLUME_DOWN",T("rk_volume_down"),"voldown"),K("MUTE",T("rk_mute"),"mute")]],
  ["media",[K("REWIND",T("rk_rewind"),"prev"),K("FAST_FORWARD",T("rk_forward"),"next")]],
  ["colours",[K("RED","","","red"),K("GREEN","","","green"),K("YELLOW","","","yellow"),K("BLUE","","","blue")]]]},
 webos:{label:T("rk_lg_webos"),how:"webos",groups:[
  ["nav",[K("UP",T("rk_up"),"up"),K("DOWN",T("rk_down"),"down"),K("LEFT",T("rk_left"),"left"),K("RIGHT",T("rk_right"),"right"),K("ENTER",T("rk_ok")),K("BACK",T("rk_back"),"back"),K("HOME",T("rk_home"),"home"),K("EXIT",T("rk_exit"),"close"),K("MENU",T("rk_menu"),"cog"),K("INFO",T("rk_info"),"info")]],
  ["volume",[K("VOLUMEUP",T("rk_volume_up"),"volup"),K("VOLUMEDOWN",T("rk_volume_down"),"voldown"),K("MUTE",T("rk_mute"),"mute"),K("CHANNELUP",T("rk_channel_up"),"chup"),K("CHANNELDOWN",T("rk_channel_down"),"chdown")]],
  ["numbers",digits("")],
  ["media",[K("PLAY",T("rk_play"),"play"),K("PAUSE",T("rk_pause"),"pause")]],
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
