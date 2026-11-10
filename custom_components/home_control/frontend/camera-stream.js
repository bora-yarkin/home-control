/* Live camera playback: WebRTC first, HLS as the fallback.
 CameraStream.start(video, entityId) returns a function that stops everything it started.
 The video is kept transparent (class "wait") until a picture is really showing, so a snapshot placed behind it stays visible instead of a black frame.
 If a stream connects but shows no moving picture, or only black, the other transport is tried; a stream that stops later is restarted.
 It reaches Home Assistant only through HA.camera (ha-adapter.js). */
(function(){
"use strict";

var BASE=document.currentScript.src;
var TRANSPORTS=["webrtc","hls"];
var START_TIMEOUT={webrtc:8000,hls:15000};
var CHECK_MS=500;
var STALL_MS=6000;            /* a playing stream whose clock does not move for this long is restarted */
var DARK_MS=6000;             /* how long a connected stream may show only black before the other transport is tried */
var DARK_LUMA=6;              /* average brightness (0-255) below which a frame counts as black */
var FAST_ROUNDS=3;            /* attempts over both transports before the snapshot is left showing while it keeps trying */
var RETRY_STEP_MS=10000;      /* after that, each further round waits this much longer than the one before ... */
var RETRY_MAX_MS=60000;       /* ... up to this */

/* ---- hls.js, loaded the first time it is needed ---- */

var hlsLoad=null;
function loadHls(){
 if(window.Hls)return Promise.resolve(window.Hls);
 if(!hlsLoad){
  hlsLoad=new Promise(function(res){
   var s=document.createElement("script");
   /* Same ?v= as this file, so a new version number refreshes hls.js too. */
   var u=new URL("vendor/hls.min.js",BASE);
   u.search=new URL(BASE).search;
   s.src=u.href;
   s.onload=function(){res(window.Hls||null)};
   s.onerror=function(){res(null)};
   document.head.appendChild(s);
  });
 }
 return hlsLoad;
}

/* ---- transports; each returns a function that tears it down ---- */

function webrtc(video,id,fail){
 var pc=null,sessionId=null,pending=[],unsub=null,closed=false;
 function candidate(c){HA.camera.candidate(id,sessionId,c).catch(function(){})}
 function giveUp(){if(!closed)fail()}
 HA.camera.clientConfig(id).then(function(cfg){
  if(closed)return;
  pc=new RTCPeerConnection(cfg.configuration||{});
  if(cfg.dataChannel)pc.createDataChannel(cfg.dataChannel);
  pc.addTransceiver("audio",{direction:"recvonly"});
  pc.addTransceiver("video",{direction:"recvonly"});
  pc.ontrack=function(e){
   var ms=e.streams&&e.streams[0]?e.streams[0]:(video.srcObject||new MediaStream());
   if(!(e.streams&&e.streams[0]))ms.addTrack(e.track);
   video.srcObject=ms;
   var p=video.play();if(p&&p.catch)p.catch(function(){});
  };
  pc.onicecandidate=function(ev){
   if(!ev.candidate)return;
   var c=ev.candidate.toJSON?ev.candidate.toJSON():ev.candidate;
   if(sessionId)candidate(c);else pending.push(c);
  };
  pc.onconnectionstatechange=function(){if(pc&&pc.connectionState==="failed")giveUp()};
  return pc.createOffer().then(function(offer){return pc.setLocalDescription(offer)}).then(function(){
   if(!cfg.getCandidatesUpfront)return;
   return new Promise(function(res){
    if(pc.iceGatheringState==="complete")return res();
    pc.addEventListener("icegatheringstatechange",function f(){if(pc.iceGatheringState==="complete"){pc.removeEventListener("icegatheringstatechange",f);res()}});
    setTimeout(res,2500);
   });
  }).then(function(){
   if(closed)return;
   return HA.camera.offer(id,pc.localDescription.sdp,function(ev){
    if(closed)return;
    if(ev.type==="session"){sessionId=ev.session_id;pending.forEach(candidate);pending=[]}
    else if(ev.type==="answer"){pc.setRemoteDescription({type:"answer",sdp:ev.answer}).catch(giveUp)}
    else if(ev.type==="candidate"){pc.addIceCandidate(ev.candidate).catch(function(){})}
    else if(ev.type==="error"){giveUp()}
   });
  });
 }).then(function(u){if(closed&&u){try{u()}catch(e){}}else unsub=u}).catch(giveUp);
 return function(){
  closed=true;
  try{unsub&&unsub()}catch(e){}
  try{pc&&pc.close()}catch(e){}
  video.srcObject=null;
 };
}

function hls(video,id,fail){
 var inst=null,closed=false;
 HA.camera.hlsUrl(id).then(function(url){
  if(closed)return;
  return loadHls().then(function(Hls){
   if(closed)return;
   if(Hls&&Hls.isSupported()){
    inst=new Hls({lowLatencyMode:true});
    inst.on(Hls.Events.ERROR,function(_,d){if(d&&d.fatal)fail()});
    inst.loadSource(url);
    inst.attachMedia(video);
   }else video.src=url;
   var p=video.play();if(p&&p.catch)p.catch(function(){});
  });
 }).catch(function(){if(!closed)fail()});
 return function(){
  closed=true;
  if(inst){inst.destroy();inst=null}
  video.removeAttribute("src");
  video.load();
 };
}

var TRANSPORT_START={webrtc:webrtc,hls:hls};

/* ---- what the picture is doing ---- */

var probe=null;
function brightness(video){
 try{
  if(!probe){probe=document.createElement("canvas");probe.width=32;probe.height=18}
  var cx=probe.getContext("2d",{willReadFrequently:true});
  cx.drawImage(video,0,0,32,18);
  var d=cx.getImageData(0,0,32,18).data,sum=0,n=d.length/4,i;
  for(i=0;i<d.length;i+=4)sum+=d[i]*.299+d[i+1]*.587+d[i+2]*.114;
  return sum/n;
 }catch(e){return null}
}

/* ---- public ---- */

function start(video,id){
 var stopped=false;
 if(!window.HA.hass())return function(){};
 var round=0,index=0,stopTransport=null,timer=0,retry=0,begun=0,revealed=false,lastClock=-1,lastMoved=0,darkSince=0,darkSeen={};

 function reveal(){
  if(revealed)return;
  revealed=true;
  round=0;
  video.classList.remove("wait");
 }
 function hide(){
  revealed=false;
  video.classList.add("wait");
 }

/* A restart of a stream that was showing keeps the last picture on screen while it reconnects. */
 function launch(keepShown){
  if(stopped)return;
  var kind=TRANSPORTS[index];
  if(!window.RTCPeerConnection&&kind==="webrtc"){next();return}
  begun=Date.now();lastClock=-1;lastMoved=begun;darkSince=0;
  if(!keepShown)hide();
  stopTransport=TRANSPORT_START[kind](video,id,next);
  clearInterval(timer);
  timer=setInterval(check,CHECK_MS);
 }

 function teardown(){
  clearInterval(timer);
  clearTimeout(retry);
  if(stopTransport){try{stopTransport()}catch(e){}stopTransport=null}
 }

 /* Move on to the other transport; after a full round, wait longer before trying again. The retries never stop on their
  own, only slow down, so a camera that was off for a while comes back; a picture that shows resets the count. */
 function retryDelay(){
  return round<FAST_ROUNDS?2000*round:Math.min(RETRY_MAX_MS,RETRY_STEP_MS*(round-FAST_ROUNDS+1));
 }
 function retryLaunch(){
  if(stopped)return;
  if(document.hidden){retry=setTimeout(retryLaunch,5000);return}
  launch();
 }
 function next(){
  if(stopped)return;
  teardown();
  index=(index+1)%TRANSPORTS.length;
  if(index!==0){launch();return}
  round++;
  if(round>=FAST_ROUNDS)hide();
  retry=setTimeout(retryLaunch,retryDelay());
 }

 function restartCurrent(){
  teardown();
  launch(true);
 }

 function check(){
  if(stopped)return;
  var kind=TRANSPORTS[index],now=Date.now();
  var moving=video.readyState>=2&&video.videoWidth>0;
  if(moving){
   var clock=video.currentTime;
   if(clock!==lastClock){lastClock=clock;lastMoved=now}
  }
  if(document.hidden)return;

  if(revealed){
   if(now-lastMoved>STALL_MS)restartCurrent();
   return;
  }
  if(!moving||now-lastMoved>STALL_MS){
   if(now-begun>START_TIMEOUT[kind])next();
   return;
  }
  var luma=brightness(video);
  if(luma===null||luma>=DARK_LUMA){reveal();return}
  /* Frames arrive but are black. The other transport decodes differently; if it is black too, the camera really is dark. */
  if(!darkSince)darkSince=now;
  if(now-darkSince>DARK_MS){
   darkSeen[kind]=true;
   if(darkSeen.webrtc&&darkSeen.hls)reveal();else next();
  }
 }

 function resume(){
  if(stopped||document.hidden)return;
  if(revealed&&video.paused){var p=video.play();if(p&&p.catch)p.catch(function(){})}
  lastMoved=Date.now();
 }
 document.addEventListener("visibilitychange",resume);
 window.addEventListener("pageshow",resume);

 launch();

 return function stop(){
  stopped=true;
  teardown();
  document.removeEventListener("visibilitychange",resume);
  window.removeEventListener("pageshow",resume);
 };
}

/* ---- push to talk ----
 CameraTalk.start(entityId) opens the microphone and a second WebRTC session to the camera that carries it.
 It returns {ready, stop}: ready resolves when the camera has accepted the audio and rejects (with userMessage) when it cannot be done;
 stop ends everything and always releases the microphone. Whether a camera takes audio is read from its answer: it must be willing to receive. */

function microphone(){
 function get(md){
  return md&&md.getUserMedia?md.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}):Promise.reject(Object.assign(new Error("no microphone support"),{name:"NotSupportedError"}));
 }
 /* The dashboard runs in a frame of the same site: when the frame may not use the microphone, the page around it may. */
 return get(navigator.mediaDevices).catch(function(e){
  var parentMedia=null;
  try{parentMedia=window.parent&&window.parent!==window?window.parent.navigator.mediaDevices:null}catch(x){}
  if(parentMedia)return get(parentMedia).catch(function(){throw e});
  throw e;
 });
}

