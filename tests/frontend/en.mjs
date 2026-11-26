// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's own English text lookup, for tests that run files which ask for it.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../../custom_components/home_control/frontend/app/strings.js", import.meta.url), "utf8"), context);

export const _T = (key, vars) => context._T(key, vars);
