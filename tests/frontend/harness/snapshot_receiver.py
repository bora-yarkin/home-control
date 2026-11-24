# SPDX-License-Identifier: GPL-3.0-or-later
"""Receives the snapshot of a real home that export-home.js posts from the dashboard's page, writes it to tests/frontend/harness/local/home.json (not tracked by git), and stops.

    python3 tests/frontend/harness/snapshot_receiver.py        # then run export-home.js in the dashboard's page

It listens on 127.0.0.1 only, takes one JSON body of at most 40 MB, and exits after writing it. See README.md ("Your own home")."""

import http.server
import json
import pathlib

PORT = 8768
OUT = pathlib.Path(__file__).resolve().parent / "local" / "home.json"
LIMIT = 40 * 1024 * 1024


class Handler(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > LIMIT:
            self.send_response(413)
            self._cors()
            self.end_headers()
            return
        body = self.rfile.read(length)
        try:
            json.loads(body)
        except ValueError:
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_bytes(body)
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "text/plain")
        self.end_headers()
        self.wfile.write(f"saved {len(body)} bytes\n".encode())
        print(f"saved {len(body)} bytes to {OUT}", flush=True)
        self.server.done = True

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    server.done = False
    print(f"waiting for one snapshot on http://127.0.0.1:{PORT}", flush=True)
    while not server.done:
        server.handle_request()
