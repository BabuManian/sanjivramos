/* SanjivramOS tiny 3D kit (WebGL 1, no libraries, works offline) — shared by the 3D story games.
   const R = GL3D.create(canvas)        → renderer (boxes + meshes, sun/moon, 6 point lights, flashlight, fog)
   R.begin(cam, env) … R.draw(mesh, M, tint) / R.cube(M, col) … (frame is presented automatically)
   GL3D.M  — column-major mat4 helpers (T, S, RX, RY, RZ, mul, chain)
   GL3D.Input(canvas) — keyboard + mouse-drag/pointer-lock look + touch stick/buttons
   GL3D.Body — capsule-ish player physics against axis-aligned boxes
   R.person(look, x, y, z, yaw, anim) — draws a SanjivramOS character (look.js) as a blocky 3D figure         */
(() => {
  'use strict';
  if (window.GL3D) return;
  /* ---------- matrices ---------- */
  const I4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  const T = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const S = (x, y, z) => { const m = I4(); m[0] = x; m[5] = y === undefined ? x : y; m[10] = z === undefined ? x : z; return m; };
  const RY = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
  const RX = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const RZ = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const chain = (...ms) => ms.reduce((a, b) => mul(a, b));
  function persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); }
  const M = { I4, mul, T, S, RX, RY, RZ, chain, persp };
  const hex = h => { const n = parseInt(String(h || '#888888').slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  /** forward vector for a yaw/pitch camera: yaw 0 looks down -Z */
  const dirOf = (yaw, pitch = 0) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

  /* ---------- geometry ---------- */
  const FACES = [[[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]], [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
  /** add a box (min corner, max corner, colour [r,g,b] or '#hex') — faces wound so back-face culling keeps them */
  function pushBox(arr, x0, y0, z0, x1, y1, z1, col, skip) {
    if (typeof col === 'string') col = hex(col);
    for (let f = 0; f < 6; f++) {
      if (skip && skip[f]) continue;
      const [n, q] = FACES[f];
      const v = q.map(([a, b, c]) => [x0 + a * (x1 - x0), y0 + b * (y1 - y0), z0 + c * (z1 - z0)]);
      tri(arr, v[0], v[1], v[2], n, col); tri(arr, v[0], v[2], v[3], n, col);
    }
  }
  /** a triangle facing along n (winding fixed automatically) */
  function tri(arr, a, b, c, n, col) {
    if (typeof col === 'string') col = hex(col);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (!n) { const l = Math.hypot(...cr) || 1; n = [cr[0] / l, cr[1] / l, cr[2] / l]; }
    const pts = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0 ? [a, b, c] : [a, c, b];
    for (const p of pts) arr.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
  /** a cone/pyramid with `sides` sides (trees, roofs, spikes) */
  function pushCone(arr, x, y, z, r, h, col, sides = 6) {
    if (typeof col === 'string') col = hex(col);
    for (let i = 0; i < sides; i++) {
      const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], top = [x, y + h, z];
      const am = (a0 + a1) / 2, nx = Math.cos(am), nz = Math.sin(am), ny = r / h, l = Math.hypot(nx, ny, nz);
      const k = 0.9 + 0.1 * Math.sin(i * 2.3);
      tri(arr, p0, p1, top, [nx / l, ny / l, nz / l], [col[0] * k, col[1] * k, col[2] * k]);
    }
  }
  /** ground from a height function, cells of `step` units, colour per vertex from colFn(x, z, h) */
  function pushTerrain(arr, x0, z0, x1, z1, step, hf, colFn) {
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const a = [x, hf(x, z), z], b = [x + step, hf(x + step, z), z], c = [x + step, hf(x + step, z + step), z + step], d = [x, hf(x, z + step), z + step];
      const col = hex(colFn(x + step / 2, z + step / 2, (a[1] + c[1]) / 2));
      tri(arr, a, c, b, upN(a, c, b), col); tri(arr, a, d, c, upN(a, d, c), col);
    }
  }
  /** normal of a triangle, flipped to point up (ground) */
  function upN(a, b, c) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map(v => v / l);
    return n[1] < 0 ? n.map(v => -v) : n;
  }

  /* ---------- renderer ---------- */
  const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uVP;uniform mat4 uM;uniform vec3 uT;varying vec3 vC;varying vec3 vN;varying vec3 vW;
void main(){vec4 w=uM*vec4(aP,1.);vW=w.xyz;vN=(uM*vec4(aN,0.)).xyz;vC=aC*uT;gl_Position=uVP*w;}`;
  const FS = `precision mediump float;varying vec3 vC;varying vec3 vN;varying vec3 vW;
uniform vec3 uCam;uniform vec3 uFC;uniform vec2 uFog;uniform vec3 uSun;uniform vec3 uSunC;uniform vec3 uAmb;uniform float uA;uniform float uE;
uniform vec4 uLP[6];uniform vec3 uLC[6];uniform vec3 uFP;uniform vec3 uFD;uniform vec4 uFL;
uniform vec3 uHS;uniform vec3 uHG;uniform float uSpec;uniform float uRim;
void main(){vec3 n=normalize(vN);vec3 v=normalize(uCam-vW);float nd=max(dot(n,uSun),0.);
vec3 l=uAmb*mix(uHG,uHS,n.y*.5+.5)+uSunC*nd;
for(int i=0;i<6;i++){float r=uLP[i].w;if(r>0.){vec3 d=uLP[i].xyz-vW;float dist=length(d);float a=clamp(1.-dist/r,0.,1.);l+=uLC[i]*a*a*(.3+.7*max(dot(n,d/max(dist,.001)),0.));}}
if(uFL.w>0.){vec3 d=vW-uFP;float dist=length(d);vec3 dn=d/max(dist,.001);float s=smoothstep(.84,.95,dot(dn,uFD))*clamp(1.-dist/uFL.w,0.,1.);l+=uFL.rgb*s*(.35+.65*max(dot(n,-dn),0.));}
vec3 c=mix(vC*l,vC,uE);
vec3 h=normalize(uSun+v);c+=uSunC*pow(max(dot(n,h),0.),40.)*uSpec*nd*(1.-uE);
c+=uAmb*uHS*pow(1.-max(dot(n,v),0.),3.)*uRim*(1.-uE);
float f=clamp((distance(vW,uCam)-uFog.x)/(uFog.y-uFog.x),0.,1.);f=f*f*(3.-2.*f);c=mix(c,uFC,f);
c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
gl_FragColor=vec4(c,uA);}`;
  /* sky: a full-screen triangle that paints a gradient, sun, clouds and stars from the view direction */
  const SKY_VS = `attribute vec2 aV;varying vec2 vP;void main(){vP=aV;gl_Position=vec4(aV,.9999,1.);}`;
  const SKY_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vP;uniform vec3 uF;uniform vec3 uR;uniform vec3 uU;uniform vec3 uTop;uniform vec3 uHor;uniform vec3 uGndC;uniform vec3 uSunD;uniform vec3 uSunCol;uniform float uStars;uniform float uClouds;uniform float uTime;uniform vec3 uCloudC;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1.,0.)),f.x),mix(hh(i+vec2(0.,1.)),hh(i+vec2(1.,1.)),f.x),f.y);}
void main(){vec3 d=normalize(uF+uR*vP.x+uU*vP.y);float y=d.y;
vec3 c=y>0.?mix(uHor,uTop,pow(y,.55)):mix(uHor,uGndC,pow(min(-y*3.,1.),.5));
float sd=max(dot(d,uSunD),0.);c+=uSunCol*(pow(sd,900.)*3.+pow(sd,10.)*.28);
if(uStars>0.&&y>0.){vec2 sp=d.xz/(y+.35)*70.;float s=hh(floor(sp));c+=vec3(step(.9965,s))*uStars*(.55+.45*sin(uTime*2.+s*90.));}
if(uClouds>0.&&y>.01){vec2 cp=d.xz/(y+.08)*1.2+vec2(uTime*.012,uTime*.004);float cl=n2(cp)*.55+n2(cp*2.2)*.3+n2(cp*5.1)*.15;cl=smoothstep(.48,.78,cl)*uClouds*smoothstep(.01,.25,y);c=mix(c,uCloudC*(.85+.3*sd),cl);}
gl_FragColor=vec4(c,1.);}`;
  /* glow sprites: camera-facing quads with a soft round falloff, added on top (fires, lamps, coins, magic) */
  const GLOW_VS = `attribute vec2 aV;uniform mat4 uVP;uniform vec3 uC;uniform vec3 uRr;uniform vec3 uUu;uniform float uSz;varying vec2 vQ;void main(){vQ=aV;gl_Position=uVP*vec4(uC+(uRr*aV.x+uUu*aV.y)*uSz,1.);}`;
  const GLOW_FS = `precision mediump float;varying vec2 vQ;uniform vec3 uCol;uniform float uAl;void main(){float a=max(0.,1.-length(vQ));a=a*a*(1.5-.5*a);gl_FragColor=vec4(uCol*a*uAl,1.);}`;
  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', { antialias: opts.antialias !== false, alpha: false, powerPreference: 'high-performance' }) || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {}; for (const n of ['uVP', 'uM', 'uT', 'uCam', 'uFC', 'uFog', 'uSun', 'uSunC', 'uAmb', 'uA', 'uE', 'uLP', 'uLC', 'uFP', 'uFD', 'uFL', 'uHS', 'uHG', 'uSpec', 'uRim']) U[n] = gl.getUniformLocation(prog, n);
    const mk = (vs, fs, names) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; for (const n of names) u[n] = gl.getUniformLocation(p, n); return { p, u, a: gl.getAttribLocation(p, 'aV') }; };
    let SKY = null, GLOW = null;
    try { SKY = mk(SKY_VS, SKY_FS, ['uF', 'uR', 'uU', 'uTop', 'uHor', 'uGndC', 'uSunD', 'uSunCol', 'uStars', 'uClouds', 'uTime', 'uCloudC']); } catch (e) { console.warn('sky shader', e); }
    try { GLOW = mk(GLOW_VS, GLOW_FS, ['uVP', 'uC', 'uRr', 'uUu', 'uSz', 'uCol', 'uAl']); } catch (e) { console.warn('glow shader', e); }
    gl.useProgram(prog);
    const triBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, triBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const DISC = (() => { const a = [], n = 14; for (let i = 0; i < n; i++) { const a0 = i / n * 6.2832, a1 = (i + 1) / n * 6.2832; tri(a, [0, 0, 0], [Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], [0, 1, 0], [0, 0, 0]); } return a; })();
    let glows = [], camR = [1, 0, 0], camU = [0, 1, 0], t0 = performance.now();
    const A = { p: gl.getAttribLocation(prog, 'aP'), n: gl.getAttribLocation(prog, 'aN'), c: gl.getAttribLocation(prog, 'aC') };
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    let bound = null;
    const mesh = data => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW); bound = null; return { b, n: data.length / 9 }; };
    const bind = m => { if (bound === m) return; bound = m; gl.bindBuffer(gl.ARRAY_BUFFER, m.b); gl.enableVertexAttribArray(A.p); gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(A.n); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(A.c); gl.vertexAttribPointer(A.c, 3, gl.FLOAT, false, 36, 24); };
    const CUBE = (() => { const a = []; pushBox(a, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1]); return mesh(a); })();
    const DISCM = mesh(DISC);
    const ID = I4(), WHITE = [1, 1, 1];
    let VP = I4(), view = I4(), proj = I4(), W = 1, H = 1, eye = [0, 0, 0];
    const R = {
      gl, mesh, CUBE,
      resize() { const d = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5) * (R.scale || 1); const w = Math.max(1, Math.round(canvas.clientWidth * d)), h = Math.max(1, Math.round(canvas.clientHeight * d)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } W = w; H = h; gl.viewport(0, 0, w, h); },
      /** cam: {eye:[x,y,z], yaw, pitch, fov}; env: {sky:'#hex', fog:[near,far], sun:[x,y,z], sunCol, amb, lights:[{p,c,r}], flash:{p,d,c,range}} */
      begin(cam, env = {}) {
        R.resize();
        const sky = hex(env.sky || env.skyHorizon || '#87ceeb');
        gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        eye = cam.eye; glows = [];
        { const y = cam.yaw || 0, p = cam.pitch || 0, f = dirOf(y, p), r = [Math.cos(y), 0, -Math.sin(y)], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]; camR = r; camU = u;
          // the painted sky (only when the game asks for it with env.skyTop)
          if (SKY && env.skyTop) {
            const th = Math.tan((cam.fov || 1.1) / 2), asp = W / H, toC = v => typeof v === 'string' ? hex(v) : v;
            gl.useProgram(SKY.p); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
            for (const k of [A.p, A.n, A.c]) gl.disableVertexAttribArray(k);
            gl.bindBuffer(gl.ARRAY_BUFFER, triBuf); gl.enableVertexAttribArray(SKY.a); gl.vertexAttribPointer(SKY.a, 2, gl.FLOAT, false, 0, 0);
            const sd = env.sun || [0.4, 1, 0.3], sl = Math.hypot(...sd);
            gl.uniform3fv(SKY.u.uF, f); gl.uniform3fv(SKY.u.uR, r.map(v => v * th * asp)); gl.uniform3fv(SKY.u.uU, u.map(v => v * th));
            gl.uniform3fv(SKY.u.uTop, toC(env.skyTop)); gl.uniform3fv(SKY.u.uHor, toC(env.skyHorizon || env.sky || '#bfdbfe')); gl.uniform3fv(SKY.u.uGndC, toC(env.skyGround || env.skyHorizon || '#334155'));
            gl.uniform3fv(SKY.u.uSunD, sd.map(v => v / sl)); gl.uniform3fv(SKY.u.uSunCol, toC(env.sunGlow || [1, 0.92, 0.75])); gl.uniform1f(SKY.u.uStars, env.stars || 0); gl.uniform1f(SKY.u.uClouds, R.quality === 'low' ? 0 : (env.clouds || 0));
            gl.uniform1f(SKY.u.uTime, (performance.now() - t0) / 1000); gl.uniform3fv(SKY.u.uCloudC, toC(env.cloudCol || [1, 1, 1]));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disableVertexAttribArray(SKY.a); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.useProgram(prog); bound = null;
          }
        }
        proj = persp(cam.fov || 1.1, W / H, cam.near || 0.1, cam.far || 400);
        view = chain(RX(-(cam.pitch || 0)), RY(-(cam.yaw || 0)), T(-eye[0], -eye[1], -eye[2]));
        VP = mul(proj, view);
        gl.uniformMatrix4fv(U.uVP, false, VP);
        gl.uniform3fv(U.uCam, eye); gl.uniform3fv(U.uFC, env.fogCol ? (typeof env.fogCol === 'string' ? hex(env.fogCol) : env.fogCol) : sky);
        const hs = env.hemi ? env.hemi[0] : env.skyTop ? [1.12, 1.12, 1.18] : [1, 1, 1], hg = env.hemi ? env.hemi[1] : env.skyTop ? [0.72, 0.68, 0.62] : [1, 1, 1];
        gl.uniform3fv(U.uHS, hs); gl.uniform3fv(U.uHG, hg); gl.uniform1f(U.uSpec, env.spec == null ? 0.18 : env.spec); gl.uniform1f(U.uRim, env.rim == null ? (env.skyTop ? 0.35 : 0) : env.rim);
        gl.uniform2fv(U.uFog, env.fog || [60, 200]);
        const sd = env.sun || [0.4, 1, 0.3], sl = Math.hypot(...sd); gl.uniform3fv(U.uSun, sd.map(v => v / sl));
        gl.uniform3fv(U.uSunC, env.sunCol ? (typeof env.sunCol === 'string' ? hex(env.sunCol) : env.sunCol) : [0.65, 0.62, 0.55]);
        gl.uniform3fv(U.uAmb, env.amb ? (typeof env.amb === 'string' ? hex(env.amb) : env.amb) : [0.42, 0.44, 0.5]);
        const LP = new Float32Array(24), LC = new Float32Array(18);
        // nearest lights first
        const ls = (env.lights || []).slice().sort((a, b) => dist2(a.p, eye) - dist2(b.p, eye)).slice(0, 6);
        ls.forEach((l, i) => { LP.set([l.p[0], l.p[1], l.p[2], l.r || 8], i * 4); LC.set(typeof l.c === 'string' ? hex(l.c) : l.c, i * 3); });
        gl.uniform4fv(U.uLP, LP); gl.uniform3fv(U.uLC, LC);
        const f = env.flash;
        if (f) { gl.uniform3fv(U.uFP, f.p); const dl = Math.hypot(...f.d) || 1; gl.uniform3fv(U.uFD, f.d.map(v => v / dl)); gl.uniform4fv(U.uFL, [...(f.c || [1, 0.95, 0.8]), f.range || 22]); }
        else gl.uniform4fv(U.uFL, [0, 0, 0, 0]);
        gl.disable(gl.BLEND); gl.depthMask(true);
      },
      draw(m, model = ID, tint = WHITE, alpha = 1, emit = 0) {
        bind(m);
        gl.uniformMatrix4fv(U.uM, false, model); gl.uniform3fv(U.uT, typeof tint === 'string' ? hex(tint) : tint); gl.uniform1f(U.uA, alpha); gl.uniform1f(U.uE, emit);
        if (alpha < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }
        gl.drawArrays(gl.TRIANGLES, 0, m.n);
        if (alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
      },
      cube(model, col, alpha = 1, emit = 0) { R.draw(CUBE, model, col, alpha, emit); },
      /** axis-aligned box by corners (handy for props that move) */
      box(x0, y0, z0, x1, y1, z1, col, alpha, emit) { R.cube(mul(T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), S(x1 - x0, y1 - y0, z1 - z0)), col, alpha, emit); },
      /** a soft glowing sprite at p (drawn in R.end(), added on top) */
      glow(p, size, col, alpha = 1) { if (GLOW && R.quality !== 'off') glows.push([p, size, typeof col === 'string' ? hex(col) : col, alpha]); },
      /** a soft round shadow on the ground at (x, y, z) */
      shadow(x, y, z, r = 0.5, alpha = 0.35) {
        bind(DISCM); gl.enable(gl.BLEND); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
        for (const [k, a] of [[1, alpha * 0.55], [0.7, alpha * 0.5]]) { gl.uniformMatrix4fv(U.uM, false, mul(T(x, y + 0.02, z), S(r * k, 1, r * k))); gl.uniform3fv(U.uT, [0, 0, 0]); gl.uniform1f(U.uA, a); gl.uniform1f(U.uE, 1); gl.drawArrays(gl.TRIANGLES, 0, DISCM.n); }
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); gl.depthMask(true);
      },
      /** finish the frame: draws the glow sprites */
      end() {
        if (!GLOW || !glows.length) return;
        gl.useProgram(GLOW.p); for (const k of [A.p, A.n, A.c]) gl.disableVertexAttribArray(k);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(GLOW.a); gl.vertexAttribPointer(GLOW.a, 2, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
        gl.uniformMatrix4fv(GLOW.u.uVP, false, VP); gl.uniform3fv(GLOW.u.uRr, camR); gl.uniform3fv(GLOW.u.uUu, camU);
        for (const [p, sz, c, a] of glows) { gl.uniform3fv(GLOW.u.uC, p); gl.uniform1f(GLOW.u.uSz, sz); gl.uniform3fv(GLOW.u.uCol, c); gl.uniform1f(GLOW.u.uAl, a); gl.drawArrays(gl.TRIANGLES, 0, 6); }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.BLEND); gl.depthMask(true); gl.disableVertexAttribArray(GLOW.a); gl.useProgram(prog); bound = null; glows = [];
      },
      /** first-person view model: your arm (and what you hold) in front of the camera. swing 0..1, bob = walk phase */
      viewModel(cam, o = {}) {
        const sw = o.swing ? Math.sin(Math.min(1, o.swing) * Math.PI) : 0, bob = o.walk ? Math.sin(o.walk * 2) * 0.025 * (o.speed || 0) : 0;
        const base = chain(T(cam.eye[0], cam.eye[1], cam.eye[2]), RY(cam.yaw || 0), RX(cam.pitch || 0), T(0.32, -0.3 + bob - sw * 0.05, -0.55), RX(0.25 - sw * 1.2), RY(-0.15 + sw * 0.6));
        gl.clear(gl.DEPTH_BUFFER_BIT);   // never clips into walls
        R.cube(mul(base, chain(T(0, 0, 0.05), S(0.13, 0.13, 0.45))), o.sleeve || [0.23, 0.51, 0.96]);
        R.cube(mul(base, chain(T(0, 0, -0.2), S(0.12, 0.12, 0.12))), o.skin || [0.97, 0.79, 0.63]);
        if (o.hold) { const k = o.holdLen || 0.55; R.cube(mul(base, chain(T(0, 0.05, -0.27 - k / 2), S(0.07, 0.07, k))), o.hold, 1, o.holdGlow || 0); if (o.holdHead) R.cube(mul(base, chain(T(0, 0.1, -0.27 - k), S(...o.holdHead))), o.holdHeadCol || o.hold, 1, o.holdGlow || 0); }
      },
      /** world point → {x, y, z(depth), vis} in CSS pixels of the canvas */
      project(p) {
        const m = VP, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        if (w <= 0.01) return { vis: false };
        return { x: (x / w * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - y / w * 0.5) * canvas.clientHeight, z: w, vis: Math.abs(x / w) < 1.1 && Math.abs(y / w) < 1.1 };
      },
      /** a SanjivramOS character as boxes. anim = {walk: phase (0 = still), speed 0..1, swing 0..1 (arm attack), hold: '#hex' item colour, sit} */
      person(look, x, y, z, yaw, anim = {}) {
        const L = Object.assign({ skin: '#f8c9a0', hair: '#4a2f1d', eye: '#1f2937', shirt: '#3b82f6', shirt2: '#f1f5f9', pants: '#334155', shoes: '#111827', hatColor: '#ef4444', accColor: '#111827', heldColor: '#9ca3af', petColor: '#f97316', markColor: '#ef4444', hairStyle: 0, hat: 0, acc: 0, body: 1, shirtStyle: 0, held: 0, pet: 0, faceMark: 0 }, look || {});
        const tm = performance.now() / 1000, CU = sl => window.SJLook && SJLook.custom ? SJLook.custom(L, sl) : null;
        const cS = window.SJLook && SJLook.cloth ? SJLook.cloth(L, 'shirt') : null, cP = window.SJLook && SJLook.cloth ? SJLook.cloth(L, 'pants') : null;
        if (cS) L.shirtStyle = 99;
        const k = anim.scale || 1, bw = [0.82, 1, 1.15][L.body] || 1;
        if (anim.shadow !== false) R.shadow(x, anim.groundY == null ? y : anim.groundY, z, 0.42 * k * bw, anim.groundY != null ? clamp01(0.38 - (y - anim.groundY) * 0.08) : 0.38);
        const base = chain(T(x, y, z), RY(yaw), S(k, k, k));
        const P = (tx, ty, tz, sx, sy, sz, col, rot) => R.cube(rot ? chain(base, T(tx, ty, tz), rot, T(0, -sy / 2, 0), S(sx, sy, sz)) : chain(base, T(tx, ty, tz), S(sx, sy, sz)), col);
        /* your own pixel items as boxes: one box per run of same-coloured pixels; m = centre of the picture, size = its width */
        const vox = (it, m, size, depth) => { const rs = window.SJLook && SJLook.runs(it); if (!rs) return; const u = size / 16; for (const r of rs) R.cube(chain(m, T((8 - r.x - r.w / 2) * u, (7.5 - r.y) * u, 0), S(r.w * u, u, depth)), r.c); };
        const sw = Math.sin(anim.walk || 0) * 0.7 * (anim.speed == null ? 1 : anim.speed);
        // legs swing from the hip; shoes ride on the leg (+x = rotation brings the foot forward, i.e. towards -z)
        for (const [sx, a] of [[-0.13, sw], [0.13, -sw]]) {
          P(sx * bw, 0.8, 0, 0.22 * bw, 0.7, 0.24, L.pants, RX(a));
          R.cube(chain(base, T(sx * bw, 0.8, 0), RX(a), T(0, -0.73, -0.05), S(0.24 * bw, 0.14, 0.34)), L.shoes);
          if (cP) { const lf = chain(base, T(sx * bw, 0.8, 0), RX(a)), cw = 0.22 * bw / 4, chh = 0.7 / 8; for (const r of SJLook.clothRuns(cP, 4, 8, sx > 0 ? 0 : 0.5, sx > 0 ? 0.5 : 1)) R.cube(chain(lf, T((2 - r.x - r.w / 2) * cw, -(r.y + 0.5) * chh, -0.122), S(r.w * cw, chh, 0.01)), r.c); }
        }
        // torso
        P(0, 1.13, 0, 0.5 * bw, 0.66, 0.3, L.shirt);
        if (cS) { const cw = 0.5 * bw / 8, chh = 0.66 / 8; for (const r of SJLook.clothRuns(cS, 8, 8)) R.cube(chain(base, T((4 - r.x - r.w / 2) * cw, 1.46 - (r.y + 0.5) * chh, -0.152), S(r.w * cw, chh, 0.01)), r.c); }
        if (L.shirtStyle === 3) for (let i = 0; i < 2; i++) P(0, 0.98 + i * 0.22, 0, 0.51 * bw, 0.07, 0.31, L.shirt2);
        if (L.shirtStyle === 2 || L.shirtStyle === 4) P(0, 1.13, -0.152, 0.12, 0.64, 0.02, L.shirt2);
        if (L.shirtStyle === 5) P(0, 1.2, -0.16, 0.42 * bw, 0.4, 0.04, L.shirt2);
        if (L.shirtStyle === 6) { P(0, 1.3, -0.152, 0.16, 0.3, 0.02, '#f8fafc'); P(0, 1.25, -0.16, 0.06, 0.3, 0.02, L.shirt2); }
        if (L.shirtStyle === 7) P(0, 0.72, 0, 0.62 * bw, 0.36, 0.44, L.shirt);
        if (L.shirtStyle === 8) { P(0, 1.02, -0.155, 0.4 * bw, 0.44, 0.02, L.pants); P(-0.16 * bw, 1.3, -0.155, 0.06, 0.3, 0.02, L.pants); P(0.16 * bw, 1.3, -0.155, 0.06, 0.3, 0.02, L.pants); }
        if (L.shirtStyle === 10 || L.shirtStyle === 12) P(0, 1.25, 0, 0.51 * bw, 0.1, 0.31, L.shirt2);
        if (L.shirtStyle === 11) P(0, 0.58, 0, 0.56 * bw, 0.66, 0.36, L.shirt);
        if (L.shirtStyle === 13) { P(0, 1.03, 0, 0.53 * bw, 0.88, 0.33, '#f1f5f9'); P(0, 1.13, -0.168, 0.14, 0.64, 0.01, L.shirt); }
        if (L.acc === 7) for (const sx of [-1, 1]) R.cube(chain(base, T(sx * 0.32, 1.3, 0.2), RY(sx * (0.5 + Math.sin(tm * 6) * 0.15)), RZ ? RZ(sx * -0.3) : I4(), S(0.5, 0.42, 0.03)), L.accColor);
        if (L.acc === 8) P(0, 1.43, -0.165, 0.18, 0.08, 0.02, L.accColor);
        if (L.acc === 9) P(0, 1.18, -0.165, 0.07, 0.38, 0.02, L.accColor);
        if (L.acc === 10) { P(0, 1.4, -0.16, 0.3, 0.03, 0.02, '#facc15'); P(0, 1.33, -0.165, 0.07, 0.08, 0.02, L.accColor); }
        if (L.acc === 13) { P(-0.11, 1.15, 0.23, 0.15, 0.44, 0.15, '#9ca3af'); P(0.11, 1.15, 0.23, 0.15, 0.44, 0.15, '#9ca3af'); }
        if (L.acc === 14) P(0, 0.78, 0.18, 0.08, 0.08, 0.45, L.accColor, RX(0.7 + Math.sin(tm * 4) * 0.15));
        { const cb = CU('back'); if (cb) vox(cb, chain(base, T(0, 1.2, 0.2)), 1.1, 0.05); const bd = CU('badge'); if (bd) vox(bd, chain(base, T(0.08 * bw, 1.25, -0.16)), 0.22, 0.02); }
        if (L.acc === 5) P(0, 1.13, 0.22, 0.38, 0.46, 0.16, L.accColor);
        if (L.acc === 6) P(0, 0.98, 0.19, 0.5 * bw, 0.9, 0.04, L.accColor, RX(0.12 + Math.abs(sw) * 0.2));
        if (L.acc === 4) P(0, 1.43, 0, 0.54 * bw, 0.1, 0.34, L.accColor);
        // arms (right arm swings for attacks)
        const armCol = [0, 4, 9, 12].includes(L.shirtStyle) ? L.skin : L.shirtStyle === 13 ? '#f1f5f9' : L.shirt, lookHeld = !anim.hold && !anim.noHeld && (L.held || CU('held'));
        // arms swing opposite to the legs; the right arm raises (+x rotation = forward) to hold or swing
        const atk = anim.swing ? 2.4 - anim.swing * 2.9 : anim.hold ? 0.55 : lookHeld ? 0.35 + sw * 0.2 : sw * 0.9;
        P(-0.33 * bw, 1.42, 0, 0.16, 0.62, 0.18, armCol, RX(-sw * 0.9));
        P(0.33 * bw, 1.42, 0, 0.16, 0.62, 0.18, armCol, RX(atk));
        if (anim.hold) R.cube(chain(base, T(0.33 * bw, 1.42, 0), RX(atk), T(0, -0.62, -0.2), S(0.08, 0.08, 0.5)), anim.hold, 1, anim.holdGlow || 0);
        else if (lookHeld) {
          const hb = chain(base, T(0.33 * bw, 1.42, 0), RX(atk), T(0, -0.62, 0), RX(-atk)), Q = (tx, ty, tz, sx, sy, sz, col, g) => R.cube(chain(hb, T(tx, ty, tz), S(sx, sy, sz)), col, 1, g || 0), c = L.heldColor, ci = CU('held');
          if (ci) vox(ci, chain(hb, RY(Math.PI / 2), T(0, 0.24, 0)), 0.8, 0.05);
          else switch (L.held) {
            case 1: Q(0, 0.48, -0.05, 0.04, 0.8, 0.1, '#e5e7eb'); Q(0, 0.06, -0.05, 0.06, 0.05, 0.3, c); Q(0, -0.04, -0.05, 0.05, 0.14, 0.05, '#78350f'); break;
            case 2: Q(0, 0.2, -0.05, 0.04, 0.5, 0.04, '#3f2a1d'); Q(0, 0.5, -0.05, 0.12, 0.12, 0.12, c, 0.8); break;
            case 3: Q(0.1, 0.05, -0.05, 0.05, 0.45, 0.4, c); Q(0.13, 0.05, -0.05, 0.02, 0.2, 0.2, '#f8fafc'); break;
            case 4: Q(0, 0.6, 0, 0.01, 1.2, 0.01, '#e5e7eb'); Q(0, 1.3, 0, 0.32, 0.38, 0.32, c); break;
            case 5: Q(0, 0.1, -0.1, 0.1, 0.4, 0.32, c); Q(0, 0.5, -0.1, 0.05, 0.5, 0.06, '#78350f'); break;
            case 6: Q(0, 0.02, 0, 0.1, 0.16, 0.1, '#d97706'); Q(0, 0.16, 0, 0.14, 0.14, 0.14, c); break;
            case 7: Q(0, 0.6, 0, 0.03, 1.3, 0.03, '#9ca3af'); Q(0, 1.05, -0.2, 0.02, 0.28, 0.38, c); break;
            case 8: Q(0, 0.2, 0, 0.06, 0.5, 0.06, '#78350f'); Q(0, 0.5, 0, 0.12, 0.16 + Math.sin(tm * 18) * 0.03, 0.12, '#f97316', 1); break;
            case 9: Q(0, 0.05, -0.05, 0.03, 0.2, 0.12, c); break;
            case 10: Q(0, 0.6, 0, 0.03, 1.2, 0.03, '#334155'); Q(0, 1.2, 0, 0.9, 0.06, 0.9, c); Q(0, 1.26, 0, 0.5, 0.06, 0.5, c); break;
            case 11: Q(0, 0.25, 0, 0.05, 0.55, 0.05, '#92400e'); Q(0, 0.55, 0, 0.14, 0.14, 0.32, c); break;
            case 12: Q(0, 0.1, -0.15, 0.04, 0.7, 0.04, c); Q(0, 0.1, -0.05, 0.01, 0.6, 0.01, '#e5e7eb'); break;
            case 13: Q(0, 0.2, 0, 0.02, 0.4, 0.02, '#f8fafc'); Q(0, 0.45, 0, 0.04, 0.2, 0.2, c); break;
            case 14: R.cube(chain(hb, RX(0.6), T(0, 0.7, 0), S(0.03, 1.5, 0.03)), '#78350f'); break;
          }
        }
        // head
        const hy = 1.72;
        P(0, hy, 0, 0.44, 0.42, 0.42, L.skin);
        P(-0.09, hy + 0.02, -0.212, 0.06, 0.07, 0.01, L.eye); P(0.09, hy + 0.02, -0.212, 0.06, 0.07, 0.01, L.eye);
        P(0, hy - 0.11, -0.212, 0.12, 0.03, 0.01, '#7f1d1d');
        if (L.acc === 1 || L.acc === 2) P(0, hy + 0.02, -0.22, 0.36, 0.09, 0.02, L.acc === 2 ? '#0a0a0a' : L.accColor);
        if (L.acc === 3) P(0, hy - 0.1, -0.22, 0.4, 0.16, 0.02, L.accColor);
        if (L.acc === 11) P(-0.09, hy + 0.02, -0.22, 0.11, 0.11, 0.02, '#0a0a0a');
        if (L.acc === 12) P(0.09, hy + 0.02, -0.22, 0.11, 0.11, 0.015, '#facc15');
        if (L.acc === 15) { P(-0.23, hy - 0.1, 0, 0.03, 0.07, 0.03, L.accColor); P(0.23, hy - 0.1, 0, 0.03, 0.07, 0.03, L.accColor); }
        if (L.faceMark === 2) { P(-0.14, hy - 0.06, -0.213, 0.08, 0.04, 0.01, '#f9a8d4'); P(0.14, hy - 0.06, -0.213, 0.08, 0.04, 0.01, '#f9a8d4'); }
        if (L.faceMark === 3) P(0, hy - 0.075, -0.216, 0.18, 0.04, 0.01, L.hair);
        if (L.faceMark === 4) { P(0, hy - 0.17, -0.1, 0.46, 0.14, 0.26, L.hair); P(0, hy - 0.075, -0.216, 0.18, 0.04, 0.01, L.hair); }
        if (L.faceMark === 7) { P(-0.15, hy - 0.05, -0.213, 0.1, 0.025, 0.01, L.markColor); P(0.15, hy - 0.05, -0.213, 0.1, 0.025, 0.01, L.markColor); }
        { const cf = CU('face'); if (cf) vox(cf, chain(base, T(0, hy, -0.218)), 0.46, 0.01); }
        if (L.hairStyle !== 7) {
          P(0, hy + 0.24, 0.01, 0.47, 0.1, 0.45, L.hair);
          if ([2, 3, 8].includes(L.hairStyle)) P(0, hy - 0.05, 0.19, 0.47, 0.52, 0.1, L.hair);
          if (L.hairStyle === 1 || L.hairStyle === 4) P(0, hy + 0.34, 0, L.hairStyle === 4 ? 0.1 : 0.4, 0.14, 0.36, L.hair);
          if (L.hairStyle === 5) P(0, hy + 0.36, 0.08, 0.18, 0.16, 0.18, L.hair);
          if (L.hairStyle === 6) P(0, hy + 0.3, 0, 0.52, 0.14, 0.5, L.hair);
          if (L.hairStyle === 8) P(0, hy - 0.08, 0.3, 0.12, 0.4, 0.12, L.hair);
          if (L.hairStyle === 10) P(0, hy + 0.12, 0.08, 0.64, 0.6, 0.52, L.hair);
          if (L.hairStyle === 11) { P(-0.2, hy - 0.22, 0.14, 0.08, 0.5, 0.08, L.hair); P(0.2, hy - 0.22, 0.14, 0.08, 0.5, 0.08, L.hair); }
          if (L.hairStyle === 12) { P(-0.3, hy + 0.06, 0.08, 0.15, 0.3, 0.15, L.hair); P(0.3, hy + 0.06, 0.08, 0.15, 0.3, 0.15, L.hair); }
          if (L.hairStyle === 13) P(0, hy + 0.36, 0, 0.46, 0.22, 0.44, L.hair);
          if (L.hairStyle === 14) { P(-0.1, hy + 0.32, 0.02, 0.2, 0.12, 0.3, L.hair, RZ ? RZ(0.4) : null); P(0.12, hy + 0.33, -0.04, 0.2, 0.12, 0.3, L.hair, RX(0.4)); }
          if (L.hairStyle === 15) P(0, hy - 0.12, 0.19, 0.5, 0.66, 0.1, L.hair);
        }
        switch (L.hat) {
          case 1: P(0, hy + 0.3, 0.02, 0.48, 0.14, 0.46, L.hatColor); P(0, hy + 0.25, -0.28, 0.42, 0.04, 0.18, L.hatColor); break;
          case 2: P(0, hy + 0.3, 0, 0.5, 0.2, 0.48, L.hatColor); break;
          case 3: P(0, hy + 0.32, 0, 0.4, 0.16, 0.4, '#facc15'); break;
          case 4: P(0, hy + 0.24, 0, 0.6, 0.04, 0.6, '#111827'); P(0, hy + 0.46, 0, 0.38, 0.42, 0.38, '#111827'); break;
          case 5: P(0, hy + 0.12, 0, 0.47, 0.07, 0.47, L.hatColor); break;
          case 6: P(0, hy + 0.08, 0.02, 0.5, 0.56, 0.5, L.hatColor); P(0, hy + 0.02, -0.25, 0.36, 0.14, 0.02, '#7dd3fc'); break;
          case 7: R.cube(chain(base, T(0, hy + 0.5, 0), RY(Math.PI / 4), S(0.32, 0.6, 0.32)), L.hatColor); P(0, hy + 0.24, 0, 0.6, 0.05, 0.6, L.hatColor); break;
          case 9: P(0, hy + 0.24, 0, 0.84, 0.04, 0.84, L.hatColor); P(0, hy + 0.36, 0, 0.42, 0.22, 0.42, L.hatColor); break;
          case 10: P(0, hy + 0.32, 0, 0.66, 0.2, 0.32, '#111827'); P(0, hy + 0.32, -0.165, 0.08, 0.08, 0.01, '#f8fafc'); break;
          case 11: R.cube(chain(base, T(0, hy + 0.48, 0), RY(Math.PI / 4), S(0.2, 0.52, 0.2)), L.hatColor); P(0, hy + 0.76, 0, 0.1, 0.1, 0.1, '#facc15'); break;
          case 12: P(-0.1, hy + 0.48, 0.02, 0.09, 0.42, 0.05, L.hatColor); P(0.1, hy + 0.48, 0.02, 0.09, 0.42, 0.05, L.hatColor); break;
          case 13: P(-0.15, hy + 0.3, 0, 0.12, 0.14, 0.06, L.hatColor); P(0.15, hy + 0.3, 0, 0.12, 0.14, 0.06, L.hatColor); break;
          case 14: for (const [a, b, w, d] of [[0, 0.18, 0.36, 0.04], [0, -0.18, 0.36, 0.04], [0.18, 0, 0.04, 0.36], [-0.18, 0, 0.04, 0.36]]) R.cube(chain(base, T(a, hy + 0.5 + Math.sin(tm * 3) * 0.02, b), S(w, 0.03, d)), '#fde047', 1, 0.9); break;
          case 15: P(-0.15, hy + 0.3, 0, 0.07, 0.18, 0.07, L.hatColor, RZ ? RZ(0.3) : null); P(0.15, hy + 0.3, 0, 0.07, 0.18, 0.07, L.hatColor, RZ ? RZ(-0.3) : null); break;
          case 16: P(0, hy + 0.42, 0, 0.46, 0.38, 0.46, '#f8fafc'); break;
          case 17: P(0.2, hy + 0.22, -0.1, 0.13, 0.13, 0.05, L.hatColor); P(0.2, hy + 0.22, -0.13, 0.05, 0.05, 0.02, '#facc15'); break;
          case 18: P(0, hy + 0.32, 0, 0.46, 0.2, 0.46, '#dc2626'); P(0, hy + 0.23, 0, 0.5, 0.07, 0.5, '#f8fafc'); P(0, hy + 0.46, 0.18, 0.1, 0.1, 0.1, '#f8fafc'); break;
          case 19: P(0, hy + 0.3, 0, 0.5, 0.22, 0.5, '#9ca3af'); P(-0.3, hy + 0.38, 0, 0.08, 0.22, 0.08, '#f5f5f4'); P(0.3, hy + 0.38, 0, 0.08, 0.22, 0.08, '#f5f5f4'); break;
          case 20: P(0, hy + 0.3, 0.02, 0.48, 0.14, 0.46, L.hatColor); R.cube(chain(base, T(0, hy + 0.42, 0), RY(tm * 12), S(0.55, 0.02, 0.07)), '#facc15'); break;
          case 21: P(0.13, hy + 0.27, 0, 0.22, 0.1, 0.06, L.hatColor); break;
          case 22: for (const sx of [-0.1, 0.1]) { P(sx, hy + 0.36, 0, 0.02, 0.2, 0.02, '#1f2937'); P(sx, hy + 0.48, 0, 0.07, 0.07, 0.07, L.hatColor); } break;
          case 23: case 24: P(0, hy + 0.23, 0, 0.68, 0.03, 0.68, L.hatColor); P(0, hy + 0.34, 0, 0.42, 0.2, 0.42, L.hatColor); P(0, hy + 0.27, 0, 0.43, 0.05, 0.43, '#111827'); if (L.hat === 24) for (let i = 0; i < 5; i++) { const a = tm * 1.5 + i * 1.256; R.cube(chain(base, T(Math.cos(a) * 0.4, hy + 0.3 + Math.sin(tm * 3 + i) * 0.08, Math.sin(a) * 0.4), RY(a), S(0.05, 0.05, 0.05)), L.hatColor, 1, 1); } break;
          case 25: { P(0, hy + 0.25, 0.02, 0.54, 0.08, 0.5, L.hatColor); P(-0.255, hy, 0.02, 0.04, 0.52, 0.5, L.hatColor); P(0.255, hy, 0.02, 0.04, 0.52, 0.5, L.hatColor); P(0, hy - 0.02, 0.255, 0.54, 0.56, 0.04, L.hatColor); P(0, hy + 0.22, -0.225, 0.54, 0.035, 0.02, '#facc15'); P(0, hy, -0.214, 0.42, 0.4, 0.004, '#050505'); const ec = L.accColor === '#111827' ? '#ef4444' : L.accColor; for (const sx of [-0.09, 0.09]) R.cube(chain(base, T(sx, hy + 0.02, -0.218), S(0.08, 0.03, 0.005)), ec, 1, 1); break; }
          case 26: P(0, hy + 0.26, 0, 0.5, 0.14, 0.5, '#cbd5e1'); P(0, hy + 0.2, 0, 0.51, 0.04, 0.51, L.hatColor); for (const sx of [-1, 1]) R.cube(chain(base, T(sx * 0.29, hy + 0.36, 0.05), RZ(sx * -0.4), S(0.04, 0.32, 0.26)), '#f8fafc'); break;
          case 27: for (const [dx, hh] of [[-0.16, 0.2], [-0.08, 0.3], [0, 0.4], [0.08, 0.3], [0.16, 0.2]]) R.cube(chain(base, T(dx, hy + 0.22 + hh / 2, -0.05), RY(Math.PI / 4), S(0.07, hh, 0.07)), L.hatColor, 1, 0.6); P(0, hy + 0.22, 0, 0.48, 0.05, 0.48, '#e5e7eb'); break;
          case 28: P(0, hy + 0.24, 0, 0.5, 0.12, 0.5, L.hatColor); P(0, hy + 0.02, -0.215, 0.36, 0.08, 0.01, '#111827'); for (let i = 0; i < 4; i++) { const fh = 0.15 + 0.08 * Math.sin(tm * 9 + i * 1.9); R.cube(chain(base, T(-0.15 + i * 0.1, hy + 0.3 + fh / 2, 0), S(0.08, fh, 0.08)), i % 2 ? '#fde047' : '#f97316', 1, 1); } break;
          case 29: for (const sx of [-1, 1]) { R.cube(chain(base, T(sx * 0.2, hy + 0.32, 0), RZ(sx * -0.5), S(0.07, 0.3, 0.07)), '#bae6fd', 1, 0.5); R.cube(chain(base, T(sx * 0.3, hy + 0.5, 0), RZ(sx * 0.2), S(0.05, 0.16, 0.05)), '#e0f2fe', 1, 0.5); } break;
          case 30: P(0, hy + 0.27, 0, 0.5, 0.16, 0.5, '#facc15'); P(0, hy + 0.21, 0, 0.51, 0.04, 0.51, '#b45309'); P(0, hy + 0.5, 0.1, 0.06, 0.3, 0.34, L.hatColor); R.cube(chain(base, T(0, hy + 0.3, -0.255), S(0.07, 0.07, 0.02)), '#ef4444', 1, 0.8); break;
          case 8: P(-0.25, hy, 0, 0.08, 0.2, 0.2, L.hatColor); P(0.25, hy, 0, 0.08, 0.2, 0.2, L.hatColor); P(0, hy + 0.27, 0, 0.5, 0.04, 0.06, L.hatColor); break;
        }
        { const ch = CU('hat'); if (ch) vox(ch, chain(base, T(0, hy + 0.2 + 0.3, 0)), 0.6, 0.46); }
        // pet: trots/floats beside you
        if (!anim.noPet) {
          const ci = CU('pet'), fly = [3, 5, 6, 7].includes(L.pet), py = (fly ? 1.1 + Math.sin(tm * 3) * 0.08 : Math.abs(Math.sin(tm * 4)) * (L.pet === 8 ? 0.15 : 0.03)), pb = chain(base, T(-0.62, py, 0.35)), c = L.petColor;
          const Q = (tx, ty, tz, sx, sy, sz, col, g) => R.cube(chain(pb, T(tx, ty, tz), S(sx, sy, sz)), col, 1, g || 0);
          if (ci) vox(ci, chain(pb, T(0, 0.3, 0)), 0.6, 0.18);
          else if (L.pet) {
            Q(0, 0.2, 0, 0.26, 0.2, 0.4, c); Q(0, 0.38, -0.24, 0.24, 0.22, 0.2, c); Q(-0.06, 0.4, -0.345, 0.04, 0.04, 0.01, '#111'); Q(0.06, 0.4, -0.345, 0.04, 0.04, 0.01, '#111');
            if (L.pet === 1 || L.pet === 8 || L.pet === 13) { const tall = L.pet === 8 ? 0.22 : 0.08; Q(-0.07, 0.52 + tall / 2, -0.24, 0.06, tall, 0.04, c); Q(0.07, 0.52 + tall / 2, -0.24, 0.06, tall, 0.04, c); }
            if (L.pet === 2) { Q(-0.13, 0.36, -0.24, 0.04, 0.16, 0.08, '#78350f'); Q(0.13, 0.36, -0.24, 0.04, 0.16, 0.08, '#78350f'); Q(0, 0.33, -0.36, 0.1, 0.07, 0.06, '#f5f5f4'); }
            if (L.pet !== 4 && L.pet !== 6 && L.pet !== 3 && L.pet !== 7) for (const [a, b] of [[-0.09, -0.13], [0.09, -0.13], [-0.09, 0.13], [0.09, 0.13]]) Q(a, 0.06, b, 0.06, 0.12, 0.06, c);
            if (L.pet === 3 || L.pet === 7) { const f = Math.sin(tm * 14) * 0.5; R.cube(chain(pb, T(-0.14, 0.26, 0), RZ ? RZ(f) : I4(), T(-0.14, 0, 0), S(0.28, 0.03, 0.2)), L.pet === 7 ? '#7c2d12' : c); R.cube(chain(pb, T(0.14, 0.26, 0), RZ ? RZ(-f) : I4(), T(0.14, 0, 0), S(0.28, 0.03, 0.2)), L.pet === 7 ? '#7c2d12' : c); }
            if (L.pet === 5) Q(0, 0.58, -0.24, 0.03, 0.12, 0.03, '#ef4444', 1);
            if (L.pet === 1 || L.pet === 2 || L.pet === 7) R.cube(chain(pb, T(0, 0.28, 0.22), RX(-0.7 + Math.sin(tm * 8) * 0.2), T(0, 0, 0.1), S(0.05, 0.05, 0.22)), c);
          }
        }
      },
    };
    return R;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  /* ---------- input: keys, mouse look (drag or pointer lock), touch stick + look pad + buttons ---------- */
  function Input(canvas, o = {}) {
    const keys = {}, I = { keys, look: [0, 0], move: [0, 0], touch: matchMedia('(pointer:coarse)').matches, pressed: new Set(), btn: {} };
    addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (!keys[e.code]) I.pressed.add(e.code); keys[e.code] = true; if (/^(Space|Arrow|Tab)/.test(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    let drag = null;
    canvas.addEventListener('mousedown', e => { if (I.touch) return; if (o.lock !== false && canvas.requestPointerLock && !document.pointerLockElement) { try { canvas.requestPointerLock(); } catch {} } drag = { x: e.clientX, y: e.clientY }; if (e.button === 0) I.pressed.add('Mouse0'); if (e.button === 2) I.pressed.add('Mouse2'); keys['Mouse' + e.button] = true; });
    addEventListener('mouseup', e => { drag = null; keys['Mouse' + e.button] = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { I.look[0] += e.movementX; I.look[1] += e.movementY; } else if (drag) { I.look[0] += e.clientX - drag.x; I.look[1] += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; } });
    canvas.addEventListener('wheel', e => { I.wheel = (I.wheel || 0) + Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // touch: left half = movement stick, right half = look; buttons are elements with data-btn
    const tp = new Map();
    canvas.addEventListener('touchstart', e => { I.touch = true; for (const t of e.changedTouches) { const left = t.clientX < innerWidth * 0.45; tp.set(t.identifier, { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }); } e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => { for (const t of e.changedTouches) { const p = tp.get(t.identifier); if (!p) continue; if (!p.left) { I.look[0] += (t.clientX - p.x) * 1.6; I.look[1] += (t.clientY - p.y) * 1.6; } p.x = t.clientX; p.y = t.clientY; } e.preventDefault(); }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { const p = tp.get(t.identifier); if (p && !p.left && Math.hypot(p.x - p.x0, p.y - p.y0) < 10) I.pressed.add('Tap'); tp.delete(t.identifier); } };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
    I.bindButtons = root => root.querySelectorAll('[data-btn]').forEach(b => {
      const k = b.dataset.btn;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); I.btn[k] = true; I.pressed.add('Btn' + k); b.classList.add('on'); });
      const up = () => { I.btn[k] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    });
    /** call once per frame: returns {mx, mz (−1..1, camera-relative), lookX, lookY, run, jump} and clears one-shot presses after */
    I.frame = () => {
      let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      for (const p of tp.values()) if (p.left) { const dx = (p.x - p.x0) / 50, dy = (p.y - p.y0) / 50; mx = Math.max(-1, Math.min(1, dx)); mz = Math.max(-1, Math.min(1, dy)); }
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      if (pads[0]) { const a = pads[0].axes; if (Math.abs(a[0]) > 0.2) mx = a[0]; if (Math.abs(a[1]) > 0.2) mz = a[1]; if (Math.abs(a[2]) > 0.15) I.look[0] += a[2] * 14; if (Math.abs(a[3]) > 0.15) I.look[1] += a[3] * 10; const bt = pads[0].buttons; ['Space', 'KeyE', 'KeyQ', 'KeyF', 'Mouse0', 'KeyC'].forEach((k, i) => { const on = bt[[0, 2, 3, 1, 7, 5][i]] && bt[[0, 2, 3, 1, 7, 5][i]].pressed; if (on && !I['gp' + k]) I.pressed.add(k); I['gp' + k] = on; keys['Pad' + k] = on; }); }
      const out = { mx, mz, lookX: I.look[0], lookY: I.look[1], run: !!(keys.ShiftLeft || keys.ShiftRight || I.btn.run), wheel: I.wheel || 0 };
      I.look[0] = I.look[1] = 0; I.wheel = 0;
      return out;
    };
    I.hit = k => I.pressed.has(k);
    I.down = k => !!(keys[k] || keys['Pad' + k] || I.btn[k]);
    I.endFrame = () => I.pressed.clear();
    return I;
  }

  /* ---------- simple physics: a cylinder-ish body against AABB boxes + a ground height function ---------- */
  function Body(x, y, z, r = 0.35, h = 1.8) { return { x, y, z, vx: 0, vy: 0, vz: 0, r, h, ground: true }; }
  /** boxes: [[x0,y0,z0,x1,y1,z1], …]; groundFn(x,z) → height. Steps up ledges ≤ 0.45. */
  function moveBody(b, dt, boxes, groundFn, g = 22) {
    b.vy -= g * dt;
    const tryAxis = (ax, d) => {
      if (!d) return;
      const old = b[ax]; b[ax] += d;
      for (const k of boxes) {
        if (b.x + b.r <= k[0] || b.x - b.r >= k[3] || b.z + b.r <= k[2] || b.z - b.r >= k[5] || b.y + b.h <= k[1] || b.y >= k[4]) continue;
        if (k[4] - b.y <= 0.45 && b.ground) { b.y = k[4]; continue; }   // step up
        b[ax] = old; if (ax === 'x') b.vx = 0; else b.vz = 0; return;
      }
    };
    tryAxis('x', b.vx * dt); tryAxis('z', b.vz * dt);
    b.y += b.vy * dt; b.ground = false;
    let floor = groundFn ? groundFn(b.x, b.z) : 0;
    for (const k of boxes) if (b.x + b.r > k[0] && b.x - b.r < k[3] && b.z + b.r > k[2] && b.z - b.r < k[5]) {
      if (b.y >= k[4] - 0.5 && k[4] > floor && b.y - b.vy * dt >= k[4] - 0.5) floor = Math.max(floor, k[4]);
      else if (b.vy > 0 && b.y + b.h > k[1] && b.y < k[1]) { b.y = k[1] - b.h; b.vy = 0; }
    }
    if (b.y <= floor) { b.y = floor; b.vy = 0; b.ground = true; }
  }
  /** line of sight / ray against boxes; returns distance or max */
  function rayBoxes(o, d, boxes, max) {
    let best = max;
    for (const k of boxes) {
      let t0 = 0, t1 = best, ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const inv = 1 / (d[a] || 1e-9), ta = (k[a] - o[a]) * inv, tb = (k[a + 3] - o[a]) * inv;
        t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); if (t1 < t0) ok = false;
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
  /** tiny sound synth for 3D games (footsteps, wind, hits) */
  let ac = null;
  function tone(f, d = 0.1, type = 'sine', vol = 0.06, f2) {
    try { if (window.SJG && SJG.muted) return; ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02); } catch {}
  }
  function noise(d = 0.2, vol = 0.05, hp = 800) {
    try { if (window.SJG && SJG.muted) return; ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = ac.sampleRate * d | 0, buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(ac.destination); s.start(); } catch {}
  }
  /** seeded random */
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  /** smooth value noise for terrain */
  function noise2(seed) { const R = rng(seed), P = new Float32Array(256 * 256); for (let i = 0; i < P.length; i++) P[i] = R(); const at = (x, z) => P[((x & 255) << 8) | (z & 255)]; const sm = t => t * t * (3 - 2 * t); return (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi); const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }; }

  /** a ⛶ button that makes the game fill the screen. Inside a SanjivramOS window it also asks the desktop to make the
      window fullscreen (some browsers don't allow fullscreen from inside a frame). opts: { style: 'css', parent: element } */
  /* first-person / third-person view, shared by every 3D game and remembered (V or the 👁 button switches) */
  const view = { fp: (() => { try { return localStorage.getItem('sj3d.fp') === '1'; } catch { return false; } })(), subs: [],
    set(v) { view.fp = !!v; try { localStorage.setItem('sj3d.fp', view.fp ? '1' : '0'); } catch {} for (const f of view.subs) try { f(view.fp); } catch {} },
    toggle() { view.set(!view.fp); } };
  addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) view.toggle(); });
  function viewButton(opts = {}) {
    const b = document.createElement('button');
    b.className = 'gl3d-view'; b.setAttribute('aria-label', 'Switch first-person / third-person view');
    b.style.cssText = 'position:fixed;z-index:20;top:12px;left:50%;margin-left:194px;width:38px;height:38px;border-radius:10px;border:none;background:rgba(0,0,0,.45);color:#fff;font:19px/1 system-ui;cursor:pointer;backdrop-filter:blur(6px);' + (opts.style || '');
    const icon = () => { b.textContent = view.fp ? '🎥' : '👁'; b.title = view.fp ? 'Third-person view (V)' : 'First-person view (V)'; };
    b.onclick = e => { e.stopPropagation(); view.toggle(); };
    b.addEventListener('pointerdown', e => e.stopPropagation());
    view.subs.push(icon); icon(); (opts.parent || document.body).appendChild(b);
    return b;
  }
  function fullscreenButton(opts = {}) {
    const b = document.createElement('button');
    b.className = 'gl3d-fs'; b.title = 'Fullscreen (F11 also works)'; b.setAttribute('aria-label', 'Fullscreen');
    b.style.cssText = 'position:fixed;z-index:20;top:12px;left:50%;margin-left:150px;width:38px;height:38px;border-radius:10px;border:none;background:rgba(0,0,0,.45);color:#fff;font:20px/1 system-ui;cursor:pointer;backdrop-filter:blur(6px);' + (opts.style || '');
    const icon = () => { b.textContent = document.fullscreenElement || document.webkitFullscreenElement ? '🗗' : '⛶'; };
    const embedded = (() => { try { return window.parent !== window; } catch { return true; } })();
    b.onclick = async e => {
      e.stopPropagation();
      const el = document.documentElement;
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else if (el.requestFullscreen || el.webkitRequestFullscreen) await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
        else throw new Error('no fullscreen');
      } catch { if (embedded) window.parent.postMessage({ sjg: 1, type: 'fullscreen' }, location.origin); }
      setTimeout(icon, 200);
    };
    b.addEventListener('pointerdown', e => e.stopPropagation());
    document.addEventListener('fullscreenchange', icon); document.addEventListener('webkitfullscreenchange', icon);
    icon(); (opts.parent || document.body).appendChild(b);
    return b;
  }
  window.GL3D = { view, viewButton, fullscreenButton, create, M, hex, dirOf, pushBox, pushCone, pushTerrain, tri, Input, Body, moveBody, rayBoxes, tone, noise, rng, noise2 };
})();
