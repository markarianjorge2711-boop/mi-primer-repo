/* HUD layer: ruler frame, read-out panels, small object labels. Canvas 2D.
   Layout follows the reference: loose text column on the left, a band of panels along the
   top right, a band along the bottom left and a thin column on the right; lots of black.
   Classic script: exposes window.Reactor.HUD. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var FONT = "'Bahnschrift Condensed','Arial Narrow','Roboto Condensed','Liberation Sans Narrow','DejaVu Sans Condensed','Helvetica Neue',Arial,sans-serif";
  var COL = {
    text: 'rgba(222,234,244,0.86)',
    dim: 'rgba(160,178,194,0.62)',
    faint: 'rgba(150,175,195,0.24)',
    line: 'rgba(215,228,240,0.55)',
    white: '#f2f7fc',
    teal: '#46c9dc',
    tealDim: 'rgba(70,200,220,0.2)',
    tealMid: 'rgba(70,200,220,0.5)',
    red: '#ff3b36'
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) { return global.Reactor.math.mulberry32(seed); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }

  /* ---------- condensed text: real condensed font if present, otherwise squeeze ---------- */
  var SQ = 1;
  function detectCondensed() {
    var c = document.createElement('canvas').getContext('2d');
    c.font = '100px ' + FONT;
    try { c.fontStretch = 'condensed'; } catch (e) { /* older engines */ }
    var a = c.measureText('MMMMMMMMMM').width;
    c.font = '100px Arial, sans-serif';
    try { c.fontStretch = 'normal'; } catch (e) { /* older engines */ }
    var b = c.measureText('MMMMMMMMMM').width;
    SQ = a / b > 0.9 ? 0.8 : 1;
  }
  function font(ctx, px, weight) {
    ctx.font = (weight || 400) + ' ' + px.toFixed(2) + 'px ' + FONT;
    try { ctx.fontStretch = 'condensed'; } catch (e) { /* older engines */ }
  }
  // ctx.__s = backing-store scale of that context
  function text(ctx, s, x, y, align) {
    ctx.textAlign = align || 'left';
    if (SQ === 1) { ctx.fillText(s, x, y); return; }
    var k = ctx.__s;
    ctx.setTransform(k * SQ, 0, 0, k, x * k, y * k);
    ctx.fillText(s, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
  }
  function tw(ctx, s) { return ctx.measureText(s).width * SQ; }

  /* ---------- invented technical vocabulary ---------- */
  var WORDS = ['COOLANT', 'FLOW', 'VALVE', 'PRESSURE', 'INLET', 'RANGE', 'PHASE', 'CORE', 'LOOP', 'RATE', 'SENSOR', 'INDEX',
    'BUFFER', 'SHIFT', 'THERMAL', 'LEVEL', 'DRIVE', 'PUMP', 'STAGE', 'LIMIT', 'MODE', 'FEED', 'OUTPUT', 'RETURN', 'CYCLE',
    'FIELD', 'VECTOR', 'TRIM', 'BIAS', 'GAIN', 'SEAL', 'VENT', 'PURGE', 'RELAY'];
  var PREFIX = ['RCX', 'LDV', 'TQM', 'HXS', 'PVR', 'KTN'];
  function sentence(rnd, n) {
    var out = [];
    if (rnd() < 0.5) out.push(String(1 + Math.floor(rnd() * 9)));
    for (var i = 0; i < n; i++) out.push(WORDS[Math.floor(rnd() * WORDS.length)]);
    return out.join(' ');
  }
  function param(rnd) {
    return PREFIX[Math.floor(rnd() * PREFIX.length)] + '_' + WORDS[Math.floor(rnd() * WORDS.length)] + '_' +
      WORDS[Math.floor(rnd() * WORDS.length)] + (rnd() < 0.5 ? '_' + String.fromCharCode(65 + Math.floor(rnd() * 6)) + (1 + Math.floor(rnd() * 4)) : '');
  }

  /* ---------- panels (fractions of the landscape frame) ----------
     frame: 'cap' = top line + right drop, 'box' = full rectangle, 'none' */
  var PANELS = [
    // left column: loose parameter lines in groups
    { type: 'params', x: 0.042, y: 0.085, w: 0.12, rows: 1 },
    { type: 'params', x: 0.042, y: 0.108, w: 0.12, rows: 8, tag: 'ACTIVE' },
    { type: 'params', x: 0.042, y: 0.215, w: 0.13, rows: 13, tag: 'RANGE' },
    { type: 'params', x: 0.042, y: 0.385, w: 0.12, rows: 5, tag: 'BUS-2' },
    { type: 'params', x: 0.042, y: 0.455, w: 0.12, rows: 6, tag: 'BANKS', red: 2 },
    { type: 'params', x: 0.042, y: 0.535, w: 0.10, rows: 3 },
    { type: 'params', x: 0.042, y: 0.585, w: 0.10, rows: 4 },
    { type: 'para', title: 'PHYSICAL', x: 0.045, y: 0.648, w: 0.115, rows: 3, cols2: true, frame: 'cap' },
    { type: 'para', title: 'CATALYST', x: 0.172, y: 0.648, w: 0.045, rows: 1, frame: 'none' },

    // top band
    { type: 'arcs', title: 'CHEMICAL', x: 0.365, y: 0.075, w: 0.115, rows: 3, frame: 'cap' },
    { type: 'para', title: 'CATALYST', x: 0.49, y: 0.075, w: 0.03, rows: 1, frame: 'none' },
    { type: 'table', title: 'LOAD CONTROLLERS', x: 0.527, y: 0.075, w: 0.14, rows: 5, cols: 5, accent: true, frame: 'none' },
    { type: 'gaugeRow', x: 0.527, y: 0.178, w: 0.14, n: 5 },
    { type: 'help', title: 'HELP', x: 0.675, y: 0.072, w: 0.12, rows: 4, frame: 'box' },
    { type: 'table', title: 'REACTOR COOLING CONTROL', x: 0.675, y: 0.165, w: 0.115, rows: 4, cols: 7, frame: 'none' },
    { type: 'table', title: 'SEARCH FOR', x: 0.8, y: 0.075, w: 0.075, rows: 6, cols: 3, frame: 'none' },
    { type: 'table', title: 'SEARCH FOR', x: 0.8, y: 0.165, w: 0.075, rows: 4, cols: 3, frame: 'none' },
    { type: 'rings2', title: 'CONTROLS', x: 0.905, y: 0.075, w: 0.07, frame: 'none' },
    { type: 'table', title: 'AUTOMATIC CONTROL', x: 0.905, y: 0.165, w: 0.07, rows: 4, cols: 3, frame: 'none', red: 1 },

    // right column
    { type: 'controlOf', title: 'CONTROL OF', x: 0.905, y: 0.255, w: 0.07, h: 0.45, frame: 'none' },
    { type: 'arcs', title: 'CHEMICAL', x: 0.85, y: 0.775, w: 0.085, rows: 2, frame: 'cap' },
    { type: 'para', title: 'CATALYST', x: 0.945, y: 0.775, w: 0.03, rows: 2, frame: 'none' },
    { type: 'para', title: 'PHYSICAL', x: 0.85, y: 0.865, w: 0.085, rows: 2, frame: 'cap' },
    { type: 'para', title: 'CATALYST', x: 0.945, y: 0.865, w: 0.03, rows: 2, frame: 'none' },

    // bottom band
    { type: 'para', title: 'REACTOR COOLING CONTROL', x: 0.045, y: 0.772, w: 0.15, rows: 4, frame: 'cap' },
    { type: 'para', title: 'SEARCH FOR', x: 0.205, y: 0.772, w: 0.085, rows: 4, frame: 'cap' },
    { type: 'para', title: 'AUTOMATIC CONTROL', x: 0.3, y: 0.772, w: 0.075, rows: 4, frame: 'cap' },
    { type: 'gaugeBars', x: 0.385, y: 0.772, w: 0.14, n: 5, h: 0.16 },
    { type: 'hbars', title: 'REACTOR COOLING CONTROL', x: 0.045, y: 0.865, w: 0.105, rows: 5, frame: 'none' },
    { type: 'table', title: 'SEARCH FOR', x: 0.16, y: 0.865, w: 0.13, rows: 5, cols: 5, frame: 'none' },
    { type: 'table', title: 'AUTOMATIC CONTROL', x: 0.3, y: 0.865, w: 0.075, rows: 5, cols: 4, frame: 'none' }
  ];

  function linesFor(p, lh, LH) {
    switch (p.type) {
      case 'params': return p.rows;
      case 'para': return 1 + p.rows;
      case 'help': return 1 + p.rows;
      case 'table': return 1 + p.rows + (p.accent ? 1 : 0);
      case 'arcs': return 1 + p.rows;
      case 'gaugeRow': return 5;
      case 'rings2': return 6;
      case 'hbars': return 1 + p.rows;
      case 'gaugeBars': case 'controlOf': return Math.max(4, Math.round(p.h * LH / lh));
    }
    return 3;
  }

  function Block(p, LW, LH, lh, pr, seed) {
    this.p = p;
    this.x = p.x * LW; this.y = p.y * LH; this.w = p.w * LW; this.lh = lh;
    this.lines = linesFor(p, lh, LH);
    this.h = this.lines * lh;
    this.fs = Math.max(6, lh * 0.64);
    this.dyn = [];
    this.rnd = rng(seed);
    this.revealStart = 0; this.revealDur = 0.5;
    var c = document.createElement('canvas');
    c.width = Math.ceil(this.w * pr) + 2; c.height = Math.ceil(this.h * pr) + 2;
    var ctx = c.getContext('2d');
    ctx.__s = pr;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    this.cache = c; this.pr = pr;
    this.paint(ctx);
  }
  Block.prototype.base = function (line) { return (line + 0.78) * this.lh; };

  Block.prototype.paint = function (ctx) {
    var p = this.p, w = this.w, lh = this.lh, fs = this.fs, rnd = this.rnd, self = this, i, j;
    ctx.textBaseline = 'alphabetic';
    function title(L) {
      font(ctx, fs * 1.04, 600);
      ctx.fillStyle = COL.white;
      text(ctx, p.title, 0, self.base(L));
      font(ctx, fs, 400);
    }
    function num(L, x, min, max, dec, col, align) {
      self.dyn.push({ kind: 'num', line: L, x: x, align: align || 'right', min: min, max: max, dec: dec,
        v: min + rnd() * (max - min), next: 0, col: col || COL.text });
    }
    font(ctx, fs, 400);
    switch (p.type) {
      case 'params':
        for (i = 0; i < p.rows; i++) {
          var nm = param(rnd);
          ctx.fillStyle = COL.dim; text(ctx, nm, 0, self.base(i));
          if (p.red === i) self.dyn.push({ kind: 'word', line: i, x: w, word: 'FAULT', col: COL.red });
          else if (rnd() < 0.7) num(i, w, 0, rnd() < 0.5 ? 9.99 : 999, rnd() < 0.5 ? 2 : 1, COL.text);
          else { ctx.fillStyle = COL.dim; text(ctx, "'" + WORDS[Math.floor(rnd() * WORDS.length)] + "'", w, self.base(i), 'right'); }
        }
        break;
      case 'para':
        title(0);
        for (i = 0; i < p.rows; i++) {
          ctx.fillStyle = COL.dim;
          if (p.cols2) {
            text(ctx, sentence(rnd, 2), 0, self.base(1 + i));
            text(ctx, sentence(rnd, 1), w * 0.55, self.base(1 + i));
          } else text(ctx, sentence(rnd, Math.max(1, Math.round(w / (fs * 4.2)))), 0, self.base(1 + i));
        }
        break;
      case 'help':
        title(0);
        for (i = 0; i < p.rows; i++) {
          ctx.fillStyle = i === p.rows - 1 ? COL.text : COL.dim;
          text(ctx, i === p.rows - 1 ? 'RFID LOCK ID ' + pad(rnd() * 999 | 0, 3) + '.' + pad(rnd() * 99 | 0, 2) : sentence(rnd, Math.round(w / (fs * 3.6))), 3, self.base(1 + i));
        }
        break;
      case 'table': {
        title(0);
        var top = 1;
        if (p.accent) {
          ctx.fillStyle = COL.teal; ctx.fillRect(w * 0.12, lh * 0.35, w * 0.88, 1.6);
          ctx.fillStyle = COL.dim;
          for (j = 1; j < p.cols; j++) text(ctx, 'UNIT_' + String.fromCharCode(64 + j) + '.' + j, w * (0.1 + 0.9 * j / p.cols), self.base(1));
          top = 2;
        }
        var cw = w / p.cols;
        for (i = 0; i < p.rows; i++) {
          var L = top + i;
          ctx.fillStyle = COL.dim;
          text(ctx, (rnd() < 0.5 ? 'B' : 'R') + '.' + (i + 1), 0, self.base(L));
          for (j = 1; j < p.cols; j++) {
            var x = cw * (j + 0.85);
            if (p.red === i && j === p.cols - 1) { self.dyn.push({ kind: 'word', line: L, x: x, word: 'LOCK', col: COL.red }); continue; }
            if (rnd() < 0.18) { ctx.fillStyle = COL.tealMid; ctx.fillRect(x - cw * 0.55, L * lh + lh * 0.35, cw * 0.45, lh * 0.3); continue; }
            num(L, x, 0, j % 2 ? 99 : 9.9, j % 2 ? 0 : 2, j === 1 ? COL.teal : COL.text);
          }
        }
        break;
      }
      case 'arcs':
        title(0);
        for (i = 0; i < p.rows; i++) { ctx.fillStyle = COL.dim; text(ctx, sentence(rnd, 2), 0, self.base(1 + i)); }
        for (i = 0; i < 2; i++) {
          var cy = lh * (1.0 + i * 1.3), cx = w * 0.72;
          ctx.strokeStyle = COL.tealDim; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(cx, cy, lh * 0.5, 0, TAU); ctx.stroke();
          self.dyn.push({ kind: 'arc', line: 1 + i, cx: cx, cy: cy, rad: lh * 0.5, v: rnd(), target: rnd(), next: 0, width: 1.6 });
          num(1 + i, w, 0, 99, 0, COL.text);
        }
        break;
      case 'gaugeRow': {
        var gw = w / p.n;
        for (i = 0; i < p.n; i++) {
          var gx = gw * (i + 0.4);
          font(ctx, fs * 0.92, 400);
          ctx.fillStyle = COL.text; text(ctx, 'CONTROL_' + String.fromCharCode(65 + i), gx, self.base(0), 'center');
          ctx.strokeStyle = COL.tealDim; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(gx, lh * 2, lh * 0.62, 0, TAU); ctx.stroke();
          self.dyn.push({ kind: 'arc', line: 2, cx: gx, cy: lh * 2, rad: lh * 0.62, v: rnd(), target: rnd(), next: 0, width: 1.7, col: COL.white });
          ctx.fillStyle = COL.dim; text(ctx, 'CALIB' + pad(i + 1, 2), gx, self.base(3.4), 'center');
          ctx.fillStyle = COL.text; text(ctx, ['IDLE', 'RUN', 'SYNC', 'AUTO', 'HOLD'][i], gx, self.base(4.3), 'center');
        }
        break;
      }
      case 'rings2':
        title(0);
        font(ctx, fs * 0.85, 400);
        ctx.fillStyle = COL.dim; text(ctx, sentence(rnd, 2), 0, self.base(1));
        for (i = 0; i < 2; i++) {
          var rx = w * (0.25 + i * 0.5), ry = lh * 3.8, rr = Math.min(w * 0.2, lh * 1.5);
          ctx.strokeStyle = COL.faint; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(rx, ry, rr, 0, TAU); ctx.stroke();
          self.dyn.push({ kind: 'arc', line: 5, cx: rx, cy: ry, rad: rr, v: rnd(), target: rnd(), next: 0, width: 1.8, col: COL.text, gap: true });
        }
        break;
      case 'hbars':
        title(0);
        for (i = 0; i < p.rows; i++) {
          ctx.fillStyle = COL.dim; text(ctx, 'B.' + (i + 1), 0, self.base(1 + i));
          ctx.fillStyle = COL.tealDim; ctx.fillRect(w * 0.16, (1 + i) * lh + lh * 0.3, w * 0.84, lh * 0.4);
          var hv = 0.5 + rnd() * 0.5;
          self.dyn.push({ kind: 'hbar', line: 1 + i, x0: w * 0.16, len: w * 0.84, y: (1 + i) * lh + lh * 0.3, h: lh * 0.4, v: hv, target: hv, next: 0 });
        }
        break;
      case 'gaugeBars': {
        var bw = w / p.n, hB = this.h;
        font(ctx, fs * 0.92, 400);
        ctx.fillStyle = COL.white;
        text(ctx, 'CONTROL_A  |  CONTROL_B  |  CONTROL_C  |  CONTROL_D', 0, self.base(0));
        ctx.fillStyle = COL.line; ctx.fillRect(0, lh * 1.05, w, 0.6);
        for (i = 0; i < p.n; i++) {
          var bx = bw * (i + 0.5);
          ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(bx, lh * 2.1, lh * 0.55, 0, TAU); ctx.stroke();
          self.dyn.push({ kind: 'arc', line: 2, cx: bx, cy: lh * 2.1, rad: lh * 0.55, v: rnd(), target: rnd(), next: 0, width: 1.6, col: COL.white });
          ctx.fillStyle = COL.dim;
          for (j = 0; j < 3; j++) text(ctx, sentence(rnd, 1).slice(0, 7), bx - bw * 0.42, self.base(3.4 + j));
          ctx.fillStyle = COL.faint; ctx.fillRect(bx + bw * 0.22, lh * 3.2, 1, hB - lh * 4.6);
          self.dyn.push({ kind: 'vbar', line: 3, x: bx + bw * 0.2, top: lh * 3.2, len: hB - lh * 4.6, v: rnd(), target: rnd(), next: 0 });
        }
        ctx.fillStyle = COL.line; ctx.fillRect(0, hB - lh * 1.2, w, 0.6);
        ctx.fillStyle = COL.text;
        text(ctx, 'PARAMETER TIMING OF TEMPERATURE', w * 0.12, self.base(this.lines - 1));
        text(ctx, 'A/B ANALYSIS', w, self.base(this.lines - 1), 'right');
        break;
      }
      case 'controlOf': {
        title(0);
        ctx.fillStyle = COL.line; ctx.fillRect(0, lh * 1.1, w, 0.6);
        font(ctx, fs * 0.85, 400);
        ctx.fillStyle = COL.dim; text(ctx, param(rnd).slice(0, 18), 0, self.base(1.3));
        for (i = 3; i < this.lines - 1; i += 3) {
          ctx.fillStyle = COL.line;
          ctx.fillRect(0, i * lh + lh * 0.5, w * 0.08, 0.8);
          for (j = 0; j < 2; j++) {
            var yy = i * lh + j * lh * 0.9;
            ctx.fillStyle = COL.dim; text(ctx, sentence(rnd, 1).slice(0, 8), w * 0.42, yy + lh * 0.75);
            self.dyn.push({ kind: 'hbar', line: i, x0: w * 0.42, len: w * 0.58, y: yy + lh * 0.95, h: 1.4, v: rnd(), target: rnd(), next: 0,
              red: i === 12 && j === 1 });
          }
        }
        break;
      }
    }
  };

  Block.prototype.update = function (t, dt) {
    var rnd = this.rnd, ease = 1 - Math.exp(-dt * 3.0);
    for (var i = 0; i < this.dyn.length; i++) {
      var e = this.dyn[i];
      if (e.kind === 'num') {
        if (t >= e.next) {
          e.v = clamp(e.v + (rnd() - 0.5) * (e.max - e.min) * 0.12, e.min, e.max);
          e.next = t + 0.15 + rnd() * 1.3;
        }
      } else if (e.target !== undefined) {
        if (t >= e.next) { e.target = 0.1 + rnd() * 0.88; e.next = t + 0.9 + rnd() * 2.6; }
        e.v += (e.target - e.v) * ease;
      }
    }
  };

  Block.prototype.drawDyn = function (ctx, t, upTo) {
    var x = this.x, y = this.y, lh = this.lh, self = this;
    font(ctx, this.fs, 400);
    for (var i = 0; i < this.dyn.length; i++) {
      var e = this.dyn[i];
      if (e.line >= upTo) continue;
      switch (e.kind) {
        case 'num':
          ctx.fillStyle = e.col;
          text(ctx, e.v.toFixed(e.dec), x + e.x, y + self.base(e.line), e.align);
          break;
        case 'word':
          ctx.fillStyle = e.col;
          text(ctx, e.word, x + e.x, y + self.base(e.line), 'right');
          break;
        case 'arc': {
          var a0 = -Math.PI / 2 + (e.gap ? 0.4 : 0), a1 = a0 + e.v * (TAU - (e.gap ? 0.8 : 0));
          ctx.strokeStyle = e.col || COL.teal; ctx.lineWidth = e.width;
          ctx.beginPath(); ctx.arc(x + e.cx, y + e.cy, e.rad, a0, a1); ctx.stroke();
          break;
        }
        case 'hbar':
          ctx.fillStyle = e.red ? COL.red : COL.teal;
          ctx.fillRect(x + e.x0, y + e.y, e.len * e.v, e.h);
          break;
        case 'vbar':
          ctx.fillStyle = COL.teal;
          ctx.fillRect(x + e.x, y + e.top + e.len * (1 - e.v), 2, e.len * e.v);
          break;
      }
    }
  };

  // brackets + typing reveal (lines appear one after another, each wiped left to right)
  Block.prototype.draw = function (ctx, t) {
    if (t < this.revealStart) return;
    var p = clamp((t - this.revealStart) / this.revealDur, 0, 1);
    var x = this.x, y = this.y, w = this.w, lh = this.lh, pr = this.pr;
    var a = clamp((t - this.revealStart) / 0.2, 0, 1);
    var fr = this.p.frame;
    if (fr === 'cap' || fr === 'box') {
      ctx.strokeStyle = 'rgba(215,228,240,' + (0.6 * a) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (fr === 'cap') {
        ctx.moveTo(x - 4, y - 2.5); ctx.lineTo(x + w + 6, y - 2.5); ctx.lineTo(x + w + 6, y + this.h + 2);
      } else ctx.rect(x - 3, y - 2.5, w + 6, this.h + 5);
      ctx.stroke();
    }
    var total = p * this.lines, full = Math.floor(total), part = total - full;
    if (full > 0) ctx.drawImage(this.cache, 0, 0, w * pr, full * lh * pr, x, y, w, full * lh);
    if (full < this.lines && part > 0) {
      var sw = Math.max(1, w * part);
      ctx.drawImage(this.cache, 0, full * lh * pr, sw * pr, lh * pr, x, y + full * lh, sw, lh);
      ctx.fillStyle = COL.teal;
      ctx.fillRect(x + sw + 1, y + full * lh + lh * 0.2, lh * 0.4, lh * 0.6);
    }
    this.drawDyn(ctx, t, full);
  };

  /* ---------- HUD ---------- */
  function HUD(canvas) {
    detectCondensed();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blocks = [];
    this.nextRetype = 3.2;
    this.lastRetype = -1;
    this.rnd = rng(4242);
  }

  HUD.prototype.resize = function (LW, LH, pr) {
    this.LW = LW; this.LH = LH; this.pr = pr;
    this.canvas.width = Math.round(LW * pr);
    this.canvas.height = Math.round(LH * pr);
    this.ctx.__s = pr;
    this.u = LH / 900;
    this.m = Math.round(9 * this.u) + 4;
    var lh = Math.max(9, LH * 0.0122);
    var self = this;
    this.blocks = PANELS.map(function (p, i) { return new Block(p, LW, LH, lh, pr, 11 + i * 7); });
    // intro stagger: outside-in by distance from the screen centre
    var order = this.blocks.slice().sort(function (a, b) {
      var da = Math.hypot(a.x / LW - 0.5, (a.y / LH - 0.5) * 0.6), db = Math.hypot(b.x / LW - 0.5, (b.y / LH - 0.5) * 0.6);
      return db - da;
    });
    order.forEach(function (b, i) { b.revealStart = 0.3 + i * (1.7 / order.length); b.revealDur = 0.5; });
    this.lh = lh;
  };

  HUD.prototype.draw = function (t, dt, cam, perf, points) {
    var ctx = this.ctx, pr = this.pr, LW = this.LW, LH = this.LH;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    ctx.textBaseline = 'alphabetic';
    this.drawFrame(ctx, t);
    // one block at a time re-types itself
    if (t >= this.nextRetype) {
      var i;
      do { i = Math.floor(this.rnd() * this.blocks.length); } while (i === this.lastRetype);
      this.lastRetype = i;
      this.blocks[i].revealStart = t; this.blocks[i].revealDur = 0.7;
      this.nextRetype = t + 2.0 + this.rnd() * 1.5;
    }
    for (var k = 0; k < this.blocks.length; k++) {
      this.blocks[k].update(t, dt);
      this.blocks[k].draw(ctx, t);
    }
    this.drawConnectors(ctx, t);
    if (cam) this.drawLabels(ctx, t, cam);
    this.drawStatus(ctx, t, perf, points);
  };

  // thin leader lines from the left frame edge into the parameter groups, with tags
  HUD.prototype.drawConnectors = function (ctx, t) {
    var a = clamp((t - 0.8) / 0.5, 0, 1);
    if (a <= 0) return;
    var m = this.m, lh = this.lh, u = this.u;
    ctx.globalAlpha = a;
    ctx.strokeStyle = COL.line; ctx.lineWidth = 0.8;
    font(ctx, Math.max(6, lh * 0.58), 400);
    for (var i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.p.type !== 'params') continue;
      var yy = b.y + lh * 0.5;
      ctx.beginPath(); ctx.moveTo(m + 2, yy); ctx.lineTo(b.x - 4, yy); ctx.stroke();
      if (b.p.tag) {
        ctx.fillStyle = COL.dim;
        text(ctx, b.p.tag, m + 6 * u, yy + lh * 0.95);
        ctx.fillStyle = COL.faint;
        ctx.fillRect(m + 5 * u, yy + lh * 1.3, b.x - m - 12 * u, 0.6);
      }
    }
    ctx.globalAlpha = 1;
  };

  HUD.prototype.drawFrame = function (ctx, t) {
    var LW = this.LW, LH = this.LH, m = this.m + 0.5, u = this.u;
    var f = clamp(t / 0.9, 0, 1);
    f = 1 - Math.pow(1 - f, 3);
    var cut = 12 * u;
    var x0 = m, y0 = m, x1 = LW - m, y1 = LH - m;
    ctx.strokeStyle = 'rgba(215,228,240,0.6)';
    ctx.lineWidth = 1;
    // each edge grows from both of its corners toward the middle
    function edge(ax, ay, bx, by) {
      ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * f / 2, ay + (by - ay) * f / 2);
      ctx.moveTo(bx, by); ctx.lineTo(bx - (bx - ax) * f / 2, by - (by - ay) * f / 2);
    }
    ctx.beginPath();
    edge(x0 + cut, y0, x1 - cut, y0);
    edge(x1, y0 + cut, x1, y1 - cut);
    edge(x1 - cut, y1, x0 + cut, y1);
    edge(x0, y1 - cut, x0, y0 + cut);
    var cf = clamp(t / 0.25, 0, 1);
    ctx.moveTo(x0, y0 + cut); ctx.lineTo(x0 + cut * cf, y0 + cut - cut * cf);
    ctx.moveTo(x1 - cut, y0); ctx.lineTo(x1 - cut + cut * cf, y0 + cut * cf);
    ctx.moveTo(x1, y1 - cut); ctx.lineTo(x1 - cut * cf, y1 - cut + cut * cf);
    ctx.moveTo(x0 + cut, y1); ctx.lineTo(x0 + cut - cut * cf, y1 - cut * cf);
    ctx.stroke();

    // ruler ticks: bottom and left edges dense, top and right sparse
    var step = 7 * u, i, p, L;
    ctx.strokeStyle = 'rgba(200,218,235,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    var halfW = (x1 - x0) / 2, halfH = (y1 - y0) / 2;
    for (i = 0, p = x0 + cut + step; p < x1 - cut; p += step, i++) {
      if (Math.min(p - x0, x1 - p) > halfW * f) continue;
      L = (i % 10 === 0 ? 8 : i % 5 === 0 ? 5 : 2.5) * u;
      ctx.moveTo(p, y1); ctx.lineTo(p, y1 - L);
      if (i % 5 === 0) { ctx.moveTo(p, y0); ctx.lineTo(p, y0 + 3 * u); }
    }
    for (i = 0, p = y0 + cut + step; p < y1 - cut; p += step, i++) {
      if (Math.min(p - y0, y1 - p) > halfH * f) continue;
      L = (i % 10 === 0 ? 8 : i % 5 === 0 ? 5 : 2.5) * u;
      ctx.moveTo(x0, p); ctx.lineTo(x0 + L, p);
      if (i % 5 === 0) { ctx.moveTo(x1, p); ctx.lineTo(x1 - 3 * u, p); }
    }
    ctx.stroke();
    if (f < 0.6) return;

    // tabs hanging off the top and bottom edges, with tiny labels
    var a = clamp((f - 0.6) / 0.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(215,228,240,0.55)';
    ctx.fillStyle = COL.dim;
    font(ctx, Math.max(6, 6.5 * u), 400);
    var tabs = [[0.06, 0.2, 'SYS.MAP / SECTOR 04'], [0.42, 0.1, 'ACM / LOCK'], [0.58, 0.08, 'INTERNAL'], [0.68, 0.06, 'BUS']];
    var th = 6 * u;
    tabs.forEach(function (tb, k) {
      var ax = x0 + (x1 - x0) * tb[0], bx = ax + (x1 - x0) * tb[1];
      ctx.beginPath();
      ctx.moveTo(ax, y0); ctx.lineTo(ax + th, y0 + th); ctx.lineTo(bx - th, y0 + th); ctx.lineTo(bx, y0);
      if (k < 3) { ctx.moveTo(ax, y1); ctx.lineTo(ax + th, y1 - th); ctx.lineTo(bx - th, y1 - th); ctx.lineTo(bx, y1); }
      ctx.stroke();
      text(ctx, tb[2], (ax + bx) / 2, y0 + th + 7 * u, 'center');
    });
    ctx.globalAlpha = 1;
  };

  // tiny labels next to parts of the object (no leader lines, as in the reference)
  var LABELS = [[2, 0.62, -1.0, 'J_CORE'], [7, 0.15, 1.05, 'R_AXIS 04'], [0, 0.55, 1.08, 'PRIMARY']];
  HUD.prototype.drawLabels = function (ctx, t, cam) {
    var a = clamp((t - 2.0) / 0.6, 0, 1);
    if (a <= 0) return;
    var P = global.Reactor.math.project, LW = this.LW, LH = this.LH, u = this.u;
    ctx.globalAlpha = a;
    font(ctx, Math.max(6, this.lh * 0.6), 400);
    LABELS.forEach(function (lb) {
      var d = cam.discs[lb[0]], an = lb[1] * TAU, r = d.R * lb[2];
      var pw = [0, 1, 2].map(function (k) { return d.c[k] + (d.u[k] * Math.cos(an) + d.v[k] * Math.sin(an)) * r; });
      var s = P(cam.viewProj, pw, LW, LH);
      ctx.fillStyle = COL.white;
      ctx.fillRect(s[0] - 1, s[1] - 1, 2, 2);
      ctx.fillStyle = COL.text;
      text(ctx, lb[3], s[0] + 5 * u, s[1] + 3 * u);
    });
    ctx.globalAlpha = 1;
  };

  // live frame time, tucked into the bottom-right corner of the frame
  HUD.prototype.drawStatus = function (ctx, t, perf, points) {
    if (t < 1.2) return;
    var u = this.u, m = this.m, LW = this.LW, LH = this.LH;
    font(ctx, Math.max(6, 6.5 * u), 400);
    ctx.fillStyle = COL.dim;
    var fps = perf && perf.fps ? perf.fps : 0;
    text(ctx, 'FRM ' + (fps ? (1000 / fps).toFixed(1) : '--.-') + ' MS  ' + fps.toFixed(0) + ' HZ  PTS ' + points + '  LOOP ' + (t % 16).toFixed(1),
      LW - m - 20 * u, LH - m - 12 * u, 'right');
  };

  global.Reactor = global.Reactor || {};
  global.Reactor.HUD = HUD;
})(window);
