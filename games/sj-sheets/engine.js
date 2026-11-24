/* Sheets formula engine: parser, evaluator, ~70 functions, reference shifting. No DOM. */
(() => {
'use strict';
const E = window.SheetEngine = {};
class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
E.FErr = FErr;
const ERR = c => new FErr(c);
E.colName = c => { let s = ''; c++; while (c) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
E.colIdx = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
E.key = (c, r) => E.colName(c) + (r + 1);
E.parseRef = s => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(String(s).trim()); return m ? { c: E.colIdx(m[1]), r: +m[2] - 1 } : null; };
E.parseRange = s => { const [a, b] = String(s).split(':'); const p = E.parseRef(a), q = b ? E.parseRef(b) : p; if (!p || !q) return null; return { c1: Math.min(p.c, q.c), r1: Math.min(p.r, q.r), c2: Math.max(p.c, q.c), r2: Math.max(p.r, q.r) }; };
// dates: serial numbers, day 0 = 1899-12-30
const EPOCH = Date.UTC(1899, 11, 30);
E.toSerial = (y, m, d) => (Date.UTC(y, m - 1, d) - EPOCH) / 864e5;
E.fromSerial = n => new Date(EPOCH + Math.round(n * 864e5));

// ---------- tokenizer ----------
const REF = String.raw`\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?`;
const TOK = new RegExp(String.raw`\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!${REF})(?![\w(])|(${REF})(?![\w(!])|([A-Za-z_][\w.]*)(?=\s*\()|(TRUE|FALSE)(?![\w(])|(<>|<=|>=|[-+*/^&=<>%(),;]))`, 'iy');
const tokenize = src => {
  const out = []; TOK.lastIndex = 0;
  while (TOK.lastIndex < src.length) {
    const at = TOK.lastIndex; const m = TOK.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(at))) break; throw ERR(/^\s*[A-Za-z_]/.test(src.slice(at)) ? '#NAME?' : '#ERROR!'); }
    if (m[1] != null) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] != null) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/""/g, '"') });
    else if (m[3] != null) { const i = m[3].lastIndexOf('!'); let sh = m[3].slice(0, i); if (sh[0] === "'") sh = sh.slice(1, -1).replace(/''/g, "'"); out.push({ t: 'ref', sheet: sh, v: m[3].slice(i + 1) }); }
    else if (m[4] != null) out.push({ t: 'ref', v: m[4] });
    else if (m[5] != null) out.push({ t: 'fn', v: m[5].toUpperCase() });
    else if (m[6] != null) out.push({ t: 'bool', v: m[6].toUpperCase() === 'TRUE' });
    else out.push({ t: 'op', v: m[7] });
  }
  return out;
};
// ---------- parser ----------
E.parse = src => {
  const tk = tokenize(src); let i = 0;
  const peek = () => tk[i], isOp = (...o) => tk[i] && tk[i].t === 'op' && o.includes(tk[i].v);
  const bin = (next, ops) => () => { let l = next(); while (isOp(...ops)) { const op = tk[i++].v; l = { t: 'bin', op, l, r: next() }; } return l; };
  const primary = () => {
    const t = tk[i++]; if (!t) throw ERR('#ERROR!');
    if (t.t === 'num' || t.t === 'str' || t.t === 'bool') return { t: 'lit', v: t.v };
    if (t.t === 'ref') { const rg = E.parseRange(t.v); if (!rg) throw ERR('#REF!'); return { t: 'ref', sheet: t.sheet, ...rg, single: !t.v.includes(':') }; }
    if (t.t === 'fn') {
      if (!isOp('(')) throw ERR('#ERROR!'); i++; const args = [];
      if (isOp(')')) { i++; return { t: 'fn', name: t.v, args }; }
      for (;;) { if (isOp(',', ';') || isOp(')')) args.push({ t: 'empty' }); else args.push(cmp()); if (isOp(',', ';')) { i++; continue; } if (isOp(')')) { i++; break; } throw ERR('#ERROR!'); }
      return { t: 'fn', name: t.v, args };
    }
    if (t.t === 'op' && t.v === '(') { const e = cmp(); if (!isOp(')')) throw ERR('#ERROR!'); i++; return e; }
    throw ERR('#ERROR!');
  };
  const postfix = () => { let e = primary(); while (isOp('%')) { i++; e = { t: 'pct', e }; } return e; };
  const unary = () => { if (isOp('-', '+')) { const op = tk[i++].v; const e = unary(); return op === '-' ? { t: 'neg', e } : e; } return postfix(); };
  const pow = bin(unary, ['^']), mul = bin(pow, ['*', '/']), add = bin(mul, ['+', '-']), cat = bin(add, ['&']), cmp = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
  const ast = cmp(); if (i < tk.length) throw ERR('#ERROR!'); return ast;
};

