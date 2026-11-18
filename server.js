// Servidor de sinalização sem dependências (Node >= 18). Serve a página e repassa offer/answer WebRTC.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const FILES = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
const page = () => fs.readFileSync(FILES.find(f => fs.existsSync(f)) || FILES[0]);
const viewers = new Map();      // id -> res (TVs / quem assiste)
let broadcaster = null;         // { id, res } (quem transmite agora)
const send = (res, o) => res.write('data: ' + JSON.stringify(o) + '\n\n');

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '').toLowerCase();

  if (u.pathname === '/events') {
    const id = (u.searchParams.get('id') || '').slice(0, 32), role = u.searchParams.get('role');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    if (role === 'broadcaster') {
      if (broadcaster) { send(broadcaster.res, { type: 'replaced' }); broadcaster.res.end(); for (const v of viewers.values()) send(v, { type: 'stop' }); }
      broadcaster = { id, res };
      for (const vid of viewers.keys()) send(res, { type: 'viewer', id: vid });
      req.on('close', () => { if (broadcaster && broadcaster.res === res) { broadcaster = null; for (const v of viewers.values()) send(v, { type: 'stop' }); } });
    } else {
      viewers.set(id, res);
      if (broadcaster) send(broadcaster.res, { type: 'viewer', id });
      req.on('close', () => { if (viewers.get(id) === res) viewers.delete(id); });
    }
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => clearInterval(ping));
    return;
  }

  if (u.pathname === '/signal' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { to, msg } = JSON.parse(body);
        const target = to === 'broadcaster' ? broadcaster && broadcaster.res : viewers.get(to);
        if (target) send(target, msg);
        res.writeHead(204).end();
      } catch { res.writeHead(400).end(); }
    });
    return;
  }

  if (u.pathname === '/ice') {
    const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (process.env.TURN_URLS) servers.push({ urls: process.env.TURN_URLS.split(',').map(x => x.trim()), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
    return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ iceServers: servers }));
  }
  if (u.pathname === '/health') return res.writeHead(200).end('ok');
  if (u.pathname === '/' || u.pathname === '/enviar' || u.pathname === '/index.html') return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
  res.writeHead(302, { Location: '/' }).end();
}).listen(PORT, () => console.log('Rodando na porta ' + PORT));
