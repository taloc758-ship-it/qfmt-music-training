const fs = require('fs');
const path = require('path');
const https = require('https');

function parseArgs(argv) {
  const args = { host: '0.0.0.0', port: 8443, cert: '', key: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') args.host = argv[++i] ?? args.host;
    else if (a === '--port') args.port = parseInt(argv[++i] ?? args.port, 10);
    else if (a === '--cert') args.cert = argv[++i] ?? args.cert;
    else if (a === '--key') args.key = argv[++i] ?? args.key;
  }
  return args;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml'
};

function safeResolve(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded.replace(/^\//, '');
  const fsPath = path.normalize(path.join(rootDir, rel));
  if (!fsPath.startsWith(rootDir)) return null;
  return fsPath;
}

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendFile(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range && stat.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        send(res, 416, { 'content-range': `bytes */${stat.size}` }, '');
        return;
      }

      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
        send(res, 416, { 'content-range': `bytes */${stat.size}` }, '');
        return;
      }

      res.writeHead(206, {
        'content-type': contentType,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': end - start + 1,
        'cache-control': 'public, max-age=31536000, immutable'
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    const urlPath = new URL(req.url, `https://${req.headers.host}`).pathname;
    const isServiceWorker = urlPath === '/service-worker.js';
    const isManifest = urlPath === '/manifest.webmanifest';

    res.writeHead(200, {
      'content-type': contentType,
      'content-length': stat.size,
      'cache-control': (ext === '.html' || isServiceWorker || isManifest) ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function start() {
  const { host, port, cert, key } = parseArgs(process.argv);
  if (!cert || !key) {
    console.error('Usage: node server.js --cert cert.pem --key key.pem [--host 0.0.0.0] [--port 8443]');
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname);
  const server = https.createServer(
    {
      cert: fs.readFileSync(path.resolve(cert)),
      key: fs.readFileSync(path.resolve(key))
    },
    (req, res) => {
      const urlPath = new URL(req.url, `https://${req.headers.host}`).pathname;
      const fsPath = safeResolve(rootDir, urlPath);
      if (!fsPath) {
        send(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad request');
        return;
      }

      if (urlPath === '/' || urlPath === '') {
        sendFile(req, res, path.join(rootDir, 'index.html'));
        return;
      }

      sendFile(req, res, fsPath);
    }
  );

  server.listen(port, host, () => {
    console.log(`QFMT HTTPS server running at https://${host}:${port}/`);
    console.log('Tip: use your LAN IP instead of 0.0.0.0 when opening on phone, e.g. https://192.168.1.3:8443/');
  });
}

start();