// ---------- evaluation ----------
// book: { sheets: [{ name, cells: { A1: { v } } }] }
E.Calc = class {
  constructor(book) { this.book = book; this.memo = new Map(); this.busy = new Set(); this.asts = new Map(); }
  reset() { this.memo.clear(); }
  sheetIdx(name) { if (name == null) return null; const n = name.toLowerCase(); return this.book.sheets.findIndex(s => s.name.toLowerCase() === n); }
  literal(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
    const s = String(raw);
    if (s[0] === "'") return s.slice(1);
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s.trim())) return parseFloat(s);
    if (/^(true|false)$/i.test(s)) return s.toUpperCase() === 'TRUE';
    if (/^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)$/.test(s)) return ERR(s);
    return s;
  }
  value(si, c, r) {
    const k = si + ':' + c + ':' + r; if (this.memo.has(k)) return this.memo.get(k);
    const sh = this.book.sheets[si]; const cell = sh && sh.cells[E.key(c, r)]; let v;
    if (!cell || cell.v == null || cell.v === '') v = null;
    else if (typeof cell.v === 'string' && cell.v[0] === '=' && cell.v.length > 1) {
      if (this.busy.has(k)) return ERR('#CIRC!');
      this.busy.add(k);
      try { let ast = this.asts.get(cell.v); if (!ast) { ast = E.parse(cell.v.slice(1)); this.asts.set(cell.v, ast); } v = this.scalar(this.ev(ast, si)); if (v === null) v = 0; }
      catch (e) { v = e instanceof FErr ? e : ERR('#ERROR!'); if (!(e instanceof FErr)) console.warn(e); }
      this.busy.delete(k);
    } else v = this.literal(cell.v);
    this.memo.set(k, v); return v;
  }
  evalFormula(src, si) { try { return this.scalar(this.ev(E.parse(src), si)); } catch (e) { return e instanceof FErr ? e : ERR('#ERROR!'); } }
  ev(n, si) {
    switch (n.t) {
      case 'lit': return n.v;
      case 'empty': return null;
      case 'ref': { const s = n.sheet != null ? this.sheetIdx(n.sheet) : si; if (s < 0) throw ERR('#REF!'); return { range: true, si: s, c1: n.c1, r1: n.r1, c2: n.c2, r2: n.r2 }; }
      case 'neg': return -this.num(this.ev(n.e, si));
      case 'pct': return this.num(this.ev(n.e, si)) / 100;
      case 'bin': {
        const a = this.scalar(this.ev(n.l, si)), b = this.scalar(this.ev(n.r, si));
        if (a instanceof FErr) throw a; if (b instanceof FErr) throw b;
        switch (n.op) {
          case '+': return this.num(a) + this.num(b);
          case '-': return this.num(a) - this.num(b);
          case '*': return this.num(a) * this.num(b);
          case '/': { const d = this.num(b); if (d === 0) throw ERR('#DIV/0!'); return this.num(a) / d; }
          case '^': { const r = Math.pow(this.num(a), this.num(b)); if (!isFinite(r)) throw ERR('#NUM!'); return r; }
          case '&': return this.str(a) + this.str(b);
          default: return E.compare(n.op, a, b);
        }
      }
      case 'fn': { const f = FN[n.name]; if (!f) throw ERR('#NAME?'); return f(this, n.args, si); }
    }
    throw ERR('#ERROR!');
  }
  scalar(v) { if (v && v.range) { if (v.c1 === v.c2 && v.r1 === v.r2) return this.value(v.si, v.c1, v.r1); throw ERR('#VALUE!'); } return v; }
  num(v) {
    v = this.scalar(v); if (v instanceof FErr) throw v;
    if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'number') return v;
    const s = String(v).trim().replace(/,/g, ''); const pct = s.endsWith('%'); const n = Number(pct ? s.slice(0, -1) : s.replace(/^\$/, ''));
    if (s === '' || isNaN(n)) throw ERR('#VALUE!'); return pct ? n / 100 : n;
  }
  str(v) { v = this.scalar(v); if (v instanceof FErr) throw v; if (v == null) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return E.numStr(v); return String(v); }
  bool(v) { v = this.scalar(v); if (v instanceof FErr) throw v; if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw ERR('#VALUE!'); } return !!v; }
  // every cell of a range (blanks as null), or the scalar
  cells(v) { if (v && v.range) { const o = []; for (let r = v.r1; r <= v.r2; r++) for (let c = v.c1; c <= v.c2; c++) o.push(this.value(v.si, c, r)); return o; } return [v]; }
  grid(v) { if (v && v.range) { const o = []; for (let r = v.r1; r <= v.r2; r++) { const row = []; for (let c = v.c1; c <= v.c2; c++) row.push(this.value(v.si, c, r)); o.push(row); } return o; } return [[v]]; }
  // numbers for SUM-like functions: from ranges only real numbers count; direct args are coerced
  nums(args, si) { const o = []; for (const a of args) { const v = this.ev(a, si); if (v && v.range) { for (const x of this.cells(v)) { if (x instanceof FErr) throw x; if (typeof x === 'number') o.push(x); } } else { if (v instanceof FErr) throw v; if (v !== null) o.push(this.num(v)); } } return o; }
};
E.numStr = v => { if (!isFinite(v)) return '#NUM!'; if (Number.isInteger(v)) return String(v); const s = String(+v.toPrecision(12)); return s; };
E.compare = (op, a, b) => {
  const t = x => x == null ? 0 : typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : 3;
  if (a == null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  let d; if (t(a) !== t(b)) d = t(a) - t(b); else if (typeof a === 'string') d = a.toLowerCase().localeCompare(b.toLowerCase()); else d = (+a) - (+b);
  return { '=': d === 0, '<>': d !== 0, '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0 }[op];
};
const crit = (C, c) => {
  c = C.scalar(c); if (c instanceof FErr) throw c;
  if (typeof c === 'number' || typeof c === 'boolean') return v => v === c || (typeof v === 'string' && v.trim() !== '' && Number(v) === c);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(String(c == null ? '' : c)); const op = m[1] || '=', rhs = m[2];
  const n = rhs.trim() !== '' && !isNaN(Number(rhs)) ? Number(rhs) : null;
  if (n !== null) return v => typeof v === 'number' && E.compare(op, v, n);
  if (op === '=' || op === '<>') {
    const re = new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
    return op === '=' ? (v => rhs === '' ? v == null || v === '' : re.test(v == null ? '' : String(v))) : (v => rhs === '' ? !(v == null || v === '') : !re.test(v == null ? '' : String(v)));
  }
  return v => typeof v === 'string' && E.compare(op, v, rhs);
};
const sum = a => a.reduce((x, y) => x + y, 0);
const R = (n, d) => { const f = Math.pow(10, d); return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f; };
const N = (C, a, si) => C.num(C.ev(a, si)), S = (C, a, si) => C.str(C.ev(a, si));
const opt = (C, a, si, d) => a && a.t !== 'empty' ? C.num(C.ev(a, si)) : d;
const need = (args, min, max = min) => { if (args.length < min || args.length > max) throw ERR('#N/A'); };
const ifs = (C, args, si, rangeIdx, critIdx, sumIdx) => {
  const rg = C.ev(args[rangeIdx], si); if (!rg || !rg.range) throw ERR('#VALUE!');
  const test = crit(C, C.ev(args[critIdx], si)); const vals = C.cells(rg);
  let sv = null; if (sumIdx != null && args[sumIdx]) { const s = C.ev(args[sumIdx], si); if (!s || !s.range) throw ERR('#VALUE!'); sv = C.cells({ ...s, c2: s.c1 + (rg.c2 - rg.c1), r2: s.r1 + (rg.r2 - rg.r1) }); }
  return vals.map((v, i) => [test(v), sv ? sv[i] : v]);
};
const lookupRow = (C, v, arr, exact) => {
  if (exact) { const t = crit(C, v); return arr.findIndex(x => typeof v === 'string' ? t(x) : E.compare('=', x, v)); }
  let best = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] == null) continue; if (E.compare('<=', arr[i], v)) best = i; else break; } return best;
};
const FN = E.FN = {
  SUM: (C, a, si) => sum(C.nums(a, si)),
  AVERAGE: (C, a, si) => { const n = C.nums(a, si); if (!n.length) throw ERR('#DIV/0!'); return sum(n) / n.length; },
  MIN: (C, a, si) => { const n = C.nums(a, si); return n.length ? Math.min(...n) : 0; },
  MAX: (C, a, si) => { const n = C.nums(a, si); return n.length ? Math.max(...n) : 0; },
  COUNT: (C, a, si) => a.reduce((t, x) => { const v = C.ev(x, si); return t + C.cells(v).filter(y => typeof y === 'number' || (!(v && v.range) && y != null && !isNaN(Number(y)) && y !== '')).length; }, 0),
  COUNTA: (C, a, si) => a.reduce((t, x) => t + C.cells(C.ev(x, si)).filter(y => y != null && y !== '').length, 0),
  COUNTBLANK: (C, a, si) => C.cells(C.ev(a[0], si)).filter(y => y == null || y === '').length,
  PRODUCT: (C, a, si) => C.nums(a, si).reduce((x, y) => x * y, 1),
  MEDIAN: (C, a, si) => { const n = C.nums(a, si).sort((x, y) => x - y); if (!n.length) throw ERR('#NUM!'); const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
  MODE: (C, a, si) => { const n = C.nums(a, si), f = new Map(); n.forEach(v => f.set(v, (f.get(v) || 0) + 1)); let b = null, bc = 1; f.forEach((c, v) => { if (c > bc) { b = v; bc = c; } }); if (b === null) throw ERR('#N/A'); return b; },
  STDEV: (C, a, si) => { const n = C.nums(a, si); if (n.length < 2) throw ERR('#DIV/0!'); const m = sum(n) / n.length; return Math.sqrt(sum(n.map(v => (v - m) ** 2)) / (n.length - 1)); },
  VAR: (C, a, si) => { const n = C.nums(a, si); if (n.length < 2) throw ERR('#DIV/0!'); const m = sum(n) / n.length; return sum(n.map(v => (v - m) ** 2)) / (n.length - 1); },
  LARGE: (C, a, si) => { const n = C.nums([a[0]], si).sort((x, y) => y - x), k = N(C, a[1], si); if (k < 1 || k > n.length) throw ERR('#NUM!'); return n[k - 1]; },
  SMALL: (C, a, si) => { const n = C.nums([a[0]], si).sort((x, y) => x - y), k = N(C, a[1], si); if (k < 1 || k > n.length) throw ERR('#NUM!'); return n[k - 1]; },
  RANK: (C, a, si) => { const v = N(C, a[0], si), n = C.nums([a[1]], si), asc = opt(C, a[2], si, 0); if (!n.includes(v)) throw ERR('#N/A'); return 1 + n.filter(x => asc ? x < v : x > v).length; },
  SUMIF: (C, a, si) => { need(a, 2, 3); return sum(ifs(C, a, si, 0, 1, a[2] ? 2 : null).filter(([ok, v]) => ok && typeof v === 'number').map(x => x[1])); },
  COUNTIF: (C, a, si) => { need(a, 2); return ifs(C, a, si, 0, 1).filter(x => x[0]).length; },
  AVERAGEIF: (C, a, si) => { need(a, 2, 3); const v = ifs(C, a, si, 0, 1, a[2] ? 2 : null).filter(([ok, v]) => ok && typeof v === 'number').map(x => x[1]); if (!v.length) throw ERR('#DIV/0!'); return sum(v) / v.length; },
  SUMIFS: (C, a, si) => { const s = C.ev(a[0], si); const vals = C.cells(s); let ok = vals.map(() => true); for (let i = 1; i + 1 < a.length; i += 2) { const t = crit(C, C.ev(a[i + 1], si)); C.cells(C.ev(a[i], si)).forEach((v, j) => { if (!t(v)) ok[j] = false; }); } return sum(vals.filter((v, j) => ok[j] && typeof v === 'number')); },
  COUNTIFS: (C, a, si) => { let ok = null; for (let i = 0; i + 1 < a.length; i += 2) { const t = crit(C, C.ev(a[i + 1], si)); const v = C.cells(C.ev(a[i], si)); if (!ok) ok = v.map(() => true); v.forEach((x, j) => { if (!t(x)) ok[j] = false; }); } return ok ? ok.filter(Boolean).length : 0; },
  IF: (C, a, si) => { need(a, 1, 3); return C.bool(C.ev(a[0], si)) ? (a[1] ? C.ev(a[1], si) : true) : (a[2] ? C.ev(a[2], si) : false); },
  IFS: (C, a, si) => { for (let i = 0; i + 1 < a.length; i += 2) if (C.bool(C.ev(a[i], si))) return C.ev(a[i + 1], si); throw ERR('#N/A'); },
  IFERROR: (C, a, si) => { try { const v = C.scalar(C.ev(a[0], si)); if (v instanceof FErr) return C.ev(a[1], si); return v; } catch (e) { if (e instanceof FErr) return C.ev(a[1], si); throw e; } },
  IFNA: (C, a, si) => { try { const v = C.scalar(C.ev(a[0], si)); if (v instanceof FErr && v.code === '#N/A') return C.ev(a[1], si); return v; } catch (e) { if (e instanceof FErr && e.code === '#N/A') return C.ev(a[1], si); throw e; } },
  AND: (C, a, si) => a.every(x => C.cells(C.ev(x, si)).filter(v => v != null).every(v => C.bool(v))),
  OR: (C, a, si) => a.some(x => C.cells(C.ev(x, si)).filter(v => v != null).some(v => C.bool(v))),
  NOT: (C, a, si) => !C.bool(C.ev(a[0], si)),
  XOR: (C, a, si) => a.reduce((t, x) => t ^ C.cells(C.ev(x, si)).filter(v => v != null).reduce((u, v) => u ^ C.bool(v), 0), 0) === 1,
  TRUE: () => true, FALSE: () => false,
  ROUND: (C, a, si) => R(N(C, a[0], si), opt(C, a[1], si, 0)),
  ROUNDUP: (C, a, si) => { const f = 10 ** opt(C, a[1], si, 0), v = N(C, a[0], si); return Math.sign(v) * Math.ceil(Math.abs(v) * f - 1e-9) / f; },
  ROUNDDOWN: (C, a, si) => { const f = 10 ** opt(C, a[1], si, 0), v = N(C, a[0], si); return Math.sign(v) * Math.floor(Math.abs(v) * f + 1e-9) / f; },
  INT: (C, a, si) => Math.floor(N(C, a[0], si)),
  TRUNC: (C, a, si) => { const f = 10 ** opt(C, a[1], si, 0); return Math.trunc(N(C, a[0], si) * f) / f; },
  CEILING: (C, a, si) => { const s = opt(C, a[1], si, 1); return s ? Math.ceil(N(C, a[0], si) / s) * s : 0; },
  FLOOR: (C, a, si) => { const s = opt(C, a[1], si, 1); return s ? Math.floor(N(C, a[0], si) / s) * s : 0; },
  ABS: (C, a, si) => Math.abs(N(C, a[0], si)),
  SIGN: (C, a, si) => Math.sign(N(C, a[0], si)),
  SQRT: (C, a, si) => { const v = N(C, a[0], si); if (v < 0) throw ERR('#NUM!'); return Math.sqrt(v); },
  POWER: (C, a, si) => Math.pow(N(C, a[0], si), N(C, a[1], si)),
  EXP: (C, a, si) => Math.exp(N(C, a[0], si)),
  LN: (C, a, si) => { const v = N(C, a[0], si); if (v <= 0) throw ERR('#NUM!'); return Math.log(v); },
  LOG: (C, a, si) => { const v = N(C, a[0], si); if (v <= 0) throw ERR('#NUM!'); return Math.log(v) / Math.log(opt(C, a[1], si, 10)); },
  LOG10: (C, a, si) => { const v = N(C, a[0], si); if (v <= 0) throw ERR('#NUM!'); return Math.log10(v); },
  MOD: (C, a, si) => { const d = N(C, a[1], si); if (d === 0) throw ERR('#DIV/0!'); const n = N(C, a[0], si); return n - d * Math.floor(n / d); },
  PI: () => Math.PI,
  SIN: (C, a, si) => Math.sin(N(C, a[0], si)), COS: (C, a, si) => Math.cos(N(C, a[0], si)), TAN: (C, a, si) => Math.tan(N(C, a[0], si)),
  RADIANS: (C, a, si) => N(C, a[0], si) * Math.PI / 180, DEGREES: (C, a, si) => N(C, a[0], si) * 180 / Math.PI,
  RAND: () => Math.random(),
  RANDBETWEEN: (C, a, si) => { const lo = Math.ceil(N(C, a[0], si)), hi = Math.floor(N(C, a[1], si)); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
  CONCAT: (C, a, si) => a.map(x => C.cells(C.ev(x, si)).map(v => C.str(v)).join('')).join(''),
  CONCATENATE: (C, a, si) => a.map(x => S(C, x, si)).join(''),
  TEXTJOIN: (C, a, si) => { const d = S(C, a[0], si), skip = C.bool(C.ev(a[1], si)); return a.slice(2).flatMap(x => C.cells(C.ev(x, si)).map(v => C.str(v))).filter(s => !skip || s !== '').join(d); },
  LEN: (C, a, si) => S(C, a[0], si).length,
  UPPER: (C, a, si) => S(C, a[0], si).toUpperCase(), LOWER: (C, a, si) => S(C, a[0], si).toLowerCase(),
  PROPER: (C, a, si) => S(C, a[0], si).toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (m, p, c) => p + c.toUpperCase()),
  TRIM: (C, a, si) => S(C, a[0], si).trim().replace(/ +/g, ' '),
  LEFT: (C, a, si) => S(C, a[0], si).slice(0, opt(C, a[1], si, 1)),
  RIGHT: (C, a, si) => { const s = S(C, a[0], si), n = opt(C, a[1], si, 1); return n ? s.slice(-n) : ''; },
  MID: (C, a, si) => { const st = N(C, a[1], si); if (st < 1) throw ERR('#VALUE!'); return S(C, a[0], si).substr(st - 1, N(C, a[2], si)); },
  FIND: (C, a, si) => { const i = S(C, a[1], si).indexOf(S(C, a[0], si), opt(C, a[2], si, 1) - 1); if (i < 0) throw ERR('#VALUE!'); return i + 1; },
  SEARCH: (C, a, si) => { const i = S(C, a[1], si).toLowerCase().indexOf(S(C, a[0], si).toLowerCase(), opt(C, a[2], si, 1) - 1); if (i < 0) throw ERR('#VALUE!'); return i + 1; },
  SUBSTITUTE: (C, a, si) => { const s = S(C, a[0], si), f = S(C, a[1], si), t = S(C, a[2], si); if (!f) return s; if (a[3]) { const n = N(C, a[3], si); let c = 0; return s.replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => ++c === n ? t : m); } return s.split(f).join(t); },
  REPLACE: (C, a, si) => { const s = S(C, a[0], si), st = N(C, a[1], si) - 1; return s.slice(0, st) + S(C, a[3], si) + s.slice(st + N(C, a[2], si)); },
  REPT: (C, a, si) => S(C, a[0], si).repeat(Math.max(0, Math.min(10000, N(C, a[1], si)))),
  EXACT: (C, a, si) => S(C, a[0], si) === S(C, a[1], si),
  VALUE: (C, a, si) => N(C, a[0], si),
  TEXT: (C, a, si) => E.formatCode(C.num(C.ev(a[0], si)), S(C, a[1], si)),
  CHAR: (C, a, si) => String.fromCharCode(N(C, a[0], si)), CODE: (C, a, si) => S(C, a[0], si).charCodeAt(0) || 0,
  ISBLANK: (C, a, si) => C.scalar(C.ev(a[0], si)) == null,
  ISNUMBER: (C, a, si) => { try { return typeof C.scalar(C.ev(a[0], si)) === 'number'; } catch { return false; } },
  ISTEXT: (C, a, si) => { try { return typeof C.scalar(C.ev(a[0], si)) === 'string'; } catch { return false; } },
  ISERROR: (C, a, si) => { try { return C.scalar(C.ev(a[0], si)) instanceof FErr; } catch (e) { return e instanceof FErr; } },
  ISEVEN: (C, a, si) => Math.trunc(N(C, a[0], si)) % 2 === 0, ISODD: (C, a, si) => Math.abs(Math.trunc(N(C, a[0], si)) % 2) === 1,
  NA: () => { throw ERR('#N/A'); },
  TODAY: () => { const d = new Date(); return E.toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); },
  NOW: () => { const d = new Date(); return E.toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; },
  DATE: (C, a, si) => E.toSerial(N(C, a[0], si), N(C, a[1], si), N(C, a[2], si)),
  YEAR: (C, a, si) => E.fromSerial(N(C, a[0], si)).getUTCFullYear(),
  MONTH: (C, a, si) => E.fromSerial(N(C, a[0], si)).getUTCMonth() + 1,
  DAY: (C, a, si) => E.fromSerial(N(C, a[0], si)).getUTCDate(),
  WEEKDAY: (C, a, si) => E.fromSerial(N(C, a[0], si)).getUTCDay() + 1,
  DAYS: (C, a, si) => Math.floor(N(C, a[0], si)) - Math.floor(N(C, a[1], si)),
  EDATE: (C, a, si) => { const d = E.fromSerial(N(C, a[0], si)); return E.toSerial(d.getUTCFullYear(), d.getUTCMonth() + 1 + N(C, a[1], si), d.getUTCDate()); },
  VLOOKUP: (C, a, si) => { need(a, 3, 4); const v = C.scalar(C.ev(a[0], si)), g = C.grid(C.ev(a[1], si)), col = N(C, a[2], si), exact = a[3] && a[3].t !== 'empty' ? !C.bool(C.ev(a[3], si)) : false; if (col < 1 || col > g[0].length) throw ERR('#REF!'); const i = lookupRow(C, v, g.map(r => r[0]), exact); if (i < 0) throw ERR('#N/A'); return g[i][col - 1]; },
  HLOOKUP: (C, a, si) => { need(a, 3, 4); const v = C.scalar(C.ev(a[0], si)), g = C.grid(C.ev(a[1], si)), row = N(C, a[2], si), exact = a[3] && a[3].t !== 'empty' ? !C.bool(C.ev(a[3], si)) : false; if (row < 1 || row > g.length) throw ERR('#REF!'); const i = lookupRow(C, v, g[0], exact); if (i < 0) throw ERR('#N/A'); return g[row - 1][i]; },
  XLOOKUP: (C, a, si) => { const v = C.scalar(C.ev(a[0], si)), keys = C.cells(C.ev(a[1], si)), vals = C.cells(C.ev(a[2], si)); const i = lookupRow(C, v, keys, true); if (i < 0) { if (a[3] && a[3].t !== 'empty') return C.ev(a[3], si); throw ERR('#N/A'); } return vals[i]; },
  INDEX: (C, a, si) => { const g = C.grid(C.ev(a[0], si)); let r = opt(C, a[1], si, 1), c = opt(C, a[2], si, 1); if (g.length === 1 && a.length === 2) { c = r; r = 1; } if (r < 1 || c < 1 || r > g.length || c > g[0].length) throw ERR('#REF!'); return g[r - 1][c - 1]; },
  MATCH: (C, a, si) => { const v = C.scalar(C.ev(a[0], si)), arr = C.cells(C.ev(a[1], si)), t = opt(C, a[2], si, 1); let i; if (t === 0) i = lookupRow(C, v, arr, true); else if (t > 0) i = lookupRow(C, v, arr, false); else { i = -1; for (let k = 0; k < arr.length; k++) if (E.compare('>=', arr[k], v)) i = k; else break; } if (i < 0) throw ERR('#N/A'); return i + 1; },
  ROWS: (C, a, si) => { const v = C.ev(a[0], si); return v && v.range ? v.r2 - v.r1 + 1 : 1; },
  COLUMNS: (C, a, si) => { const v = C.ev(a[0], si); return v && v.range ? v.c2 - v.c1 + 1 : 1; },
  ROW: (C, a, si) => { const v = a[0] && C.ev(a[0], si); if (!v || !v.range) throw ERR('#VALUE!'); return v.r1 + 1; },
  COLUMN: (C, a, si) => { const v = a[0] && C.ev(a[0], si); if (!v || !v.range) throw ERR('#VALUE!'); return v.c1 + 1; },
  PMT: (C, a, si) => { const r = N(C, a[0], si), n = N(C, a[1], si), pv = N(C, a[2], si), fv = opt(C, a[3], si, 0); return r === 0 ? -(pv + fv) / n : -(r * (pv * Math.pow(1 + r, n) + fv)) / (Math.pow(1 + r, n) - 1); },
  FV: (C, a, si) => { const r = N(C, a[0], si), n = N(C, a[1], si), p = N(C, a[2], si), pv = opt(C, a[3], si, 0); return r === 0 ? -(pv + p * n) : -(pv * Math.pow(1 + r, n) + p * (Math.pow(1 + r, n) - 1) / r); },
};
FN.AVG = FN.AVERAGE; FN.STDEV_S = FN.STDEV; FN['STDEV.S'] = FN.STDEV; FN['VAR.S'] = FN.VAR; FN.CEIL = FN.CEILING;
E.FUNCTIONS = Object.keys(FN).filter(k => /^[A-Z]/.test(k)).sort();

