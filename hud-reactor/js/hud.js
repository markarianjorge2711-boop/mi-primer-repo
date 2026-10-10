/* HUD layer: ruler frame, read-out columns, disc callouts. Canvas 2D.
   Classic script: exposes window.Reactor.HUD. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var FONT = "'Bahnschrift Condensed','Arial Narrow','Roboto Condensed','Liberation Sans Narrow','DejaVu Sans Condensed','Helvetica Neue',Arial,sans-serif";
  var COL = {
    text: 'rgba(214,232,246,0.86)',
    dim: 'rgba(150,178,200,0.6)',
    faint: 'rgba(130,170,200,0.22)',
    line: 'rgba(225,240,255,0.55)',
    white: '#f4f9ff',
    cyan: '#46d2ff',
    cyanDim: 'rgba(70,200,255,0.16)',
    cyanMid: 'rgba(70,200,255,0.45)',
    blue: '#2a8cff',
    red: '#ff3a3a',
    yellow: '#ffd04a'
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

  /* ---------- read-out content (invented technical labels) ---------- */
  var COLUMNS = [
    [
      { type: 'table', title: 'CORE COOLANT REGULATION', code: 'CC-01', head: ['LOOP', 'IN K', 'OUT K', 'FLOW', 'DEV %'],
        rows: ['PRI-A', 'PRI-B', 'SEC-A', 'SEC-B', 'AUX-1', 'AUX-2', 'BYP-1', 'BYP-2', 'RTN'],
        ranges: [[540, 620, 1], [680, 760, 1], [12, 48, 2], [-3, 3, 2]] },
      { type: 'list', title: 'AUTO SEQUENCE CONTROL', code: 'AS-14', red: 3,
        rows: ['SQ-01 PUMP TRAIN ENGAGE', 'SQ-02 VALVE BANK 4 OPEN', 'SQ-03 FIELD COIL PREHEAT', 'SQ-04 CATALYST FEED',
          'SQ-05 CORE RING SPIN-UP', 'SQ-06 LATTICE ALIGN', 'SQ-07 PURGE CYCLE', 'SQ-08 VENT STACK TEST', 'SQ-09 HANDOVER'] },
      { type: 'meters', title: 'LOAD CONTROLLERS', code: 'LC-08',
        rows: ['LC-01', 'LC-02', 'LC-03', 'LC-04', 'LC-05', 'LC-06', 'LC-07', 'LC-08'] },
      { type: 'gauges', title: 'CATALYST INDEX', code: 'CX-03', labels: ['PT', 'RH', 'PD', 'IR', 'OS', 'RU', 'AU', 'AG'] },
      { type: 'wave', title: 'NEUTRON FLUX TREND', code: 'NF-01' }
    ],
    [
      { type: 'table', title: 'CHEMICAL ASSAY', code: 'CH-22', head: ['ELEM', 'PPM', 'REF', 'DEV', 'Q'],
        rows: ['H-2', 'HE-3', 'LI-7', 'B-11', 'C-12', 'N-15', 'O-18', 'NE-20', 'AR-40'],
        ranges: [[10, 990, 1], [100, 900, 0], [-9, 9, 2], [0, 99, 0]] },
      { type: 'meters', title: 'PHYSICAL STATE', code: 'PS-02',
        rows: ['MASS FLOW', 'DENSITY', 'VISCOSITY', 'THERMAL', 'OPACITY', 'SHEAR', 'FIELD', 'TORQUE'] },
      { type: 'wave', title: 'FLUX MONITOR', code: 'FX-02' },
      { type: 'matrix', title: 'SEARCH GRID', code: 'SR-09' },
      { type: 'list', title: 'SEARCH QUERY', code: 'SQ-77',
        rows: ['Q-01 ISOTOPE TRACE', 'Q-02 RING HARMONICS', 'Q-03 VOID FRACTION', 'Q-04 SPECTRAL SHIFT', 'Q-05 LEAK VECTOR', 'Q-06 HEAT SIGNATURE'] }
    ],
    [
      { type: 'gauges', title: 'THERMAL EXCHANGE', code: 'HX-40', labels: ['HX-1', 'HX-2', 'HX-3', 'HX-4', 'HX-5', 'HX-6', 'HX-7', 'HX-8'] },
      { type: 'matrix', title: 'CONTROL MATRIX', code: 'CM-16' },
      { type: 'list', title: 'HELP / DIAGNOSTICS', code: 'HD-00',
        rows: ['F1 SYSTEM INDEX', 'F2 RING TELEMETRY', 'F3 PHASE TABLES', 'F4 FAULT LOG', 'F5 SENSOR MAP',
          'F6 SERVICE MODE', 'F7 CALIBRATION', 'F8 EXPORT FRAME'] },
      { type: 'table', title: 'PRESSURE LOOP B', code: 'PB-07', head: ['NODE', 'KPA', 'SET', 'VALVE', 'DELTA'],
        rows: ['PB-1', 'PB-2', 'PB-3', 'PB-4', 'PB-5', 'PB-6', 'PB-7', 'PB-8'],
        ranges: [[180, 260, 1], [200, 240, 0], [0, 100, 0], [-12, 12, 2]] },
      { type: 'meters', title: 'FIELD COILS', code: 'FC-12', rows: ['COIL A', 'COIL B', 'COIL C', 'COIL D', 'COIL E', 'COIL F'] }
    ],
    [
      { type: 'meters', title: 'LOAD DISTRIBUTION', code: 'LD-05',
        rows: ['RING 01', 'RING 02', 'RING 03', 'RING 04', 'RING 05', 'RING 06', 'RING 07', 'RING 08'] },
      { type: 'table', title: 'ISOTOPE RATIO', code: 'IR-31', head: ['SMP', 'R-1', 'R-2', 'R-3', 'SIGMA'],
        rows: ['S-01', 'S-02', 'S-03', 'S-04', 'S-05', 'S-06', 'S-07', 'S-08'],
        ranges: [[0, 1, 4], [0, 1, 4], [0, 1, 4], [0, 0.2, 3]] },
      { type: 'wave', title: 'PHASE SYNC', code: 'PH-11' },
      { type: 'table', title: 'RING TELEMETRY', code: 'RT-05', head: ['RING', 'RPM', 'TILT', 'GAP', 'LOAD'],
        rows: ['D-01', 'D-02', 'D-03', 'D-04', 'D-05', 'D-06'],
        ranges: [[200, 900, 0], [0, 45, 2], [0, 9, 3], [0, 99, 1]] },
      { type: 'list', title: 'MANUAL CONTROLS', code: 'MC-02', redTag: 'ARMED',
        rows: ['OVR-1 RING BRAKE', 'OVR-2 FIELD DAMPER', 'OVR-3 COOLANT DUMP', 'OVR-4 LATTICE LOCK', 'OVR-5 SCRAM PRIME', 'OVR-6 BYPASS'] }
    ]
  ];

  /* ---------- block construction ---------- */
  function linesFor(def) {
    switch (def.type) {
      case 'table': return 1 + 1 + def.rows.length + 1;
      case 'list': return 1 + def.rows.length + 1;
      case 'meters': return 1 + def.rows.length + 1;
      case 'gauges': return 1 + 10 + 1;
      case 'wave': return 1 + 6 + 1 + 1;
      case 'matrix': return 1 + 6 + 1 + 1;
    }
    return 4;
  }

  function Block(def, x, y, w, lh, pr, seed) {
    this.def = def; this.x = x; this.y = y; this.w = w; this.lh = lh;
    this.lines = linesFor(def);
    this.h = this.lines * lh;
    this.dyn = [];
    this.rnd = rng(seed);
    this.revealStart = 0; this.revealDur = 0.6;
    var c = document.createElement('canvas');
    c.width = Math.ceil(w * pr) + 2; c.height = Math.ceil(this.h * pr) + 2;
    var ctx = c.getContext('2d');
    ctx.__s = pr;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    this.cache = c; this.pr = pr;
    this.fs = lh * 0.68;
    this.paintStatic(ctx);
  }

  Block.prototype.base = function (line) { return (line + 0.76) * this.lh; };

  Block.prototype.paintStatic = function (ctx) {
    var d = this.def, w = this.w, lh = this.lh, fs = this.fs, rnd = this.rnd, self = this;
    ctx.textBaseline = 'alphabetic';
    // header
    ctx.fillStyle = COL.cyan;
    ctx.fillRect(0, lh * 0.2, 2.5, lh * 0.6);
    font(ctx, fs * 1.05, 600);
    ctx.fillStyle = COL.white;
    text(ctx, d.title, 6, this.base(0));
    font(ctx, fs * 0.85, 400);
    ctx.fillStyle = COL.dim;
    text(ctx, d.code, w, this.base(0), 'right');
    if (d.redTag) {
      ctx.fillStyle = COL.red;
      text(ctx, d.redTag, w - tw(ctx, d.code) - 6, this.base(0), 'right');
    }
    ctx.fillStyle = COL.line;
    ctx.fillRect(0, lh - 1, w, 0.6);
    ctx.fillStyle = COL.cyan;
    ctx.fillRect(0, lh - 1.4, Math.min(34, w * 0.2), 1.2);

    font(ctx, fs, 400);
    var builders = {
      table: function () {
        var nC = d.head.length, xs = [];
        for (var i = 0; i < nC; i++) xs.push(i === 0 ? 0 : w * (0.28 + 0.72 * i / (nC - 1)));
        ctx.fillStyle = COL.dim;
        d.head.forEach(function (hh, i) { text(ctx, hh, xs[i], self.base(1), i ? 'right' : 'left'); });
        ctx.fillStyle = COL.faint; ctx.fillRect(0, 2 * lh - 2, w, 0.5);
        var hi = 1 + Math.floor(rnd() * d.rows.length);
        d.rows.forEach(function (r, j) {
          var L = 2 + j;
          if (j === hi) { ctx.fillStyle = COL.cyanDim; ctx.fillRect(0, L * lh + 1, w, lh - 2); }
          ctx.fillStyle = COL.text;
          text(ctx, r, xs[0], self.base(L));
          d.ranges.forEach(function (rg, k) {
            self.dyn.push({ kind: 'num', line: L, x: xs[k + 1], align: 'right', min: rg[0], max: rg[1], dec: rg[2],
              v: rg[0] + rnd() * (rg[1] - rg[0]), next: 0, col: k === 0 ? COL.cyan : COL.text });
          });
        });
        footer(this.lines - 1);
      },
      list: function () {
        d.rows.forEach(function (r, j) {
          var L = 1 + j, sp = r.indexOf(' ');
          ctx.fillStyle = COL.dim; text(ctx, r.slice(0, sp), 0, self.base(L));
          ctx.fillStyle = COL.text; text(ctx, r.slice(sp + 1), w * 0.2, self.base(L));
          ctx.fillStyle = COL.faint;
          for (var xx = w * 0.2 + tw(ctx, r.slice(sp + 1)) + 4; xx < w * 0.82; xx += 3) ctx.fillRect(xx, self.base(L) - 1, 1, 1);
          self.dyn.push({ kind: 'status', line: L, x: w, red: d.red === j, v: Math.floor(rnd() * 4), next: 0 });
          self.dyn.push({ kind: 'blink', line: L, x: w * 0.84, phase: rnd() * TAU, rate: 1 + Math.floor(rnd() * 3) });
        });
        footer(this.lines - 1);
      },
      meters: function () {
        var lw = 0;
        d.rows.forEach(function (r) { lw = Math.max(lw, tw(ctx, r)); });
        var x0 = Math.max(w * 0.24, lw + 6), x1 = w * 0.84, n = 20, sw = (x1 - x0) / n;
        d.rows.forEach(function (r, j) {
          var L = 1 + j;
          ctx.fillStyle = COL.text; text(ctx, r, 0, self.base(L));
          ctx.fillStyle = COL.cyanDim;
          for (var i = 0; i < n; i++) ctx.fillRect(x0 + i * sw, L * lh + lh * 0.3, sw - 1.2, lh * 0.45);
          var v = rnd();
          self.dyn.push({ kind: 'meter', line: L, x0: x0, sw: sw, n: n, x: w, v: v, target: v, next: 0 });
        });
        footer(this.lines - 1);
      },
      gauges: function () {
        var per = 4, cw = w / per, rad = Math.min(cw * 0.36, lh * 1.75);
        for (var g = 0; g < 8; g++) {
          var row = Math.floor(g / per), col = g % per;
          var cx = cw * (col + 0.5), cy = lh * (1 + row * 5 + 2.1);
          ctx.strokeStyle = COL.cyanDim; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
          ctx.strokeStyle = COL.faint; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.arc(cx, cy, rad * 0.7, 0, TAU); ctx.stroke();
          ctx.strokeStyle = COL.line; ctx.lineWidth = 0.6;
          for (var t = 0; t <= 10; t++) {
            var a = Math.PI * 0.75 + t / 10 * Math.PI * 1.5, r1 = rad + 2, r2 = rad + (t % 5 ? 3.5 : 5.5);
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); ctx.stroke();
          }
          font(ctx, fs * 0.85, 400);
          ctx.fillStyle = COL.dim;
          text(ctx, d.labels[g], cx, cy + rad + lh * 0.95, 'center');
          font(ctx, fs, 400);
          var v = rnd();
          self.dyn.push({ kind: 'gauge', line: 1 + row * 5 + 4, cx: cx, cy: cy, rad: rad, v: v, target: v, next: 0 });
        }
        footer(this.lines - 1);
      },
      wave: function () {
        var top = lh * 1.2, hh = lh * 5.6;
        ctx.strokeStyle = COL.faint; ctx.lineWidth = 0.5;
        ctx.strokeRect(0.5, top, w - 1, hh);
        for (var i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(w * i / 10, top); ctx.lineTo(w * i / 10, top + hh); ctx.stroke(); }
        for (var j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(0, top + hh * j / 4); ctx.lineTo(w, top + hh * j / 4); ctx.stroke(); }
        ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(0, top + hh / 2); ctx.lineTo(w, top + hh / 2); ctx.stroke();
        self.dyn.push({ kind: 'wave', line: 6, top: top, hh: hh, w: w, f: [1 + rnd() * 2, 3 + rnd() * 4, 7 + rnd() * 5], ph: rnd() * TAU });
        var labels = ['AMP', 'FRQ', 'RMS'];
        labels.forEach(function (lb, k) {
          ctx.fillStyle = COL.dim; text(ctx, lb, w * k / 3, self.base(7));
          self.dyn.push({ kind: 'num', line: 7, x: w * (k + 1) / 3 - 6, align: 'right', min: 0, max: k === 1 ? 99 : 9, dec: k === 1 ? 1 : 3,
            v: rnd() * 5, next: 0, col: COL.cyan });
        });
        footer(this.lines - 1);
      },
      matrix: function () {
        var cols = 18, rows = 6, cs = Math.min((w - 2) / cols, lh), top = lh * 1.1;
        ctx.strokeStyle = COL.faint; ctx.lineWidth = 0.6;
        var cells = [];
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          ctx.strokeRect(c * cs + 0.5, top + r * lh + 1.5, cs - 2.5, lh - 3);
          cells.push({ x: c * cs + 1.5, y: top + r * lh + 2.5, on: rnd() < 0.3, next: 0, hot: rnd() < 0.05 });
        }
        self.dyn.push({ kind: 'cells', line: 6, cells: cells, w: cs - 4.5, h: lh - 5 });
        ctx.fillStyle = COL.dim; text(ctx, 'SECTOR', 0, self.base(7));
        self.dyn.push({ kind: 'num', line: 7, x: w * 0.38, align: 'right', min: 0, max: 99, dec: 0, v: 4, next: 0, col: COL.cyan, int: true });
        ctx.fillStyle = COL.dim; text(ctx, 'LOCK', w * 0.5, self.base(7));
        self.dyn.push({ kind: 'num', line: 7, x: w, align: 'right', min: 0, max: 360, dec: 2, v: 120, next: 0, col: COL.text });
        footer(this.lines - 1);
      }
    };
    function footer(L) {
      font(ctx, fs * 0.8, 400);
      ctx.fillStyle = COL.faint;
      ctx.fillRect(0, L * lh + 2, w, 0.5);
      ctx.fillStyle = COL.dim;
      var codes = '0x' + pad((rnd() * 65535 | 0).toString(16).toUpperCase(), 4) + '  ' + pad(rnd() * 999 | 0, 3) + '.' + pad(rnd() * 99 | 0, 2) +
        '  REF ' + pad(rnd() * 99 | 0, 2) + '/' + pad(rnd() * 99 | 0, 2);
      text(ctx, codes, 0, self.base(L));
      for (var i = 0; i < 6; i++) { ctx.fillStyle = i < 4 ? COL.cyanMid : COL.cyanDim; ctx.fillRect(w - 6 * 5 + i * 5, L * lh + lh * 0.4, 3.5, lh * 0.35); }
      font(ctx, fs, 400);
    }
    builders[d.type].call(this);
  };

  Block.prototype.update = function (t, dt) {
    var rnd = this.rnd;
    var ease = 1 - Math.exp(-dt * 3.2);
    this.dyn.forEach(function (e) {
      switch (e.kind) {
        case 'num':
          if (t >= e.next) {
            var span = e.max - e.min;
            e.v = clamp(e.v + (rnd() - 0.5) * span * 0.12, e.min, e.max);
            e.next = t + 0.12 + rnd() * 1.1;
          }
          break;
        case 'meter': case 'gauge':
          if (t >= e.next) { e.target = 0.08 + rnd() * 0.9; e.next = t + 0.8 + rnd() * 2.4; }
          e.v += (e.target - e.v) * ease;
          break;
        case 'status':
          if (t >= e.next) { e.v = (e.v + 1 + Math.floor(rnd() * 2)) % 4; e.next = t + 1.5 + rnd() * 4; }
          break;
        case 'cells':
          e.cells.forEach(function (c) { if (t >= c.next) { c.on = rnd() < 0.32; c.next = t + 0.3 + rnd() * 3; } });
          break;
      }
    });
  };

  var STATUS = ['OK', 'RUN', 'SYNC', 'IDLE'];

  Block.prototype.drawDyn = function (ctx, t, upTo) {
    var x = this.x, y = this.y, lh = this.lh, self = this;
    font(ctx, this.fs, 400);
    this.dyn.forEach(function (e) {
      if (e.line >= upTo) return;
      switch (e.kind) {
        case 'num':
          ctx.fillStyle = e.col;
          text(ctx, e.int ? pad(Math.round(e.v), 2) : e.v.toFixed(e.dec), x + e.x, y + self.base(e.line), e.align);
          break;
        case 'meter':
          var lit = Math.round(e.v * e.n);
          for (var i = 0; i < lit; i++) {
            ctx.fillStyle = i >= e.n - 3 ? COL.white : COL.cyan;
            ctx.fillRect(x + e.x0 + i * e.sw, y + e.line * lh + lh * 0.3, e.sw - 1.2, lh * 0.45);
          }
          ctx.fillStyle = COL.text;
          text(ctx, (e.v * 100).toFixed(1), x + e.x, y + self.base(e.line), 'right');
          break;
        case 'gauge':
          var a0 = Math.PI * 0.75, a1 = a0 + e.v * Math.PI * 1.5;
          ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x + e.cx, y + e.cy, e.rad, a0, a1); ctx.stroke();
          ctx.fillStyle = COL.white;
          ctx.fillRect(x + e.cx + Math.cos(a1) * e.rad - 1.5, y + e.cy + Math.sin(a1) * e.rad - 1.5, 3, 3);
          ctx.fillStyle = COL.text;
          text(ctx, (e.v * 100).toFixed(0), x + e.cx, y + e.cy + self.fs * 0.35, 'center');
          break;
        case 'status':
          var red = e.red;
          ctx.fillStyle = red ? COL.red : (e.v === 3 ? COL.dim : COL.cyan);
          text(ctx, red ? 'HOLD' : STATUS[e.v], x + e.x, y + self.base(e.line), 'right');
          break;
        case 'blink':
          if (Math.sin(t * TAU * e.rate / 2 + e.phase) > 0) {
            ctx.fillStyle = COL.cyan;
            ctx.fillRect(x + e.x, y + e.line * lh + lh * 0.35, 3, 3);
          }
          break;
        case 'wave':
          ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1;
          ctx.beginPath();
          for (var k = 0; k <= 90; k++) {
            var u = k / 90;
            var s = 0.5 * Math.sin(u * TAU * e.f[0] + t * 2.1 + e.ph) + 0.3 * Math.sin(u * TAU * e.f[1] - t * 3.3) + 0.15 * Math.sin(u * TAU * e.f[2] + t * 5.7);
            var px = x + u * e.w, py = y + e.top + e.hh * (0.5 - s * 0.42);
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
          ctx.strokeStyle = COL.cyanMid; ctx.lineWidth = 0.7;
          ctx.beginPath();
          for (k = 0; k <= 60; k++) {
            u = k / 60;
            s = 0.6 * Math.sin(u * TAU * 2 - t * 1.3 + e.ph * 2);
            px = x + u * e.w; py = y + e.top + e.hh * (0.5 - s * 0.35);
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
          var cxp = x + ((t * 0.12 + e.ph) % 1) * e.w;
          ctx.fillStyle = COL.line; ctx.fillRect(cxp, y + e.top, 0.8, e.hh);
          break;
        case 'cells':
          e.cells.forEach(function (c) {
            if (!c.on) return;
            ctx.fillStyle = c.hot ? COL.white : COL.cyan;
            ctx.fillRect(x + c.x, y + c.y, e.w, e.h);
          });
          break;
      }
    });
  };

  // reveal = typing: lines appear one after another, each wiped in left to right
  Block.prototype.draw = function (ctx, t) {
    var p = clamp((t - this.revealStart) / this.revealDur, 0, 1);
    var x = this.x, y = this.y, w = this.w, lh = this.lh, pr = this.pr;
    // brackets (always, once the block has started)
    if (t >= this.revealStart || p > 0) {
      var a = clamp((t - this.revealStart) / 0.2, 0, 1);
      ctx.strokeStyle = 'rgba(235,245,255,' + (0.8 * a) + ')';
      ctx.lineWidth = 1;
      var x0 = x - 5, y0 = y - 4, x1 = x + w + 5, y1 = y + this.h + 2, k = 8;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + k, y0);
      ctx.moveTo(x1 - k, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + k);
      ctx.moveTo(x1, y1 - k); ctx.lineTo(x1, y1); ctx.lineTo(x1 - k, y1);
      ctx.moveTo(x0 + k, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - k);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160,200,230,' + (0.18 * a) + ')';
      ctx.fillRect(x0, y0 + k + 3, 0.6, this.h - 2 * k - 1);
    } else return;
    var total = p * this.lines, full = Math.floor(total), part = total - full;
    if (full > 0) ctx.drawImage(this.cache, 0, 0, w * pr, full * lh * pr, x, y, w, full * lh);
    if (full < this.lines && part > 0) {
      var sw = Math.max(1, w * part);
      ctx.drawImage(this.cache, 0, full * lh * pr, sw * pr, lh * pr, x, y + full * lh, sw, lh);
      ctx.fillStyle = COL.cyan;
      ctx.fillRect(x + sw + 1, y + full * lh + lh * 0.18, lh * 0.45, lh * 0.64);
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
    this.calls = [];
  }

  HUD.prototype.resize = function (LW, LH, pr) {
    this.LW = LW; this.LH = LH; this.pr = pr;
    this.canvas.width = Math.round(LW * pr);
    this.canvas.height = Math.round(LH * pr);
    this.ctx.__s = pr;
    var u = LH / 900;
    this.u = u;
    var m = Math.round(10 * u) + 4; // frame inset
    this.m = m;
    var top = m + 34 * u, bottom = LH - m - 34 * u;
    var avail = bottom - top;
    var colX = [0.03, 0.155, 0.735, 0.86], colW = 0.112;
    var maxLines = 0;
    COLUMNS.forEach(function (col) {
      var n = 0; col.forEach(function (d) { n += linesFor(d); });
      maxLines = Math.max(maxLines, n);
    });
    var gapL = 1.6;
    var lh = Math.min(LH * 0.018, avail / (maxLines + gapL * 3));
    var self = this, seed = 11, order = [];
    this.blocks = [];
    COLUMNS.forEach(function (col, ci) {
      var n = 0; col.forEach(function (d) { n += linesFor(d); });
      var gap = (avail - n * lh) / (col.length - 1);
      var y = top;
      col.forEach(function (d, bi) {
        var b = new Block(d, colX[ci] * LW, y, colW * LW, lh, pr, seed++);
        b.col = ci; b.row = bi;
        self.blocks.push(b);
        order.push(b);
        y += b.h + gap;
      });
    });
    // intro stagger: by row, alternating outer/inner columns
    order.sort(function (a, b) { return (a.row - b.row) || (Math.abs(a.col - 1.5) < Math.abs(b.col - 1.5) ? 1 : -1); });
    order.forEach(function (b, i) { b.revealStart = 0.3 + i * (1.6 / order.length); b.revealDur = 0.55; });
    this.lh = lh;
  };

  HUD.prototype.draw = function (t, dt, cam, perf, points) {
    var ctx = this.ctx, pr = this.pr, LW = this.LW, LH = this.LH, u = this.u;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    ctx.textBaseline = 'alphabetic';

    this.drawFrame(ctx, t);

    // one block at a time re-types itself
    if (t >= this.nextRetype) {
      var i;
      do { i = Math.floor(this.rnd() * this.blocks.length); } while (i === this.lastRetype);
      this.lastRetype = i;
      this.blocks[i].revealStart = t; this.blocks[i].revealDur = 0.75;
      this.nextRetype = t + 2.2 + this.rnd() * 1.4;
    }
    for (var k = 0; k < this.blocks.length; k++) {
      this.blocks[k].update(t, dt);
      this.blocks[k].draw(ctx, t);
    }
    this.drawStrips(ctx, t, perf, points);
    if (cam) this.drawCallouts(ctx, t, cam);
  };

  HUD.prototype.drawFrame = function (ctx, t) {
    var LW = this.LW, LH = this.LH, m = this.m + 0.5, u = this.u;
    var f = clamp(t / 0.9, 0, 1);
    f = 1 - Math.pow(1 - f, 3);
    var cut = 16 * u;
    var x0 = m, y0 = m, x1 = LW - m, y1 = LH - m;
    ctx.strokeStyle = 'rgba(225,240,255,0.7)';
    ctx.lineWidth = 1;
    // each edge grows from both of its corners toward the middle
    function edge(ax, ay, bx, by) {
      var mx = ax + (bx - ax) * f / 2, my = ay + (by - ay) * f / 2;
      var nx = bx - (bx - ax) * f / 2, ny = by - (by - ay) * f / 2;
      ctx.moveTo(ax, ay); ctx.lineTo(mx, my);
      ctx.moveTo(bx, by); ctx.lineTo(nx, ny);
    }
    ctx.beginPath();
    edge(x0 + cut, y0, x1 - cut, y0);
    edge(x1, y0 + cut, x1, y1 - cut);
    edge(x1 - cut, y1, x0 + cut, y1);
    edge(x0, y1 - cut, x0, y0 + cut);
    // notched corners
    var cf = clamp(t / 0.25, 0, 1);
    if (cf > 0) {
      ctx.moveTo(x0, y0 + cut); ctx.lineTo(x0 + cut * cf, y0 + cut - cut * cf);
      ctx.moveTo(x1 - cut, y0); ctx.lineTo(x1 - cut + cut * cf, y0 + cut * cf);
      ctx.moveTo(x1, y1 - cut); ctx.lineTo(x1 - cut * cf, y1 - cut + cut * cf);
      ctx.moveTo(x0 + cut, y1); ctx.lineTo(x0 + cut - cut * cf, y1 - cut * cf);
    }
    ctx.stroke();

    // tick marks
    var step = 8 * u, maj = 5;
    ctx.strokeStyle = 'rgba(210,230,250,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    var cx = LW / 2, cy = LH / 2, i, p, L;
    var halfW = (x1 - x0) / 2 - cut, halfH = (y1 - y0) / 2 - cut;
    for (i = 0, p = x0 + cut + step; p < x1 - cut - 2; p += step, i++) {
      var dEdge = Math.min(p - (x0 + cut), (x1 - cut) - p);
      if (dEdge > halfW * f) continue;
      L = (i % maj === 0 ? 7 : 3) * u;
      ctx.moveTo(p, y0); ctx.lineTo(p, y0 + L);
      ctx.moveTo(p, y1); ctx.lineTo(p, y1 - L);
    }
    for (i = 0, p = y0 + cut + step; p < y1 - cut - 2; p += step, i++) {
      dEdge = Math.min(p - (y0 + cut), (y1 - cut) - p);
      if (dEdge > halfH * f) continue;
      L = (i % maj === 0 ? 7 : 3) * u;
      ctx.moveTo(x0, p); ctx.lineTo(x0 + L, p);
      ctx.moveTo(x1, p); ctx.lineTo(x1 - L, p);
    }
    ctx.stroke();

    if (f < 0.6) return;
    var a = clamp((f - 0.6) / 0.4, 0, 1);
    // corner brackets + inner partial frame
    ctx.strokeStyle = 'rgba(70,210,255,' + 0.8 * a + ')';
    ctx.lineWidth = 1.5;
    var k = 26 * u, o = 6 * u;
    ctx.beginPath();
    ctx.moveTo(x0 + o, y0 + o + k); ctx.lineTo(x0 + o, y0 + o + cut * 0.6); ctx.lineTo(x0 + o + cut * 0.6, y0 + o); ctx.lineTo(x0 + o + k, y0 + o);
    ctx.moveTo(x1 - o - k, y0 + o); ctx.lineTo(x1 - o - cut * 0.6, y0 + o); ctx.lineTo(x1 - o, y0 + o + cut * 0.6); ctx.lineTo(x1 - o, y0 + o + k);
    ctx.moveTo(x1 - o, y1 - o - k); ctx.lineTo(x1 - o, y1 - o - cut * 0.6); ctx.lineTo(x1 - o - cut * 0.6, y1 - o); ctx.lineTo(x1 - o - k, y1 - o);
    ctx.moveTo(x0 + o + k, y1 - o); ctx.lineTo(x0 + o + cut * 0.6, y1 - o); ctx.lineTo(x0 + o, y1 - o - cut * 0.6); ctx.lineTo(x0 + o, y1 - o - k);
    ctx.stroke();
    // mid-edge notches
    ctx.fillStyle = 'rgba(235,245,255,' + 0.85 * a + ')';
    var n = 5 * u;
    ctx.beginPath();
    ctx.moveTo(cx - n, y0); ctx.lineTo(cx + n, y0); ctx.lineTo(cx, y0 + n * 1.3); ctx.closePath();
    ctx.moveTo(cx - n, y1); ctx.lineTo(cx + n, y1); ctx.lineTo(cx, y1 - n * 1.3); ctx.closePath();
    ctx.moveTo(x0, cy - n); ctx.lineTo(x0, cy + n); ctx.lineTo(x0 + n * 1.3, cy); ctx.closePath();
    ctx.moveTo(x1, cy - n); ctx.lineTo(x1, cy + n); ctx.lineTo(x1 - n * 1.3, cy); ctx.closePath();
    ctx.fill();
    // ruler numerals along top and bottom
    font(ctx, 7 * u + 1, 400);
    ctx.fillStyle = 'rgba(170,200,225,' + 0.6 * a + ')';
    for (i = 1; i < 12; i++) {
      var xx = x0 + (x1 - x0) * i / 12;
      text(ctx, pad(i * 30, 3), xx, y0 + 17 * u, 'center');
      text(ctx, pad(i * 30, 3), xx, y1 - 11 * u, 'center');
    }
  };

  HUD.prototype.drawStrips = function (ctx, t, perf, points) {
    var LW = this.LW, LH = this.LH, u = this.u, m = this.m;
    var a = clamp((t - 0.6) / 0.6, 0, 1);
    if (a <= 0) return;
    var xL = LW * 0.31, xR = LW * 0.69, yT = m + 30 * u, yB = LH - m - 24 * u;
    ctx.globalAlpha = a;
    font(ctx, 9 * u + 1, 600);
    ctx.fillStyle = COL.white;
    text(ctx, 'REACTOR STACK  /  OBLIQUE FIVE-PLANE VIEW', xL, yT);
    font(ctx, 9 * u + 1, 400);
    ctx.fillStyle = COL.cyan;
    var secs = t, hh = Math.floor(secs / 3600), mm = Math.floor(secs / 60) % 60, ss = secs % 60;
    text(ctx, 'T+ ' + pad(hh, 2) + ':' + pad(mm, 2) + ':' + (ss < 10 ? '0' : '') + ss.toFixed(2), xR, yT, 'right');
    ctx.fillStyle = COL.line;
    ctx.fillRect(xL, yT + 5 * u, xR - xL, 0.6);
    for (var i = 0; i <= 40; i++) ctx.fillRect(xL + (xR - xL) * i / 40, yT + 5 * u, 0.7, i % 5 ? 2.5 * u : 5 * u);
    ctx.fillStyle = COL.dim;
    font(ctx, 7.5 * u + 1, 400);
    text(ctx, 'AXIS 34.6 / 12.0 / 05.5   ORBIT LOCKED   FIELD NOMINAL', xL, yT + 18 * u);
    // bottom strip
    ctx.fillStyle = COL.line;
    ctx.fillRect(xL, yB - 12 * u, xR - xL, 0.6);
    for (i = 0; i <= 40; i++) ctx.fillRect(xL + (xR - xL) * i / 40, yB - 12 * u - (i % 5 ? 2.5 * u : 5 * u), 0.7, i % 5 ? 2.5 * u : 5 * u);
    font(ctx, 8 * u + 1, 400);
    ctx.fillStyle = COL.dim;
    var fps = perf && perf.fps ? perf.fps : 0;
    text(ctx, 'FRM ' + (fps ? (1000 / fps).toFixed(1) : '--.-') + ' MS   ' + fps.toFixed(0) + ' HZ   PTS ' + points, xL, yB);
    ctx.fillStyle = COL.cyan;
    text(ctx, 'LOOP ' + (t % 16).toFixed(2) + ' / 16.00', xR, yB, 'right');
    ctx.globalAlpha = 1;
  };

  var CALLOUT_DIRS = [[0.85, -0.55], [-1, 0.7], [1, -0.1], [1, 0.25], [-1, 0.45]];

  HUD.prototype.drawCallouts = function (ctx, t, cam) {
    var a = clamp((t - 2.0) / 0.6, 0, 1);
    if (a <= 0) return;
    var LW = this.LW, LH = this.LH, u = this.u, P = global.Reactor.math.project;
    ctx.globalAlpha = a;
    var self = this;
    cam.discs.forEach(function (d, i) {
      var dir = CALLOUT_DIRS[i], best = null, bs = -1e9;
      for (var k = 0; k < 24; k++) {
        var an = k / 24 * TAU;
        var pw = [d.c[0] + (d.u[0] * Math.cos(an) + d.v[0] * Math.sin(an)) * d.R * 1.04,
          d.c[1] + (d.u[1] * Math.cos(an) + d.v[1] * Math.sin(an)) * d.R * 1.04,
          d.c[2] + (d.u[2] * Math.cos(an) + d.v[2] * Math.sin(an)) * d.R * 1.04];
        var s = P(cam.viewProj, pw, LW, LH);
        var score = s[0] * dir[0] + s[1] * dir[1];
        if (score > bs) { bs = score; best = s; }
      }
      var ex = best[0] + dir[0] * 34 * u, ey = best[1] + dir[1] * 34 * u;
      var lx = ex + (dir[0] > 0 ? 70 : -70) * u;
      ctx.strokeStyle = 'rgba(230,242,255,0.75)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(best[0], best[1]); ctx.lineTo(ex, ey); ctx.lineTo(lx, ey); ctx.stroke();
      ctx.strokeStyle = COL.cyan;
      ctx.beginPath(); ctx.arc(best[0], best[1], 2.5 * u + 0.5, 0, TAU); ctx.stroke();
      var align = dir[0] > 0 ? 'right' : 'left';
      font(ctx, 8.5 * u + 1, 600);
      ctx.fillStyle = COL.white;
      text(ctx, d.label, lx, ey - 3 * u, align);
      font(ctx, 7.5 * u + 1, 400);
      ctx.fillStyle = COL.cyan;
      var w = (0.3 + 0.12 * i + 0.02 * Math.sin(t * 1.7 + i)).toFixed(3);
      text(ctx, 'W ' + w + ' R/S   D ' + (d.R * 2).toFixed(2), lx, ey + 9 * u, align);
    });
    ctx.globalAlpha = 1;
  };

  global.Reactor = global.Reactor || {};
  global.Reactor.HUD = HUD;
})(window);
