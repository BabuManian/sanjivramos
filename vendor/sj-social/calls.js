/* SanjivramOS calls — WebRTC voice/video between everyone in a call (mesh, up to 8). The server only relays signalling.
   window.SJ_calls = { start(cid, video), join(callId, video), active }  — loaded on demand by the Social core. */
(() => {
  'use strict';
  const S = Social;
  const CSS = `
.sjc{height:100%;display:flex;flex-direction:column;background:#0b0d12;color:#f1f5f9;position:relative;overflow:hidden;font-size:14px}
.sjc button{border:none;background:none;font:inherit;color:inherit;cursor:pointer}
.sjc-top{display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:13px;color:#cbd5e1;z-index:2}
.sjc-top b{color:#fff;font-size:14px}.sjc-top .sp{flex:1}
.sjc-grid{flex:1;min-height:0;display:grid;gap:8px;padding:0 10px 10px;grid-auto-rows:1fr}
.sjc-tile{position:relative;border-radius:16px;overflow:hidden;background:#1a1f2b;display:grid;place-items:center;min-height:0;min-width:0;transition:box-shadow .2s}
.sjc-tile.talk{box-shadow:0 0 0 3px #22c55e}
.sjc-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.sjc-tile.screen video{object-fit:contain}
.sjc-tile.me video{transform:scaleX(-1)}.sjc.nomirror .sjc-tile.me video{transform:none}.sjc-tile.me.screen video{transform:none}
.sjc-tile .av{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:34px;font-weight:700;background:var(--c,#475569);overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.4)}
.sjc-tile .av img{width:100%;height:100%;object-fit:cover}
.sjc-tile.talk .av{animation:sjcTalk 1s infinite}
@keyframes sjcTalk{50%{box-shadow:0 0 0 10px rgba(34,197,94,.25)}}
.sjc-tile .nm{position:absolute;left:8px;bottom:8px;display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);backdrop-filter:blur(8px);font-size:12.5px;font-weight:600;max-width:calc(100% - 16px)}
.sjc-tile .nm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sjc-tile .nm svg{width:14px;height:14px;flex:none}.sjc-tile .nm .mut{color:#f87171}
.sjc-q{display:inline-flex;align-items:flex-end;gap:1.5px;height:12px}.sjc-q i{width:3px;background:#22c55e;border-radius:1px}.sjc-q i.off{background:rgba(255,255,255,.25)}
.sjc-tile .st{position:absolute;top:8px;left:8px;font-size:12px;padding:3px 9px;border-radius:999px;background:rgba(0,0,0,.55)}
.sjc-tile.self-pip{position:absolute;right:16px;bottom:96px;width:min(26%,220px);aspect-ratio:4/3;z-index:3;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:grab}
.sjc-bar{display:flex;justify-content:center;align-items:center;gap:10px;padding:10px 10px 16px;z-index:2;flex-wrap:wrap}
.sjc-b{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);transition:background .15s,transform .1s}
.sjc-b:hover{background:rgba(255,255,255,.2)}.sjc-b:active{transform:scale(.93)}
.sjc-b svg{width:22px;height:22px}
.sjc-b.off{background:#f1f5f9;color:#0b0d12}
.sjc-b.end{background:#ef4444;width:64px;border-radius:25px}.sjc-b.end:hover{background:#dc2626}
.sjc-b.on{background:#22c55e;color:#fff}
.sjc-note{position:absolute;left:50%;top:48px;transform:translateX(-50%);max-width:calc(100% - 30px);padding:8px 14px;border-radius:12px;background:rgba(234,179,8,.18);color:#fde68a;font-size:12.5px;z-index:4;text-align:center}
.sjc-menu{position:absolute;bottom:84px;left:50%;transform:translateX(-50%);width:min(360px,calc(100% - 24px));background:rgba(26,31,43,.97);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px;z-index:5;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.sjc-menu label{display:block;font-size:12px;color:#94a3b8;margin:8px 0 4px}
.sjc-menu select{width:100%;padding:8px;border-radius:9px;background:#0f131c;color:#fff;border:1px solid rgba(255,255,255,.1);font:inherit}
.sjc-menu .row{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px}
.sjc-wait{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#cbd5e1;pointer-events:none}
.sjc-wait .av{margin:0 auto 12px}
@media (prefers-reduced-motion:reduce){.sjc-tile.talk .av{animation:none}}`;
  if (!document.getElementById('sjc-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'sjc-css', textContent: CSS }));
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
  const person = uid => { for (const c of S.convos.values()) { const m = c.members.find(x => x.id === uid); if (m) return m; } return uid === S.me.id ? S.me : { id: uid, display: S.name(uid) }; };
  const avHtml = u => `<span class="av" style="--c:${COLORS[(u.id * 7 + String(u.username || '').length) % COLORS.length]}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : esc((u.display || '?').charAt(0).toUpperCase())}</span>`;
  const prefs = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('sjc.' + k)); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('sjc.' + k, JSON.stringify(v)); } catch {} } };

  const mp = () => { try { return JSON.parse(localStorage.getItem('sjm.prefs')) || {}; } catch { return {}; } };   // Messages → Settings → Calls
  let active = null;   // the one running call

  class Call {
    constructor(call, wantVideo) {
      this.id = call.id; this.cid = call.cid; this.call = call; this.wantVideo = wantVideo;
      this.peers = new Map(); this.local = null; this.screen = null; this.mic = true; this.cam = wantVideo; this.started = Date.now(); this.talking = new Map(); this.layout = mp().callLayout === 'speaker' ? 'speaker' : 'grid';
      this.onSocial = d => this.social(d);
      Bus.on('social', this.onSocial);
    }
    async media() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.cam = false; this.note = window.isSecureContext ? 'This browser can’t use a camera or microphone.' : 'The others can’t see or hear you: this page isn’t secure (http), so the browser blocks your camera and mic.'; return; }
      const v = this.wantVideo ? { width: { ideal: prefs.get('hd', true) ? 1280 : 640 }, height: { ideal: prefs.get('hd', true) ? 720 : 360 }, frameRate: { ideal: 30, max: 30 }, deviceId: prefs.get('cam') ? { ideal: prefs.get('cam') } : undefined, facingMode: prefs.get('cam') ? undefined : 'user' } : false;
      const a = { echoCancellation: true, noiseSuppression: mp().noiseSup !== false, autoGainControl: true, deviceId: prefs.get('mic') ? { ideal: prefs.get('mic') } : undefined };
      try { this.local = await navigator.mediaDevices.getUserMedia({ audio: a, video: v }); }
      catch (e) {
        try { this.local = await navigator.mediaDevices.getUserMedia({ audio: a }); this.cam = false; this.note = 'Camera not available — joined with audio only.'; }
        catch (e2) { this.note = 'Microphone blocked or missing (' + e2.name + '). You can still listen and watch.'; }
      }
      if (this.local) for (const t of this.local.getVideoTracks()) t.contentHint = 'motion';
      if (this.answering && mp().callCam === false && this.local) { for (const t of this.local.getVideoTracks()) t.enabled = false; if (this.local.getVideoTracks().length) this.cam = false; }
      if (this.local) this.watchLevel(S.me.id, this.local);
      if (!this.local || !this.local.getVideoTracks().length) this.cam = false;   // tell the others honestly, so they don't wait for a picture
    }
    async open() {
      // signals that arrive while the camera is still starting must wait for it — otherwise the connection is
      // built without our camera and the other person never sees us (the "one-way video" bug)
      this.mediaReady = this.media().then(() => { this.mediaDone = true; for (const p of this.peers.values()) this.attachLocal(p); });
      await this.mediaReady;
      this.win = WM.open('sjcall', { callObj: this });
      this.sync(this.call);
      this.statsT = setInterval(() => this.stats(), 2000);
      this.media2server();
    }
    media2server() { S.fire('call.media', { id: this.id, mic: this.mic, cam: this.cam, screen: !!this.screen }); }
    social(d) {
      if (d.t === 'call.state' && d.call.id === this.id) this.sync(d.call);
      else if (d.t === 'call.signal' && d.id === this.id) this.signal(d.from, d.data);
      else if (d.t === 'call.end' && d.call.id === this.id) { Toast.show('Call ended', S.convoTitle(S.convos.get(this.cid)), 'phone', 2500); this.end(false); }
      else if (d.t === 'call.media' && d.id === this.id) { const p = this.peers.get(d.uid); if (p) { p.mic = d.mic; p.cam = d.cam; p.screen = d.screen; this.render(); } }
      else if (d.t === 'ready' && this.id) { S.req('call.join', { id: this.id }).then(r => { if (r.error) this.end(false); else { for (const p of this.peers.values()) try { p.pc.restartIce(); } catch {} } }); }
    }
    sync(call) {
      this.call = call;
      if (this.mediaReady && !this.mediaDone) { this.mediaReady.then(() => this.sync(this.call)); return; }   // wait for our camera/mic first
      const want = new Set(call.people.filter(u => u !== S.me.id));
      for (const uid of want) if (!this.peers.has(uid)) this.addPeer(uid);
      if (this.early && this.early.length) { const q = this.early.splice(0).filter(x => Date.now() - x.at < 20000); for (const x of q) if (want.has(x.uid)) this.signal(x.uid, x.data); else this.early.push(x); }
      for (const uid of [...this.peers.keys()]) if (!want.has(uid)) this.dropPeer(uid);
      if (!this.connectedOnce && this.peers.size) { this.connectedOnce = true; }
      this.render(); this.adapt();
    }
    addPeer(uid) {
      const pc = new RTCPeerConnection({ iceServers: S.ice || [], bundlePolicy: 'max-bundle' });
      const p = { uid, pc, polite: S.me.id > uid, makingOffer: false, ignore: false, stream: new MediaStream(), mic: true, cam: true, quality: 3, lostT: null, pendingIce: [] };
      this.peers.set(uid, p);
      if (this.local) for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
      // always be able to receive both, even if we send nothing
      if (!this.local || !this.local.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
      if (!this.local || !this.local.getVideoTracks().length) pc.addTransceiver('video', { direction: this.screen ? 'sendrecv' : 'recvonly' });
      if (this.screen) { const tr = pc.getTransceivers().find(t => t.receiver.track.kind === 'video'); if (tr) { tr.direction = 'sendrecv'; tr.sender.replaceTrack(this.screen.getVideoTracks()[0]); } }
      pc.ontrack = e => { if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track); e.track.onunmute = () => this.render(); this.render(); if (e.track.kind === 'audio') this.watchLevel(uid, p.stream); };
      pc.onicecandidate = e => { if (e.candidate) S.fire('call.signal', { id: this.id, to: uid, data: { candidate: e.candidate.toJSON() } }); };
      pc.onnegotiationneeded = async () => {
        try { p.makingOffer = true; await pc.setLocalDescription(); S.fire('call.signal', { id: this.id, to: uid, data: { sdp: pc.localDescription.toJSON() } }); }
        catch (e) { console.warn('offer', e); } finally { p.makingOffer = false; }
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState; p.state = s; this.render();
        clearTimeout(p.lostT);
        if (s === 'failed') { try { pc.restartIce(); } catch {} }
        if (s === 'disconnected') p.lostT = setTimeout(() => { if (pc.connectionState === 'disconnected') try { pc.restartIce(); } catch {} }, 4000);
        if (s === 'connected') { p.connAt = p.connAt || Date.now(); this.adapt(); }
      };
      return p;
    }
    /** make sure every local track is being sent to this person (safety net for connections made before the camera was ready) */
    attachLocal(p) {
      if (!this.local) return;
      for (const t of this.local.getTracks()) {
        if (p.pc.getSenders().some(s => s.track === t)) continue;
        if (t.kind === 'video' && this.screen) continue;
        const tr = p.pc.getTransceivers().find(x => x.receiver.track.kind === t.kind && !x.sender.track);
        if (tr) { if (tr.direction === 'recvonly' || tr.direction === 'inactive') tr.direction = 'sendrecv'; tr.sender.replaceTrack(t).catch(() => {}); }
        else try { p.pc.addTrack(t, this.local); } catch {}
      }
    }
    async signal(uid, data) {
      if (this.mediaReady) await this.mediaReady;
      let p = this.peers.get(uid);
      if (!p) {
        // an offer can arrive before the server's call.state lists that person — keep it instead of dropping it
        if (!this.call.people.includes(uid)) { (this.early = this.early || []).push({ uid, data, at: Date.now() }); return; }
        p = this.addPeer(uid);
      }
      const pc = p.pc;
      try {
        if (data.sdp) {
          const collision = data.sdp.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
          p.ignore = !p.polite && collision;
          if (p.ignore) return;
          await pc.setRemoteDescription(data.sdp);
          for (const c of p.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          if (data.sdp.type === 'offer') { await pc.setLocalDescription(); S.fire('call.signal', { id: this.id, to: uid, data: { sdp: pc.localDescription.toJSON() } }); }
        } else if (data.fix) {
          const vt = this.screen ? this.screen.getVideoTracks()[0] : this.local && this.local.getVideoTracks()[0];
          if (vt) {
            const tr = pc.getTransceivers().find(t => (t.sender.track && t.sender.track.kind === 'video') || t.receiver.track.kind === 'video');
            if (tr) { if (tr.direction === 'recvonly' || tr.direction === 'inactive') tr.direction = 'sendrecv'; await tr.sender.replaceTrack(vt); } else pc.addTrack(vt, this.local);
          } else this.toast2('The other person can’t see you: this device has no camera access. ' + (S.insecure && S.insecure() ? 'Use the secure address (⋯ menu).' : ''));
          try { pc.restartIce(); } catch {}
        } else if (data.candidate) {
          if (!pc.remoteDescription) { p.pendingIce.push(data.candidate); return; }
          try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!p.ignore) throw e; }
        }
      } catch (e) { console.warn('signal', e); }
    }
    dropPeer(uid) { const p = this.peers.get(uid); if (!p) return; clearTimeout(p.lostT); try { p.pc.close(); } catch {} this.peers.delete(uid); this.talking.delete(uid); this.render(); }
    /* active-speaker detection: audio level per person */
    watchLevel(uid, stream) {
      try {
        this.ac = this.ac || new AudioContext();
        if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
        const src = this.ac.createMediaStreamSource(stream), an = this.ac.createAnalyser(); an.fftSize = 256; src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        (this.meters = this.meters || []).push(() => { an.getByteFrequencyData(buf); let s = 0; for (let i = 2; i < 40; i++) s += buf[i]; return [uid, s / 38]; });
        if (!this.meterT) this.meterT = setInterval(() => {
          let changed = false;
          for (const m of this.meters) { const [u, lvl] = m(); const on = lvl > 22 && !(u === S.me.id && !this.mic); if (on !== !!this.talking.get(u)) { this.talking.set(u, on); changed = true; } }
          if (changed) this.paintTalk();
        }, 150);
      } catch {}
    }
    paintTalk() { if (!this.el) return; for (const t of this.el.querySelectorAll('.sjc-tile')) t.classList.toggle('talk', !!this.talking.get(+t.dataset.uid)); }
    /* quality: bitrate cap by number of peers, backed off when packets are lost */
    async adapt() {
      const n = Math.max(1, this.peers.size), cap = this.screen ? 2500000 : n === 1 ? (prefs.get('hd', true) ? 2500000 : 900000) : n <= 3 ? 1000000 : 450000;
      for (const p of this.peers.values()) for (const s of p.pc.getSenders()) {
        if (!s.track || s.track.kind !== 'video') continue;
        try { const prm = s.getParameters(); if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}]; const target = Math.round(cap * (p.quality >= 3 ? 1 : p.quality === 2 ? .6 : .35)); prm.encodings[0].maxBitrate = target; prm.encodings[0].scaleResolutionDownBy = p.quality <= 1 && !this.screen ? 2 : 1; prm.degradationPreference = this.screen ? 'maintain-resolution' : 'balanced'; await s.setParameters(prm); } catch {}
      }
    }
    async stats() {
      for (const p of this.peers.values()) {
        try {
          const rep = await p.pc.getStats(); let rtt = null, lost = 0, recv = 0, frames = 0;
          rep.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000;
            if (r.type === 'inbound-rtp') { lost += r.packetsLost || 0; recv += r.packetsReceived || 0; if (r.kind === 'video' || r.mediaType === 'video') frames += r.framesDecoded || 0; }
          });
          const dl = lost - (p.lastLost || 0), dr = recv - (p.lastRecv || 0); p.lastLost = lost; p.lastRecv = recv;
          const lossPct = dr + dl > 0 ? dl / (dr + dl) * 100 : 0;
          const q = p.pc.connectionState !== 'connected' ? 0 : (rtt > 400 || lossPct > 8) ? 1 : (rtt > 180 || lossPct > 2) ? 2 : 3;
          p.rtt = rtt; p.loss = lossPct;
          // one-way video fix: they say their camera is on, we're connected, but no new frames for 6 s → renegotiate
          const gotFrames = frames > (p.frames || 0); p.frames = frames; if (gotFrames) { p.lastFrame = Date.now(); p.hadVideo = true; }
          if ((p.cam || p.screen) && p.pc.connectionState === 'connected' && Date.now() - (p.lastFrame || p.connAt || Date.now()) > 6000 && Date.now() - (p.fixAt || 0) > 15000) {
            p.fixAt = Date.now(); console.warn('[call] no video from', p.uid, '— renegotiating');
            S.fire('call.signal', { id: this.id, to: p.uid, data: { fix: 1 } });
            try { p.pc.restartIce(); } catch {}
          }
          if (gotFrames && p.noVid) { p.noVid = false; this.render(); }
          if (q !== p.quality) { p.quality = q; this.adapt(); }
        } catch {}
      }
      this.render(true);
    }
    /* controls */
    toggleMic() { this.mic = !this.mic; if (this.local) this.local.getAudioTracks().forEach(t => t.enabled = this.mic); this.media2server(); this.render(); }
    async toggleCam() {
      if (!this.local) return;
      let vt = this.local.getVideoTracks()[0];
      if (!vt) {
        try { const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: prefs.get('cam') ? { ideal: prefs.get('cam') } : undefined } }); vt = s.getVideoTracks()[0]; this.local.addTrack(vt); for (const p of this.peers.values()) { const tr = p.pc.getTransceivers().find(t => t.receiver.track.kind === 'video'); if (tr && !this.screen) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(vt); } else p.pc.addTrack(vt, this.local); } this.cam = true; }
        catch (e) { Toast.show('Camera', 'Couldn’t start the camera: ' + e.name, 'video'); return; }
      } else { this.cam = !this.cam; vt.enabled = this.cam; }
      this.media2server(); this.render(); this.adapt();
    }
    async switchCam() {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); if (cams.length < 2 || !this.local) return Toast.show('Camera', 'Only one camera found.', 'video', 1800);
      const cur = this.local.getVideoTracks()[0], curId = cur && cur.getSettings().deviceId, next = cams[(cams.findIndex(c => c.deviceId === curId) + 1) % cams.length];
      await this.useCam(next.deviceId);
    }
    async useCam(id) {
      prefs.set('cam', id);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } }), nt = s.getVideoTracks()[0];
        const old = this.local.getVideoTracks()[0]; if (old) { this.local.removeTrack(old); old.stop(); } nt.enabled = this.cam; this.local.addTrack(nt);
        if (!this.screen) for (const p of this.peers.values()) { const snd = p.pc.getSenders().find(x => x.track && x.track.kind === 'video') || p.pc.getTransceivers().find(t => t.receiver.track.kind === 'video').sender; await snd.replaceTrack(nt); }
        this.render();
      } catch (e) { Toast.show('Camera', e.message, 'video'); }
    }
    async useMic(id) {
      prefs.set('mic', id);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }), nt = s.getAudioTracks()[0];
        const old = this.local.getAudioTracks()[0]; if (old) { this.local.removeTrack(old); old.stop(); } nt.enabled = this.mic; this.local.addTrack(nt);
        for (const p of this.peers.values()) { const snd = p.pc.getSenders().find(x => x.track && x.track.kind === 'audio'); if (snd) await snd.replaceTrack(nt); }
      } catch (e) { Toast.show('Microphone', e.message, 'mic'); }
    }
    async useSpeaker(id) { prefs.set('spk', id); for (const v of (this.audios || new Map()).values()) if (v.setSinkId) v.setSinkId(id).catch(() => {}); }
    async toggleScreen() {
      if (this.screen) return this.stopScreen();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return Toast.show('Screen sharing', window.isSecureContext ? 'This browser can’t share the screen (phones usually can’t).' : 'Screen sharing needs a secure page (localhost or https).', 'screen', 5000);
      try { this.screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true }); }
      catch { return; }
      const st = this.screen.getVideoTracks()[0]; st.contentHint = 'detail';
      st.onended = () => this.stopScreen();
      for (const p of this.peers.values()) {
        const snd = p.pc.getSenders().find(x => x.track && x.track.kind === 'video');
        if (snd) await snd.replaceTrack(st);
        else { const tr = p.pc.getTransceivers().find(t => t.receiver.track.kind === 'video'); if (tr) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(st); } }
      }
      this.media2server(); this.render(); this.adapt();
    }
    async stopScreen() {
      if (!this.screen) return; this.screen.getTracks().forEach(t => t.stop()); this.screen = null;
      const cam = this.local && this.local.getVideoTracks()[0];
      for (const p of this.peers.values()) { const tr = p.pc.getTransceivers().find(t => t.sender.track && t.sender.track.kind === 'video') || p.pc.getTransceivers().find(t => t.receiver.track.kind === 'video'); if (tr) await tr.sender.replaceTrack(cam || null); }
      this.media2server(); this.render(); this.adapt();
    }
    async pip() {
      const vids = [...(this.el ? this.el.querySelectorAll('.sjc-tile:not(.me) video') : [])].filter(v => v.srcObject && v.srcObject.getVideoTracks().length);
      const v = vids.find(x => x.closest('.talk')) || vids[0];
      if (!v || !document.pictureInPictureEnabled) return Toast.show('Picture-in-picture', 'Nobody is showing video yet, or this browser doesn’t support it.', 'video', 2500);
      try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch {}
    }
    /* UI */
    mount(win) {
      this.win = win;
      win.body.innerHTML = `<div class="sjc"><div class="sjc-top"><b class="t"></b><span class="dur">0:00</span><span class="sp"></span><button class="lay" title="Switch layout">▦</button></div><div class="sjc-grid"></div><div class="sjc-bar"></div></div>`;
      this.el = win.body.querySelector('.sjc');
      this.el.classList.toggle('nomirror', mp().mirror === false);
      this.el.querySelector('.lay').onclick = () => { this.layout = this.layout === 'grid' ? 'speaker' : 'grid'; this.render(); };
      win.every(() => { const s = Math.floor((Date.now() - this.started) / 1000); const d = this.el && this.el.querySelector('.dur'); if (d) d.textContent = fmtTime(s); }, 1000);
      win.onClose = () => { if (active === this) this.end(true); };
      win.onKey = e => { if (e.key === 'm' && !isTyping(e.target)) { this.toggleMic(); return true; } };
      this.render();
    }
    render(statsOnly) {
      if (!this.el) return;
      const c = S.convos.get(this.cid), title = S.convoTitle(c);
      this.el.querySelector('.t').textContent = title;
      if (this.win) this.win.setTitle(`${this.call.video ? 'Video' : 'Voice'} call — ${title}`);
      const grid = this.el.querySelector('.sjc-grid');
      const tiles = [{ uid: S.me.id, me: true, stream: this.screen || this.local, mic: this.mic, cam: this.screen ? true : this.cam, screen: !!this.screen }].concat([...this.peers.values()].map(p => ({ uid: p.uid, stream: p.stream, mic: p.mic, cam: p.cam || p.screen, screen: p.screen, quality: p.quality, state: p.state, rtt: p.rtt })));
      if (statsOnly) { for (const t of tiles) { const q = grid.querySelector(`.sjc-tile[data-uid="${t.uid}"] .sjc-q`); if (q) q.outerHTML = this.bars(t); } return; }
      const n = tiles.length, solo = n === 1, speakerMode = this.layout === 'speaker' && n > 2;
      const cols = n <= 2 ? 1 : n <= 4 ? 2 : 3;   // with 2 people your own camera floats in the corner
      grid.style.gridTemplateColumns = speakerMode ? '1fr' : `repeat(${cols},1fr)`;
      // keep <video> elements alive between renders so playback never blinks
      this.videos = this.videos || new Map();
      const keep = new Set();
      grid.innerHTML = '';
      const order = speakerMode ? tiles.slice().sort((a, b) => (this.talking.get(b.uid) ? 1 : 0) - (this.talking.get(a.uid) ? 1 : 0)) : tiles;
      order.forEach((t, i) => {
        const pp = !t.me && this.peers.get(t.uid), u = person(t.uid), hasVid = t.stream && t.stream.getVideoTracks().some(x => x.readyState === 'live' && (!x.muted || (pp && pp.hadVideo))) && t.cam;
        const el = h(`<div class="sjc-tile${t.me ? ' me' : ''}${t.screen ? ' screen' : ''}${this.talking.get(t.uid) ? ' talk' : ''}${t.me && n === 2 && !speakerMode ? ' self-pip' : ''}" data-uid="${t.uid}">${hasVid ? '' : avHtml(u)}
          ${!t.me && t.state && t.state !== 'connected' ? `<span class="st">${t.state === 'new' || t.state === 'connecting' ? 'Connecting…' : t.state === 'disconnected' ? 'Reconnecting…' : t.state === 'failed' ? 'Connection failed — retrying' : ''}</span>` : ''}
          <div class="nm">${t.mic ? '' : `<svg class="mut" viewBox="0 0 24 24">${ICONS.mutemic}</svg>`}<span>${esc(t.me ? 'You' + (t.screen ? ' (sharing screen)' : '') : u.display)}</span>${t.me ? '' : this.bars(t)}</div></div>`);
        if (t.stream) {
          let v = this.videos.get(t.uid);
          if (!v) { v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.muted = true; this.videos.set(t.uid, v); }
          if (v.srcObject !== t.stream) v.srcObject = t.stream;
          if (!t.me) this.audioFor(t.uid, t.stream);
          v.style.display = hasVid ? '' : 'none';
          el.prepend(v); v.play().catch(() => {});
          keep.add(t.uid);
        }
        grid.appendChild(el);
        if (speakerMode && i > 0) el.style.display = i < 1 ? '' : 'none';
      });
      if (speakerMode) { const strip = h(`<div style="display:flex;gap:6px;height:90px">${''}</div>`); order.slice(1).forEach(t => { const tile = grid.querySelector(`.sjc-tile[data-uid="${t.uid}"]`); tile.style.display = ''; tile.style.flex = '1'; strip.appendChild(tile); }); grid.style.gridTemplateRows = '1fr 90px'; grid.appendChild(strip); } else grid.style.gridTemplateRows = '';
      for (const [uid, v] of this.videos) if (!keep.has(uid)) { v.srcObject = null; this.videos.delete(uid); const a = this.audios && this.audios.get(uid); if (a) { a.srcObject = null; a.remove(); this.audios.delete(uid); } }
      if (this.soundBlocked && !this.el.querySelector('.sjc-unmute')) { const b = h(`<button class="sjc-note sjc-unmute" style="pointer-events:auto;cursor:pointer;top:auto;bottom:90px;background:rgba(59,130,246,.9);color:#fff">🔊 Tap to turn on call sound</button>`); b.onclick = () => this.unblockSound(); this.el.appendChild(b); }
      if (solo && !this.peers.size) {
        const ring = this.call.ringing.length;
        grid.appendChild(h(`<div class="sjc-wait">${''}<div>${avHtml(S.convoOther(c) || { id: 0, display: title })}<b style="display:block;font-size:18px;color:#fff">${esc(title)}</b>${ring ? 'Ringing…' : 'Waiting for others to join…'}</div></div>`));
      }
      if (this.note && !this.noteShown) {
        this.noteShown = true;
        const sec = S.insecure && S.insecure();
        const nEl = h(`<div class="sjc-note" style="pointer-events:auto">${esc(this.note)}${sec ? ' <button data-sec style="margin-left:6px;padding:3px 10px;border-radius:999px;background:#fde68a;color:#111;font-weight:600">Fix: use secure address</button>' : ''} <button data-x style="margin-left:4px;opacity:.8">✕</button></div>`);
        nEl.onclick = e => { if (e.target.closest('[data-x]')) nEl.remove(); if (e.target.closest('[data-sec]')) { const id = this.id, v = this.wantVideo; S.goSecure('So the others can see and hear you.', `&calljoin=${id}&video=${v ? 1 : 0}`).then(ok => { if (ok) this.end(true); }); } };
        this.el.appendChild(nEl); if (!sec) setTimeout(() => nEl.remove(), 12000);
      }
      const bar = this.el.querySelector('.sjc-bar');
      bar.innerHTML = `<button class="sjc-b${this.mic ? '' : ' off'}" data-c="mic" title="${this.mic ? 'Mute (M)' : 'Unmute (M)'}">${svg(this.mic ? 'mic' : 'mutemic')}</button>
        <button class="sjc-b${this.cam ? '' : ' off'}" data-c="cam" title="${this.cam ? 'Turn camera off' : 'Turn camera on'}">${svg(this.cam ? 'video' : 'videooff')}</button>
        <button class="sjc-b${this.screen ? ' on' : ''}" data-c="screen" title="${this.screen ? 'Stop sharing' : 'Share your screen or a window'}">${svg('screen')}</button>
        <button class="sjc-b" data-c="more" title="Devices & settings">⋯</button>
        <button class="sjc-b end" data-c="end" title="Leave call">${svg('hangup')}</button>`;
      bar.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; ({ mic: () => this.toggleMic(), cam: () => this.toggleCam(), screen: () => this.toggleScreen(), more: () => this.menu(), end: () => this.end(true) })[b.dataset.c](); };
      this.paintTalk();
    }
    /* one hidden <audio> per person: the browser may refuse to autoplay sound (e.g. right after switching to https),
       which used to freeze their whole video. Now only the sound waits for a tap; the picture always plays. */
    audioFor(uid, stream) {
      this.audios = this.audios || new Map();
      let a = this.audios.get(uid);
      if (!a) { a = document.createElement('audio'); a.autoplay = true; a.style.display = 'none'; (this.el || document.body).appendChild(a); this.audios.set(uid, a); if (prefs.get('spk') && a.setSinkId) a.setSinkId(prefs.get('spk')).catch(() => {}); }
      if (a.srcObject !== stream) a.srcObject = stream;
      if (a.paused) a.play().then(() => { if (this.soundBlocked) { this.soundBlocked = false; const b = this.el && this.el.querySelector('.sjc-unmute'); if (b) b.remove(); } }).catch(() => {
        if (this.soundBlocked) return; this.soundBlocked = true; this.render();
        const once = () => { removeEventListener('pointerdown', once, true); this.unblockSound(); }; addEventListener('pointerdown', once, true);
      });
    }
    unblockSound() {
      this.soundBlocked = false; const b = this.el && this.el.querySelector('.sjc-unmute'); if (b) b.remove();
      for (const a of (this.audios || new Map()).values()) a.play().catch(() => {});
      for (const v of (this.videos || new Map()).values()) v.play().catch(() => {});
      if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    }
    toast2(t) { if (this._t2 && Date.now() - this._t2 < 20000) return; this._t2 = Date.now(); Toast.show('Call', t, 'video', 7000); }
    bars(t) { const q = t.quality == null ? 3 : t.quality; return `<span class="sjc-q" title="${q >= 3 ? 'Good' : q === 2 ? 'OK' : q === 1 ? 'Poor' : 'No'} connection${t.rtt ? ` · ${Math.round(t.rtt)} ms` : ''}">${[1, 2, 3].map(i => `<i class="${q >= i ? '' : 'off'}" style="height:${i * 4}px"></i>`).join('')}</span>`; }
    async menu() {
      const old = this.el.querySelector('.sjc-menu'); if (old) return old.remove();
      const devs = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? await navigator.mediaDevices.enumerateDevices() : [];
      const opt = (kind, cur) => devs.filter(d => d.kind === kind).map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label || `${kind === 'audioinput' ? 'Microphone' : kind === 'videoinput' ? 'Camera' : 'Speaker'} ${i + 1}`)}</option>`).join('');
      const curMic = this.local && this.local.getAudioTracks()[0] && this.local.getAudioTracks()[0].getSettings().deviceId, curCam = this.local && this.local.getVideoTracks()[0] && this.local.getVideoTracks()[0].getSettings().deviceId;
      const m = h(`<div class="sjc-menu"><label>Microphone</label><select data-k="mic">${opt('audioinput', curMic)}</select><label>Camera</label><select data-k="cam">${opt('videoinput', curCam) || '<option>None</option>'}</select>${'setSinkId' in HTMLMediaElement.prototype ? `<label>Speaker</label><select data-k="spk">${opt('audiooutput', prefs.get('spk'))}</select>` : ''}
        <div class="row"><input type="checkbox" id="sjc-hd" ${prefs.get('hd', true) ? 'checked' : ''}><label for="sjc-hd" style="margin:0;color:#e2e8f0">HD video (720p) — turn off on slow Wi-Fi</label></div>
        <div class="row" style="flex-wrap:wrap"><button class="sjc-b" style="width:auto;padding:0 14px;border-radius:999px;height:36px" data-x="flip">${svg('camera')} Switch camera</button><button class="sjc-b" style="width:auto;padding:0 14px;border-radius:999px;height:36px" data-x="pip">Picture-in-picture</button><button class="sjc-b" style="width:auto;padding:0 14px;border-radius:999px;height:36px" data-x="fs">Fullscreen</button><button class="sjc-b" style="width:auto;padding:0 14px;border-radius:999px;height:36px" data-x="chat">Open chat</button></div></div>`);
      this.el.appendChild(m);
      m.onchange = e => { const k = e.target.dataset.k; if (k === 'mic') this.useMic(e.target.value); if (k === 'cam') this.useCam(e.target.value); if (k === 'spk') this.useSpeaker(e.target.value); if (e.target.id === 'sjc-hd') { prefs.set('hd', e.target.checked); this.adapt(); } };
      m.onclick = e => { const b = e.target.closest('[data-x]'); if (!b) return; m.remove(); ({ flip: () => this.switchCam(), pip: () => this.pip(), fs: () => WM.fullscreen(this.win), chat: () => WM.open('messages', { cid: this.cid }) })[b.dataset.x](); };
    }
    end(tellServer) {
      if (this.ended) return; this.ended = true;
      if (tellServer) S.req('call.leave', { id: this.id });
      Bus.off && Bus.off('social', this.onSocial);
      this.onSocial = () => {};
      clearInterval(this.statsT); clearInterval(this.meterT);
      for (const p of this.peers.values()) try { p.pc.close(); } catch {}
      this.peers.clear();
      for (const s of [this.local, this.screen]) if (s) s.getTracks().forEach(t => t.stop());
      if (this.ac) this.ac.close().catch(() => {});
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
      if (active === this) active = null;
      if (this.win && WM.wins.has(this.win.id)) { this.win.onClose = null; WM.close(this.win, true); }
    }
  }

  Apps.register({
    id: 'sjcall', name: 'Call', icon: 'phone', color: 'linear-gradient(135deg,#22c55e,#0ea5e9)', hidden: true, width: 720, height: 520, minWidth: 300, minHeight: 260,
    findExisting() { return WM.windowsOf('sjcall')[0] || null; },
    launch(win, args) { if (args && args.callObj) args.callObj.mount(win); else win.body.innerHTML = '<div class="app-error">No call.</div>'; },
  });

  async function begin(r, video, answering) {
    if (r.error) { Toast.show('Call', r.error, 'phone'); return null; }
    if (active) { if (active.id === r.call.id) { WM.focus(active.win); return active; } active.end(true); }
    active = new Call(r.call, video); active.answering = !!answering;
    await active.open();
    return active;
  }
  window.SJ_calls = {
    async start(cid, video) {
      if (active && active.cid === cid) { WM.focus(active.win); return active; }
      if (!S.ready) return Toast.show('Call', 'Messages isn’t connected yet.', 'phone');
      return begin(await S.req('call.start', { cid, video: !!video }), !!video);
    },
    async join(id, video) { return begin(await S.req('call.join', { id }), !!video, true); },
    get active() { return active; },
  };
})();
