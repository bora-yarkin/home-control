// SPDX-License-Identifier: GPL-3.0-or-later
// mic_frame.html: the page on the https address that records for a dashboard on plain http. It must answer only to a page on a
// private network address or on its own host, and it must send the audio to the page that asked, never to any origin.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../../custom_components/home_control/mic_frame.html", import.meta.url), "utf8");
const script = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));

function frame(host = "ha.example.net") {
  const posted = [];
  const listeners = {};
  const parent = { postMessage: (message, origin) => posted.push({ message, origin }) };
  const stream = { getTracks: () => [{ stop() {} }] };
  const window = {
    parent,
    addEventListener: (type, fn) => (listeners[type] = fn),
    AudioContext: class {
      constructor() {
        this.sampleRate = 48000;
        this.destination = {};
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createScriptProcessor() {
        return { connect() {}, disconnect() {} };
      }
      close() {}
    },
  };
  const context = {
    window,
    location: { hostname: host },
    document: {},
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    URL,
    Float32Array,
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  const send = (origin, data, source = parent) => listeners.message({ origin, data, source });
  return { posted, send };
}

test("only a dashboard on this host or a private network address is answered", async () => {
  for (const origin of ["http://homeassistant.local:8123", "http://192.168.0.12:8123", "http://10.1.2.3", "http://172.20.0.5", "http://localhost:8123", "https://ha.example.net"]) {
    const { posted, send } = frame();
    send(origin, { cmd: "start" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(posted.map((p) => [p.message.t, p.origin]), [["ack", origin], ["ready", origin]], origin);
  }
  for (const origin of ["http://evil.example.com", "http://192.169.0.1", "http://172.32.0.1", "http://homeassistant.local.evil.com", "null"]) {
    const { posted, send } = frame();
    send(origin, { cmd: "start" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(posted, [], origin);
  }
});

test("a message from a window that is not the parent is ignored", async () => {
  const { posted, send } = frame();
  send("http://homeassistant.local:8123", { cmd: "start" }, {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posted, []);
});

test("a refused microphone is reported to the asker with the browser's error name, and nothing is recorded", async () => {
  const posted = [];
  const parent = { postMessage: (message, origin) => posted.push({ message, origin }) };
  const listeners = {};
  const context = {
    window: { parent, addEventListener: (type, fn) => (listeners[type] = fn) },
    location: { hostname: "ha.example.net" },
    document: {},
    navigator: { mediaDevices: { getUserMedia: async () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })) } },
    URL,
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.message({ origin: "http://homeassistant.local:8123", data: { cmd: "start" }, source: parent });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posted.map((p) => p.message.t), ["ack", "error"]);
  assert.equal(posted[1].message.name, "NotAllowedError");
});
