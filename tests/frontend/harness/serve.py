# SPDX-License-Identifier: GPL-3.0-or-later
"""Serves the repository for the harness. The panel loads about fifty files at once, which the plain `python3 -m http.server` (a queue of five
waiting connections) drops now and then; this one waits for many more. Run it from anywhere: python3 tests/frontend/harness/serve.py"""

import functools
import http.server
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]


# Where a plus integration's script is served from on a real box: /<domain>_static/. Here a sibling checkout of Hue Plus stands in for it, when there is one.
PLUGINS = {"/hue_plus_static/": ROOT.parent / "hue-plus" / "custom_components" / "hue_plus" / "frontend"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        for prefix, folder in PLUGINS.items():
            if path.startswith(prefix):
                return str(folder / path[len(prefix) :].split("?")[0])
        return super().translate_path(path)


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    print("http://localhost:8765/tests/frontend/harness/index.html")
    Server(("127.0.0.1", 8765), handler).serve_forever()
