// Self-signed HTTPS certificate for SanjivramOS on your own network, made with Node's crypto (no openssl needed).
// Browsers only allow camera/microphone/screen sharing on secure pages; plain http://192.168… is not one.
// The certificate covers localhost and this machine's current LAN addresses and is remade when those change.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* ---- minimal DER encoder ---- */
const len = n => n < 128 ? Buffer.from([n]) : (() => { const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); })();
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const seq = (...p) => tlv(0x30, ...p), set = (...p) => tlv(0x31, ...p);
const int = buf => { if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]); return tlv(0x02, buf); };
const oid = s => { const a = s.split('.').map(Number), out = [a[0] * 40 + a[1]]; for (const v of a.slice(2)) { const b = []; let x = v; do { b.unshift(x & 127); x = Math.floor(x / 128); } while (x); for (let i = 0; i < b.length - 1; i++) b[i] |= 128; out.push(...b); } return tlv(0x06, Buffer.from(out)); };
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8'));
const time = d => { const y = d.getUTCFullYear(); const s = d.toISOString().replace(/[-:T]/g, '').slice(y < 2050 ? 2 : 0, 14) + 'Z'; return tlv(y < 2050 ? 0x17 : 0x18, Buffer.from(s)); };
const bits = buf => tlv(0x03, Buffer.from([0]), buf);
const octets = buf => tlv(0x04, buf);
const ctx = (n, ...p) => tlv(0xa0 + n, ...p);
const ipBytes = ip => ip.includes(':') ? Buffer.from(ip.split(':').flatMap(() => [])) : Buffer.from(ip.split('.').map(Number));

export function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

function makeCert(ips) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const sigAlg = seq(oid('1.2.840.10045.4.3.2'));            // ecdsa-with-SHA256
  const name = seq(set(seq(oid('2.5.4.3'), utf8('SanjivramOS'))), set(seq(oid('2.5.4.10'), utf8('SanjivramOS (this phone)'))));
  const now = new Date(Date.now() - 864e5), until = new Date(Date.now() + 397 * 864e5);
  const san = seq(tlv(0x82, Buffer.from('localhost')), ...['127.0.0.1', ...ips].map(ip => tlv(0x87, ipBytes(ip))));
  const exts = ctx(3, seq(
    seq(oid('2.5.29.17'), octets(san)),                                         // subjectAltName
    seq(oid('2.5.29.19'), tlv(0x01, Buffer.from([0xff])), octets(seq())),       // basicConstraints (critical, CA:false)
    seq(oid('2.5.29.15'), tlv(0x01, Buffer.from([0xff])), octets(tlv(0x03, Buffer.from([7, 0x80])))),   // keyUsage: digitalSignature
    seq(oid('2.5.29.37'), octets(seq(oid('1.3.6.1.5.5.7.3.1')))),               // extKeyUsage: serverAuth
  ));
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const tbs = seq(ctx(0, int(Buffer.from([2]))), int(serial), sigAlg, name, seq(time(now), time(until)), name, spki, exts);
  const sig = crypto.sign('sha256', tbs, privateKey);   // DER-encoded ECDSA signature
  const der = seq(tbs, sigAlg, bits(sig));
  const pem = '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { cert: pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}

/** Returns { key, cert, ips, fingerprint } — reuses the saved one while it still covers this machine's addresses. */
export function ensureCert(dataDir) {
  const dir = path.join(dataDir, '.tls'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = n => path.join(dir, n), ips = lanIPs();
  try {
    const cert = fs.readFileSync(f('cert.pem'), 'utf8'), key = fs.readFileSync(f('key.pem'), 'utf8');
    const x = new crypto.X509Certificate(cert);
    const covered = ips.every(ip => (x.subjectAltName || '').includes('IP Address:' + ip));
    if (covered && new Date(x.validTo) - Date.now() > 30 * 864e5) return { key, cert, ips, fingerprint: x.fingerprint256 };
  } catch {}
  const c = makeCert(ips);
  fs.writeFileSync(f('cert.pem'), c.cert, { mode: 0o600 }); fs.writeFileSync(f('key.pem'), c.key, { mode: 0o600 });
  return { ...c, ips, fingerprint: new crypto.X509Certificate(c.cert).fingerprint256 };
}
