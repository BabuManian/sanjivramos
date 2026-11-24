/* SanjivramOS Messages — lazy-loaded UI for the Social core in index.html (window.SJ_messages).
   Uses the OS's own helpers (h, esc, svg, Toast, Dialog, ContextMenu, WM, Bus, Store) so it looks and behaves native. */
(() => {
  'use strict';
  const S = Social;
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899'];
  const colorOf = u => COLORS[(((u && u.id) || 0) * 7 + String((u && u.username) || '').length) % COLORS.length];
  const av = (u, size = '', dot = true) => u ? `<span class="sjm-av ${size}" style="--c:${colorOf(u)}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" loading="lazy">` : esc((u.display || u.username || '?').trim().charAt(0).toUpperCase())}${dot && u.online ? '<i class="dot"></i>' : ''}</span>` : '';
  const convoAv = (c, size = '') => { if (!c) return ''; if (c.kind === 'dm') return av(S.convoOther(c) || {}, size); return c.avatar ? `<span class="sjm-av ${size}"><img src="${esc(c.avatar)}" alt=""></span>` : `<span class="sjm-av grp ${size}">${svg('users')}</span>`; };
  const ago = t => { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const clock = t => { let c24 = false; try { c24 = (JSON.parse(localStorage.getItem('sjm.prefs')) || {}).clock24; } catch {} return fmtDT(new Date(t), c24 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { hour: 'numeric', minute: '2-digit' }); };
  const listTime = t => { if (!t) return ''; const d = new Date(t), n = new Date(); if (d.toDateString() === n.toDateString()) return clock(t); const y = new Date(n - 864e5); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return (n - d) < 6 * 864e5 ? fmtDT(d, { weekday: 'short' }) : fmtDT(d, { month: 'short', day: 'numeric' }); };
  const dayLabel = t => { const d = new Date(t), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Today'; if (d.toDateString() === new Date(n - 864e5).toDateString()) return 'Yesterday'; return fmtDT(d, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); };
  const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('sjm.' + k)); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('sjm.' + k, JSON.stringify(v)); } catch {} } };
  const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  const linkify = t => esc(t).replace(URL_RE, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/(^|\s)@([a-zA-Z0-9_.]{3,24})/g, '$1<b>@$2</b>');
  const onlyEmoji = t => { const s = t.trim(); return s && [...s].length <= 8 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s) && !/^[\d#*\s]+$/.test(s); };
  const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  /* ---------- customisation: preferences (per browser) + shared chat themes ---------- */
  const PREF_DEF = { outColor: '', outText: '', inColor: '', inText: '', bubble: 'round', tails: true, textSize: 15, density: 'cozy', wall: 'none', wallImg: '', wallDim: 25, avatars: true, names: true, clock24: false, bigEmoji: true, enterSend: true, previews: true, autoplayGif: true, chatThemes: true, sideRight: false, soundOn: true, sound: 'pop', ringtone: 'classic', notifPreview: true, callCam: true, mirror: true, callLayout: 'grid', noiseSup: true, quickEmoji: '❤️', font: 'system' };
  const P = () => Object.assign({}, PREF_DEF, store.get('prefs', {}));
  const setP = patch => { store.set('prefs', Object.assign(store.get('prefs', {}), patch)); };
  const BUBBLE_R = { round: '20px', soft: '13px', square: '5px', pill: '26px' };
  const FONTS = { system: 'inherit', rounded: '"Nunito","Varela Round",ui-rounded,system-ui,sans-serif', serif: 'Georgia,"Noto Serif",serif', mono: 'var(--mono)', comic: '"Comic Neue","Comic Sans MS",cursive' };
  const WALLS = {
    none: ['Plain', ''], aurora: ['Aurora', 'linear-gradient(135deg,#1e3a8a,#7c3aed 55%,#db2777)'], sunset: ['Sunset', 'linear-gradient(160deg,#f97316,#db2777 50%,#4c1d95)'],
    ocean: ['Ocean', 'linear-gradient(180deg,#0ea5e9,#1e3a8a)'], forest: ['Forest', 'linear-gradient(160deg,#065f46,#14532d 60%,#052e16)'], midnight: ['Midnight', 'radial-gradient(circle at 30% 20%,#312e81,#0f172a 60%)'],
    peach: ['Peach', 'linear-gradient(135deg,#fed7aa,#fbcfe8)'], mint: ['Mint', 'linear-gradient(135deg,#d1fae5,#bae6fd)'], lavender: ['Lavender', 'linear-gradient(135deg,#e9d5ff,#c7d2fe)'],
    dots: ['Dots', 'pattern:dots'], grid: ['Grid', 'pattern:grid'], diag: ['Stripes', 'pattern:diag'], stars: ['Stars', 'pattern:stars'], hearts: ['Hearts', 'pattern:hearts'], waves: ['Waves', 'pattern:waves'],
    custom: ['Your photo', 'custom'],
  };
  const THEMES = [
    { id: 'ocean', name: 'Ocean', out: '#0ea5e9', outText: '#ffffff', in: '#e0f2fe', inText: '#0c4a6e', bg: '#082f49', bg2: '#0c4a6e', pattern: 'waves', emoji: '🌊' },
    { id: 'sunset', name: 'Sunset', out: '#f97316', outText: '#ffffff', in: '#ffedd5', inText: '#7c2d12', bg: '#4c1d95', bg2: '#be185d', pattern: 'none', emoji: '🌅' },
    { id: 'forest', name: 'Forest', out: '#16a34a', outText: '#ffffff', in: '#dcfce7', inText: '#14532d', bg: '#052e16', bg2: '#14532d', pattern: 'dots', emoji: '🌲' },
    { id: 'grape', name: 'Grape', out: '#8b5cf6', outText: '#ffffff', in: '#ede9fe', inText: '#4c1d95', bg: '#1e1b4b', bg2: '#4c1d95', pattern: 'stars', emoji: '🍇' },
    { id: 'candy', name: 'Candy', out: '#ec4899', outText: '#ffffff', in: '#ffffff', inText: '#831843', bg: '#fdf2f8', bg2: '#fbcfe8', pattern: 'hearts', emoji: '🍬' },
    { id: 'neon', name: 'Neon', out: '#22d3ee', outText: '#020617', in: '#1e293b', inText: '#e2e8f0', bg: '#020617', bg2: '#0f172a', pattern: 'grid', emoji: '⚡' },
    { id: 'mono', name: 'Mono', out: '#18181b', outText: '#fafafa', in: '#e4e4e7', inText: '#18181b', bg: '#fafafa', bg2: '#e4e4e7', pattern: 'none', emoji: '🖤' },
    { id: 'gold', name: 'Royal', out: '#ca8a04', outText: '#ffffff', in: '#fef9c3', inText: '#713f12', bg: '#1c1917', bg2: '#422006', pattern: 'stars', emoji: '👑' },
    { id: 'lava', name: 'Lava', out: '#dc2626', outText: '#ffffff', in: '#fee2e2', inText: '#7f1d1d', bg: '#1c0a0a', bg2: '#450a0a', pattern: 'waves', emoji: '🌋' },
    { id: 'gamer', name: 'Gamer', out: '#a3e635', outText: '#1a2e05', in: '#27272a', inText: '#f4f4f5', bg: '#09090b', bg2: '#1e1b4b', pattern: 'grid', emoji: '🎮' },
  ];
  const lum = hex => { const n = parseInt(String(hex || '#000').slice(1), 16); return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; };
  const textOn = hex => lum(hex) > .6 ? '#111827' : '#ffffff';
  function patternCss(p, dark) {
    const c = dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.07)', cs = encodeURIComponent(dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.08)');
    return {
      dots: `radial-gradient(${c} 1.6px,transparent 1.8px) 0 0/20px 20px`,
      grid: `linear-gradient(${c} 1px,transparent 1px) 0 0/26px 26px,linear-gradient(90deg,${c} 1px,transparent 1px) 0 0/26px 26px`,
      diag: `repeating-linear-gradient(45deg,${c} 0 2px,transparent 2px 16px)`,
      stars: `radial-gradient(${c} 1.2px,transparent 1.6px) 0 0/34px 34px,radial-gradient(${c} 1.6px,transparent 2px) 17px 17px/34px 34px`,
      waves: `radial-gradient(circle at 50% 120%,transparent 46%,${c} 47%,${c} 53%,transparent 54%) 0 0/36px 18px`,
      hearts: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 30s-9-5.6-9-11.3A4.8 4.8 0 0 1 20 16a4.8 4.8 0 0 1 9 2.7C29 24.4 20 30 20 30z' fill='${cs}'/%3E%3C/svg%3E") 0 0/40px 40px`,
    }[p] || '';
  }
  /** background for the message list: your wallpaper, or the chat's shared theme */
  function wallCss(pr, theme) {
    if (theme) { const dark = lum(theme.bg) < .5, pat = theme.pattern && theme.pattern !== 'none' ? patternCss(theme.pattern, dark) + ',' : ''; return pat + `linear-gradient(160deg,${theme.bg},${theme.bg2 || theme.bg})`; }
    const w = WALLS[pr.wall] ? pr.wall : 'none';
    if (w === 'none') return '';
    if (w === 'custom') return pr.wallImg ? `linear-gradient(rgba(0,0,0,${(pr.wallDim || 0) / 100}),rgba(0,0,0,${(pr.wallDim || 0) / 100})),url("${pr.wallImg}") center/cover` : '';
    const v = WALLS[w][1];
    if (v.startsWith('pattern:')) return patternCss(v.slice(8), document.documentElement.dataset.theme === 'dark') + ',var(--surface)';
    return v;
  }
  /** apply your look to a Messages root (and a chat's shared theme to its pane) */
  function applyLook(root, convo) {
    const pr = P(), st = root.style;
    st.setProperty('--b-out', pr.outColor || 'var(--accent)'); st.setProperty('--b-out-t', pr.outColor ? (pr.outText || textOn(pr.outColor)) : 'var(--on-accent)');
    st.setProperty('--b-in', pr.inColor || 'var(--surface-2)'); st.setProperty('--b-in-t', pr.inColor ? (pr.inText || textOn(pr.inColor)) : 'var(--text)');
    st.setProperty('--sjm-r', BUBBLE_R[pr.bubble] || '20px'); st.setProperty('--sjm-fs', (pr.textSize || 15) + 'px'); st.setProperty('--sjm-font', FONTS[pr.font] && FONTS[pr.font] !== 'inherit' ? '"SJ Emoji",' + FONTS[pr.font] : 'inherit');
    root.classList.toggle('compact', pr.density === 'compact'); root.classList.toggle('roomy', pr.density === 'roomy');
    root.classList.toggle('noav', !pr.avatars); root.classList.toggle('nonames', !pr.names); root.classList.toggle('tails', !!pr.tails); root.classList.toggle('right', !!pr.sideRight);
    const main = root.querySelector('.sjm-main'), list = root.querySelector('.sjm-msgs');
    const theme = convo && convo.theme && pr.chatThemes ? convo.theme : null;
    if (main) for (const [k, v] of [['--b-out', theme && theme.out], ['--b-out-t', theme && (theme.outText || textOn(theme.out))], ['--b-in', theme && theme.in], ['--b-in-t', theme && (theme.inText || textOn(theme.in))]]) v ? main.style.setProperty(k, v) : main.style.removeProperty(k);
    if (main) main.classList.toggle('themed', !!theme);
    if (list) { const bg = wallCss(pr, theme); list.style.background = bg || ''; list.classList.toggle('walled', !!bg); }
  }

  const STICKER_PACKS = [
    ['Faces', ['😀', '😂', '🤣', '😍', '🥰', '😎', '🤩', '🥳', '😴', '🤯', '😭', '😡', '🥺', '🤔', '🫡', '🤗']],
    ['Love', ['❤️', '💖', '💕', '💘', '💝', '😘', '🫶', '💌', '🌹', '💐', '🧸', '💍']],
    ['Gaming', ['🎮', '🕹️', '👾', '🏆', '🥇', '🎯', '⚔️', '🛡️', '💥', '🔥', '⚡', '🎲', '♟️', '🏁', '🚀', '💀']],
    ['Animals', ['🐶', '🐱', '🦊', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐧', '🐙', '🦖']],
    ['Food', ['🍕', '🍔', '🍟', '🌮', '🍩', '🍦', '🍪', '🎂', '🍓', '🍉', '☕', '🧋']],
  ];
  // file uploads with progress (fetch has no upload progress)
  function upload(file, kind = 'attachment', onProgress) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('POST', 'social/api/upload');
      x.setRequestHeader('content-type', file.type || 'application/octet-stream');
      x.setRequestHeader('x-name', encodeURIComponent(file.name || 'file'));
      x.setRequestHeader('x-kind', kind);
      x.upload.onprogress = e => onProgress && e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status === 200 ? res(j) : rej(new Error(j.error || 'Upload failed')); };
      x.onerror = () => rej(new Error('Upload failed'));
      x.send(file);
    });
  }
  let emojiData = null;
  // GIPHY pictures load through this server (it downloads + caches them), so devices that can't reach giphy.com still see GIFs
  const gp = u => u && /^https:\/\/(media\d?|i)\.giphy\.com\//.test(u) ? 'social/gifmedia?u=' + encodeURIComponent(u) : u;
  const loadEmoji = () => emojiData ? Promise.resolve(emojiData) : fetch('vendor/sj-social/emoji.json').then(r => r.json()).then(d => (emojiData = d));
  const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
  const withTone = (e, tone) => { if (!tone) return e; const cps = [...e]; return cps[0] + TONES[tone] + cps.slice(1).join('').replace(/^️/, ''); };
  const previews = new Map();
  function openLink(url) { if (typeof SanjServer !== 'undefined' && SanjServer.vip && Apps.get('browser')) WM.open('browser', { url, newWindow: true }); else window.open(url, '_blank', 'noopener'); }
  function viewMedia(src, name, video) {
    const v = h(`<div class="sjm-view"><header><span>${esc(name || '')}</span><a href="${esc(src)}${src.includes('?') ? '&' : '?'}dl=1" download="${esc(name || '')}">Download</a><button>Close</button></header><div class="st">${video ? `<video src="${esc(src)}" controls autoplay playsinline></video>` : `<img src="${esc(src)}" alt="">`}</div></div>`);
    const close = () => { v.remove(); removeEventListener('keydown', k, true); };
    const k = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    v.querySelector('button').onclick = close; v.querySelector('.st').onclick = e => { if (e.target.classList.contains('st')) close(); };
    addEventListener('keydown', k, true); document.body.appendChild(v);
  }

  function launch(win, args) {
    const root = h(`<div class="sjm"></div>`);
    win.body.innerHTML = ''; win.body.appendChild(root);
    const st = { tab: 'chats', cid: null, msgs: new Map(), reply: null, edit: null, drawer: null, atts: [], typing: new Map(), archived: false, q: '', thread: null, rec: null, pick: null, pickTab: store.get('pickTab', 'emoji') };
    win.viewingCid = null;
    const ro = new ResizeObserver(() => root.classList.toggle('narrow', root.clientWidth < 720)); ro.observe(root);
    const q = s => root.querySelector(s);

    /* ---------- top-level render ---------- */
    function render() {
      if (!S.me) return signIn();
      if (!S.ready) { root.classList.remove('list'); root.innerHTML = `<aside class="sjm-side"><div class="sjm-me">${av(S.me)}<div class="nm"><b>${esc(S.me.display)}</b><small>Connecting…</small></div></div>${'<div class="sjm-skel"></div>'.repeat(6)}</aside><section class="sjm-main"><div class="sjm-nochat">Connecting to Messages…</div></section><aside class="sjm-drawer"></aside>`; S.connect(); return; }
      root.innerHTML = `<aside class="sjm-side">
          <div class="sjm-me">${av({ ...S.me, online: true })}<div class="nm"><b>${esc(S.me.display)}</b><small>@${esc(S.me.username)}</small></div>
            <button class="sjm-ib" data-a="new" title="New chat or group">${svg('edit')}</button><button class="sjm-ib" data-a="settings" title="Settings">${svg('user')}</button></div>
          <div class="sjm-search">${svg('search')}<input class="sjm-in" type="search" placeholder="Search" aria-label="Search chats and messages"></div>
          <div class="sjm-tabs"></div><div class="sjm-list"></div></aside>
        <section class="sjm-main"></section><aside class="sjm-drawer"></aside>`;
      q('.sjm-search input').value = st.q;
      q('.sjm-search input').oninput = e => { st.q = e.target.value; clearTimeout(st.qT); st.qT = setTimeout(renderList, 160); };
      q('[data-a=new]').onclick = newChat; q('[data-a=settings]').onclick = settings;
      renderTabs(); renderList(); renderMain(); renderDrawer(); applyLook(root, S.convos.get(st.cid));
      if (root.classList.contains('narrow') && !st.cid) root.classList.add('list');
    }
    function signIn(mode = 'login') {
      const suggested = (Settings.get('username') || '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24);
      root.innerHTML = `<div class="sjm-welcome"><form class="sjm-card"><div class="sjm-logo">${svg('chat')}</div>
        <h2>${mode === 'login' ? 'Sign in to Messages' : 'Create your account'}</h2>
        <p>${S.unavailable ? 'Messages needs the updated SanjivramOS server. In Termux, run <b>sanjivramos restart</b>, then reopen this app.' : 'One SanjivramOS account for Messages, calls and online games. Everyone who uses this SanjivramOS — on this phone or on your Wi-Fi — can find you by username.'}</p>
        ${mode === 'signup' ? `<label>Your name</label><input class="sjm-in" name="display" maxlength="40" value="${esc(Settings.get('username') || '')}" autocomplete="name">` : ''}
        <label>Username</label><input class="sjm-in" name="username" maxlength="24" autocomplete="username" value="${mode === 'signup' ? esc(suggested) : ''}" required>
        <label>Password</label><input class="sjm-in" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${mode === 'login' ? 1 : 6}" required>
        <div class="sjm-err"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="sjm-btn pri" style="flex:1">${mode === 'login' ? 'Sign in' : 'Create account'}</button></div>
        <p style="margin:14px 0 0;font-size:13px;text-align:center">${mode === 'login' ? 'New here? <a href="#" data-m="signup">Create an account</a>' : 'Have an account? <a href="#" data-m="login">Sign in</a>'}</p></form></div>`;
      const f = q('form');
      f.querySelector('[data-m]').onclick = e => { e.preventDefault(); signIn(e.target.dataset.m); };
      f.onsubmit = async e => {
        e.preventDefault(); const b = f.querySelector('.sjm-btn'); b.disabled = true;
        try { await S.auth(mode, f.username.value.trim(), f.password.value, f.display ? f.display.value.trim() : undefined); }
        catch (err) { f.querySelector('.sjm-err').textContent = err.message; b.disabled = false; }
      };
      setTimeout(() => (f.querySelector('input[value=""]') || f.username).focus(), 60);
    }

    /* ---------- sidebar ---------- */
    function renderTabs() {
      const reqs = S.friends.filter(f => f.incoming).length, unread = S.unread();
      q('.sjm-tabs').innerHTML = [['chats', 'Chats', unread], ['friends', 'Friends', reqs], ['calls', 'Calls', 0]].map(([k, l, n]) => `<button class="sjm-tab${st.tab === k ? ' on' : ''}" data-t="${k}">${l}${n ? `<span class="n">${n > 99 ? '99+' : n}</span>` : ''}</button>`).join('');
      q('.sjm-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; renderTabs(); renderList(); } };
    }
    function typingText(cid) { const t = st.typing.get(cid); if (!t) return ''; const now = Date.now(), who = [...t].filter(([, at]) => now - at < 5000).map(([uid]) => S.name(uid)); return who.length ? (who.length === 1 ? `${who[0]} is typing…` : `${who.length} people are typing…`) : ''; }
    function renderList() {
      const list = q('.sjm-list'); if (!list) return;
      const query = st.q.trim().toLowerCase();
      if (st.tab === 'chats') {
        const all = [...S.convos.values()];
        let items = all.filter(c => !!c.archived === st.archived);
        if (query) items = all.filter(c => S.convoTitle(c).toLowerCase().includes(query) || c.members.some(m => m.username.toLowerCase().includes(query)));
        const nArch = all.filter(c => c.archived).length;
        list.innerHTML = (st.archived ? `<button class="sjm-ci" data-arch="0">${svg('back') || '←'}<div class="t"><b>Back to chats</b></div></button>` : '') +
          (items.map(c => {
            const ty = typingText(c.id), last = c.last;
            return `<button class="sjm-ci${c.id === st.cid ? ' on' : ''}${c.unread && !c.muted ? ' unread' : ''}" data-cid="${c.id}">${convoAv(c)}<div class="t"><div class="r1"><b>${esc(S.convoTitle(c))}</b><time>${listTime(last ? last.at : c.created)}</time></div>
              <div class="r2">${ty ? `<span class="typing">${esc(ty)}</span>` : `<span>${esc(S.preview(last)) || '<i>No messages yet</i>'}</span>`}${c.muted ? `<svg class="ic" viewBox="0 0 24 24">${ICONS.bell || ''}<path d="M3 3l18 18"/></svg>` : ''}${c.unread ? `<span class="sjm-pill${c.muted ? ' muted' : ''}">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div></div></button>`;
          }).join('') || `<div class="sjm-empty">${query ? 'No chats match.' : st.archived ? 'No archived chats.' : 'No chats yet.<br><br><button class="sjm-btn pri" data-a="new2">Start a chat</button>'}</div>`) +
          (query.length >= 2 ? `<div class="sjm-sec">Messages</div><div class="sjm-msr"><div class="sjm-skel"></div></div><div class="sjm-sec">People</div><div class="sjm-usr"></div>` : '') +
          (!st.archived && !query && nArch ? `<button class="sjm-ci" data-arch="1"><span class="sjm-av" style="--c:var(--surface-3);color:var(--text-2)">🗄</span><div class="t"><b>Archived</b><div class="r2"><span>${nArch} chat${nArch === 1 ? '' : 's'}</span></div></div></button>` : '');
        const n2 = list.querySelector('[data-a=new2]'); if (n2) n2.onclick = newChat;
        if (query.length >= 2) {
          S.req('search', { q: st.q }).then(r => { const box = list.querySelector('.sjm-msr'); if (!box) return; box.innerHTML = (r.msgs || []).slice(0, 20).map(m => { const c = S.convos.get(m.cid); return `<div class="sjm-res" data-jump="${m.cid}:${m.id}"><small>${esc(S.convoTitle(c))} · ${esc(S.name(m.uid))} · ${listTime(m.at)}</small>${highlight(m.body, query)}</div>`; }).join('') || '<div class="sjm-empty" style="padding:10px">No messages</div>'; });
          S.req('user.search', { q: st.q }).then(r => { const box = list.querySelector('.sjm-usr'); if (!box) return; box.innerHTML = (r.users || []).slice(0, 10).map(u => `<div class="sjm-fr">${av(u)}<div class="t"><b>${esc(u.display)}</b><small>@${esc(u.username)}</small></div><button class="sjm-ib" data-dm="${u.id}" title="Message">${svg('chat')}</button></div>`).join('') || '<div class="sjm-empty" style="padding:10px">No people</div>'; });
        }
      } else if (st.tab === 'friends') friendsView(list, query);
      else callsView(list);
      list.onclick = e => {
        const ci = e.target.closest('[data-cid]'); if (ci) return openConvo(+ci.dataset.cid);
        const ar = e.target.closest('[data-arch]'); if (ar) { st.archived = ar.dataset.arch === '1'; return renderList(); }
        const j = e.target.closest('[data-jump]'); if (j) { const [c, m] = j.dataset.jump.split(':').map(Number); return openConvo(c, m); }
        const dm = e.target.closest('[data-dm]'); if (dm) return dmWith(+dm.dataset.dm);
      };
      list.oncontextmenu = e => { const ci = e.target.closest('[data-cid]'); if (!ci) return; e.preventDefault(); convoMenu(S.convos.get(+ci.dataset.cid), e.clientX, e.clientY); };
    }
    function highlight(text, query) { const t = String(text || ''), i = t.toLowerCase().indexOf(query); if (i < 0) return esc(t.slice(0, 120)); const s = Math.max(0, i - 40); return (s ? '…' : '') + esc(t.slice(s, i)) + '<mark>' + esc(t.slice(i, i + query.length)) + '</mark>' + esc(t.slice(i + query.length, i + query.length + 80)); }
    function convoMenu(c, x, y) {
      if (!c) return;
      ContextMenu.show(x, y, [
        { label: c.unread ? 'Mark as read' : 'Open', icon: 'chat', action: () => openConvo(c.id) },
        { label: c.muted ? 'Unmute' : 'Mute notifications', icon: 'bell', action: () => setConvo(c, { muted: !c.muted }) },
        { label: c.archived ? 'Unarchive' : 'Archive', icon: 'folder', action: () => setConvo(c, { archived: !c.archived }) },
        '-', { label: 'Voice call', icon: 'phone', action: () => S.startCall(c.id, false) }, { label: 'Video call', icon: 'video', action: () => S.startCall(c.id, true) },
      ]);
    }
    async function setConvo(c, a) { const r = await S.req('convo.settings', { cid: c.id, ...a }); if (r.convo) { S.convos.set(c.id, r.convo); S.badge(); renderList(); renderTabs(); if (st.drawer === 'info') renderDrawer(); } }

    function friendsView(list, query) {
      const fr = S.friends, inc = fr.filter(f => f.incoming), out = fr.filter(f => f.status === 'pending' && !f.incoming), acc = fr.filter(f => f.status === 'accepted');
      const online = acc.filter(f => f.user.online), offline = acc.filter(f => !f.user.online);
      const row = (f, extra) => `<div class="sjm-fr">${av(f.user)}<div class="t"><b>${esc(f.user.display)}</b>${f.user.activity ? `<small class="play">🎮 Playing ${esc(f.user.activity.gameName || f.user.activity.game)}</small>` : `<small>@${esc(f.user.username)}${f.user.online ? ' · Online' : f.user.lastSeen ? ' · ' + ago(f.user.lastSeen) : ''}</small>`}</div>${extra}</div>`;
      list.innerHTML = `<form class="sjm-addf" style="display:flex;gap:6px;padding:4px 6px 8px"><input class="sjm-in" placeholder="Add a friend by username" maxlength="24" aria-label="Username"><button class="sjm-btn pri">Add</button></form>
        ${query.length >= 2 ? '<div class="sjm-sec">People</div><div class="sjm-usr"><div class="sjm-skel"></div></div>' : ''}
        ${inc.length ? `<div class="sjm-sec">Requests · ${inc.length}</div>${inc.map(f => row(f, `<button class="sjm-btn pri" data-acc="${f.user.id}">Accept</button><button class="sjm-ib" data-rem="${f.user.id}" title="Decline">${svg('close')}</button>`)).join('')}` : ''}
        ${online.length ? `<div class="sjm-sec">Online · ${online.length}</div>${online.map(f => row(f, `${f.user.activity && f.user.activity.room ? `<button class="sjm-btn pri" data-join='${esc(JSON.stringify({ game: f.user.activity.game, name: f.user.activity.gameName, code: f.user.activity.room }))}'>Join</button>` : ''}<button class="sjm-ib" data-dm="${f.user.id}" title="Message">${svg('chat')}</button><button class="sjm-ib" data-call="${f.user.id}" title="Call">${svg('phone')}</button>`)).join('')}` : ''}
        ${offline.length ? `<div class="sjm-sec">Offline · ${offline.length}</div>${offline.map(f => row(f, `<button class="sjm-ib" data-dm="${f.user.id}" title="Message">${svg('chat')}</button>`)).join('')}` : ''}
        ${out.length ? `<div class="sjm-sec">Sent requests</div>${out.map(f => row(f, `<button class="sjm-btn" data-rem="${f.user.id}">Cancel</button>`)).join('')}` : ''}
        ${!fr.length ? '<div class="sjm-empty">No friends yet. Add people by their username — they get a request and can accept it.</div>' : ''}`;
      const form = list.querySelector('.sjm-addf');
      form.onsubmit = async e => { e.preventDefault(); const u = form.querySelector('input').value.trim(); if (!u) return; const r = await S.req('friend.request', { username: u }); if (r.error) return Toast.show('Couldn’t add', r.error, 'user'); if (r.friends) S.friends = r.friends; Toast.show('Friend request sent', '@' + u, 'user', 2500); form.querySelector('input').value = ''; renderList(); renderTabs(); };
      if (query.length >= 2) S.req('user.search', { q: st.q }).then(r => { const box = list.querySelector('.sjm-usr'); if (box) box.innerHTML = (r.users || []).map(u => `<div class="sjm-fr">${av(u)}<div class="t"><b>${esc(u.display)}</b><small>@${esc(u.username)}</small></div><button class="sjm-btn" data-add="${u.id}">Add</button><button class="sjm-ib" data-dm="${u.id}">${svg('chat')}</button></div>`).join('') || '<div class="sjm-empty" style="padding:10px">Nobody by that name</div>'; });
      list.addEventListener('click', async e => {
        const t = e.target.closest('[data-acc],[data-rem],[data-add],[data-call],[data-join]'); if (!t) return;
        if (t.dataset.join) { S.joinInvite(JSON.parse(t.dataset.join)); return; }
        if (t.dataset.call) { const r = await S.req('convo.dm', { id: +t.dataset.call }); if (r.convo) { S.convos.set(r.convo.id, r.convo); S.startCall(r.convo.id, false); } return; }
        const op = t.dataset.acc ? 'friend.accept' : t.dataset.add ? 'friend.request' : 'friend.remove';
        const r = await S.req(op, { id: +(t.dataset.acc || t.dataset.rem || t.dataset.add) });
        if (r.error) Toast.show('Friends', r.error, 'user'); else { if (r.friends) S.friends = r.friends; renderList(); renderTabs(); }
      }, { once: true });
    }
    async function callsView(list) {
      list.innerHTML = '<div class="sjm-skel"></div>'.repeat(4);
      const r = await S.req('call.history');
      if (st.tab !== 'calls') return;
      list.innerHTML = (r.calls || []).map(c => {
        const cv = S.convos.get(c.cid), out = c.by === S.me.id, missed = !c.answered || (!out && !c.joined);
        const dur = c.answered && c.ended ? Math.round((c.ended - c.answered) / 1000) : 0;
        return `<div class="sjm-fr">${convoAv(cv)}<div class="t"><b style="${missed && !out ? 'color:#ef4444' : ''}">${esc(S.convoTitle(cv))}</b><small>${out ? '↗ Outgoing' : missed ? '↙ Missed' : '↙ Incoming'} ${c.video ? 'video' : 'voice'} · ${listTime(c.started)}${dur ? ' · ' + fmtTime(dur) : ''}</small></div><button class="sjm-ib" data-cb="${c.cid}" data-v="${c.video ? 1 : ''}" title="Call back">${svg(c.video ? 'video' : 'phone')}</button></div>`;
      }).join('') || '<div class="sjm-empty">No calls yet. Start one from any chat with the 📞 or 🎥 buttons.</div>';
      list.onclick = e => { const b = e.target.closest('[data-cb]'); if (b) S.startCall(+b.dataset.cb, !!b.dataset.v); };
    }
    async function dmWith(uid) { const r = await S.req('convo.dm', { id: uid }); if (r.error) return Toast.show('Messages', r.error, 'chat'); S.convos.set(r.convo.id, Object.assign(S.convos.get(r.convo.id) || {}, r.convo)); st.tab = 'chats'; renderTabs(); openConvo(r.convo.id); }

    /* ---------- conversation ---------- */
    async function openConvo(cid, jumpTo) {
      const c = S.convos.get(cid); if (!c) return;
      if (st.cid !== cid) { st.reply = null; st.edit = null; st.thread = null; if (st.drawer === 'thread' || st.drawer === 'search') st.drawer = null; }
      st.cid = cid; win.viewingCid = cid; root.classList.remove('list');
      renderList(); renderMain(); renderDrawer();
      if (!st.msgs.has(cid)) { const r = await S.req('msgs.get', { cid, limit: 60 }); st.msgs.set(cid, { list: r.msgs || [], more: !!r.more }); }
      if (st.cid !== cid) return;
      renderMsgs(true);
      if (jumpTo) await jump(jumpTo);
      markRead();
      if (args.focus || !root.classList.contains('narrow')) setTimeout(() => { const ta = q('.sjm-ta'); if (ta) ta.focus(); }, 30);
    }
    function markRead() {
      const c = S.convos.get(st.cid), m = st.msgs.get(st.cid); if (!c || !m || !m.list.length) return;
      if (WM.active !== win || win.minimized || !document.hasFocus()) return;
      const last = m.list[m.list.length - 1];
      if (c.unread || (c.members.find(x => x.id === S.me.id) || {}).read < last.id) { S.fire('read', { cid: c.id, id: last.id }); c.unread = 0; S.badge(); renderTabs(); const ci = q(`.sjm-ci[data-cid="${c.id}"]`); if (ci) ci.classList.remove('unread'), ci.querySelector('.sjm-pill') && ci.querySelector('.sjm-pill').remove(); }
    }
    function statusLine(c) {
      const ty = typingText(c.id); if (ty) return `<small class="on">${esc(ty)}</small>`;
      if (c.kind === 'group') { const on = c.members.filter(m => m.online && m.id !== S.me.id).length; return `<small>${c.members.length} members${on ? ` · ${on} online` : ''}</small>`; }
      const o = S.convoOther(c); if (!o) return '';
      if (o.activity) return `<small class="on">🎮 Playing ${esc(o.activity.gameName || o.activity.game)}</small>`;
      return o.online ? '<small class="on">Online</small>' : `<small>${o.lastSeen ? 'Last seen ' + ago(o.lastSeen) : '@' + esc(o.username)}</small>`;
    }
    function renderMain() {
      const main = q('.sjm-main'); if (!main) return;
      const c = S.convos.get(st.cid);
      if (!c) { main.innerHTML = `<div class="sjm-nochat"><div>${svg('chat')}<h3 style="margin:10px 0 4px;color:var(--text)">Your messages</h3><p>Pick a chat, or start a new one.</p><button class="sjm-btn pri" data-a="new3">New message</button></div></div>`; main.querySelector('[data-a=new3]').onclick = newChat; win.setTitle('Messages'); return; }
      win.setTitle(`${S.convoTitle(c)} — Messages`);
      const call = [...S.calls.values()].find(x => x.cid === c.id);
      main.innerHTML = `<header class="sjm-head"><button class="sjm-ib sjm-back" data-a="back" title="Back">${svg('back') || '‹'}</button>${convoAv(c)}<div class="who" data-a="info"><b>${esc(S.convoTitle(c))}${c.theme && c.theme.emoji && P().chatThemes ? ' ' + esc(c.theme.emoji) : ''}</b><span class="sjm-stl">${statusLine(c)}</span></div>
          ${call ? `<button class="sjm-btn pri" data-a="joincall">Join call</button>` : ''}
          <button class="sjm-ib" data-a="voice" title="Voice call">${svg('phone')}</button><button class="sjm-ib" data-a="video" title="Video call">${svg('video')}</button>
          <button class="sjm-ib" data-a="search" title="Search in chat">${svg('search')}</button><button class="sjm-ib" data-a="info" title="Details">${svg('info') || 'ⓘ'}</button></header>
        <div class="sjm-pinbar" hidden></div>
        <div class="sjm-msgs" role="log" aria-live="polite"></div><div class="sjm-typing"></div>
        <button class="sjm-jump" hidden title="Jump to latest">${svg('down') || '↓'}</button>
        <div class="sjm-comp"><div class="sjm-ctx" hidden></div><div class="sjm-atts" hidden></div>
          <div class="sjm-row"><button class="sjm-ib" data-a="attach" title="Attach photos, videos or files">${svg('paperclip')}</button><input type="file" multiple hidden class="sjm-file-in">
            <textarea class="sjm-ta" rows="1" placeholder="Message ${esc(S.convoTitle(c))}" aria-label="Message"></textarea>
            <button class="sjm-ib" data-a="pick" title="Emoji, GIFs & stickers">${svg('smile')}</button><button class="sjm-send" data-a="send" title="Send">${svg('mic')}</button></div>
          <div class="sjm-pick" hidden></div></div>`;
      main.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', e => act(b.dataset.a, e)));
      const ta = q('.sjm-ta');
      ta.value = (store.get('drafts', {})[c.id]) || '';
      // empty = natural one-line height; otherwise fit the text (re-measured when the width changes — measuring while the
      // window was still opening at ~0px wide made the placeholder wrap and left a huge empty box)
      const grow = () => { if (!ta.value) ta.style.height = ''; else { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; } sendIcon(); };
      if (window.ResizeObserver) { let lw = 0; new ResizeObserver(() => { const w = ta.clientWidth; if (w && Math.abs(w - lw) > 2) { lw = w; if (ta.value) grow(); } }).observe(ta); }
      ta.addEventListener('input', () => { grow(); const d = store.get('drafts', {}); if (ta.value) d[c.id] = ta.value; else delete d[c.id]; store.set('drafts', d); if (ta.value && Date.now() - (st.typedAt || 0) > 2500) { st.typedAt = Date.now(); S.fire('typing', { cid: c.id }); } });
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (P().enterSend || e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
        else if (e.key === 'ArrowUp' && !ta.value) { const mine = (st.msgs.get(c.id) || { list: [] }).list.filter(m => m.uid === S.me.id && m.kind === 'text').pop(); if (mine) { e.preventDefault(); startEdit(mine); } }
        else if (e.key === 'Escape') { if (st.pick) closePick(); else if (st.reply || st.edit) { st.reply = st.edit = null; if (st.edit === null) ta.value = ''; ctxBar(); } }
      });
      ta.addEventListener('paste', e => { const files = [...(e.clipboardData && e.clipboardData.files || [])]; if (files.length) { e.preventDefault(); addAtts(files); } });
      q('.sjm-file-in').onchange = e => { addAtts([...e.target.files]); e.target.value = ''; };
      const box = q('.sjm-msgs');
      box.addEventListener('scroll', () => { const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80; q('.sjm-jump').hidden = near; if (near) markRead(); if (box.scrollTop < 60) loadOlder(); }, { passive: true });
      box.addEventListener('click', onMsgClick); box.addEventListener('contextmenu', onMsgMenu);
      box.addEventListener('dblclick', e => { const row = e.target.closest('.sjm-m'); if (!row || e.target.closest('a,video,button,img')) return; const m = msgById(+row.dataset.id); if (!m || m.kind === 'deleted') return; const cc = S.convos.get(m.cid); react(m, (cc && cc.theme && cc.theme.emoji && P().chatThemes) ? cc.theme.emoji : P().quickEmoji || '❤️'); window.getSelection && window.getSelection().removeAllRanges(); });
      let lp; box.addEventListener('touchstart', e => { const m = e.target.closest('.sjm-m'); if (!m) return; lp = setTimeout(() => { const t = e.touches[0]; onMsgMenu({ target: e.target, clientX: t.clientX, clientY: t.clientY, preventDefault() {} }); }, 520); }, { passive: true });
      box.addEventListener('touchend', () => clearTimeout(lp)); box.addEventListener('touchmove', () => clearTimeout(lp), { passive: true });
      q('.sjm-jump').onclick = () => { box.scrollTop = box.scrollHeight; };
      grow(); ctxBar(); renderAtts(); pinBar(); applyLook(root, c);
      if (st.msgs.has(c.id)) renderMsgs(true); else box.innerHTML = '<div class="sjm-skel" style="width:60%"></div><div class="sjm-skel" style="width:40%;align-self:flex-end"></div><div class="sjm-skel" style="width:55%"></div>';
    }
    function sendIcon() { const b = q('.sjm-send'); if (!b) return; const has = q('.sjm-ta').value.trim() || st.atts.length || st.edit; b.innerHTML = svg(has ? 'send' : 'mic'); b.title = has ? (st.edit ? 'Save' : 'Send') : 'Hold or tap to record a voice message'; }
    async function pinBar() {
      const bar = q('.sjm-pinbar'); if (!bar || !st.cid) return;
      const r = await S.req('pins.get', { cid: st.cid }); const p = (r.msgs || [])[0];
      if (!p || !q('.sjm-pinbar')) { bar.hidden = true; return; }
      bar.hidden = false; bar.innerHTML = `${svg('pin')}<span><b>Pinned</b> · ${esc(S.preview(p))}</span>${r.msgs.length > 1 ? `<small>+${r.msgs.length - 1}</small>` : ''}`;
      bar.onclick = () => { st.drawer = 'pins'; renderDrawer(); };
    }

    /* ---------- message rendering ---------- */
    function msgBody(m, c) {
      const me = m.uid === S.me.id;
      const q1 = m.replyTo ? `<span class="sjm-q" data-goto="${m.replyTo.id}"><b>${esc(S.name(m.replyTo.uid))}</b> ${esc(m.replyTo.kind === 'text' ? m.replyTo.body : S.preview(m.replyTo))}</span>` : '';
      const fwd = m.fwd ? `<div class="sjm-fwd">↪ Forwarded</div>` : '';
      switch (m.kind) {
        case 'deleted': return `<div class="sjm-b sjm-deleted">${svg('trash')} This message was deleted</div>`;
        case 'text': {
          if (P().bigEmoji && onlyEmoji(m.body) && !q1 && !fwd) return `<div class="sjm-b emoji">${esc(m.body)}</div>`;
          const url = (m.body.match(URL_RE) || [])[0];
          return `<div class="sjm-b">${fwd}${q1}${linkify(m.body)}${m.meta && m.meta.screenshot ? `<img class="sjm-img" src="${esc(m.meta.screenshot.url)}" data-view="${esc(m.meta.screenshot.url)}" alt="Screenshot" style="margin-top:6px">` : ''}${url ? `<span class="sjm-lp" data-url="${esc(url)}"></span>` : ''}</div>`;
        }
        case 'gif': return `<div class="sjm-b media">${fwd}${q1}${m.meta.file ? `<img class="sjm-gif" src="${esc(m.meta.file.url)}" alt="GIF" loading="lazy">` : m.meta.mp4 ? `<video class="sjm-gif" src="${esc(gp(m.meta.mp4))}" ${P().autoplayGif ? 'autoplay' : 'preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()" onclick="this.paused?this.play():this.pause()"'} loop muted playsinline width="${m.meta.w}" height="${m.meta.h}" aria-label="${esc(m.meta.title || 'GIF')}"></video>` : `<img class="sjm-gif" src="${esc(gp(m.meta.url))}" width="${m.meta.w}" height="${m.meta.h}" alt="${esc(m.meta.title || 'GIF')}" loading="lazy">`}${m.meta.source === 'giphy' ? '<div class="sjm-gif-src">via GIPHY</div>' : ''}</div>`;
        case 'sticker': return `<div class="sjm-b sjm-stk">${m.meta.emoji ? esc(m.meta.emoji) : m.meta.file ? `<img src="${esc(m.meta.file.url)}" alt="Sticker">` : `<img src="${esc(gp(m.meta.url))}" alt="Sticker">`}</div>`;
        case 'image': case 'video': return `<div class="sjm-b media">${fwd}${q1}${m.meta.files.map(f => /^video\//.test(f.mime) ? `<video class="sjm-img" src="${esc(f.url)}" controls preload="metadata" playsinline></video>` : `<img class="sjm-img" src="${esc(f.url)}" data-view="${esc(f.url)}" data-name="${esc(f.name)}" alt="${esc(f.name)}" loading="lazy">`).join('')}</div>`;
        case 'file': return `<div class="sjm-b">${fwd}${q1}${m.meta.files.map(f => /^image\//.test(f.mime) && !/svg/.test(f.mime) ? `<img class="sjm-img" src="${esc(f.url)}" data-view="${esc(f.url)}" data-name="${esc(f.name)}" alt="">` : `<a class="sjm-file" href="${esc(f.url)}?dl=1" download="${esc(f.name)}"><span class="fi">${svg('file') || '📄'}</span><span><b>${esc(f.name)}</b><small>${size(f.size)} · Download</small></span></a>`).join('')}</div>`;
        case 'voice': { const f = m.meta.files[0], w = m.meta.wave && m.meta.wave.length ? m.meta.wave : Array.from({ length: 40 }, (_, i) => .3 + .5 * Math.abs(Math.sin(i * 1.7 + m.id))); return `<div class="sjm-b"><div class="sjm-voice" data-src="${esc(f.url)}"><button title="Play">${svg('play')}</button><div class="sjm-wave">${w.map(v => `<i style="height:${Math.max(10, v * 100)}%"></i>`).join('')}</div><small>${fmtTime(m.meta.duration || 0)}</small></div></div>`; }
        case 'invite': { const i = m.meta; return `<div class="sjm-b"><div class="sjm-invite"><span class="gi">🎮</span><div><b>${esc(i.name || i.game)}</b><small>${me ? 'You invited them to play' : 'Invited you to play'} · room ${esc(i.code)}</small></div><button class="sjm-btn" data-inv='${esc(JSON.stringify(i))}'>${me ? 'Open' : 'Join'}</button></div></div>`; }
        default: return `<div class="sjm-b">${esc(m.body || '')}</div>`;
      }
    }
    function receipt(m, c) {
      if (m.uid !== S.me.id) return '';
      const others = c.members.filter(x => x.id !== S.me.id);
      if (others.length && others.every(x => x.read >= m.id)) return `<span class="tick read" title="Read">✓✓</span>`;
      if (others.length && others.every(x => x.delivered >= m.id)) return `<span class="tick" title="Delivered">✓✓</span>`;
      return m.pending ? `<span class="tick" title="Sending">🕓</span>` : `<span class="tick" title="Sent">✓</span>`;
    }
    function msgHtml(m, prev, next, c) {
      if (m.kind === 'system') return `<div class="sjm-sys" data-id="${m.id}">${esc(m.body)}</div>`;
      if (m.kind === 'call') { const v = m.meta || {}, mine = v.by === S.me.id; return `<div class="sjm-sys" data-id="${m.id}" style="display:flex;justify-content:center"><div class="sjm-b sjm-call" style="white-space:normal"><span class="ci${v.missed ? ' miss' : ''}">${svg(v.video ? 'video' : 'phone')}</span><span><b>${v.missed ? (mine ? 'No answer' : 'Missed ' + (v.video ? 'video' : 'voice') + ' call') : (v.video ? 'Video' : 'Voice') + ' call'}</b><small>${clock(m.at)}${v.duration ? ' · ' + fmtTime(v.duration) : ''}</small></span><button class="sjm-btn" data-callback="${v.video ? 1 : 0}" style="margin-left:6px">Call back</button></div></div>`; }
      const same = (a, b) => a && b && a.uid === b.uid && !['system', 'call'].includes(a.kind) && Math.abs(a.at - b.at) < 5 * 60e3 && new Date(a.at).toDateString() === new Date(b.at).toDateString();
      const first = !same(prev, m), last = !same(m, next), me = m.uid === S.me.id;
      const sender = c.members.find(x => x.id === m.uid) || { display: S.name(m.uid), id: m.uid };
      const reacts = Object.entries(m.reacts || {}).filter(([, l]) => l.length);
      return `<div class="sjm-m${me ? ' me' : ''}${first ? ' first' : ''}${last ? ' last' : ''}" data-id="${m.id}">${me ? '' : av(sender, 's', false)}<div class="sjm-col">
        ${first && !me && c.kind === 'group' ? `<div class="sjm-from" style="color:${colorOf(sender)}">${esc(sender.display)}</div>` : ''}
        ${msgBody(m, c)}
        ${reacts.length ? `<div class="sjm-reacts">${reacts.map(([e, l]) => `<button class="sjm-rx${l.includes(S.me.id) ? ' mine' : ''}" data-rx="${esc(e)}" title="${esc(l.map(id => S.name(id)).join(', '))}">${esc(e)}${l.length > 1 ? `<b>${l.length}</b>` : ''}</button>`).join('')}</div>` : ''}
        ${m.threadN ? `<button class="sjm-thr" data-thread="${m.id}">${svg('thread')} ${m.threadN} repl${m.threadN === 1 ? 'y' : 'ies'}</button>` : ''}
        ${last || m.pinned || m.edited ? `<div class="sjm-meta">${m.pinned ? '📌 ' : ''}${m.edited ? 'edited · ' : ''}${clock(m.at)} ${receipt(m, c)}</div>` : ''}
        </div>${m.kind !== 'deleted' ? `<div class="sjm-tools">${QUICK.slice(0, 3).map(e => `<button data-qr="${e}" title="React ${e}">${e}</button>`).join('')}<button data-more title="More reactions">${svg('smile')}</button><button data-rep title="Reply">${svg('reply')}</button><button data-menu title="More">⋯</button></div>` : ''}</div>`;
    }
    function renderMsgs(toBottom) {
      const box = q('.sjm-msgs'), c = S.convos.get(st.cid), data = st.msgs.get(st.cid); if (!box || !c || !data) return;
      const atBottom = toBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 120, oldH = box.scrollHeight, oldTop = box.scrollTop;
      const L = data.list; let html = data.more ? '<div class="sjm-more"><button class="sjm-btn" data-older>Load earlier messages</button></div>' : `<div class="sjm-sys sjm-intro" style="margin:20px auto 10px">${convoAv(c, 'l')}<div style="margin-top:8px;font-weight:700;color:var(--text);font-size:16px">${esc(S.convoTitle(c))}</div>${c.kind === 'dm' ? 'This is the start of your conversation.' : 'Group created ' + listTime(c.created)}</div>`;
      let lastDay = '';
      for (let i = 0; i < L.length; i++) {
        const day = new Date(L[i].at).toDateString();
        if (day !== lastDay) { html += `<div class="sjm-day">${esc(dayLabel(L[i].at))}</div>`; lastDay = day; }
        html += msgHtml(L[i], L[i - 1], L[i + 1], c);
      }
      box.innerHTML = html;
      if (atBottom) box.scrollTop = box.scrollHeight; else if (st.keepTop) { box.scrollTop = box.scrollHeight - oldH + oldTop; st.keepTop = false; } else box.scrollTop = oldTop;
      if (P().previews) box.querySelectorAll('.sjm-lp').forEach(fillPreview);
      applyLook(root, c);
      const ol = box.querySelector('[data-older]'); if (ol) ol.onclick = loadOlder;
    }
    async function fillPreview(el) {
      const url = el.dataset.url; let p = previews.get(url);
      if (!p) { p = fetch('social/api/preview?url=' + encodeURIComponent(url), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null); previews.set(url, p); }
      const v = await p; if (!v || (!v.title && !v.desc) || !el.isConnected) return;
      el.outerHTML = `<a class="sjm-link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">${v.image ? `<img src="${esc(v.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><small>${esc(v.site)}</small><b>${esc(v.title)}</b>${v.desc ? `<p>${esc(v.desc)}</p>` : ''}</div></a>`;
    }
    async function loadOlder() {
      const data = st.msgs.get(st.cid); if (!data || !data.more || st.loadingOlder) return;
      st.loadingOlder = true; const cid = st.cid;
      const r = await S.req('msgs.get', { cid, before: data.list[0] ? data.list[0].id : undefined, limit: 50 });
      st.loadingOlder = false; if (cid !== st.cid || r.error) return;
      data.list = (r.msgs || []).concat(data.list); data.more = r.more; st.keepTop = true; renderMsgs(false);
    }
    async function jump(id) {
      for (let i = 0; i < 12 && !(st.msgs.get(st.cid) || { list: [] }).list.some(m => m.id === id) && st.msgs.get(st.cid).more; i++) await loadOlder();
      const el = q(`.sjm-m[data-id="${id}"]`); if (!el) return Toast.show('Messages', 'That message is too far back.', 'chat', 2500);
      el.scrollIntoView({ block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    const msgById = id => { for (const d of st.msgs.values()) { const m = d.list.find(x => x.id === id); if (m) return m; } return null; };
    function onMsgClick(e) {
      const t = e.target;
      const a = t.closest('.sjm-b a[href]'); if (a && !a.hasAttribute('download')) { e.preventDefault(); return openLink(a.href); }
      const v = t.closest('[data-view]'); if (v) return viewMedia(v.dataset.view, v.dataset.name);
      const g = t.closest('[data-goto]'); if (g) return jump(+g.dataset.goto);
      const inv = t.closest('[data-inv]'); if (inv) return S.joinInvite(JSON.parse(inv.dataset.inv));
      const cb = t.closest('[data-callback]'); if (cb) return S.startCall(st.cid, cb.dataset.callback === '1');
      const older = t.closest('[data-older]'); if (older) return loadOlder();
      const vo = t.closest('.sjm-voice'); if (vo && (t.closest('button') || t.closest('.sjm-wave'))) return playVoice(vo, t.closest('.sjm-wave') ? e : null);
      const row = t.closest('.sjm-m'); if (!row) return;
      const m = msgById(+row.dataset.id); if (!m) return;
      const rx = t.closest('[data-rx]'); if (rx) return react(m, rx.dataset.rx);
      const qr = t.closest('[data-qr]'); if (qr) return react(m, qr.dataset.qr);
      if (t.closest('[data-more]')) return openPick('react', m);
      if (t.closest('[data-rep]')) return startReply(m);
      if (t.closest('[data-thread]')) return openThread(m);
      if (t.closest('[data-menu]')) { const r = t.closest('[data-menu]').getBoundingClientRect(); return msgMenu(m, r.left, r.bottom); }
    }
    function onMsgMenu(e) { const row = e.target.closest('.sjm-m'); if (!row || e.target.closest('a,video')) return; const m = msgById(+row.dataset.id); if (!m || m.kind === 'deleted') return; e.preventDefault(); msgMenu(m, e.clientX, e.clientY); }
    function msgMenu(m, x, y) {
      const mine = m.uid === S.me.id, c = S.convos.get(m.cid), admin = c && ['owner', 'admin'].includes(c.role) || ['admin', 'owner'].includes(S.me.role);
      ContextMenu.show(x, y, [
        { title: QUICK.join('  ') },
        ...QUICK.map(e => null),
        { label: 'React…', icon: 'smile', action: () => openPick('react', m) },
        { label: 'Reply', icon: 'reply', action: () => startReply(m) },
        { label: 'Reply in thread', icon: 'thread', action: () => openThread(m) },
        m.kind === 'text' ? { label: 'Copy text', icon: 'copy', action: () => navigator.clipboard && navigator.clipboard.writeText(m.body).catch(() => {}) } : null,
        mine && m.kind === 'text' ? { label: 'Edit', icon: 'edit', action: () => startEdit(m) } : null,
        { label: m.pinned ? 'Unpin' : 'Pin', icon: 'pin', action: () => S.req('msg.pin', { id: m.id, on: !m.pinned }).then(() => pinBar()) },
        { label: 'Forward', icon: 'forward', action: () => forward(m) },
        '-',
        !mine ? { label: 'Report', icon: 'bell', action: () => report(m) } : null,
        mine || admin ? { label: 'Delete', icon: 'trash', danger: true, action: async () => { if (await Dialog.confirm('Delete message?', 'It will be removed for everyone.', { okText: 'Delete', danger: true })) S.req('msg.delete', { id: m.id }); } } : null,
      ].filter(x => x !== null));
      const t = document.querySelector('.ctx .ctx-title');
      if (t) { t.innerHTML = QUICK.map(e => `<button style="border:none;background:none;font-size:22px;cursor:pointer;padding:2px 4px;border-radius:8px" data-e="${e}">${e}</button>`).join(''); t.onclick = ev => { const b = ev.target.closest('[data-e]'); if (b) { react(m, b.dataset.e); ContextMenu.hide(); } }; }
    }
    function react(m, e) {
      // optimistic: toggle locally, the server's update replaces it
      m.reacts = m.reacts || {}; const l = m.reacts[e] = m.reacts[e] || []; const i = l.indexOf(S.me.id); if (i >= 0) l.splice(i, 1); else l.push(S.me.id);
      renderMsgs(false); S.req('msg.react', { id: m.id, emoji: e }).then(r => { if (r.error) Toast.show('Reaction', r.error, 'smile'); });
      const rec = store.get('recentEmoji', []); store.set('recentEmoji', [e].concat(rec.filter(x => x !== e)).slice(0, 32));
    }
    async function report(m) { const why = await Dialog.prompt('Report message', 'Tell the moderators what’s wrong (spam, harassment…).', ''); if (why === null) return; const r = await S.req('report', { msg: m.id, reason: why }); Toast.show(r.error ? 'Couldn’t report' : 'Reported', r.error || 'Thanks — the admins will take a look.', 'bell', 3000); }
    function startReply(m) { st.reply = m; st.edit = null; ctxBar(); q('.sjm-ta').focus(); }
    function startEdit(m) { st.edit = m; st.reply = null; const ta = q('.sjm-ta'); ta.value = m.body; ta.dispatchEvent(new Event('input')); ctxBar(); ta.focus(); }
    function ctxBar() {
      const bar = q('.sjm-ctx'); if (!bar) return;
      const m = st.reply || st.edit;
      bar.hidden = !m; sendIcon();
      if (!m) return;
      bar.innerHTML = `${svg(st.edit ? 'edit' : 'reply')}<span><b>${st.edit ? 'Editing message' : 'Replying to ' + esc(S.name(m.uid))}</b> · ${esc(S.preview({ ...m, uid: 0 }))}</span><button class="sjm-ib" title="Cancel (Esc)">${svg('close')}</button>`;
      bar.querySelector('button').onclick = () => { if (st.edit) { q('.sjm-ta').value = ''; } st.reply = st.edit = null; ctxBar(); };
    }

    /* ---------- sending ---------- */
    async function send() {
      const ta = q('.sjm-ta'), c = S.convos.get(st.cid); if (!ta || !c) return;
      const text = ta.value.replace(/\s+$/, '');
      if (st.edit) { if (text.trim()) { const r = await S.req('msg.edit', { id: st.edit.id, body: text }); if (r.error) return Toast.show('Couldn’t edit', r.error, 'edit'); } st.edit = null; ta.value = ''; ta.dispatchEvent(new Event('input')); ctxBar(); return; }
      if (!text.trim() && !st.atts.length) { if (!st.rec) startRecording(); return; }
      if (st.atts.some(a => !a.done && !a.err)) return Toast.show('Still uploading', 'Wait for your files to finish uploading.', 'paperclip', 2000);
      const atts = st.atts.filter(a => a.done), replyTo = st.reply && st.reply.id;
      st.atts = []; st.reply = null; renderAtts(); ctxBar();
      ta.value = ''; ta.dispatchEvent(new Event('input')); const d = store.get('drafts', {}); delete d[c.id]; store.set('drafts', d);
      const groups = { image: atts.filter(a => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(a.file.type)), video: atts.filter(a => /^video\//.test(a.file.type)) };
      groups.file = atts.filter(a => !groups.image.includes(a) && !groups.video.includes(a));
      for (const kind of ['image', 'video', 'file']) if (groups[kind].length) { const r = await S.req('msg.send', { cid: c.id, kind, meta: { files: groups[kind].map(a => a.id) }, replyTo }); if (r.error) Toast.show('Not sent', r.error, 'chat'); }
      if (text.trim()) await sendMsg({ kind: 'text', body: text, replyTo });
    }
    async function sendMsg(a) {
      const c = S.convos.get(st.cid); if (!c) return;
      const clientId = 'c' + Date.now() + Math.random(), data = st.msgs.get(c.id);
      // show it right away (optimistic), replaced by the real one when the server answers
      const temp = { id: 9e15 + Math.random(), cid: c.id, uid: S.me.id, kind: a.kind, body: a.body || '', meta: a.meta || null, at: Date.now(), pending: true, clientId, reacts: {}, replyTo: a.replyTo ? (() => { const r = msgById(a.replyTo); return r && { id: r.id, uid: r.uid, kind: r.kind, body: r.body }; })() : null };
      if (data && (a.kind === 'text' || a.kind === 'sticker')) { data.list.push(temp); renderMsgs(true); }
      const r = await S.req('msg.send', { cid: c.id, ...a, clientId });
      if (data) { const i = data.list.indexOf(temp); if (i >= 0) data.list.splice(i, 1); }
      if (r.error) { Toast.show('Not sent', r.error, 'chat'); renderMsgs(false); if (a.kind === 'text') { const ta = q('.sjm-ta'); if (ta && !ta.value) { ta.value = a.body; ta.dispatchEvent(new Event('input')); } } return; }
      if (data && !data.list.some(m => m.id === r.msg.id)) { data.list.push(r.msg); }
      renderMsgs(true); Social.blip(980, .05, 'sine', .03);
    }
    function addAtts(files) {
      if (!st.cid) return;
      for (const file of files.slice(0, 10)) {
        if (file.size > 25 * 1048576) { Toast.show('Too big', `${file.name} is over 25 MB.`, 'paperclip'); continue; }
        const a = { file, p: 0, url: /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : null };
        st.atts.push(a);
        upload(file, 'attachment', p => { a.p = p; const bar = root.querySelector(`.sjm-att[data-k="${st.atts.indexOf(a)}"] .bar`); if (bar) bar.style.width = p * 100 + '%'; })
          .then(r => { a.id = r.id; a.done = true; renderAtts(); }, e => { a.err = e.message; renderAtts(); Toast.show('Upload failed', `${file.name}: ${e.message}`, 'paperclip'); });
      }
      renderAtts(); sendIcon();
    }
    function renderAtts() {
      const box = q('.sjm-atts'); if (!box) return;
      box.hidden = !st.atts.length;
      box.innerHTML = st.atts.map((a, i) => `<div class="sjm-att" data-k="${i}" title="${esc(a.file.name)}">${a.url ? (/^video/.test(a.file.type) ? `<video src="${a.url}" muted></video>` : `<img src="${a.url}" alt="">`) : `<span>📄<br>${esc(a.file.name.slice(0, 18))}</span>`}<button class="x" data-x="${i}" title="Remove">✕</button>${a.err ? '<span style="position:absolute;inset:auto 0 0;background:#ef4444;color:#fff;font-size:10px">Failed</span>' : `<i class="bar" style="width:${a.done ? 0 : a.p * 100}%"></i>`}</div>`).join('');
      box.onclick = e => { const x = e.target.closest('[data-x]'); if (x) { const a = st.atts.splice(+x.dataset.x, 1)[0]; if (a && a.url) URL.revokeObjectURL(a.url); renderAtts(); sendIcon(); } };
      sendIcon();
    }
    win.onDropFiles = files => { if (!S.me || !st.cid) { Toast.show('Messages', 'Open a chat first, then drop files on it.', 'chat'); return; } addAtts([...files]); };

    /* ---------- voice messages ---------- */
    async function startRecording() {
      if (S.insecure && S.insecure()) { S.goSecure('Voice messages need your microphone.'); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) return Toast.show('Voice messages', window.isSecureContext ? 'This browser can’t record audio.' : 'Recording needs a secure page: open SanjivramOS as http://localhost on this phone, or through your https address.', 'mic', 6000);
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { return Toast.show('Microphone blocked', 'Allow microphone access to record voice messages.', 'mic'); }
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {}), chunks = [], peaks = [];
      const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize), t0 = Date.now();
      st.rec = { rec, stream, ac, cancel: false };
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      const row = q('.sjm-row'), keep = row.innerHTML;
      row.innerHTML = `<button class="sjm-ib" data-r="x" title="Cancel">${svg('trash')}</button><div class="sjm-rec"><i></i><span>0:00</span><canvas width="300" height="28"></canvas></div><button class="sjm-send" data-r="ok" title="Send voice message">${svg('send')}</button>`;
      const cv = row.querySelector('canvas'), g = cv.getContext('2d'), tl = row.querySelector('.sjm-rec span');
      const draw = () => {
        if (!st.rec) return;
        an.getByteTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v - 128) / 128); peaks.push(pk);
        g.clearRect(0, 0, 300, 28); g.fillStyle = '#ef4444'; const n = Math.min(peaks.length, 75); for (let i = 0; i < n; i++) { const v = peaks[peaks.length - n + i], hh = Math.max(2, v * 26); g.fillRect(i * 4, 14 - hh / 2, 3, hh); }
        tl.textContent = fmtTime((Date.now() - t0) / 1000);
        if (Date.now() - t0 > 5 * 60e3) row.querySelector('[data-r=ok]').click();
        requestAnimationFrame(draw);
      };
      draw();
      rec.start(250);
      const finish = async ok => {
        const r = st.rec; st.rec = null;
        await new Promise(res => { rec.onstop = res; rec.stop(); });
        stream.getTracks().forEach(t => t.stop()); ac.close();
        row.innerHTML = keep; renderMain();
        if (!ok) return;
        const dur = (Date.now() - t0) / 1000; if (dur < .6) return Toast.show('Too short', 'Hold on a little longer.', 'mic', 1500);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const wave = Array.from({ length: 48 }, (_, i) => { const a = Math.floor(i * peaks.length / 48), b = Math.max(a + 1, Math.floor((i + 1) * peaks.length / 48)); let m = 0; for (let k = a; k < b; k++) m = Math.max(m, peaks[k] || 0); return +Math.min(1, m * 1.6).toFixed(2); });
        try { const up = await upload(new File([blob], `voice-${Date.now()}.${/mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'}`, { type: blob.type.split(';')[0] }), 'voice'); const s = await S.req('msg.send', { cid: st.cid, kind: 'voice', meta: { files: [up.id], duration: Math.round(dur), wave } }); if (s.error) Toast.show('Not sent', s.error, 'mic'); }
        catch (e) { Toast.show('Voice message', e.message, 'mic'); }
      };
      row.querySelector('[data-r=x]').onclick = () => finish(false);
      row.querySelector('[data-r=ok]').onclick = () => finish(true);
    }
    let playing = null;
    function playVoice(el, seekEv) {
      if (playing && playing.el !== el) { playing.a.pause(); }
      if (!playing || playing.el !== el) { const a = new Audio(el.dataset.src); playing = { el, a }; a.ontimeupdate = () => { const bars = el.querySelectorAll('.sjm-wave i'), p = a.currentTime / (a.duration || 1); bars.forEach((b, i) => b.classList.toggle('p', i / bars.length <= p)); el.querySelector('small').textContent = fmtTime(a.currentTime); }; a.onended = () => { el.querySelector('button').innerHTML = svg('play'); el.querySelectorAll('.sjm-wave i').forEach(b => b.classList.remove('p')); playing = null; }; }
      const a = playing.a;
      if (seekEv) { const r = el.querySelector('.sjm-wave').getBoundingClientRect(); const p = (seekEv.clientX - r.left) / r.width; const go = () => { a.currentTime = p * (a.duration || 0); }; if (a.readyState) go(); else a.addEventListener('loadedmetadata', go, { once: true }); }
      if (a.paused || seekEv) { a.play().catch(() => {}); el.querySelector('button').innerHTML = svg('pause'); } else { a.pause(); el.querySelector('button').innerHTML = svg('play'); }
    }

    /* ---------- emoji / GIF / sticker picker ---------- */
    function openPick(mode = 'compose', target = null) {
      const p = q('.sjm-pick'); if (!p) return;
      if (st.pick && st.pick.mode === mode && !target) return closePick();
      st.pick = { mode, target }; p.hidden = false; fitPick(); setTimeout(fitPick, 350);
      if (!st.pickRO && window.ResizeObserver) { st.pickRO = new ResizeObserver(() => st.pick && fitPick()); st.pickRO.observe(root); }
      renderPick();
      setTimeout(() => document.addEventListener('pointerdown', st.pickOut = e => { if (!e.target.closest('.sjm-pick') && !e.target.closest('[data-a=pick]') && !e.target.closest('[data-more]')) closePick(); }, true), 0);
    }
    // The picker is anchored to the composer, so size it from the space above the composer (inside the chat area).
    function fitPick() { const p = q('.sjm-pick'), comp = q('.sjm-comp'), head = q('.sjm-head'); if (!p || !comp) return; const top = head ? head.getBoundingClientRect().bottom : comp.closest('.sjm-main').getBoundingClientRect().top; p.style.setProperty('--pick-h', Math.max(150, Math.min(430, comp.getBoundingClientRect().top - top - 10)) + 'px'); }
    function closePick() { const p = q('.sjm-pick'); if (p) p.hidden = true; st.pick = null; document.removeEventListener('pointerdown', st.pickOut, true); }
    function renderPick() {
      const p = q('.sjm-pick'); if (!p || !st.pick) return; fitPick();
      const tabs = st.pick.mode === 'react' ? [['emoji', 'Emoji']] : [['emoji', 'Emoji'], ['gif', 'GIFs'], ['sticker', 'Stickers']];
      if (st.pick.mode === 'react') st.pickTab = 'emoji';
      p.innerHTML = `<div class="sjm-pt">${tabs.map(([k, l]) => `<button class="${st.pickTab === k ? 'on' : ''}" data-pt="${k}">${l}</button>`).join('')}</div><div class="sjm-ps"><input class="sjm-in" type="search" placeholder="${st.pickTab === 'gif' ? 'Search GIPHY' : st.pickTab === 'sticker' ? 'Search stickers' : 'Search emoji'}" aria-label="Search">${st.pickTab === 'emoji' ? `<button class="sjm-tone" title="Skin tone">${withTone('👋', store.get('tone', 0))}</button>` : ''}</div><div class="sjm-pbody" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>`;
      p.querySelector('.sjm-pt').onclick = e => { const b = e.target.closest('[data-pt]'); if (b) { st.pickTab = b.dataset.pt; store.set('pickTab', st.pickTab); renderPick(); } };
      const inp = p.querySelector('.sjm-in'); setTimeout(() => inp.focus(), 20);
      ({ emoji: emojiTab, gif: gifTab, sticker: stickerTab })[st.pickTab](p, inp);
    }
    async function emojiTab(p, inp) {
      const body = p.querySelector('.sjm-pbody'); body.innerHTML = '<div class="sjm-pb"><div class="sjm-skel"></div></div>';
      const data = await loadEmoji(); if (!st.pick) return;
      const tone = store.get('tone', 0), ICON = { 'Smileys & Emotion': '😀', 'People & Body': '👋', 'Animals & Nature': '🐻', 'Food & Drink': '🍔', 'Travel & Places': '✈️', 'Activities': '⚽', 'Objects': '💡', 'Symbols': '❤️', 'Flags': '🏁' };
      const cell = e => `<button class="sjm-e" data-e="${esc(e[2] ? withTone(e[0], tone) : e[0])}" title="${esc(e[1])}">${e[2] ? withTone(e[0], tone) : e[0]}</button>`;
      const draw = () => {
        const qy = inp.value.trim().toLowerCase();
        let html = '';
        if (qy) { const words = qy.split(/\s+/); const hits = []; for (const [, list] of data) for (const e of list) if (words.every(w => e[1].includes(w))) hits.push(e); html = hits.length ? `<div class="sjm-eg-grid">${hits.slice(0, 300).map(cell).join('')}</div>` : '<div class="sjm-empty">No emoji found</div>'; }
        else {
          const rec = store.get('recentEmoji', []);
          if (rec.length) html += `<div class="sjm-eg" data-g="recent">Recently used</div><div class="sjm-eg-grid">${rec.map(e => `<button class="sjm-e" data-e="${esc(e)}">${e}</button>`).join('')}</div>`;
          html += data.map(([g, list]) => `<div class="sjm-eg" data-g="${esc(g)}">${esc(g)}</div><div class="sjm-eg-grid">${list.map(cell).join('')}</div>`).join('');
        }
        body.innerHTML = `<div class="sjm-pb">${html}</div>${qy ? '' : `<div class="sjm-pcats">${data.map(([g]) => `<button data-cat="${esc(g)}" title="${esc(g)}">${ICON[g] || '•'}</button>`).join('')}</div>`}`;
        const pb = body.querySelector('.sjm-pb');
        pb.onclick = e => { const b = e.target.closest('[data-e]'); if (b) pickEmoji(b.dataset.e); };
        const cats = body.querySelector('.sjm-pcats'); if (cats) cats.onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { const h2 = pb.querySelector(`.sjm-eg[data-g="${CSS.escape(b.dataset.cat)}"]`); if (h2) pb.scrollTop = h2.offsetTop - 2; } };
      };
      inp.oninput = () => { clearTimeout(st.eT); st.eT = setTimeout(draw, 80); };
      draw();
      const tb = p.querySelector('.sjm-tone');
      tb.onclick = () => { const box = h(`<div class="sjm-tones">${TONES.map((t, i) => `<button data-t="${i}">${withTone('👋', i)}</button>`).join('')}</div>`); p.appendChild(box); box.onclick = e => { const b = e.target.closest('[data-t]'); if (b) { store.set('tone', +b.dataset.t); renderPick(); } }; };
    }
    function pickEmoji(e) {
      const rec = store.get('recentEmoji', []); store.set('recentEmoji', [e].concat(rec.filter(x => x !== e)).slice(0, 32));
      if (st.pick && st.pick.mode === 'react') { react(st.pick.target, e); closePick(); return; }
      const ta = q('.sjm-ta'); const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + e + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + e.length; ta.dispatchEvent(new Event('input')); ta.focus();
    }
    function gifTab(p, inp, kind = 'gifs') {
      const body = p.querySelector('.sjm-pbody');
      if (!S.gif) {
        const adm = S.me && ['admin', 'owner'].includes(S.me.role);
        body.innerHTML = `<div class="sjm-pb"><div class="sjm-empty" style="padding:18px 16px;text-align:left;line-height:1.5">GIFs come from <b>GIPHY</b> and need a free API key (Google’s Tenor GIF service shut down in June 2026, and no GIF site works without a key).<br><br>
          ${adm ? `1. Open <b>developers.giphy.com</b> → sign up → <b>Create an App</b> → <b>API</b>.<br>2. Copy the API key and paste it here:<br>
          <div style="display:flex;gap:6px;margin-top:8px"><input class="sjm-in" data-gk placeholder="GIPHY API key" style="flex:1;min-width:0" autocomplete="off"><button class="sjm-btn" data-gks>Save</button></div><div data-gkm style="margin-top:6px;font-size:12px"></div>
          <small style="color:var(--text-3)">The key stays on your SanjivramOS server; everyone in Messages gets GIFs.</small>` : 'Ask the Messages admin (the first account made on this server) to add a GIPHY key in this tab.'}</div>${favGrid(true) ? `<div class="sjm-gifs">${favGrid(true)}</div>` : ''}</div>`;
        bindGifGrid(body);
        const sv = body.querySelector('[data-gks]');
        if (sv) sv.onclick = async e => {
          e.stopPropagation(); const k = body.querySelector('[data-gk]').value.trim(), msg = body.querySelector('[data-gkm]'); if (!k) return;
          sv.disabled = true; msg.textContent = 'Checking the key with GIPHY…';
          try { const r = await fetch('social/api/gifkey', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: k }) }).then(r => r.json()); if (r.error) throw new Error(r.error); S.gif = true; renderPick(); }
          catch (err) { msg.textContent = err.message === 'Not found' ? 'Your SanjivramOS server needs a restart first (run: sanjivramos restart).' : err.message; msg.style.color = '#ef4444'; sv.disabled = false; }
        };
        return;
      }
      let offset = 0, next = null, loading = false, query = '';
      body.innerHTML = `<div class="sjm-terms"></div><div class="sjm-pb"><div class="sjm-gifs"></div><div class="sjm-sentinel" style="height:20px"></div></div><div class="sjm-attr">Powered by GIPHY</div>`;
      const grid = body.querySelector('.sjm-gifs'), terms = body.querySelector('.sjm-terms'), pb = body.querySelector('.sjm-pb');
      const api = (type, extra = '') => fetch(`social/api/gif?type=${type}&kind=${kind}${extra}`, { credentials: 'same-origin' }).then(r => r.json());
      const item = g => `<button class="sjm-gi" data-g='${esc(JSON.stringify({ url: g.url, mp4: g.mp4, w: g.fw, h: g.fh, title: g.title, preview: g.preview, pw: g.w, ph: g.h }))}' title="${esc(g.title)}" style="aspect-ratio:${g.w}/${g.h}"><img src="${esc(gp(g.preview))}" alt="${esc(g.title)}" loading="lazy" width="${g.w}" height="${g.h}"><span class="fav${isFav(g.url) ? ' on' : ''}" data-fav>★</span></button>`;
      const load = async (reset) => {
        if (loading) return; loading = true;
        if (reset) { offset = 0; grid.innerHTML = '<div class="sjm-skel"></div>'.repeat(4); pb.scrollTop = 0; }
        const r = await api(query ? 'search' : 'trending', `&q=${encodeURIComponent(query)}&offset=${offset}`);
        loading = false; if (!st.pick) return;
        if (r.error) { grid.innerHTML = `<div class="sjm-empty">${esc(r.message || r.error)}</div>`; return; }
        if (reset) grid.innerHTML = (!query && kind === 'gifs' ? favGrid(true) : '');
        grid.insertAdjacentHTML('beforeend', r.items.map(item).join('') || (reset ? '<div class="sjm-empty">No results</div>' : ''));
        next = r.next; offset = next || offset;
      };
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting && next) load(false); }, { root: pb, rootMargin: '300px' });
      io.observe(body.querySelector('.sjm-sentinel'));
      const showTerms = list => { terms.innerHTML = list.map(t => `<button data-term="${esc(t)}">${esc(t)}</button>`).join(''); };
      api('trending-searches').then(r => { if (!query && r.terms) showTerms(['😂 reaction', 'anime', 'gaming', 'meme', 'love', 'happy', 'sad', 'thank you', 'gg', 'hype'].concat(r.terms).slice(0, 22)); });
      terms.onclick = e => { const b = e.target.closest('[data-term]'); if (b) { inp.value = b.dataset.term.replace(/^\S+ /, m => /\p{Extended_Pictographic}/u.test(m) ? '' : m); query = inp.value.trim(); load(true); } };
      inp.oninput = () => { clearTimeout(st.gT); st.gT = setTimeout(() => { query = inp.value.trim(); load(true); if (query.length >= 2) api('autocomplete', `&q=${encodeURIComponent(query)}`).then(r => r.terms && r.terms.length && showTerms(r.terms)); }, 320); };
      bindGifGrid(body, kind);
      load(true);
    }
    const favs = () => store.get('favGifs', []), isFav = u => favs().some(f => f.url === u);
    function favGrid(inline) { const f = favs(), r = store.get('recentGifs', []); if (!f.length && !r.length) return ''; const it = g => `<button class="sjm-gi" data-g='${esc(JSON.stringify(g))}' style="aspect-ratio:${g.pw || 1}/${g.ph || 1}"><img src="${esc(gp(g.preview))}" alt="" loading="lazy"><span class="fav${isFav(g.url) ? ' on' : ''}" data-fav>★</span></button>`; return (inline ? '' : '<div class="sjm-pb"><div class="sjm-gifs">') + (f.length ? f.map(it).join('') : '') + r.filter(g => !isFav(g.url)).slice(0, 8).map(it).join('') + (inline ? '' : '</div></div>'); }
    function bindGifGrid(body, kind = 'gifs') {
      body.onclick = async e => {
        const b = e.target.closest('[data-g]'); if (!b) return;
        const g = JSON.parse(b.dataset.g);
        if (e.target.closest('[data-fav]')) { const f = favs(), i = f.findIndex(x => x.url === g.url); if (i >= 0) f.splice(i, 1); else f.unshift(g); store.set('favGifs', f.slice(0, 60)); e.target.classList.toggle('on', i < 0); return; }
        store.set('recentGifs', [g].concat(store.get('recentGifs', []).filter(x => x.url !== g.url)).slice(0, 24));
        closePick();
        await sendMsg({ kind: kind === 'stickers' ? 'sticker' : 'gif', meta: { url: g.url, mp4: g.mp4, w: g.w, h: g.h, title: g.title }, replyTo: st.reply && st.reply.id });
        st.reply = null; ctxBar();
      };
    }
    async function stickerTab(p, inp) {
      const body = p.querySelector('.sjm-pbody');
      const mine = (await S.req('sticker.list')).stickers || [];
      const draw = () => {
        const qy = inp.value.trim().toLowerCase();
        body.innerHTML = `<div class="sjm-pb">
          <div class="sjm-eg">My stickers <button class="sjm-btn" data-up style="float:right;padding:3px 10px;font-size:12px">+ Add</button></div>
          <div class="sjm-stks">${mine.map(s => `<button data-file="${esc(s.file)}" title="${esc(s.pack)}"><img src="social/file/${esc(s.file)}" alt="" loading="lazy"><span class="x" data-del="${s.id}">✕</span></button>`).join('') || '<div class="sjm-empty" style="grid-column:1/-1;padding:10px">Add your own pictures as stickers (PNG/GIF/WebP).</div>'}</div>
          ${STICKER_PACKS.map(([name, list]) => `<div class="sjm-eg">${name}</div><div class="sjm-stks">${list.map(e => `<button data-emo="${e}" data-pack="${name}">${e}</button>`).join('')}</div>`).join('')}
          ${S.gif ? '<div class="sjm-eg">GIPHY stickers</div><div class="sjm-gstk"></div>' : ''}</div><input type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden multiple>`;
        if (S.gif && qy) { const box = body.querySelector('.sjm-gstk'); box.innerHTML = '<div class="sjm-skel"></div>'; fetch(`social/api/gif?type=search&kind=stickers&q=${encodeURIComponent(qy)}`).then(r => r.json()).then(r => { box.innerHTML = `<div class="sjm-gifs">${(r.items || []).map(g => `<button class="sjm-gi" data-g='${esc(JSON.stringify({ url: g.url, mp4: g.mp4, w: g.fw, h: g.fh, title: g.title, preview: g.preview }))}'><img src="${esc(gp(g.preview))}" alt="" loading="lazy"></button>`).join('')}</div>`; }); }
        else if (S.gif) body.querySelector('.sjm-gstk').innerHTML = '<div class="sjm-empty" style="padding:8px">Type to search GIPHY stickers</div>';
        const file = body.querySelector('input[type=file]');
        body.querySelector('[data-up]').onclick = () => file.click();
        file.onchange = async () => { for (const f of file.files) { try { const up = await upload(f, 'sticker'); await S.req('sticker.add', { file: up.id }); } catch (e) { Toast.show('Sticker', e.message, 'sticker'); } } const r = await S.req('sticker.list'); mine.length = 0; mine.push(...(r.stickers || [])); draw(); };
        body.onclick = async e => {
          const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); await S.req('sticker.remove', { id: +del.dataset.del }); const r = await S.req('sticker.list'); mine.length = 0; mine.push(...(r.stickers || [])); return draw(); }
          const g = e.target.closest('[data-g]'); if (g) { const v = JSON.parse(g.dataset.g); closePick(); return sendMsg({ kind: 'sticker', meta: { url: v.url, mp4: v.mp4, w: v.w, h: v.h, title: v.title } }); }
          const em = e.target.closest('[data-emo]'); if (em) { closePick(); return sendMsg({ kind: 'sticker', meta: { emoji: em.dataset.emo, pack: em.dataset.pack } }); }
          const f = e.target.closest('[data-file]'); if (f) { closePick(); return sendMsg({ kind: 'sticker', meta: { file: f.dataset.file } }); }
        };
      };
      inp.oninput = () => { clearTimeout(st.sT); st.sT = setTimeout(draw, 300); };
      draw();
    }

    /* ---------- header actions ---------- */
    function act(a, e) {
      const c = S.convos.get(st.cid);
      if (a === 'back') { root.classList.add('list'); st.cid = null; win.viewingCid = null; renderList(); return; }
      if (a === 'voice') return S.startCall(c.id, false);
      if (a === 'video') return S.startCall(c.id, true);
      if (a === 'joincall') { const call = [...S.calls.values()].find(x => x.cid === c.id); if (call) S.joinCall(call.id, call.video); return; }
      if (a === 'info') { st.drawer = st.drawer === 'info' ? null : 'info'; return renderDrawer(); }
      if (a === 'search') { st.drawer = st.drawer === 'search' ? null : 'search'; return renderDrawer(); }
      if (a === 'attach') return q('.sjm-file-in').click();
      if (a === 'pick') return openPick('compose');
      if (a === 'send') return send();
    }

    /* ---------- drawer: info / thread / search / pins ---------- */
    function renderDrawer() {
      const d = q('.sjm-drawer'); if (!d) return;
      const c = S.convos.get(st.cid);
      d.classList.toggle('open', !!(st.drawer && c));
      if (!st.drawer || !c) { d.innerHTML = ''; return; }
      const head = t => `<div class="sjm-dh"><b>${t}</b><button class="sjm-ib" data-dx title="Close">${svg('close')}</button></div>`;
      if (st.drawer === 'info') {
        const other = S.convoOther(c), admin = ['owner', 'admin'].includes(c.role);
        const media = (st.msgs.get(c.id) || { list: [] }).list.filter(m => m.kind === 'image').flatMap(m => m.meta.files).slice(-12).reverse();
        d.innerHTML = head(c.kind === 'dm' ? 'Contact' : 'Group') + `<div class="sjm-db">
          <div class="sjm-info-top">${convoAv(c, 'l')}<b>${esc(S.convoTitle(c))}</b>${other ? `<small>@${esc(other.username)}</small>${other.bio ? `<p style="margin:4px 0 0;color:var(--text-2)">${esc(other.bio)}</p>` : ''}` : `<small>${c.members.length} members</small>`}</div>
          <div class="sjm-acts"><button class="sjm-act" data-i="voice">${svg('phone')}Call</button><button class="sjm-act" data-i="video">${svg('video')}Video</button><button class="sjm-act" data-i="mute">${svg('bell')}${c.muted ? 'Unmute' : 'Mute'}</button><button class="sjm-act" data-i="search">${svg('search')}Search</button></div>
          ${c.kind === 'group' ? `<div class="sjm-sec">Members</div>${c.members.map(m => `<div class="sjm-mem">${av(m, 's')}<div class="t"><b>${esc(m.display)}${m.id === S.me.id ? ' (you)' : ''}</b><small>${m.role === 'owner' ? 'Owner · ' : ''}${m.online ? 'Online' : '@' + esc(m.username)}</small></div>${admin && m.id !== S.me.id ? `<button class="sjm-ib" data-kick="${m.id}" title="Remove">${svg('close')}</button>` : ''}</div>`).join('')}
            <button class="sjm-opt" data-i="add">${svg('plus') || '+'}<span>Add people</span></button><button class="sjm-opt" data-i="rename">${svg('edit')}<span>Rename group</span></button><button class="sjm-opt" data-i="photo">${svg('camera')}<span>Change group photo</span></button>` : ''}
          ${media.length ? `<div class="sjm-sec">Shared photos</div><div class="sjm-media">${media.map(f => `<img src="${esc(f.url)}" data-view="${esc(f.url)}" alt="" loading="lazy">`).join('')}</div>` : ''}
          <div class="sjm-sec">Settings</div>
          <button class="sjm-opt" data-i="mute">${svg('bell')}<span>Mute notifications</span><i class="sjm-switch${c.muted ? ' on' : ''}"></i></button>
          <button class="sjm-opt" data-i="archive">${svg('folder') || '🗄'}<span>${c.archived ? 'Unarchive chat' : 'Archive chat'}</span></button>
          <button class="sjm-opt" data-i="theme">${svg('palette')}<span>Chat theme</span><small style="color:var(--text-3)">${esc(c.theme ? (c.theme.emoji || '') + ' ' + (c.theme.name || 'Custom') : 'Default')}</small></button>
          <button class="sjm-opt" data-i="pins">${svg('pin')}<span>Pinned messages</span></button>
          ${other ? `<button class="sjm-opt" data-i="addfriend">${svg('user')}<span>${S.friends.some(f => f.user.id === other.id && f.status === 'accepted') ? 'Remove friend' : 'Add friend'}</span></button><button class="sjm-opt danger" data-i="block">${svg('close')}<span>Block @${esc(other.username)}</span></button><button class="sjm-opt danger" data-i="report">${svg('bell')}<span>Report</span></button>` : `<button class="sjm-opt danger" data-i="leave">${svg('logout') || '⎋'}<span>Leave group</span></button>`}
          <input type="file" accept="image/*" hidden></div>`;
        d.onclick = async e => {
          if (e.target.closest('[data-dx]')) { st.drawer = null; return renderDrawer(); }
          const v = e.target.closest('[data-view]'); if (v) return viewMedia(v.dataset.view);
          const k = e.target.closest('[data-kick]'); if (k) { if (await Dialog.confirm('Remove from group?', S.name(+k.dataset.kick), { okText: 'Remove', danger: true })) { const r = await S.req('convo.kick', { cid: c.id, id: +k.dataset.kick }); if (r.error) Toast.show('Group', r.error, 'users'); } return; }
          const b = e.target.closest('[data-i]'); if (!b) return;
          const i = b.dataset.i;
          if (i === 'voice' || i === 'video') return S.startCall(c.id, i === 'video');
          if (i === 'mute') return setConvo(c, { muted: !c.muted });
          if (i === 'archive') return setConvo(c, { archived: !c.archived });
          if (i === 'search' || i === 'pins') { st.drawer = i; return renderDrawer(); }
          if (i === 'theme') return themePicker(c);
          if (i === 'rename') { const n = await Dialog.prompt('Rename group', '', c.name || ''); if (n !== null) S.req('convo.update', { cid: c.id, name: n }); return; }
          if (i === 'photo') { const f = d.querySelector('input[type=file]'); f.onchange = async () => { try { const up = await upload(f.files[0], 'avatar'); await S.req('convo.update', { cid: c.id, avatar: up.id }); } catch (er) { Toast.show('Photo', er.message, 'camera'); } }; return f.click(); }
          if (i === 'add') return pickPeople('Add people', ids => S.req('convo.add', { cid: c.id, members: ids }), c.members.map(m => m.id));
          if (i === 'leave') { if (await Dialog.confirm('Leave group?', S.convoTitle(c), { okText: 'Leave', danger: true })) { await S.req('convo.leave', { cid: c.id }); S.convos.delete(c.id); st.cid = null; st.drawer = null; render(); } return; }
          if (i === 'addfriend') { const fr = S.friends.some(f => f.user.id === other.id && f.status === 'accepted'); const r = await S.req(fr ? 'friend.remove' : 'friend.request', { id: other.id }); if (r.friends) S.friends = r.friends; Toast.show('Friends', r.error || (fr ? 'Removed' : 'Request sent'), 'user', 2500); return renderDrawer(); }
          if (i === 'block') { if (await Dialog.confirm(`Block ${other.display}?`, 'They won’t be able to message or call you.', { okText: 'Block', danger: true })) { await S.req('block', { id: other.id }); Toast.show('Blocked', other.display, 'user', 2500); } return; }
          if (i === 'report') { const why = await Dialog.prompt('Report user', 'What’s wrong?', ''); if (why !== null) { await S.req('report', { user: other.id, reason: why }); Toast.show('Reported', 'Thanks — the admins will take a look.', 'bell'); } }
        };
      } else if (st.drawer === 'search') {
        d.innerHTML = head('Search in chat') + `<div class="sjm-db"><input class="sjm-in" type="search" placeholder="Search messages"><div class="sjm-sres" style="margin-top:10px"></div></div>`;
        const inp = d.querySelector('input'); setTimeout(() => inp.focus(), 50);
        inp.oninput = () => { clearTimeout(st.sqT); st.sqT = setTimeout(async () => { const v = inp.value.trim(); if (!v) { d.querySelector('.sjm-sres').innerHTML = ''; return; } const r = await S.req('search', { q: v, cid: c.id }); d.querySelector('.sjm-sres').innerHTML = (r.msgs || []).map(m => `<div class="sjm-res" data-j="${m.id}"><small>${esc(S.name(m.uid))} · ${listTime(m.at)}</small>${highlight(m.body, v.toLowerCase())}</div>`).join('') || '<div class="sjm-empty">Nothing found</div>'; }, 200); };
        d.onclick = e => { if (e.target.closest('[data-dx]')) { st.drawer = null; return renderDrawer(); } const j = e.target.closest('[data-j]'); if (j) jump(+j.dataset.j); };
      } else if (st.drawer === 'pins') {
        d.innerHTML = head('Pinned') + `<div class="sjm-db"><div class="sjm-skel"></div></div>`;
        S.req('pins.get', { cid: c.id }).then(r => { const b = d.querySelector('.sjm-db'); if (b) b.innerHTML = (r.msgs || []).map(m => `<div class="sjm-res" data-j="${m.id}"><small>${esc(S.name(m.uid))} · ${listTime(m.at)}</small>${esc(S.preview({ ...m, uid: 0 }))}<button class="sjm-btn" data-unpin="${m.id}" style="float:right;padding:3px 9px;font-size:12px">Unpin</button></div>`).join('') || '<div class="sjm-empty">No pinned messages. Pin one from its ⋯ menu.</div>'; });
        d.onclick = async e => { if (e.target.closest('[data-dx]')) { st.drawer = null; return renderDrawer(); } const u = e.target.closest('[data-unpin]'); if (u) { e.stopPropagation(); await S.req('msg.pin', { id: +u.dataset.unpin, on: false }); pinBar(); return renderDrawer(); } const j = e.target.closest('[data-j]'); if (j) jump(+j.dataset.j); };
      } else if (st.drawer === 'thread') renderThread(d, head);
    }
    async function openThread(m) { st.thread = m.thread || m.id; st.drawer = 'thread'; renderDrawer(); }
    async function renderThread(d, head) {
      const c = S.convos.get(st.cid);
      d.innerHTML = head('Thread') + `<div class="sjm-db sjm-tbody"><div class="sjm-skel"></div></div><div class="sjm-comp"><div class="sjm-row"><textarea class="sjm-ta sjm-tta" rows="1" placeholder="Reply in thread…"></textarea><button class="sjm-send" title="Send">${svg('send')}</button></div></div>`;
      const r = await S.req('msgs.get', { cid: c.id, thread: st.thread });
      const body = d.querySelector('.sjm-tbody'); if (!body) return;
      const list = [r.root].concat(r.msgs || []).filter(Boolean);
      body.innerHTML = `<div class="sjm-msgs" style="padding:0;overflow:visible">${list.map((m, i) => msgHtml(m, list[i - 1], list[i + 1], c) + (i === 0 ? `<div class="sjm-sys">${list.length - 1} repl${list.length === 2 ? 'y' : 'ies'}</div>` : '')).join('')}</div>`;
      body.scrollTop = body.scrollHeight;
      const ta = d.querySelector('.sjm-tta'), go = async () => { const t = ta.value.trim(); if (!t) return; ta.value = ''; const s = await S.req('msg.send', { cid: c.id, body: t, thread: st.thread }); if (s.error) Toast.show('Not sent', s.error, 'chat'); };
      ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
      d.querySelector('.sjm-send').onclick = go;
      d.onclick = e => { if (e.target.closest('[data-dx]')) { st.drawer = null; st.thread = null; renderDrawer(); } const v = e.target.closest('[data-view]'); if (v) viewMedia(v.dataset.view); };
      setTimeout(() => ta.focus(), 50);
    }

    /* ---------- modals: new chat, people picker, forward, share, settings ---------- */
    function modal(html) { const m = h(`<div class="sjm-modal"><div class="sjm-card">${html}</div></div>`); root.appendChild(m); m.onclick = e => { if (e.target === m) m.remove(); }; m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); m.remove(); } }); return m; }
    async function pickPeople(title, done, exclude = [], groupName = false) {
      const m = modal(`<h2 style="margin-top:0">${esc(title)}</h2><input class="sjm-in" type="search" placeholder="Search people by name or username"><div class="sjm-pickl"></div>${groupName ? '<label>Group name (optional)</label><input class="sjm-in sjm-gname" maxlength="60">' : ''}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="sjm-btn" data-c>Cancel</button><button class="sjm-btn pri" data-ok>Continue</button></div>`);
      const sel = new Set(), box = m.querySelector('.sjm-pickl'), inp = m.querySelector('input');
      const people = new Map(S.friends.filter(f => f.status === 'accepted').map(f => [f.user.id, f.user]));
      for (const c of S.convos.values()) for (const u of c.members) if (u.id !== S.me.id) people.set(u.id, u);
      const draw = list => { box.innerHTML = list.filter(u => !exclude.includes(u.id)).map(u => `<label>${'<input type="checkbox" value="' + u.id + '"' + (sel.has(u.id) ? ' checked' : '') + '>'}${av(u, 's')}<span><b>${esc(u.display)}</b> <small style="color:var(--text-3)">@${esc(u.username)}</small></span></label>`).join('') || '<div class="sjm-empty" style="padding:14px">Search for someone by their username.</div>'; };
      draw([...people.values()]);
      inp.oninput = () => { clearTimeout(st.ppT); st.ppT = setTimeout(async () => { const v = inp.value.trim(); if (!v) return draw([...people.values()]); const r = await S.req('user.search', { q: v }); for (const u of r.users || []) people.set(u.id, u); draw((r.users || []).concat([...people.values()].filter(u => (u.display + u.username).toLowerCase().includes(v.toLowerCase()) && !(r.users || []).some(x => x.id === u.id)))); }, 200); };
      box.onchange = e => { const v = +e.target.value; e.target.checked ? sel.add(v) : sel.delete(v); };
      m.querySelector('[data-c]').onclick = () => m.remove();
      m.querySelector('[data-ok]').onclick = async () => { if (!sel.size) return; const name = groupName ? m.querySelector('.sjm-gname').value : ''; m.remove(); await done([...sel], name); };
      setTimeout(() => inp.focus(), 40);
    }
    function newChat() {
      pickPeople('New message', async (ids, name) => {
        if (ids.length === 1) return dmWith(ids[0]);
        const r = await S.req('convo.group', { members: ids, name }); if (r.error) return Toast.show('Group', r.error, 'users');
        S.convos.set(r.convo.id, r.convo); st.tab = 'chats'; renderTabs(); openConvo(r.convo.id);
      }, [], true);
    }
    function chooseConvos(title, done) {
      const list = [...S.convos.values()];
      const m = modal(`<h2 style="margin-top:0">${esc(title)}</h2><div class="sjm-pickl">${list.map(c => `<label><input type="checkbox" value="${c.id}">${convoAv(c, 's')}<span>${esc(S.convoTitle(c))}</span></label>`).join('') || '<div class="sjm-empty">No chats yet — add a friend first.</div>'}</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="sjm-btn" data-c>Cancel</button><button class="sjm-btn pri" data-ok>Send</button></div>`);
      m.querySelector('[data-c]').onclick = () => m.remove();
      m.querySelector('[data-ok]').onclick = async () => { const ids = [...m.querySelectorAll('input:checked')].map(i => +i.value); if (!ids.length) return; m.remove(); await done(ids); };
    }
    function forward(msg) { chooseConvos('Forward to…', async ids => { for (const cid of ids) { const r = await S.req('msg.forward', { id: msg.id, cid }); if (r.error) Toast.show('Not forwarded', r.error, 'forward'); } Toast.show('Forwarded', ids.length + ' chat' + (ids.length === 1 ? '' : 's'), 'forward', 2000); }); }
    function share(sh) { chooseConvos(sh.kind === 'invite' ? `Invite to ${sh.meta.name}` : 'Share to…', async ids => { for (const cid of ids) { const r = await S.req('msg.send', { cid, kind: sh.kind, meta: sh.meta, body: sh.body || '' }); if (r.error) Toast.show('Not sent', r.error, 'chat'); } Toast.show('Invite sent', `Room ${sh.meta.code} · ${ids.length} chat${ids.length === 1 ? '' : 's'}`, 'gamepad', 2500); if (ids.length === 1) openConvo(ids[0]); }); }
    /* ---------- chat theme picker (shared with everyone in the chat) ---------- */
    function themePicker(c) {
      const cur = c.theme ? c.theme.id : 'default';
      const sw = t => `<button class="sjm-th${cur === t.id ? ' on' : ''}" data-th="${t.id}" style="background:${t.id === 'default' ? 'var(--surface-2)' : `linear-gradient(160deg,${t.bg},${t.bg2})`}"><i style="background:${t.id === 'default' ? 'var(--surface-3)' : t.in}"></i><i style="background:${t.id === 'default' ? 'var(--accent)' : t.out}"></i><span>${t.emoji || ''} ${esc(t.name)}</span></button>`;
      const ct = c.theme && c.theme.id === 'custom' ? c.theme : { out: '#6366f1', in: '#e0e7ff', bg: '#111827', bg2: '#312e81', pattern: 'dots', emoji: '✨' };
      const m = modal(`<h2 style="margin-top:0">Chat theme</h2><p>Everyone in “${esc(S.convoTitle(c))}” sees the theme you pick.</p>
        <div class="sjm-ths">${sw({ id: 'default', name: 'Default' })}${THEMES.map(sw).join('')}</div>
        <details class="sjm-custom" ${cur === 'custom' ? 'open' : ''}><summary>Custom theme</summary>
          <div class="sjm-cgrid"><label>My bubbles <input type="color" name="out" value="${ct.out}"></label><label>Their bubbles <input type="color" name="in" value="${ct.in}"></label>
          <label>Background <input type="color" name="bg" value="${ct.bg}"></label><label>Background 2 <input type="color" name="bg2" value="${ct.bg2 || ct.bg}"></label>
          <label>Pattern <select name="pattern">${['none', 'dots', 'grid', 'waves', 'stars', 'hearts'].map(p => `<option${p === ct.pattern ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
          <label>Quick reaction <input name="emoji" maxlength="4" value="${esc(ct.emoji || '')}" style="width:60px"></label></div>
          <button class="sjm-btn pri" data-custom style="margin-top:8px">Use custom theme</button></details>
        <div style="text-align:right;margin-top:12px"><button class="sjm-btn" data-c>Close</button></div>`);
      m.querySelector('[data-c]').onclick = () => m.remove();
      const apply = async theme => { const r = await S.req('convo.theme', { cid: c.id, theme }); if (r.error) Toast.show('Chat theme', r.error, 'palette'); else m.remove(); };
      m.querySelector('.sjm-ths').onclick = e => { const b = e.target.closest('[data-th]'); if (!b) return; apply(b.dataset.th === 'default' ? null : THEMES.find(t => t.id === b.dataset.th)); };
      m.querySelector('[data-custom]').onclick = () => { const v = n => m.querySelector(`[name=${n}]`).value; apply({ id: 'custom', name: 'Custom', out: v('out'), outText: textOn(v('out')), in: v('in'), inText: textOn(v('in')), bg: v('bg'), bg2: v('bg2'), pattern: v('pattern'), emoji: v('emoji') }); };
    }

    /* ---------- People (admins): roles, permissions, suspend, delete ---------- */
    async function peopleTab(sec) {
      sec.innerHTML = '<div class="sjm-empty">Loading people…</div>';
      let data = await S.req('mod.users'); if (data.error) { sec.innerHTML = `<div class="sjm-empty">${esc(data.error)}</div>`; return; }
      const open = new Set(), owner = data.me.role === 'owner', ips = new Map(); const udevs = new Map(); let bans = [], devBans = [], showBans = false, devs = (await S.req('mod.devices')).devices || [], showVis = true, visAll = false;
      { const b = await S.req('mod.bans'); bans = b.bans || []; devBans = b.devBans || []; }
      const loadIps = async id => { const [r, d] = await Promise.all([S.req('mod.ips', { id }), S.req('mod.devices', { id })]); ips.set(id, r.ips || []); udevs.set(id, d.devices || []); };
      const devName = d => `${esc(d.device)} <span class="sjm-devid" title="Device ID">#${esc(d.short || d.id.slice(0, 6))}</span>`;
      const ROLE = { owner: 'Owner · op', admin: 'Admin', user: 'Member' };
      const ago = ts => ts ? listTime(ts) : 'never';
      const row = u => {
        const tags = `<span class="sjm-ptag ${u.role}">${ROLE[u.role] || 'Member'}</span>${u.banned ? '<span class="sjm-ptag ban">Suspended</span>' : ''}${u.id === data.me.id ? '<span class="sjm-ptag">You</span>' : ''}`;
        const off = Object.entries(u.perms).filter(([, v]) => !v).length;
        let body = '';
        if (open.has(u.id) && u.canManage) {
          body = `<div class="sjm-pbox">
            ${owner ? `<label>Role</label><div class="sjm-seg" data-prole="${u.id}"><button data-v="user" class="${u.role === 'user' ? 'on' : ''}">Member</button><button data-v="admin" class="${u.role === 'admin' ? 'on' : ''}">Admin</button></div><small class="sjm-phint">Admins can manage members, read reports, suspend and delete member accounts. Only you (the owner) can make admins.</small>` : ''}
            <label>Permissions</label>
            ${u.role === 'admin' ? '<small class="sjm-phint">Admins can always do everything. Make them a Member first to limit them.</small>' : Object.entries(data.perms).map(([k, l]) => `<button class="sjm-opt" data-pperm="${u.id}" data-k="${k}"><span>${esc(l)}</span><i class="sjm-switch${u.perms[k] ? ' on' : ''}"></i></button>`).join('')}
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              <button class="sjm-btn" data-pban="${u.id}">${u.banned ? 'Unsuspend' : 'Suspend'}</button>
              <button class="sjm-btn danger" data-pdel="${u.id}">${svg('trash')} Delete account</button>
            </div>
            <label>Devices</label>${!udevs.has(u.id) ? '<small class="sjm-phint">Loading…</small>' : !udevs.get(u.id).length ? '<small class="sjm-phint">No devices recorded yet (recorded from now on).</small>' : `<div class="sjm-ips">${udevs.get(u.id).map(d => `<div class="sjm-ip${d.banned ? ' ban' : ''}"><div class="t">${devName(d)}${d.active ? ' <span class="sjm-dot"></span>' : ''}<small>${esc(d.ip)}${d.sameIp ? ` · ${d.sameIp} other device${d.sameIp === 1 ? '' : 's'} on this IP` : ''} · last ${ago(d.last)}</small></div>${d.banned ? `<button class="sjm-btn" data-pdunban="${d.id}">Unban</button>` : `<button class="sjm-btn danger" data-pdban="${d.id}" data-uid="${u.id}">Ban device</button>`}</div>`).join('')}</div>
              <button class="sjm-btn danger" style="margin-top:8px" data-pdevall="${u.id}">🚫 Ban their devices + suspend account</button>`}
            <label>IP addresses <small style="font-weight:400;color:var(--text-3)">(banning an IP blocks everyone on that network)</small></label>${!ips.has(u.id) ? '<small class="sjm-phint">Loading…</small>' : !ips.get(u.id).length ? '<small class="sjm-phint">None recorded yet (they’re recorded from now on, each time they use Messages).</small>' : `<div class="sjm-ips">${ips.get(u.id).map(x => `<div class="sjm-ip"><div class="t"><code>${esc(x.ip)}</code><small>last ${ago(x.last)} · first ${ago(x.first)}${x.others.length ? ` · also @${x.others.map(esc).join(', @')}` : ''}</small></div>${x.banned ? `<button class="sjm-btn" data-punban="${esc(x.ip)}">Unban</button>` : `<button class="sjm-btn danger" data-pipban="${esc(x.ip)}" data-uid="${u.id}">Ban IP</button>`}</div>`).join('')}</div>
`}
            </div>`;
        }
        return `<div class="sjm-pp${u.banned ? ' banned' : ''}" data-pu="${u.id}">
          <div class="sjm-pph"${u.canManage ? ` data-ptog="${u.id}" role="button" tabindex="0"` : ''}>${av(u, 's')}<div class="t"><b>${esc(u.display)}</b> ${tags}<small>@${esc(u.username)} · ${u.online ? '<span style="color:#22c55e">online</span>' : 'seen ' + ago(u.lastSeen)} · ${u.msgs} msg${u.msgs === 1 ? '' : 's'} · joined ${ago(u.created)}${off ? ` · <span style="color:#f59e0b">${off} limit${off === 1 ? '' : 's'}</span>` : ''}</small></div>${u.canManage ? `<span class="sjm-pchev${open.has(u.id) ? ' on' : ''}">${svg('down')}</span>` : ''}</div>${body}</div>`;
      };
      const draw = () => {
        const qy = (sec.querySelector('.sjm-psearch') || {}).value || '';
        const list = data.users.filter(u => !qy || (u.username + ' ' + u.display).toLowerCase().includes(qy.toLowerCase()));
        sec.querySelector('.sjm-plist').innerHTML = list.map(row).join('') || '<div class="sjm-empty">Nobody matches</div>';
      };
      sec.innerHTML = `<p style="margin-top:0">${owner ? 'You’re the <b>owner (op)</b>: you can make admins and manage everyone.' : 'As an admin you can manage members (not other admins or the owner).'} Tap a person to change what they can do.</p>
        <div class="sjm-bans"></div><div class="sjm-vis"></div>
        <input class="sjm-in sjm-psearch" type="search" placeholder="Search ${data.users.length} people"><div class="sjm-plist"></div>`;
      const drawBans = () => { const n = bans.length + devBans.length; sec.querySelector('.sjm-bans').innerHTML = `<button class="sjm-opt" data-pbans><span>🚫 Bans <b>${n}</b><small style="display:block;color:var(--text-3);font-size:12px">Banned devices and IP addresses can’t open SanjivramOS at all — they only see a “banned” page with their username</small></span><span class="sjm-pchev${showBans ? ' on' : ''}">${svg('down')}</span></button>
        ${showBans ? `<div class="sjm-pbox" style="border:none"><div class="sjm-ips">${devBans.map(b => `<div class="sjm-ip"><div class="t">📱 ${esc(b.deviceName)} <span class="sjm-devid">#${esc(b.device.slice(0, 6))}</span><small>device · ${b.username ? '@' + esc(b.username) : 'no account'} · ${ago(b.created)}${b.by_name ? ' by @' + esc(b.by_name) : ''}${b.reason ? ' · ' + esc(b.reason) : ''}</small></div><button class="sjm-btn" data-pdunban="${esc(b.device)}">Unban</button></div>`).join('')}
          ${bans.map(b => `<div class="sjm-ip"><div class="t">🌐 <code>${esc(b.ip)}</code><small>whole IP · ${b.username ? '@' + esc(b.username) : 'no account'} · ${ago(b.created)}${b.by_name ? ' by @' + esc(b.by_name) : ''}${b.reason ? ' · ' + esc(b.reason) : ''}</small></div><button class="sjm-btn" data-punban="${esc(b.ip)}">Unban</button></div>`).join('')}</div>${n ? '' : '<small class="sjm-phint">Nobody banned.</small>'}
          <div style="display:flex;gap:6px;margin-top:8px"><input class="sjm-in" data-pipin placeholder="Ban a whole IP address…" style="flex:1;min-width:0"><button class="sjm-btn danger" data-pipadd>Ban</button></div></div>` : ''}`; };
      const drawVis = () => {
        const on = devs.filter(v => v.active).length, list = visAll ? devs : devs.slice(0, 25);
        sec.querySelector('.sjm-vis').innerHTML = `<button class="sjm-opt" data-pvis><span>👀 Everyone using SanjivramOS <b>${devs.length}</b> device${devs.length === 1 ? '' : 's'}${on ? ` · <span style="color:#22c55e">${on} online now</span>` : ''}<small style="display:block;color:var(--text-3);font-size:12px">Every device that opened SanjivramOS — signed in to Messages or not (your own phone isn’t listed). “Ban device” blocks just that one; “Ban IP” blocks their whole network.</small></span><span class="sjm-pchev${showVis ? ' on' : ''}">${svg('down')}</span></button>
          ${showVis ? `<div class="sjm-pbox" style="border:none"><div class="sjm-ips">${list.map(d => { const mine = d.accounts.includes(S.me.username); return `<div class="sjm-ip${d.banned || d.ipBanned ? ' ban' : ''}"><div class="t">${devName(d)}${d.active ? ' <span class="sjm-dot" title="Online now"></span>' : ''} ${d.accounts.length ? d.accounts.map(a => `<b class="sjm-vacct">@${esc(a)}</b>`).join(' ') : '<span class="sjm-ptag">not signed in</span>'}<small><code>${esc(d.ip)}</code>${d.sameIp ? ` (+${d.sameIp} other device${d.sameIp === 1 ? '' : 's'})` : ''} · ${d.via === 'tunnel' ? 'internet' : 'your network'} · last ${ago(d.last)} · first ${ago(d.first)}</small></div>
            ${mine ? '<span class="sjm-ptag">You</span>' : `<div class="sjm-ipbtns">${d.banned ? `<button class="sjm-btn" data-pdunban="${d.id}">Unban device</button>` : `<button class="sjm-btn danger" data-pdban="${d.id}">Ban device</button>`}${d.ipBanned ? `<button class="sjm-btn" data-punban="${esc(d.ip)}">Unban IP</button>` : `<button class="sjm-btn" data-pvban="${esc(d.ip)}" title="Blocks everyone on this network">Ban IP</button>`}</div>`}</div>`; }).join('') || '<small class="sjm-phint">Nobody else has opened SanjivramOS yet (devices are recorded from now on).</small>'}</div>
          ${devs.length > list.length ? `<button class="sjm-btn" data-pvmore style="margin-top:6px">Show all ${devs.length}</button>` : ''}<button class="sjm-btn" data-pvref style="margin-top:6px">Refresh</button></div>` : ''}`;
      };
      const reloadVis = async () => { devs = (await S.req('mod.devices')).devices || []; drawVis(); };
      sec.querySelector('.sjm-vis').onclick = async e => {
        const t = e.target;
        if (t.closest('[data-pvis]')) { showVis = !showVis; drawVis(); return; }
        if (t.closest('[data-pvmore]')) { visAll = true; drawVis(); return; }
        if (t.closest('[data-pvref]')) return reloadVis();
        const ub = t.closest('[data-punban]'); if (ub) { await S.req('mod.ipunban', { ip: ub.dataset.punban }); Toast.show('Unbanned', ub.dataset.punban, 'users', 2000); return reloadBans(); }
        const vb = t.closest('[data-pvban]'); if (vb) return banIps([vb.dataset.pvban], null, false);
        const db = t.closest('[data-pdban]'); if (db) { const d = devs.find(x => x.id === db.dataset.pdban), u = d && d.accounts.length === 1 ? data.users.find(x => x.username === d.accounts[0]) : null; return banDevs([db.dataset.pdban], u && u.canManage ? u : null, false); }
        const du = t.closest('[data-pdunban]'); if (du) { await S.req('mod.devunban', { device: du.dataset.pdunban }); Toast.show('Device unbanned', '', 'users', 2000); return reloadBans(); }
      };
      drawBans(); drawVis(); draw();
      const banDevs = async (list, u, suspend) => {
        const why = await Dialog.prompt(`Ban ${list.length > 1 ? list.length + ' devices' : 'this device'}?`, `${u ? `@${u.username}` : 'Whoever uses it'} won’t be able to open SanjivramOS on ${list.length > 1 ? 'those devices' : 'that device'} — they’ll see a “banned” page with their username. Other people on the same Wi-Fi are NOT affected.${suspend ? ' Their account is suspended as well.' : ''} (Someone could get round it with a private/incognito window or a different browser — suspending their account stops them signing in anywhere.)\n\nReason (optional, they’ll see it):`, '', { okText: 'Ban' });
        if (why === null) return;
        const r = await S.req('mod.devban', { devices: list, id: u ? u.id : undefined, reason: why, suspend: !!suspend });
        if (r.error) Toast.show('Device ban', r.error, 'users'); else Toast.show('Banned', `${r.banned} device${r.banned === 1 ? '' : 's'}`, 'users', 3000);
        if (suspend) { const d = await S.req('mod.users'); if (!d.error) data = d; }
        await reloadBans();
      };
      const reloadBans = async () => { { const b = await S.req('mod.bans'); bans = b.bans || []; devBans = b.devBans || []; } drawBans(); await reloadVis(); for (const id of ips.keys()) await loadIps(id); draw(); };
      const banIps = async (list, u, suspend) => {
        const why = await Dialog.prompt(`Ban ${list.length > 1 ? list.length + ' IP addresses' : list[0]}?`, `${u ? `@${u.username} ` : 'Whoever uses it '}won’t be able to open SanjivramOS from ${list.length > 1 ? 'those addresses' : 'that address'} — they’ll see a “banned” page with their username. Heads-up: everyone else on the same Wi-Fi/network is blocked too.${suspend ? ' Their account is suspended as well.' : ''}\n\nReason (optional, they’ll see it):`, '', { okText: 'Ban' });
        if (why === null) return;
        const r = await S.req('mod.ipban', { ips: list, id: u ? u.id : undefined, reason: why, suspend: !!suspend });
        if (r.error) Toast.show('IP ban', r.error, 'users'); else Toast.show('Banned', r.banned.join(', '), 'users', 3000);
        if (suspend) { const d = await S.req('mod.users'); if (!d.error) data = d; }
        await reloadBans();
      };
      sec.querySelector('.sjm-bans').onclick = async e => {
        const t = e.target;
        if (t.closest('[data-pbans]')) { showBans = !showBans; drawBans(); return; }
        const ub = t.closest('[data-punban]'); if (ub) { await S.req('mod.ipunban', { ip: ub.dataset.punban }); Toast.show('Unbanned', ub.dataset.punban, 'users', 2000); return reloadBans(); }
        const du = t.closest('[data-pdunban]'); if (du) { await S.req('mod.devunban', { device: du.dataset.pdunban }); Toast.show('Device unbanned', '', 'users', 2000); return reloadBans(); }
        if (t.closest('[data-pipadd]')) { const v = sec.querySelector('[data-pipin]').value.trim(); if (v) await banIps([v], null, false); }
      };
      sec.querySelector('.sjm-psearch').oninput = draw;
      const reload = async () => { const d = await S.req('mod.users'); if (!d.error) data = d; draw(); };
      sec.querySelector('.sjm-plist').onclick = async e => {
        const t = e.target, U = id => data.users.find(u => u.id === +id);
        const tg = t.closest('[data-ptog]'); if (tg) { const id = +tg.dataset.ptog; open.has(id) ? open.delete(id) : open.add(id); draw(); if (open.has(id) && !ips.has(id)) { await loadIps(id); draw(); } return; }
        const ib = t.closest('[data-pipban]'); if (ib) return banIps([ib.dataset.pipban], U(ib.dataset.uid), false);
        const ia = t.closest('[data-pdevall]'); if (ia) { const u = U(ia.dataset.pdevall), list = (udevs.get(u.id) || []).filter(x => !x.banned).map(x => x.id); if (!list.length) { Toast.show('Device ban', 'All their devices are already banned.', 'users'); return; } return banDevs(list, u, true); }
        const db = t.closest('[data-pdban]'); if (db) return banDevs([db.dataset.pdban], U(db.dataset.uid), false);
        const du = t.closest('[data-pdunban]'); if (du) { await S.req('mod.devunban', { device: du.dataset.pdunban }); Toast.show('Device unbanned', '', 'users', 2000); return reloadBans(); }
        const ub2 = t.closest('[data-punban]'); if (ub2) { await S.req('mod.ipunban', { ip: ub2.dataset.punban }); Toast.show('Unbanned', ub2.dataset.punban, 'users', 2000); return reloadBans(); }
        const rl = t.closest('[data-prole] [data-v]'); if (rl) { const u = U(rl.closest('[data-prole]').dataset.prole); if (u.role === rl.dataset.v) return;
          if (rl.dataset.v === 'admin' && !await Dialog.confirm(`Make ${u.display} an admin?`, 'They’ll be able to suspend and delete member accounts and change members’ permissions.', { okText: 'Make admin' })) return;
          const r = await S.req('mod.role', { id: u.id, role: rl.dataset.v }); if (r.error) Toast.show('People', r.error, 'users'); else Toast.show(r.role === 'admin' ? `${u.display} is now an admin` : `${u.display} is now a member`, '', 'users', 2200); return reload(); }
        const pm = t.closest('[data-pperm]'); if (pm) { const u = U(pm.dataset.pperm), k = pm.dataset.k, perms = { ...u.perms, [k]: !u.perms[k] };
          const r = await S.req('mod.perms', { id: u.id, perms }); if (r.error) { Toast.show('People', r.error, 'users'); return; } u.perms = r.perms; draw(); return; }
        const bn = t.closest('[data-pban]'); if (bn) { const u = U(bn.dataset.pban), on = !u.banned;
          if (on && !await Dialog.confirm(`Suspend ${u.display}?`, 'They’re signed out everywhere and can’t sign in until you unsuspend them. Nothing is deleted.', { okText: 'Suspend', danger: true })) return;
          const r = await S.req('mod.ban', { id: u.id, on }); if (r.error) Toast.show('People', r.error, 'users'); else Toast.show(on ? `${u.display} suspended` : `${u.display} can sign in again`, '', 'users', 2200); return reload(); }
        const dl = t.closest('[data-pdel]'); if (dl) { const u = U(dl.dataset.pdel);
          const typed = await Dialog.prompt(`Delete @${u.username} for good?`, `This can’t be undone. Their account, direct chats, friends, stickers and Game Maker games are deleted, and their messages in groups show as deleted. Type their username (${u.username}) to confirm.`, '');
          if (typed === null) return;
          if (typed.trim().toLowerCase() !== u.username.toLowerCase()) { Toast.show('Not deleted', 'The username didn’t match.', 'users'); return; }
          const r = await S.req('mod.delete', { id: u.id, confirm: typed.trim() }); if (r.error) { Toast.show('People', r.error, 'users'); return; }
          Toast.show('Account deleted', `@${u.username} is gone.`, 'trash', 3000); open.delete(u.id); return reload(); }
      };
      sec.querySelector('.sjm-plist').onkeydown = e => { if (e.key === 'Enter' && e.target.matches('[data-ptog]')) e.target.click(); };
    }

    /* ---------- settings ---------- */
    async function settings(tab = 'profile') {
      const me = S.me;
      const TABS = [['profile', 'Profile', 'user'], ['look', 'Appearance', 'palette'], ['chats', 'Chats', 'chat'], ['notif', 'Notifications', 'bell'], ['privacy', 'Privacy', 'lock'], ['calls', 'Calls', 'phone'], ['account', 'Account', 'settings']].concat(['admin', 'owner'].includes(me.role) ? [['people', 'People', 'users']] : []);
      const m = modal(`<div class="sjm-set"><nav>${TABS.map(([k, l, i]) => `<button data-tab="${k}">${svg(i)}<span>${l}</span></button>`).join('')}</nav><section></section></div><div style="text-align:right;margin-top:10px"><button class="sjm-btn" data-close>Done</button></div>`);
      m.querySelector('.sjm-card').classList.add('wide');
      const sec = m.querySelector('section');
      m.querySelector('[data-close]').onclick = () => m.remove();
      const sw = (k, label, hint) => `<button class="sjm-opt" data-sw="${k}"><span>${label}${hint ? `<small style="display:block;color:var(--text-3);font-size:12px">${hint}</small>` : ''}</span><i class="sjm-switch${P()[k] ? ' on' : ''}"></i></button>`;
      const seg = (k, opts) => `<div class="sjm-seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(P()[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const relook = () => { applyLook(root, S.convos.get(st.cid)); if (st.cid) renderMsgs(false); const pv = sec.querySelector('.sjm-prev'); if (pv) applyLook(pv, null), pv.querySelector('.sjm-msgs').style.background = wallCss(P(), null); };
      const show = async t => {
        tab = t; m.querySelectorAll('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        const pr = P();
        if (t === 'profile') sec.innerHTML = `<div style="display:flex;align-items:center;gap:14px">${av(me, 'l', false)}<div><h2 style="margin:0">${esc(me.display)}</h2><small style="color:var(--text-3)">@${esc(me.username)}${me.role === 'owner' ? ' · owner (op)' : me.role === 'admin' ? ' · admin' : ''}</small></div></div>
          <label>Display name</label><input class="sjm-in" name="display" maxlength="40" value="${esc(me.display)}">
          <label>About</label><input class="sjm-in" name="bio" maxlength="200" value="${esc(me.bio || '')}" placeholder="A line about you">
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="sjm-btn pri" data-s="save">Save</button><button class="sjm-btn" data-s="photo">Change photo</button>${me.avatar ? '<button class="sjm-btn" data-s="nophoto">Remove photo</button>' : ''}</div><input type="file" accept="image/*" hidden>`;
        if (t === 'look') sec.innerHTML = `<div class="sjm-prev sjm" style="height:auto;display:block;border-radius:14px;overflow:hidden;border:1px solid var(--border)"><div class="sjm-main" style="display:block"><div class="sjm-msgs" style="padding:12px;min-height:150px">
            <div class="sjm-m first last"><span class="sjm-av s" style="--c:#0ea5e9">A</span><div class="sjm-col"><div class="sjm-from">Alex</div><div class="sjm-b">Ready for the race? 🏎️</div></div></div>
            <div class="sjm-m me first"><div class="sjm-col"><div class="sjm-b">Always. Host it!</div></div></div><div class="sjm-m me last"><div class="sjm-col"><div class="sjm-b">I'll send the code 🎮</div><div class="sjm-meta">${clock(Date.now())} <span class="tick read">✓✓</span></div></div></div></div></div></div>
          <label>My bubbles</label><div class="sjm-colors" data-col="outColor">${['', '#0ea5e9', '#22c55e', '#8b5cf6', '#ec4899', '#f97316', '#ef4444', '#eab308', '#14b8a6', '#18181b'].map(c => `<button data-c="${c}" title="${c || 'Accent colour'}" style="background:${c || 'var(--accent)'}" class="${pr.outColor === c ? 'on' : ''}"></button>`).join('')}<label class="pick" title="Any colour"><input type="color" value="${pr.outColor || '#3b82f6'}"></label></div>
          <label>Their bubbles</label><div class="sjm-colors" data-col="inColor">${['', '#e5e7eb', '#dbeafe', '#dcfce7', '#fce7f3', '#fef3c7', '#334155', '#1f2937'].map(c => `<button data-c="${c}" title="${c || 'Theme default'}" style="background:${c || 'var(--surface-2)'}" class="${pr.inColor === c ? 'on' : ''}"></button>`).join('')}<label class="pick" title="Any colour"><input type="color" value="${pr.inColor || '#e5e7eb'}"></label></div>
          <label>Bubble shape</label>${seg('bubble', [['round', 'Round'], ['pill', 'Pill'], ['soft', 'Soft'], ['square', 'Square']])}
          ${sw('tails', 'Bubble tails', 'A little tail on the last message of a group')}
          <label>Text size · <b class="sjm-fsv">${pr.textSize}px</b></label><input type="range" min="12" max="22" step="1" value="${pr.textSize}" data-range="textSize" style="width:100%">
          <label>Font</label>${seg('font', [['system', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono'], ['comic', 'Playful']])}
          <label>Spacing</label>${seg('density', [['compact', 'Compact'], ['cozy', 'Cozy'], ['roomy', 'Roomy']])}
          <label>Chat wallpaper</label><div class="sjm-walls">${Object.entries(WALLS).map(([k, [n]]) => `<button data-wall="${k}" class="${pr.wall === k ? 'on' : ''}" title="${n}" style="background:${k === 'custom' ? (pr.wallImg ? `url('${pr.wallImg}') center/cover` : 'var(--surface-3)') : wallCss({ wall: k }, null) || 'var(--surface)'}">${k === 'custom' ? '📷' : ''}<span>${n}</span></button>`).join('')}</div>
          ${pr.wall === 'custom' ? `<label>Darken photo · <b>${pr.wallDim}%</b></label><input type="range" min="0" max="70" value="${pr.wallDim}" data-range="wallDim" style="width:100%">` : ''}
          <input type="file" accept="image/*" hidden class="sjm-wallfile">
          ${sw('chatThemes', 'Show chat themes', 'Use the themes people set for each chat (turn off to always use your own look)')}
          ${sw('sideRight', 'Chat list on the right')}
          <div style="margin-top:10px"><button class="sjm-btn" data-s="resetlook">Reset appearance</button></div>`;
        if (t === 'chats') sec.innerHTML = `${sw('enterSend', 'Enter sends the message', 'Off: Enter makes a new line, Ctrl+Enter sends')}${sw('bigEmoji', 'Big emoji', 'Messages that are only emoji show large')}${sw('previews', 'Link previews', 'Show a card for the first link in a message')}${sw('autoplayGif', 'Autoplay GIFs', 'Off: GIFs play when you hover or tap')}
          ${sw('avatars', 'Show profile pictures in chats')}${sw('names', 'Show names in group chats')}${sw('clock24', '24-hour time')}
          <label>Double-click reaction</label><div class="sjm-colors" data-quick>${['❤️', '👍', '😂', '🔥', '🎉', '💯', '👀', '🙏'].map(e => `<button data-e="${e}" class="${pr.quickEmoji === e ? 'on' : ''}" style="font-size:20px;background:var(--surface-2)">${e}</button>`).join('')}</div>`;
        if (t === 'notif') sec.innerHTML = `${sw('soundOn', 'Message sounds')}<label>Message sound</label><div class="sjm-seg wrap" data-sound>${Object.keys(S.SOUNDS).concat('none').map(k => `<button data-v="${k}" class="${pr.sound === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
          <label>Ringtone</label><div class="sjm-seg wrap" data-ring>${Object.keys(S.RINGS).map(k => `<button data-v="${k}" class="${pr.ringtone === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
          ${sw('notifPreview', 'Show message text in notifications', 'Off: notifications just say “New message”')}
          <button class="sjm-opt" data-s="desk">${svg('bell')}<span>Desktop notifications when this tab is in the background</span><i class="sjm-switch${'Notification' in window && Notification.permission === 'granted' ? ' on' : ''}"></i></button>`;
        if (t === 'privacy') {
          const pv = (await S.req('prefs.get')).prefs || {}, on = k => pv[k] !== false;
          sec.innerHTML = `<p style="margin-top:0">These are enforced on the server, so they apply on every device.</p>
            <button class="sjm-opt" data-pv="readReceipts"><span>Read receipts<small style="display:block;color:var(--text-3);font-size:12px">Off: others don’t see when you’ve read their messages — and you won’t see theirs either</small></span><i class="sjm-switch${on('readReceipts') ? ' on' : ''}"></i></button>
            <button class="sjm-opt" data-pv="showOnline"><span>Show when I’m online<small style="display:block;color:var(--text-3);font-size:12px">Off: you appear offline, with no “last seen”</small></span><i class="sjm-switch${on('showOnline') ? ' on' : ''}"></i></button>
            <button class="sjm-opt" data-pv="showActivity"><span>Show what I’m playing<small style="display:block;color:var(--text-3);font-size:12px">Off: friends can’t see your game or join your room from your profile</small></span><i class="sjm-switch${on('showActivity') ? ' on' : ''}"></i></button>
            <button class="sjm-opt" data-s="blocked">${svg('close')}<span>Blocked people</span></button><div class="sjm-sub"></div>`;
        }
        if (t === 'calls') sec.innerHTML = `${sw('callCam', 'Camera on when I answer a video call')}${sw('mirror', 'Mirror my own video', 'Like a mirror — others always see you the right way round')}${sw('noiseSup', 'Noise suppression', 'Filters out fans, keyboards and background noise')}
          <label>Call layout</label>${seg('callLayout', [['grid', 'Grid'], ['speaker', 'Speaker']])}`;
        if (t === 'account') sec.innerHTML = `<button class="sjm-opt" data-s="pw">${svg('lock')}<span>Change password</span></button>
          ${['admin', 'owner'].includes(me.role) ? `<button class="sjm-opt" data-s="people">${svg('users')}<span>Manage people — roles, permissions, accounts</span></button><button class="sjm-opt" data-s="mod">${svg('bell')}<span>Moderation — reports</span></button>` : ''}
          <button class="sjm-opt" data-s="export">${svg('download')}<span>Save my settings to a file</span></button><button class="sjm-opt" data-s="import">${svg('upload')}<span>Load settings from a file</span></button>
          <button class="sjm-opt danger" data-s="out">${svg('logout')}<span>Sign out</span></button><div class="sjm-sub"></div><input type="file" accept="application/json" hidden class="sjm-setfile">`;
        if (t === 'people') peopleTab(sec);
        if (t === 'look') relook();
      };
      m.querySelector('nav').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };
      sec.addEventListener('input', e => {
        const r = e.target.closest('[data-range]'); if (r) { setP({ [r.dataset.range]: +r.value }); const lab = r.previousElementSibling && r.previousElementSibling.querySelector('b'); if (lab) lab.textContent = r.value + (r.dataset.range === 'textSize' ? 'px' : '%'); relook(); }
        const col = e.target.closest('.sjm-colors[data-col] input[type=color]'); if (col) { const k = col.closest('[data-col]').dataset.col; setP({ [k]: col.value }); col.closest('.sjm-colors').querySelectorAll('button').forEach(b => b.classList.remove('on')); relook(); }
      });
      sec.addEventListener('click', async e => {
        const t = e.target;
        const s1 = t.closest('[data-sw]'); if (s1) { const k = s1.dataset.sw; setP({ [k]: !P()[k] }); s1.querySelector('.sjm-switch').classList.toggle('on', P()[k]); relook(); if (['avatars', 'names', 'sideRight'].includes(k)) render(); return; }
        const sg = t.closest('[data-seg] [data-v]'); if (sg) { const k = sg.closest('[data-seg]').dataset.seg; setP({ [k]: sg.dataset.v }); sg.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sg)); relook(); return; }
        const cb = t.closest('.sjm-colors[data-col] [data-c]'); if (cb) { const k = cb.closest('[data-col]').dataset.col; setP({ [k]: cb.dataset.c, [k === 'outColor' ? 'outText' : 'inText']: '' }); cb.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === cb)); relook(); return; }
        const qe = t.closest('[data-quick] [data-e]'); if (qe) { setP({ quickEmoji: qe.dataset.e }); qe.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === qe)); return; }
        const wl = t.closest('[data-wall]'); if (wl) { if (wl.dataset.wall === 'custom') { const f = sec.querySelector('.sjm-wallfile'); f.onchange = () => { const file = f.files[0]; if (!file) return; const img = new Image(); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c2 = document.createElement('canvas'); c2.width = img.width * k; c2.height = img.height * k; c2.getContext('2d').drawImage(img, 0, 0, c2.width, c2.height); try { setP({ wall: 'custom', wallImg: c2.toDataURL('image/jpeg', .82) }); } catch { Toast.show('Wallpaper', 'That picture is too big to keep.', 'image'); } URL.revokeObjectURL(img.src); show('look'); }; img.src = URL.createObjectURL(file); }; f.click(); return; } setP({ wall: wl.dataset.wall }); show('look'); return; }
        const snd = t.closest('[data-sound] [data-v]'); if (snd) { setP({ sound: snd.dataset.v }); snd.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === snd)); if (snd.dataset.v !== 'none') S.playSound(snd.dataset.v); return; }
        const rg = t.closest('[data-ring] [data-v]'); if (rg) { setP({ ringtone: rg.dataset.v }); rg.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === rg)); S.playSeq(S.RINGS[rg.dataset.v], .08); return; }
        const pv = t.closest('[data-pv]'); if (pv) { const sw2 = pv.querySelector('.sjm-switch'), on = !sw2.classList.contains('on'); const r = await S.req('prefs.set', { [pv.dataset.pv]: on }); if (r.error) Toast.show('Privacy', r.error, 'lock'); else { sw2.classList.toggle('on', on); S.privacy = r.prefs; } return; }
        const b = t.closest('[data-s]'); if (!b) return;
        const sub = sec.querySelector('.sjm-sub'), s = b.dataset.s;
        if (s === 'save') { const r = await S.req('profile.update', { display: sec.querySelector('[name=display]').value, bio: sec.querySelector('[name=bio]').value }); if (r.me) { S.me = r.me; Toast.show('Profile saved', '', 'user', 1800); render(); } else Toast.show('Profile', r.error, 'user'); }
        if (s === 'photo') { const f = sec.querySelector('input[type=file]'); f.onchange = async () => { try { const up = await upload(f.files[0], 'avatar'); const r = await S.req('profile.update', { avatar: up.id }); if (r.me) { S.me = r.me; render(); show('profile'); } } catch (er) { Toast.show('Photo', er.message, 'camera'); } }; f.click(); }
        if (s === 'nophoto') { const r = await S.req('profile.update', { avatar: null }); if (r.me) { S.me = r.me; render(); show('profile'); } }
        if (s === 'resetlook') { const keep = store.get('prefs', {}); for (const k of ['outColor', 'outText', 'inColor', 'inText', 'bubble', 'tails', 'textSize', 'density', 'wall', 'wallImg', 'wallDim', 'font', 'sideRight', 'chatThemes']) delete keep[k]; store.set('prefs', keep); show('look'); render(); }
        if (s === 'desk') { if ('Notification' in window) { const p = await Notification.requestPermission(); b.querySelector('.sjm-switch').classList.toggle('on', p === 'granted'); } }
        if (s === 'people') { show('people'); return; }
        if (s === 'pw') { sub.innerHTML = `<label>Current password</label><input class="sjm-in" type="password" name="old" autocomplete="current-password"><label>New password</label><input class="sjm-in" type="password" name="pw" autocomplete="new-password" minlength="6"><div style="margin-top:8px"><button class="sjm-btn pri" data-s="pwok">Change password</button></div>`; }
        if (s === 'pwok') { const r = await fetch('social/api/password', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ old: sub.querySelector('[name=old]').value, password: sub.querySelector('[name=pw]').value }) }); const j = await r.json(); Toast.show(r.ok ? 'Password changed' : 'Couldn’t change it', j.error || 'Other devices were signed out.', 'user'); if (r.ok) sub.innerHTML = ''; }
        if (s === 'blocked') { const r = await S.req('blocks'); sub.innerHTML = `<div class="sjm-sec" style="padding-left:0">Blocked</div>` + ((r.users || []).map(u => `<div class="sjm-fr">${av(u, 's')}<div class="t"><b>${esc(u.display)}</b></div><button class="sjm-btn" data-unb="${u.id}">Unblock</button></div>`).join('') || '<div class="sjm-empty" style="padding:8px">Nobody blocked</div>'); }
        const ub = t.closest('[data-unb]'); if (ub) { await S.req('unblock', { id: +ub.dataset.unb }); ub.closest('.sjm-fr').remove(); }
        if (s === 'mod') { const r = await S.req('mod.reports'); sub.innerHTML = `<div class="sjm-sec" style="padding-left:0">Open reports</div>` + ((r.reports || []).map(x => `<div class="sjm-res"><small>${esc(x.by_name)} reported @${esc(x.target)} · ${listTime(x.created)}</small>${esc(x.reason || '(no reason)')}${x.body ? `<div style="opacity:.7;margin-top:4px">“${esc(String(x.body).slice(0, 140))}”</div>` : ''}<div style="display:flex;gap:6px;margin-top:6px"><button class="sjm-btn" data-res="${x.id}">Dismiss</button><button class="sjm-btn danger" data-ban="${x.user_id}" data-res2="${x.id}">Suspend @${esc(x.target)}</button></div></div>`).join('') || '<div class="sjm-empty" style="padding:8px">No open reports 🎉</div>'); }
        const rs = t.closest('[data-res]'); if (rs) { await S.req('mod.resolve', { id: +rs.dataset.res }); rs.closest('.sjm-res').remove(); }
        const bn = t.closest('[data-ban]'); if (bn && await Dialog.confirm('Suspend this account?', 'They are signed out everywhere and can’t sign in again until you undo it.', { okText: 'Suspend', danger: true })) { const r = await S.req('mod.ban', { id: +bn.dataset.ban }); if (r.error) Toast.show('Moderation', r.error, 'bell'); else { await S.req('mod.resolve', { id: +bn.dataset.res2 }); bn.closest('.sjm-res').remove(); } }
        if (s === 'export') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ sjmPrefs: store.get('prefs', {}), favGifs: store.get('favGifs', []), recentEmoji: store.get('recentEmoji', []) }, null, 2)], { type: 'application/json' })); a.download = 'messages-settings.json'; a.click(); }
        if (s === 'import') { const f = sec.querySelector('.sjm-setfile'); f.onchange = async () => { try { const j = JSON.parse(await f.files[0].text()); if (j.sjmPrefs) store.set('prefs', j.sjmPrefs); if (j.favGifs) store.set('favGifs', j.favGifs); if (j.recentEmoji) store.set('recentEmoji', j.recentEmoji); Toast.show('Settings loaded', '', 'settings', 2000); render(); } catch { Toast.show('Settings', 'That file isn’t a Messages settings file.', 'settings'); } }; f.click(); }
        if (s === 'out') { if (await Dialog.confirm('Sign out of Messages?', 'Calls and game invites stop until you sign in again.', { okText: 'Sign out' })) { m.remove(); await S.logout(); } }
      });
      show(tab);
    }

    /* ---------- live updates ---------- */
    win.listen('social', d => {
      if (!root.isConnected) return;
      if (d.t === 'auth' || d.t === 'ready') return render();
      if (d.t === 'offline') { const s = q('.sjm-me small'); if (s) s.textContent = 'Reconnecting…'; return; }
      if (!S.ready) return;
      if (d.t === 'msg') {
        const data = st.msgs.get(d.msg.cid);
        if (data && !d.msg.thread && !data.list.some(m => m.id === d.msg.id)) { data.list.push(d.msg); if (d.msg.cid === st.cid) { const box = q('.sjm-msgs'), near = box && box.scrollHeight - box.scrollTop - box.clientHeight < 140; renderMsgs(near || d.msg.uid === S.me.id); if (near) markRead(); } }
        const ty = st.typing.get(d.msg.cid); if (ty) ty.delete(d.msg.uid);
        if (d.msg.thread && st.drawer === 'thread' && st.thread === d.msg.thread) renderDrawer();
        renderList(); renderTabs(); if (d.msg.cid === st.cid) updateHead();
        return;
      }
      if (d.t === 'msg.update') { const data = st.msgs.get(d.msg.cid); if (data) { const i = data.list.findIndex(m => m.id === d.msg.id); if (i >= 0) { data.list[i] = d.msg; if (d.msg.cid === st.cid) renderMsgs(false); } } if (d.msg.cid === st.cid) pinBar(); return; }
      if (d.t === 'receipts' && d.cid === st.cid) return renderMsgs(false);
      if (d.t === 'typing') { if (!st.typing.has(d.cid)) st.typing.set(d.cid, new Map()); st.typing.get(d.cid).set(d.uid, Date.now()); typingUi(); setTimeout(typingUi, 5200); return; }
      if (d.t === 'presence') { renderList(); if (st.tab === 'chats') updateHead(); return; }
      if (d.t === 'friends') { renderTabs(); if (st.tab === 'friends') renderList(); return; }
      if (d.t === 'convo' || d.t === 'convo.gone' || d.t === 'convos') { if (d.t === 'convo.gone' && d.cid === st.cid) { st.cid = null; renderMain(); } renderList(); renderTabs(); if (d.convo && d.convo.id === st.cid) { updateHead(); if (st.drawer === 'info') renderDrawer(); } return; }
      if (d.t && d.t.startsWith('call.')) { if (st.cid) { const hb = q('.sjm-head'); const has = [...S.calls.values()].some(x => x.cid === st.cid); if (hb && !!hb.querySelector('[data-a=joincall]') !== has) renderMain(); } if (st.tab === 'calls' && d.t === 'call.end') renderList(); }
    });
    function updateHead() { const c = S.convos.get(st.cid), el = q('.sjm-stl'); if (c && el) el.innerHTML = statusLine(c); }
    function typingUi() {
      renderList();
      const el = q('.sjm-typing'); if (!el || !st.cid) return;
      const t = typingText(st.cid); el.innerHTML = t ? `<span class="sjm-dots"><i></i><i></i><i></i></span>${esc(t)}` : '';
      updateHead();
    }
    win.onFocus = () => markRead();
    win.receive = a => handleArgs(a || {});
    win.onClose = () => { ro.disconnect(); closePick(); if (st.rec) { st.rec.stream.getTracks().forEach(t => t.stop()); st.rec = null; } win.viewingCid = null; };
    win.onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); const i = q('.sjm-search input'); if (i) i.focus(); return true; } if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newChat(); return true; } };
    async function handleArgs(a) {
      if (!S.ready) { st.pendingArgs = a; return; }
      if (a.tab) { st.tab = a.tab; renderTabs(); renderList(); }
      if (a.user) await dmWith(+a.user);
      if (a.cid) { st.tab = 'chats'; renderTabs(); await openConvo(+a.cid); if (a.focus) { const ta = q('.sjm-ta'); if (ta) ta.focus(); } }
      if (a.share) share(a.share);
    }
    win.listen('social', d => { if ((d.t === 'ready') && st.pendingArgs) { const a = st.pendingArgs; st.pendingArgs = null; setTimeout(() => handleArgs(a), 0); } });
    setInterval(() => { if (root.isConnected && st.typing.size) typingUi(); }, 4000);
    render();
    handleArgs(args);
    window.__sjm = { st, open: openConvo, send: (t) => { const ta = q('.sjm-ta'); ta.value = t; ta.dispatchEvent(new Event('input')); return send(); }, pick: openPick, react: (id, e) => react(msgById(id), e) };
  }
  window.SJ_messages = { launch };
})();