function talkMessage(e){
 var n=e&&e.name;
 if(n==="NotAllowedError"||n==="SecurityError")return"The microphone is blocked. Allow it for this site in the browser, then try again.";
 if(n==="NotFoundError")return"No microphone was found.";
 if(n==="NotSupportedError"||!window.isSecureContext)return"Talking needs a secure (https) connection and a browser with a microphone.";
 return(e&&e.userMessage)||"Talking did not start.";
}

/* Whether the answer's audio line takes what was sent (the camera receives): recvonly or sendrecv. */
function takesAudio(sdp){
 var audio=String(sdp).split(/\r?\nm=/).filter(function(m){return/^audio/.test(m)})[0];
 return!!audio&&/a=(recvonly|sendrecv)/.test(audio);
}

function talk(id){
 var closed=false,pc=null,mic=null,unsub=null,sessionId=null,pending=[];
 function candidate(c){HA.camera.candidate(id,sessionId,c).catch(function(){})}
 function stop(){
  closed=true;
  try{unsub&&unsub()}catch(e){}
  try{pc&&pc.close()}catch(e){}
  if(mic)mic.getTracks().forEach(function(t){t.stop()});
  mic=null;pc=null;
 }
 var ready=microphone().then(function(ms){
  mic=ms;
  if(closed){stop();throw Object.assign(new Error("cancelled"),{userMessage:""})}
  return HA.camera.clientConfig(id);
 }).then(function(cfg){
  if(closed)throw Object.assign(new Error("cancelled"),{userMessage:""});
  return new Promise(function(resolveOnce,rejectOnce){
   var timer=null;
   var resolve=function(v){clearTimeout(timer);resolveOnce(v)};
   var reject=function(e){clearTimeout(timer);rejectOnce(e)};
   var fail=function(m){reject(Object.assign(new Error(m),{userMessage:m}))};
   pc=new RTCPeerConnection(cfg.configuration||{});
   if(cfg.dataChannel)pc.createDataChannel(cfg.dataChannel);
   mic.getAudioTracks().forEach(function(t){pc.addTrack(t,mic)});
   pc.addTransceiver("video",{direction:"recvonly"});
   pc.onicecandidate=function(ev){
    if(!ev.candidate)return;
    var c=ev.candidate.toJSON?ev.candidate.toJSON():ev.candidate;
    if(sessionId)candidate(c);else pending.push(c);
   };
   pc.onconnectionstatechange=function(){if(pc&&pc.connectionState==="failed")fail("The connection to the camera failed.")};
   pc.createOffer().then(function(o){return pc.setLocalDescription(o)}).then(function(){
    if(closed)return;
    return HA.camera.offer(id,pc.localDescription.sdp,function(ev){
     if(closed)return;
     if(ev.type==="session"){sessionId=ev.session_id;pending.forEach(candidate);pending=[]}
     else if(ev.type==="answer"){
      if(!takesAudio(ev.answer)){fail("This camera does not accept talking through Home Assistant.");return}
      pc.setRemoteDescription({type:"answer",sdp:ev.answer}).then(resolve,function(){fail("The camera did not accept the audio.")});
     }
     else if(ev.type==="candidate"){pc.addIceCandidate(ev.candidate).catch(function(){})}
     else if(ev.type==="error"){fail("The camera could not be reached.")}
    });
   }).then(function(u){if(closed&&u){try{u()}catch(e){}}else unsub=u}).catch(function(){fail("The camera could not be reached.")});
   timer=setTimeout(function(){fail("The camera did not answer.")},10000);
  });
 }).catch(function(e){
  stop();
  throw Object.assign(new Error(e&&e.message),{userMessage:e&&e.userMessage!==undefined?e.userMessage:talkMessage(e)});
 });
 return{ready:ready,stop:stop};
}

