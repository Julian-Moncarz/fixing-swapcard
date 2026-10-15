# Dev only: serves dist/ on localhost so a Swapcard tab can fetch the latest bundle.
# Rebuilds the bundle on every request so edits show up on the next reload.
import http.server, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', 'https://app.swapcard.com')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def do_GET(self):
        subprocess.run(['node', os.path.join(ROOT, 'scripts/build-bundle.mjs')], capture_output=True)
        super().do_GET()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), lambda *a, **k: H(*a, directory=os.path.join(ROOT, 'dist'), **k)).serve_forever()
