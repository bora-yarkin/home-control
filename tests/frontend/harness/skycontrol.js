// SPDX-License-Identifier: GPL-3.0-or-later
// A control for looking at the header's sky: the weather, the height of the sun, and a sweep from night through day. Opened with ?sky (README.md, "The header sky").
// It sets the pretend weather and sun of the harness only.
const WEATHER = [
  ["sunny", "Sunny"],
  ["partlycloudy", "Partly cloudy"],
  ["cloudy", "Cloudy"],
  ["rainy", "Rain"],
  ["pouring", "Heavy rain"],
  ["lightning-rainy", "Storm"],
  ["snowy", "Snow"],
  ["fog", "Fog"],
  ["windy", "Windy"],
  ["clear-night", "Clear night"],
];

const ALIAS = { storm: "lightning-rainy", rain: "rainy", heavy: "pouring", snow: "snowy", night: "clear-night", partly: "partlycloudy", wind: "windy" };

export function skyControl(hass, query) {
  const weather = Object.keys(hass.states).find((id) => id.startsWith("weather."));
  if (!weather) return;
  const start = (query.get("sky") || "").split("@");
  start[0] = ALIAS[start[0]] || start[0];
  const state = { cond: WEATHER.some((w) => w[0] === start[0]) ? start[0] : "sunny", elev: Number(start[1]) || 40, sweep: 0 };

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:10px;bottom:10px;z-index:99999;width:230px;padding:10px;border-radius:10px;background:rgba(10,12,16,.92);color:#e8ebf0;font:12px/1.4 system-ui,sans-serif;border:1px solid #333";
  box.innerHTML =
    "<div style='font-weight:600;margin-bottom:6px'>Header sky</div><div class='w' style='display:flex;flex-wrap:wrap;gap:4px'></div>" +
    "<div style='margin:8px 0 2px'>Sun height <b class='v'></b>°</div><input class='e' type='range' min='-30' max='60' step='1' style='width:100%'>" +
    "<button class='s' style='margin-top:6px;width:100%'>Sweep night to day</button>";
  const buttons = box.querySelector(".w");
  const slider = box.querySelector(".e");
  const label = box.querySelector(".v");
  const sweep = box.querySelector(".s");

  function apply() {
    hass.setState(weather, state.cond, { temperature: 9 });
    hass.setState("sun.sun", state.elev > 0 ? "above_horizon" : "below_horizon", { elevation: state.elev });
    slider.value = state.elev;
    label.textContent = Math.round(state.elev);
    [...buttons.children].forEach((b) => (b.style.outline = b.dataset.c === state.cond ? "2px solid #7aa8ff" : ""));
  }
  WEATHER.forEach(([cond, name]) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.dataset.c = cond;
    b.onclick = () => {
      state.cond = cond;
      apply();
    };
    buttons.appendChild(b);
  });
  slider.oninput = () => {
    clearInterval(state.sweep);
    state.sweep = 0;
    state.elev = Number(slider.value);
    apply();
  };
  sweep.onclick = () => {
    clearInterval(state.sweep);
    state.elev = -30;
    state.sweep = setInterval(() => {
      state.elev += 0.5;
      if (state.elev >= 60) {
        clearInterval(state.sweep);
        state.sweep = 0;
      }
      apply();
    }, 250);
  };
  document.body.appendChild(box);
  apply();
}