window.CameraTalk={start:talk};
/* ---- talking into a door call ----
 IntercomTalk.start(url) opens the microphone and a WebSocket at `url` (a signed ws:// or wss:// address from HA.signPath) and sends 16 kHz,
 16-bit, little-endian mono PCM in binary messages (docs/intercom-contract.md). It returns {ready, stop, mute}: ready resolves when the line is
 open and rejects (with userMessage) when it cannot be done; mute(true) stops the voice without ending the line; stop ends everything and always
 releases the microphone. The line can answer with {"error": code} as text, which ends the talk and is passed to onEnd(code); onEnd(null) says
 it ended another way. available() is false where the page may not use a microphone (plain http): the caller offers something else.
 The microphone is read through a ScriptProcessorNode: it is deprecated but the one thing every browser the dashboard runs in (including the
 phone apps' web views) still has; an AudioWorklet would need a second file served from this page. */

var TALK_RATE=16000;
var TALK_ERRORS={no_call:"There is no call to talk into.",busy:"Someone else is talking to the door.",station_offline:"The door station is not reachable.",app_unreachable:"The door station's app is not reachable."};

/* Float samples at inRate to 16-bit samples at 16 kHz: each output sample is the average of the input it covers (a low-pass, so nothing above 8 kHz folds back), in chunks of any size. */
function resampler(inRate){
 var ratio=inRate/TALK_RATE,made=0,dropped=0,tail=[];
 return function(input){
  var data=tail.length?tail.concat(Array.prototype.slice.call(input)):input,out=[];
  /* The place of each output sample is worked out from its number, not added up, so the chunk size cannot change a sample. */
  for(;;){
   var a=made*ratio-dropped,b=(made+1)*ratio-dropped;
   if(b>data.length)break;
   var sum=0,w=0;
   for(var i=Math.floor(a);i<Math.ceil(b);i++){
    var l=Math.max(a,i),r=Math.min(b,i+1);
    sum+=data[i]*(r-l);w+=r-l;
   }
   var v=Math.max(-1,Math.min(1,sum/w));
   out.push(Math.round(v<0?v*32768:v*32767));
   made++;
  }
  var keep=Math.floor(made*ratio-dropped);
  tail=Array.prototype.slice.call(data,keep);
  dropped+=keep;
  return Int16Array.from(out);
 };
}

