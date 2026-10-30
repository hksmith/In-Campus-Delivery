#!/usr/bin/env python3
"""
Receipt relay for a server INSIDE Ethiopia (e.g. a TeleCloud VPS). Needs only Python 3 – nothing to install.

Why: transactioninfo.ethiotelecom.et (Telebirr) and apps.cbe.com.et (CBE) block servers abroad
(Render, Railway…). The backend asks this relay to fetch the official receipt for it.

It does the same job as receipt-relay.php:
  GET /?key=SECRET&url=https://transactioninfo.ethiotelecom.et/receipt/ABC1234567
Only the two official receipt addresses are allowed, so it can't be used as an open proxy.

Privacy: receipts only pass through memory – nothing is saved to disk, and the relay writes
NO logs at all (no requests, no errors). The service file also sends any output to /dev/null.

Settings come from environment variables (see receipt-relay.service):
  RELAY_KEY   the secret (same value as VERIFY_RELAY_KEY on Render) – REQUIRED
  RELAY_PORT  port to listen on (default 8088)
"""
import hmac
import os
import re
import ssl
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

RELAY_KEY = os.environ.get("RELAY_KEY", "")
PORT = int(os.environ.get("RELAY_PORT", "8088"))
TIMEOUT = 25
MAX_BYTES = 5 * 1024 * 1024

ALLOWED = [
    re.compile(r"^https://transactioninfo\.ethiotelecom\.et/receipt/[A-Z0-9]{8,14}$"),
    re.compile(r"^https://apps\.cbe\.com\.et:100/\?id=FT[A-Z0-9]{10}[0-9]{8}$"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "text/html,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,am;q=0.8",
}


def fetch(url, insecure=False):
    ctx = ssl.create_default_context()
    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as res:
            return res.status, res.headers.get("Content-Type", "application/octet-stream"), res.read(MAX_BYTES)
    except urllib.error.HTTPError as err:  # 404 etc. – pass the status on to the backend
        return err.code, err.headers.get("Content-Type", "text/plain"), err.read(MAX_BYTES)


class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, ctype="text/plain; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        key = (q.get("key") or [""])[0]
        url = (q.get("url") or [""])[0]

        if not hmac.compare_digest(RELAY_KEY.encode(), key.encode()):
            return self.send(403, "forbidden")
        if not any(p.match(url) for p in ALLOWED):
            return self.send(400, "url not allowed")

        try:
            status, ctype, body = fetch(url)
        except Exception as err:
            # CBE's server is known to send an incomplete certificate chain – retry without
            # verification ONLY for CBE (the backend still cross-checks the receipt contents).
            if "apps.cbe.com.et" in url:
                try:
                    status, ctype, body = fetch(url, insecure=True)
                except Exception as err2:
                    return self.send(502, "upstream error: %s" % err2)
            else:
                return self.send(502, "upstream error: %s" % err)
        self.send(status or 200, body, ctype)

    def log_message(self, fmt, *args):
        pass  # silent: no request or error logs, ever


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # silent: don't print errors (they could contain receipt links)


if __name__ == "__main__":
    if len(RELAY_KEY) < 16:
        sys.exit(1)  # RELAY_KEY must be at least 16 characters (exits silently)
    Server(("0.0.0.0", PORT), Handler).serve_forever()
