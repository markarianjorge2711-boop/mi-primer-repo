/* Disc stack: point-cloud geometry + raw WebGL2 renderer.
   Classic script: exposes window.Reactor.math and window.Reactor.DiscStack. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var LOOP = 16; // seconds; every periodic motion closes on this loop

  /* ---------- small math ---------- */
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, target, up) {
    var z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    var x = norm(cross(up, z));
    var y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  // world point -> css pixel in a W x H viewport
  function project(m, p, W, H) {
    var x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    var y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H];
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- palette (linear-ish values, written straight to an sRGB buffer) ---------- */
  var C = {
    cyan: [0.22, 0.82, 1.0],
    blue: [0.10, 0.48, 1.0],
    deep: [0.06, 0.28, 0.95],
    ice: [0.62, 0.92, 1.0],
    white: [0.93, 0.97, 1.0],
    grey: [0.55, 0.62, 0.70],
    yellow: [1.0, 0.80, 0.28],
    amber: [1.0, 0.62, 0.16]
  };

  /* ---------- the five discs: centre, normal, radius (world units) ---------- */
  var DISCS = [
    { c: [-0.46, 0.92, -0.10], n: [0.16, 0.24, 1.0], R: 1.18, label: 'D-01 PRIMARY RING' },   // big, almost face-on
    { c: [-0.08, 0.22, 0.12], n: [0.30, 0.55, 0.85], R: 0.34, label: 'D-02 COUPLER' },       // translucent connector
    { c: [0.22, -0.18, 0.22], n: [0.32, 0.72, 0.70], R: 0.62, label: 'D-03 IGNITION CORE' }, // yellow core
    { c: [0.52, -0.70, 0.30], n: [0.18, 1.0, 0.16], R: 0.82, label: 'D-04 LATTICE A' },     // blocky, edge-on
    { c: [0.84, -1.36, 0.42], n: [0.26, 1.0, 0.10], R: 0.68, label: 'D-05 LATTICE B' }      // blocky, edge-on
  ];
  DISCS.forEach(function (d) {
    d.n = norm(d.n);
    var ref = Math.abs(d.n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    d.u = norm(cross(ref, d.n));
    d.v = cross(d.n, d.u);
  });

  /* ---------- geometry builder ----------
     Per point, 5 x vec4:
     a0 = disc, centreX, centreZ, centreOmega   (sub-centre on the disc plane, orbiting)
     a1 = radius, theta, omega, height          (polar around the sub-centre)
     a2 = r, g, b, alpha
     a3 = size, seed, -, -
     a4 = blockHeight, blockPhase, shimmerFreq, -  (blockHeight > 0 => a1.w is a 0..1 fraction) */
  var STRIDE = 20;

  function omega(k, S) { return k * TAU / (S * LOOP); } // pattern has S-fold symmetry => seamless at LOOP

  function Builder(density, seed) {
    this.d = density;
    this.rnd = mulberry32(seed || 7);
    this.buf = [];
    this.count = 0;
  }
  // pseed: shimmer seed, shared by the S copies of a pattern element so the loop closes
  // (after one loop each copy sits where its neighbour was and must shine the same)
  Builder.prototype.push = function (disc, cx, cz, oc, r, th, om, h, col, a, size, bH, bPh, pseed) {
    var rnd = this.rnd;
    var ps = pseed === undefined ? rnd() : pseed;
    this.buf.push(disc, cx, cz, oc, r, th, om, h,
      col[0], col[1], col[2], a,
      size, rnd(), ps, 0,
      bH || 0, bPh || 0, 1 + Math.floor(ps * 4999) % 5, 0);
    this.count++;
  };
  // step that thins with density
  Builder.prototype.step = function (s) { return s / this.d; };

  function pick(rnd, list) { return list[Math.floor(rnd() * list.length)]; }

  /* dotted ring made of arcs; one sector pattern replicated S times */
  function ring(b, o) {
    var rnd = o.pseed ? mulberry32(o.pseed) : b.rnd, S = o.S || 8, sector = TAU / S;
    var om = omega(o.k || 0, S);
    var arcs = [];
    if (o.cover >= 1 || !o.cover) arcs.push([0, sector]);
    else {
      var nA = o.arcs || 2;
      for (var i = 0; i < nA; i++) arcs.push([rnd() * sector, sector * o.cover / nA * (0.6 + rnd() * 0.8)]);
    }
    var dth = b.step(o.spacing || 0.008) / o.r;
    var jr = o.jr || 0;
    // pattern: list of offsets (theta, dr, alpha mul) shared by all sectors
    var pat = [];
    arcs.forEach(function (ar) {
      for (var t = 0; t < ar[1]; t += dth) pat.push([ar[0] + t, (rnd() - 0.5) * jr, 0.6 + rnd() * 0.4, rnd()]);
    });
    for (var s = 0; s < S; s++) for (var p = 0; p < pat.length; p++) {
      b.push(o.d, o.cx || 0, o.cz || 0, o.oc || 0, o.r + pat[p][1], s * sector + pat[p][0], om, o.h || 0,
        o.col, o.a * pat[p][2], o.size || 1, 0, 0, pat[p][3]);
    }
  }

  /* radial or tangential dashes scattered in an annulus */
  function dashes(b, o) {
    var rnd = b.rnd, S = o.S || 12, sector = TAU / S, om = omega(o.k || 0, S);
    var pat = [];
    var n = Math.max(1, Math.round(o.perSector));
    for (var i = 0; i < n; i++) {
      pat.push({
        th: rnd() * sector,
        r: o.r0 + rnd() * (o.r1 - o.r0),
        len: o.len[0] + rnd() * (o.len[1] - o.len[0]),
        col: o.cols ? pick(rnd, o.cols) : o.col,
        a: o.a * (0.5 + rnd() * 0.5),
        seed: rnd()
      });
    }
    var sp = b.step(o.spacing || 0.006);
    for (var s = 0; s < S; s++) pat.forEach(function (q) {
      for (var t = 0; t <= q.len; t += sp) {
        var r = o.dir === 'tangent' ? q.r : q.r + t;
        var th = s * sector + q.th + (o.dir === 'tangent' ? t / q.r : 0);
        b.push(o.d, o.cx || 0, o.cz || 0, o.oc || 0, r, th, om, o.h || 0, q.col, q.a, o.size || 1, 0, 0, (q.seed + t * 7.31) % 1);
      }
    });
  }

  /* loose dots in an annulus (halos, dust) */
  function scatter(b, o) {
    var rnd = b.rnd, S = o.S || 12, sector = TAU / S, om = omega(o.k || 0, S);
    var n = Math.round(o.perSector * b.d), pat = [];
    for (var i = 0; i < n; i++) {
      pat.push([rnd() * sector, o.r0 + Math.sqrt(rnd()) * (o.r1 - o.r0), (rnd() - 0.5) * (o.hj || 0),
        o.cols ? pick(rnd, o.cols) : o.col, o.a * (0.35 + rnd() * 0.65), rnd()]);
    }
    for (var s = 0; s < S; s++) pat.forEach(function (q) {
      b.push(o.d, o.cx || 0, o.cz || 0, o.oc || 0, q[1], s * sector + q[0], om, (o.h || 0) + q[2], q[3], q[4], o.size || 1, 0, 0, q[5]);
    });
  }

  /* gear-like blue rosette: dense concentric dotted rings, teeth, petals, warm core */
  function rosette(b, d, cx, cz, R, dir) {
    var rnd = b.rnd, i;
    var nR = 13;
    for (i = 0; i < nR; i++) {
      var r = 0.03 + i * (R - 0.03) / (nR - 1);
      ring(b, {
        d: d, cx: cx, cz: cz, r: r, S: 8, k: dir * (i % 2 ? 1 : -1) * (1 + (i % 3)),
        spacing: 0.0045, cover: i % 3 === 0 ? 1 : 0.62 + rnd() * 0.3, arcs: 2,
        col: i % 4 === 1 ? C.white : (i % 2 ? C.cyan : C.blue), a: i % 4 === 1 ? 0.55 : 0.85, size: 1.0
      });
    }
    // gear teeth on the rim
    var teeth = 24, sector = TAU / teeth, om = omega(dir * 2, teeth);
    var step = b.step(0.0065);
    for (var t = 0; t < teeth; t++) {
      for (var rr = R + 0.008, ri = 0; rr < R + 0.04; rr += step, ri++) {
        for (var a = -0.28, ai = 0; a <= 0.28; a += step / rr / sector, ai++) {
          b.push(d, cx, cz, 0, rr, t * sector + a * sector, om, 0, C.cyan, 0.9, 1.0, 0, 0, (ri * 0.317 + ai * 0.619) % 1);
        }
      }
    }
    // six-petal curve
    var petals = 6, ps = TAU / petals, pom = omega(-dir, petals);
    var nP = Math.max(4, Math.round(ps / (b.step(0.005) / (R * 0.5))));
    for (var pi = 0; pi < petals; pi++) for (var pj = 0; pj < nP; pj++) {
      var th = pi * ps + pj * ps / nP;
      var pr = R * 0.42 + R * 0.2 * Math.abs(Math.cos(th * petals / 2));
      b.push(d, cx, cz, 0, pr, th, pom, 0, C.ice, 0.75, 1.0, 0, 0, (pj * 0.618) % 1);
    }
    // warm core + white specks
    scatter(b, { d: d, cx: cx, cz: cz, r0: 0, r1: 0.035, perSector: 26, S: 6, k: dir, col: C.yellow, a: 1.0, size: 1.3 });
    scatter(b, { d: d, cx: cx, cz: cz, r0: 0.04, r1: R, perSector: 30, S: 6, k: -dir, cols: [C.white, C.white, C.yellow], a: 1.0, size: 1.25 });
  }

  /* circular city: annular-sector blocks extruded along the disc normal */
  function blockDisc(b, d, R0, R, S, k, maxH, seedBias) {
    var rnd = b.rnd, om = omega(k, S);
    var dr = 0.062;
    var sp = b.step(0.018);
    for (var r = R0, ri = 0; r < R; r += dr, ri++) {
      var n = Math.max(S, Math.round(TAU * r / 0.062 / S) * S);
      var dth = TAU / n, per = n / S;
      var pat = [];
      for (var j = 0; j < per; j++) {
        if (rnd() < 0.6) {
          var edge = 1 - Math.abs((r - R0) / (R - R0) - 0.45) * 1.3; // taller mid-ring
          pat.push({ j: j, H: (0.25 + 0.75 * Math.pow(rnd(), 1.4)) * maxH * (0.45 + 0.55 * Math.max(0, edge)),
            wr: dr * (0.5 + rnd() * 0.25), wt: dth * (0.5 + rnd() * 0.25), bright: rnd() < 0.12, seed: rnd() });
        }
      }
      for (var s = 0; s < S; s++) pat.forEach(function (q) {
        var th0 = (s * per + q.j) * dth;
        var phase = q.j * dth * S + r * 7 + seedBias; // travelling wave, sector-local so every copy matches
        emitBlock(b, d, r, th0, q.wr, q.wt, q.H, phase, om, sp, q.bright, q.seed);
      });
    }
  }
  function emitBlock(b, d, r0, th0, wr, wt, H, ph, om, sp, bright, seed) {
    var cR = [r0 - wr / 2, r0 + wr / 2], cT = [th0 - wt / 2, th0 + wt / 2];
    var nV = Math.max(3, Math.round(H / sp));
    var colE = bright ? C.ice : C.blue, colT = bright ? C.white : C.cyan;
    var i, w, ci, cj, n = 0;
    function ps() { n++; return (seed + n * 0.6180339) % 1; }
    // vertical edges
    for (ci = 0; ci < 2; ci++) for (cj = 0; cj < 2; cj++) {
      for (i = 0; i < nV; i++) {
        w = i / (nV - 1);
        b.push(d, 0, 0, 0, cR[ci], cT[cj], om, w, colE, 0.45 + 0.4 * w, 0.9, H, ph, ps());
      }
    }
    // top outline + a little fill, bottom outline dim
    var nE = 4;
    for (i = 0; i <= nE; i++) {
      var f = i / nE;
      var rr = cR[0] + (cR[1] - cR[0]) * f, tt = cT[0] + (cT[1] - cT[0]) * f;
      b.push(d, 0, 0, 0, rr, cT[0], om, 1, colT, 0.95, 1.0, H, ph, ps());
      b.push(d, 0, 0, 0, rr, cT[1], om, 1, colT, 0.95, 1.0, H, ph, ps());
      b.push(d, 0, 0, 0, cR[0], tt, om, 1, colT, 0.95, 1.0, H, ph, ps());
      b.push(d, 0, 0, 0, cR[1], tt, om, 1, colT, 0.95, 1.0, H, ph, ps());
      if (i % 2 === 0) {
        b.push(d, 0, 0, 0, rr, cT[0], om, 0, C.deep, 0.5, 0.8, H, ph, ps());
        b.push(d, 0, 0, 0, cR[1], tt, om, 0, C.deep, 0.5, 0.8, H, ph, ps());
      }
    }
    // hatch on the outer face
    for (i = 1; i < nV - 1; i += 2) {
      w = i / (nV - 1);
      b.push(d, 0, 0, 0, cR[1], th0, om, w, C.deep, 0.5, 0.8, H, ph, ps());
    }
  }

  function buildStack(density) {
    var b = new Builder(density, 20251010);
    var i;

    /* D1 – large, almost face-on: rings of sparse radial ticks + twin rosettes */
    var d1 = DISCS[0];
    var tickRings = [0.66, 0.76, 0.86, 0.96, 1.06, 1.16];
    tickRings.forEach(function (r, idx) {
      dashes(b, { d: 0, r0: r - 0.01, r1: r + 0.01, len: [0.012, idx % 2 ? 0.05 : 0.03], perSector: 12 + idx * 3, S: 12,
        k: idx % 2 ? 1 : -1, spacing: 0.005, dir: 'radial', cols: [C.white, C.white, C.grey, C.ice], a: 1.0, size: 0.95 });
      ring(b, { d: 0, r: r + 0.025, S: 12, k: idx % 2 ? 1 : -1, spacing: 0.011, cover: 0.55, arcs: 2,
        col: idx === 5 ? C.cyan : C.grey, a: idx === 5 ? 0.7 : 0.35, size: 0.85 });
    });
    // fine regular tick crown on the very rim
    dashes(b, { d: 0, r0: d1.R + 0.05, r1: d1.R + 0.05, len: [0.02, 0.02], perSector: 1, S: 180, k: -1, spacing: 0.006, dir: 'radial', col: C.white, a: 0.55, size: 0.85 });
    ring(b, { d: 0, r: 0.6, S: 6, k: 1, spacing: 0.007, cover: 1, col: C.blue, a: 0.6, size: 0.9 });
    scatter(b, { d: 0, r0: 0.62, r1: 1.2, perSector: 260, S: 12, k: 1, cols: [C.white, C.grey, C.cyan], a: 0.6, size: 0.9 });
    rosette(b, 0, -0.29, 0.0, 0.25, 1);
    scatter(b, { d: 0, r0: 0.0, r1: 0.58, perSector: 120, S: 12, k: -1, cols: [C.cyan, C.blue, C.white], a: 0.45, size: 0.9 });
    rosette(b, 0, 0.29, 0.0, 0.25, -1);

    /* D2 – translucent cluster of little rings */
    var d2 = DISCS[1];
    var rnd = b.rnd;
    for (i = 0; i < 3; i++) { // 3 patterns x 3-fold = 9 small circles
      var cr = 0.06 + rnd() * 0.2, ca = rnd() * TAU / 3, rad = 0.03 + rnd() * 0.06;
      for (var s = 0; s < 3; s++) {
        var a = ca + s * TAU / 3;
        ring(b, { d: 1, cx: Math.cos(a) * cr, cz: Math.sin(a) * cr, oc: omega(1, 3), r: rad, S: 4, k: 1, pseed: 101 + i,
          spacing: 0.0042, cover: 1, col: i === 1 ? C.ice : C.blue, a: 0.65, size: 0.95 });
      }
    }
    ring(b, { d: 1, r: d2.R * 0.6, S: 6, k: -1, spacing: 0.007, cover: 0.7, arcs: 3, col: C.cyan, a: 0.35, size: 0.9 });
    ring(b, { d: 1, r: d2.R, S: 6, k: 1, spacing: 0.006, cover: 1, col: C.blue, a: 0.35, size: 0.9 });
    scatter(b, { d: 1, r0: 0, r1: d2.R, perSector: 120, S: 6, k: 1, cols: [C.cyan, C.white], a: 0.5, size: 1.0 });

    /* D3 – bright yellow core, tight white dot rings, outer dashes */
    var d3 = DISCS[2];
    scatter(b, { d: 2, r0: 0, r1: 0.075, perSector: 200, S: 6, k: 1, cols: [C.yellow, C.yellow, C.amber, C.white], a: 1.0, size: 1.25 });
    for (i = 0; i < 14; i++) {
      ring(b, { d: 2, r: 0.1 + i * 0.022, S: 10, k: i % 2 ? 1 : -1, spacing: 0.0062, cover: i % 4 === 0 ? 1 : 0.7, arcs: 3,
        col: i % 5 === 2 ? C.cyan : C.white, a: 0.62, size: 0.95 });
    }
    dashes(b, { d: 2, r0: 0.43, r1: d3.R, len: [0.015, 0.06], perSector: 24, S: 16, k: -1, spacing: 0.005, dir: 'tangent',
      cols: [C.cyan, C.blue, C.white, C.ice], a: 0.85, size: 1.0 });
    ring(b, { d: 2, r: d3.R + 0.03, S: 8, k: 1, spacing: 0.008, cover: 0.8, arcs: 2, col: C.blue, a: 0.6, size: 0.9 });

    /* D4 / D5 – circular cities */
    var d4 = DISCS[3], d5 = DISCS[4];
    blockDisc(b, 3, 0.1, d4.R, 6, 1, 0.34, 0.0);
    blockDisc(b, 4, 0.1, d5.R, 6, -1, 0.28, 2.1);
    [3, 4].forEach(function (d, j) {
      var R = DISCS[d].R;
      ring(b, { d: d, r: R + 0.04, S: 6, k: j ? -1 : 1, spacing: 0.007, cover: 1, col: C.cyan, a: 0.55, size: 0.9 });
      ring(b, { d: d, r: 0.07, S: 6, k: 1, spacing: 0.006, cover: 1, col: C.ice, a: 0.8, size: 1.0 });
      scatter(b, { d: d, r0: R + 0.08, r1: R + 0.42, perSector: 70, S: 12, k: j ? 1 : -1, hj: 0.04, cols: [C.cyan, C.blue, C.white], a: 0.6, size: 0.9 });
      ring(b, { d: d, r: R + 0.28, S: 12, k: j ? 1 : -1, spacing: 0.012, cover: 0.45, arcs: 2, col: C.grey, a: 0.4, size: 0.85 });
      scatter(b, { d: d, r0: 0, r1: 0.06, perSector: 12, S: 6, k: 1, col: C.yellow, a: 0.9, size: 1.1 });
    });

    var data = new Float32Array(b.buf);
    return { data: data, count: b.count };
  }

  /* ---------- shaders ---------- */
  var VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec4 a0;',
    'layout(location=1) in vec4 a1;',
    'layout(location=2) in vec4 a2;',
    'layout(location=3) in vec4 a3;',
    'layout(location=4) in vec4 a4;',
    'uniform mat4 uViewProj;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uDC[5]; uniform vec3 uDU[5]; uniform vec3 uDV[5]; uniform vec3 uDN[5];',
    'uniform float uTime;',      // 0..16 loop time
    'uniform float uIntro;',     // 0..1
    'uniform float uPx;',        // device px per world unit at distance 1
    'uniform float uSize;',      // world size of a point
    'uniform float uMaxPx;',
    'uniform float uKeep;',      // fraction of pattern elements drawn (point budget)
    'out vec4 vColor;',
    'const float TAU = 6.28318530718;',
    'float hash(float n){ return fract(sin(n) * 43758.5453123); }',
    'void main(){',
    '  if (hash(a3.z * 91.37 + 0.5) > uKeep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec4(0.0); return; }',
    '  int d = int(a0.x + 0.5);',
    '  float ac = a0.w * uTime;',
    '  vec2 c = vec2(a0.y * cos(ac) - a0.z * sin(ac), a0.y * sin(ac) + a0.z * cos(ac));',
    '  float th = a1.y + a1.z * uTime;',
    '  vec2 p = c + a1.x * vec2(cos(th), sin(th));',
    '  float h = a1.w;',
    '  float lift = 0.0;',
    '  if (a4.x > 0.0) {',
    '    float wave = 0.5 + 0.5 * sin(TAU * uTime * 2.0 / 16.0 + a4.y);',
    '    float hh = a4.x * (0.25 + 0.75 * wave);',
    '    h = a1.w * hh;',
    '    lift = wave * a1.w;',
    '  }',
    '  vec3 world = uDC[d] + uDU[d] * p.x + uDV[d] * p.y + uDN[d] * h;',
    '  float s = a3.y;',
    '  vec3 scat = (vec3(hash(s * 91.7), hash(s * 37.3 + 1.0), hash(s * 13.9 + 2.0)) * 2.0 - 1.0) * vec3(7.5, 4.5, 5.0);',
    '  float k = clamp(uIntro * 1.55 - s * 0.55, 0.0, 1.0);',
    '  k = 1.0 - pow(1.0 - k, 3.0);',
    '  world = mix(scat, world, k);',
    '  gl_Position = uViewProj * vec4(world, 1.0);',
    '  float dist = length(world - uCamPos);',
    '  float px = uSize * a3.x * uPx / dist;',
    '  float shim = 0.62 + 0.38 * sin(TAU * a4.z * uTime / 16.0 + a3.z * 57.0);',
    '  float sparkle = step(0.985, hash(floor(uTime * 6.0) + a3.z * 311.0)) * 0.9;',
    '  float alpha = a2.a * (shim + sparkle) * (0.75 + 0.35 * lift);',
    '  alpha *= 1.3 * mix(0.25, 1.0, k);',
    '  if (px < 1.6) { alpha *= px / 1.6; px = 1.6; }',
    '  gl_PointSize = min(px, uMaxPx);',
    '  float fog = clamp(1.25 - (dist - 6.0) * 0.18, 0.55, 1.15);',
    '  vColor = vec4(a2.rgb, alpha * fog);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision mediump float;',
    'in vec4 vColor;',
    'out vec4 outColor;',
    'void main(){',
    '  vec2 q = gl_PointCoord - 0.5;',
    '  float d = length(q);',
    '  if (d > 0.5) discard;',
    '  float a = smoothstep(0.5, 0.12, d);',
    '  outColor = vec4(vColor.rgb * vColor.a * a, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  /* ---------- renderer ---------- */
  function DiscStack(canvas) {
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.canvas = canvas;
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    var u = {};
    ['uViewProj', 'uCamPos', 'uKeep', 'uTime', 'uIntro', 'uPx', 'uSize', 'uMaxPx', 'uDC', 'uDU', 'uDV', 'uDN'].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    this.u = u;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.count = 0;
    this.density = 1;
  }

  // geometry is built once at full density; the point budget is applied in the vertex
  // shader by keeping a fraction of pattern elements (all S copies of an element share
  // its seed, so the kept subset stays symmetric and the 16 s loop still closes)
  DiscStack.prototype.build = function (budget) {
    var gl = this.gl;
    var geo = buildStack(1);
    this.total = geo.count;
    this.setBudget(budget);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    for (var i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
    }
    gl.bindVertexArray(null);
    return this.count;
  };
  DiscStack.prototype.setBudget = function (budget) {
    this.count = Math.min(this.total, budget);
    this.keep = this.count / this.total;
    this.density = this.count / Math.min(this.total, 60000);
  };

  DiscStack.prototype.resize = function (w, h) {
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  };

  DiscStack.prototype.render = function (cam, loopT, intro, pr) {
    var gl = this.gl, u = this.u;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(u.uViewProj, false, cam.viewProj);
    gl.uniform3fv(u.uCamPos, cam.eye);
    gl.uniform1f(u.uTime, loopT);
    gl.uniform1f(u.uIntro, intro);
    gl.uniform1f(u.uKeep, this.keep);
    gl.uniform1f(u.uPx, cam.pxPerUnit);
    gl.uniform1f(u.uSize, 0.0128 / Math.sqrt(Math.max(0.25, this.density)));
    gl.uniform1f(u.uMaxPx, 9 * pr);
    var dc = [], du = [], dv = [], dn = [];
    cam.discs.forEach(function (d) { dc.push.apply(dc, d.c); du.push.apply(du, d.u); dv.push.apply(dv, d.v); dn.push.apply(dn, d.n); });
    gl.uniform3fv(u.uDC, dc); gl.uniform3fv(u.uDU, du); gl.uniform3fv(u.uDV, dv); gl.uniform3fv(u.uDN, dn);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.total);
    gl.bindVertexArray(null);
  };

  global.Reactor = global.Reactor || {};
  global.Reactor.LOOP = LOOP;
  global.Reactor.DISCS = DISCS;
  global.Reactor.math = { perspective: perspective, lookAt: lookAt, mul: mul, project: project, norm: norm, cross: cross, mulberry32: mulberry32 };
  global.Reactor.DiscStack = DiscStack;
  global.Reactor.buildStack = buildStack;
})(window);