function talkAvailable(){
 function has(md){return!!(md&&md.getUserMedia)}
 var parentMedia=null;
 try{parentMedia=window.parent&&window.parent!==window?window.parent.navigator.mediaDevices:null}catch(x){}
 return has(navigator.mediaDevices)||has(parentMedia);
}

function intercomTalk(url,onEnd){
 var closed=false,muted=false,mic=null,ctx=null,node=null,src=null,ws=null,over=false;
 function end(code){
  if(over)return;
  over=true;
  closed=true;
  try{node&&(node.onaudioprocess=null,node.disconnect())}catch(e){}
  try{src&&src.disconnect()}catch(e){}
  try{ctx&&ctx.close()}catch(e){}
  if(mic)mic.getTracks().forEach(function(t){t.stop()});
  try{ws&&ws.close()}catch(e){}
  mic=ctx=node=src=ws=null;
  if(onEnd)onEnd(code===undefined?null:code);
 }
 function stop(){end(null)}
 var ready=microphone().then(function(ms){
  mic=ms;
  if(closed){end(null);throw Object.assign(new Error("cancelled"),{userMessage:""})}
  return new Promise(function(resolve,reject){
   var Ctx=window.AudioContext||window.webkitAudioContext,opened=false;
   if(!Ctx)return reject(Object.assign(new Error("no audio"),{userMessage:"This browser cannot record for the door."}));
   ws=new WebSocket(url);
   ws.binaryType="arraybuffer";
   var timer=setTimeout(function(){reject(Object.assign(new Error("timeout"),{userMessage:"The door did not answer."}))},8000);
   ws.onopen=function(){
    opened=true;
    clearTimeout(timer);
    ctx=new Ctx();
    var down=resampler(ctx.sampleRate);
    src=ctx.createMediaStreamSource(mic);
    node=ctx.createScriptProcessor(4096,1,1);
    node.onaudioprocess=function(e){
     if(muted||!ws||ws.readyState!==1||ws.bufferedAmount>262144)return;
     var pcm=down(e.inputBuffer.getChannelData(0));
     if(pcm.length)ws.send(pcm.buffer);
    };
    src.connect(node);
    node.connect(ctx.destination);
    resolve();
   };
   ws.onmessage=function(ev){
    if(typeof ev.data!=="string")return;
    var code=null;
    try{code=JSON.parse(ev.data).error||null}catch(e){}
    if(!opened)reject(Object.assign(new Error(code||"error"),{userMessage:TALK_ERRORS[code]||"Talking did not start."}));
    end(code||"failed");
   };
   ws.onerror=function(){if(!opened)reject(Object.assign(new Error("socket"),{userMessage:"The door could not be reached."}))};
   ws.onclose=function(){
    clearTimeout(timer);
    if(!opened)reject(Object.assign(new Error("closed"),{userMessage:"The door could not be reached."}));
    end(null);
   };
  });
 }).catch(function(e){
  end(null);
  throw Object.assign(new Error(e&&e.message),{userMessage:e&&e.userMessage!==undefined?e.userMessage:talkMessage(e)});
 });
 function mute(on){
  muted=!!on;
  if(mic)mic.getAudioTracks().forEach(function(t){t.enabled=!muted});
 }
 return{ready:ready,stop:stop,mute:mute};
}

window.IntercomTalk={start:intercomTalk,available:talkAvailable,resampler:resampler,errors:TALK_ERRORS};

window.CameraStream={start:start};
})();
