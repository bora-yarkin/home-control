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

window.CameraStream={start:start};
})();