// ---------- number formats ----------
// fmt: '' general | 'num' | 'cur' | 'pct' | 'date' | 'text' ; dec: decimals
E.format = (v, fmt, dec) => {
  if (v == null) return '';
  if (v instanceof FErr) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v !== 'number') return String(v);
  if (!isFinite(v)) return '#NUM!';
  const fix = (n, d) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (fmt) {
    case 'num': return fix(v, dec ?? 2);
    case 'cur': return (v < 0 ? '-$' : '$') + fix(Math.abs(v), dec ?? 2);
    case 'pct': return (v * 100).toFixed(dec ?? 0) + '%';
    case 'date': { if (v < -657434 || v > 2958465) return '#####'; const d = E.fromSerial(v); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }
    case 'time': { const s = Math.round((v % 1) * 86400); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; }
    default: if (dec != null) return v.toFixed(dec); return Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(5) : E.numStr(v);
  }
};
E.formatCode = (v, code) => {
  code = String(code);
  if (/[yd]/i.test(code) && /y{2,4}|d{1,2}|m{1,2}/i.test(code)) { const d = E.fromSerial(v); const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate(); return code.replace(/yyyy/gi, Y).replace(/yy/gi, String(Y).slice(2)).replace(/mm/g, String(M).padStart(2, '0')).replace(/(^|[^m])m(?!m)/g, '$1' + M).replace(/dd/gi, String(D).padStart(2, '0')).replace(/(^|[^d])d(?!d)/gi, '$1' + D); }
  const pct = code.includes('%'), dm = /0\.(0+)/.exec(code), d = dm ? dm[1].length : 0, group = code.includes(','), cur = (/^[^0#]*/.exec(code)[0] || '').replace(/["\\]/g, '');
  let n = pct ? v * 100 : v; const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: group });
  return (n < 0 ? '-' : '') + cur.replace(/%/g, '') + s + (pct ? '%' : '');
};

// ---------- reference rewriting (copy/paste, fill, insert/delete rows) ----------
const REF_RE = /("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(!])/g;
E.mapRefs = (f, fn) => f.replace(REF_RE, (m, str, sheet, ac, col, ar, row, off, all) => {
  if (str) return m;
  const prev = all[off - 1]; if (prev && /[\w.]/.test(prev)) return m;
  let sh = sheet ? sheet.slice(0, -1) : null; if (sh && sh[0] === "'") sh = sh.slice(1, -1).replace(/''/g, "'");
  const r = fn({ sheet: sh, c: E.colIdx(col), r: +row - 1, absC: !!ac, absR: !!ar });
  if (!r) return (sheet || '') + '#REF!';
  return (sheet || '') + (ac ? '$' : '') + E.colName(r.c) + (ar ? '$' : '') + (r.r + 1);
});
E.shift = (f, dc, dr) => E.mapRefs(f, x => { const c = x.absC ? x.c : x.c + dc, r = x.absR ? x.r : x.r + dr; return c < 0 || r < 0 ? null : { c, r }; });
})();
