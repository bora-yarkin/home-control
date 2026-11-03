// SPDX-License-Identifier: GPL-3.0-or-later
// Push to talk: the microphone is released whatever happens, and a camera that does not take audio says so. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../custom_components/home_control/frontend/camera-stream.js", import.meta.url), "utf8");

function talkWith({ answerDirection, mediaDevices, parentMedia }) {
  const stopped = [];
  const track = { stop: () => stopped.push(1) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class PC {
    constructor() {
      this.iceGatheringState = "complete";
      this.localDescription = { sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=recvonly" };
      PC.last = this;
    }
    addTrack() {}
    addTransceiver() {}
    createDataChannel() {}
    createOffer() { return Promise.resolve({ type: "offer", sdp: "x" }); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    close() { this.closed = true; }
    addEventListener() {}
    removeEventListener() {}
  }
  const win = {
    isSecureContext: true,
    parent: parentMedia === undefined ? undefined : { navigator: { mediaDevices: parentMedia } },
  };
  win.parent = win.parent || win;
  const context = vm.createContext({
    window: win,
    document: { currentScript: { src: "http://h/camera-stream.js" }, addEventListener() {}, hidden: false },
    navigator: { mediaDevices: mediaDevices === undefined ? { getUserMedia: () => Promise.resolve(stream) } : mediaDevices },
    RTCPeerConnection: PC,
    MediaStream: class {},
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval() {},
    console,
    Date,
    Promise,
    Object,
    String,
    Error,
    HA: {
      camera: {
        clientConfig: async () => ({ configuration: {} }),
        candidate: async () => {},
        offer: async (id, sdp, cb) => {
          setTimeout(() => {
            cb({ type: "session", session_id: "s1" });
            cb({ type: "answer", answer: `v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=${answerDirection}\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly` });
          }, 5);
          return () => {};
        },
      },
    },
  });
  win.HA = context.HA;
  vm.runInContext(SOURCE, context);
  return { talk: win.CameraTalk.start("camera.guest"), stopped, PC };
}

test("a camera that receives the audio is talked to, and stopping releases the microphone and the connection", async () => {
  const { talk, stopped, PC } = talkWith({ answerDirection: "recvonly" });
  await talk.ready;
  talk.stop();
  assert.equal(stopped.length, 1);
  assert.equal(PC.last.closed, true);
});

test("a camera that only sends (it has no way to take audio) is refused with a plain message and the microphone is released", async () => {
  const { talk, stopped } = talkWith({ answerDirection: "sendonly" });
  await assert.rejects(talk.ready, (e) => /does not accept talking/.test(e.userMessage));
  assert.equal(stopped.length, 1);
});

test("a blocked or missing microphone says so", async () => {
  const blocked = talkWith({ answerDirection: "recvonly", mediaDevices: { getUserMedia: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) } });
  await assert.rejects(blocked.talk.ready, (e) => /blocked/.test(e.userMessage));
  const missing = talkWith({ answerDirection: "recvonly", mediaDevices: {} });
  await assert.rejects(missing.talk.ready, (e) => /microphone/.test(e.userMessage));
});

test("when the frame may not use the microphone but the page around it may, that one is used", async () => {
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push(1) }], getAudioTracks: () => [{ stop: () => stopped.push(1) }] };
  const { talk } = talkWith({
    answerDirection: "recvonly",
    mediaDevices: { getUserMedia: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) },
    parentMedia: { getUserMedia: () => Promise.resolve(stream) },
  });
  await talk.ready;
  talk.stop();
  assert.ok(stopped.length >= 1);
});
