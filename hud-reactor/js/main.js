/* Boot, camera, loop, performance guard, portrait rotation. */
(function () {
  'use strict';
  var R = window.Reactor, M = R.math, TAU = Math.PI * 2, LOOP = R.LOOP;

  var stage = document.getElementById('stage');
  var glCanvas = document.getElementById('gl');
  var hudCanvas = document.getElementById('hud');

  var params = new URLSearchParams(location.search);
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timeScale = reduced ? 0.25 : 1;
  // as many points as the machine sustains: ~400k to start, halved (up to 4 times) while
  // frames take longer than 20 ms. ?pts=N pins the count and turns the guard off.
  var DENSITY = params.has('density') ? parseFloat(params.get('density')) : 3;
  var pinned = params.has('pts') ? parseInt(params.get('pts'), 10) : 0;

  var stack = null;
  try { stack = new R.DiscStack(glCanvas); stack.build(pinned || 1e9, DENSITY); }
  catch (e) { console.warn('WebGL2 disc stack disabled:', e.message); stack = null; }
  var hud = R.HUD && !params.has("nohud") ? new R.HUD(hudCanvas) : null;

  var LW = 0, LH = 0, pr = 1, portrait = false;
  var FOV = 33 * Math.PI / 180;

  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    portrait = h > w;
    LW = portrait ? h : w;
    LH = portrait ? w : h;
    pr = Math.min(window.devicePixelRatio || 1, 2);
    stage.style.width = LW + 'px';
    stage.style.height = LH + 'px';
    stage.style.transform = portrait ? 'translate(' + w + 'px,0) rotate(90deg)' : 'none';
    if (stack) stack.resize(Math.round(LW * pr), Math.round(LH * pr));
    if (hud) hud.resize(LW, LH, pr);
  }
  window.addEventListener('resize', layout);
  layout();

  var CAM_DIST = 8.7;
  var TARGET = [0.05, -0.32, 0.0];

  /* orbit: drag to turn, wheel / pinch to zoom, double-click or R to reset */
  var orbit = { yaw: 0, pitch: 0, dist: CAM_DIST, tYaw: 0, tPitch: 0, tDist: CAM_DIST, vYaw: 0, vPitch: 0, dragging: false };
  if (params.has('yaw')) orbit.yaw = orbit.tYaw = parseFloat(params.get('yaw'));
  if (params.has('pitch')) orbit.pitch = orbit.tPitch = parseFloat(params.get('pitch'));
  if (params.has('dist')) orbit.dist = orbit.tDist = parseFloat(params.get('dist'));
  var pointers = {}, pinch = 0;
  function stageDelta(dx, dy) { return portrait ? [dy, -dx] : [dx, dy]; } // the stage is turned 90 deg in portrait
  function clampOrbit() {
    orbit.tPitch = Math.max(-1.45, Math.min(1.45, orbit.tPitch));
    orbit.tDist = Math.max(3.0, Math.min(20, orbit.tDist));
  }
  window.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = [e.clientX, e.clientY];
    orbit.dragging = true; orbit.vYaw = orbit.vPitch = 0;
    document.body.classList.add('grabbing');
  });
  window.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      pointers[e.pointerId] = [e.clientX, e.clientY];
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { orbit.tDist *= pinch / d; clampOrbit(); }
      pinch = d;
      return;
    }
    var s = stageDelta(e.clientX - p[0], e.clientY - p[1]);
    pointers[e.pointerId] = [e.clientX, e.clientY];
    var k = 0.006;
    orbit.tYaw -= s[0] * k; orbit.tPitch += s[1] * k;
    orbit.vYaw = -s[0] * k; orbit.vPitch = s[1] * k;
    clampOrbit();
  });
  function release(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = 0;
    if (!Object.keys(pointers).length) { orbit.dragging = false; document.body.classList.remove('grabbing'); }
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    orbit.tDist *= Math.exp(e.deltaY * 0.0012);
    clampOrbit();
  }, { passive: false });
  function resetView() { orbit.tYaw = 0; orbit.tPitch = 0; orbit.tDist = CAM_DIST; orbit.vYaw = orbit.vPitch = 0; }
  window.addEventListener('dblclick', resetView);
  window.addEventListener('keydown', function (e) { if (e.key === 'r' || e.key === 'R') resetView(); });
  window.Reactor.orbit = orbit;

  function updateOrbit(dt) {
    if (!orbit.dragging) {               // a little inertia after letting go
      orbit.tYaw += orbit.vYaw; orbit.tPitch += orbit.vPitch;
      var fr = Math.exp(-dt * 4);
      orbit.vYaw *= fr; orbit.vPitch *= fr;
      clampOrbit();
    }
    var e = 1 - Math.exp(-dt * 10);
    orbit.yaw += (orbit.tYaw - orbit.yaw) * e;
    orbit.pitch += (orbit.tPitch - orbit.pitch) * e;
    orbit.dist += (orbit.tDist - orbit.dist) * e;
  }

  // orbit pivot: the middle of the machine, so turning keeps it in frame
  var PIVOT = [0.3, -0.2, 0.1];
  function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
  function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
  function aroundPivot(p, yaw, pitch) {
    var q = [p[0] - PIVOT[0], p[1] - PIVOT[1], p[2] - PIVOT[2]];
    q = rotY(rotX(q, -pitch), yaw);
    return [q[0] + PIVOT[0], q[1] + PIVOT[1], q[2] + PIVOT[2]];
  }

  function camera(t) {
    // user orbit + a slow breathing of the viewing angle (a few degrees, closes on the loop)
    var yaw = orbit.yaw + 0.05 * Math.sin(TAU * t / LOOP);
    var pitch = orbit.pitch + 0.03 * Math.sin(TAU * t / LOOP * 2 + 1.1);
    // the default framing (target + distance) is turned as a whole around the pivot
    var eye = aroundPivot([TARGET[0], TARGET[1], TARGET[2] + orbit.dist], yaw, pitch);
    var tgt = aroundPivot(TARGET, yaw, pitch);
    // once the user turns away from the default view, aim at the middle of the machine
    var w = Math.min(1, (Math.abs(orbit.yaw) + Math.abs(orbit.pitch)) / 0.6);
    w = w * w * (3 - 2 * w);
    tgt = [tgt[0] + (PIVOT[0] - tgt[0]) * w, tgt[1] + (PIVOT[1] - tgt[1]) * w, tgt[2] + (PIVOT[2] - tgt[2]) * w];
    var aspect = LW / LH;
    // keep the stack the same size on narrow landscape windows
    var fov = aspect < 1.5 ? 2 * Math.atan(Math.tan(FOV / 2) * 1.5 / aspect) : FOV;
    var proj = M.perspective(fov, aspect, 0.05, 80);
    var view = M.lookAt(eye, tgt, [0, 1, 0]);
    // tiny wobble of each disc so the stack never looks frozen
    var discs = R.DISCS.map(function (d, i) {
      var w = 0.025 * Math.sin(TAU * t / LOOP + i * 1.3);
      var n = M.norm([d.n[0] + w, d.n[1], d.n[2] - w]);
      var ref = Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      var u = M.norm(M.cross(ref, n));
      var bob = 0.03 * Math.sin(TAU * t / LOOP * 2 + i);
      return { c: [d.c[0], d.c[1] + bob, d.c[2]], n: n, u: u, v: M.cross(n, u), R: d.R, label: d.label };
    });
    return {
      eye: eye, viewProj: M.mul(proj, view), discs: discs,
      pxPerUnit: (LH * pr) / (2 * Math.tan(fov / 2))
    };
  }

  /* performance guard: while frames take > 20 ms, halve the points (up to 4 times) */
  var perf = { samples: [], halved: false, fps: 0, ms: 0 };
  window.HUD_STATS = perf;

  var sim = 0, last = performance.now(), frames = 0, fpsT0 = last;
  var fixedT = params.has('t') ? parseFloat(params.get('t')) : null; // for stills: ?t=6

  function frame(now) {
    var raw = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim += raw * timeScale;
    var t = fixedT !== null ? fixedT : sim;
    var intro = Math.min(1, t / 2.5);
    var loopT = t % LOOP;
    updateOrbit(raw);
    var cam = camera(loopT);

    if (stack) stack.render(cam, loopT, intro, pr);
    var h0 = performance.now();
    if (hud) hud.draw(t, raw * timeScale, cam, perf, stack ? stack.count : 0);
    perf.hudMs = performance.now() - h0;

    // measure after the intro has settled
    frames++;
    if (now - fpsT0 >= 1000) {
      perf.fps = frames * 1000 / (now - fpsT0);
      perf.ms = 1000 / perf.fps;
      frames = 0; fpsT0 = now;
    }
    if (stack && !pinned && !perf.checked && sim > 3 && !document.hidden) {
      perf.samples.push(raw * 1000);
      var sum = perf.samples.reduce(function (a, b) { return a + b; }, 0);
      if (perf.samples.length >= 90 || (perf.samples.length >= 12 && sum > 2500)) {
        var s = perf.samples.slice().sort(function (a, b) { return a - b; });
        perf.measuredMs = s[s.length >> 1];
        perf.samples = [];
        perf.halvings = perf.halvings || 0;
        if (perf.measuredMs > 20 && perf.halvings < 4) {
          stack.setBudget(Math.floor(stack.count / 2));
          perf.halved = true;
          perf.halvings++;            // measure again at the new budget
        } else perf.checked = true;
      }
    }
    perf.points = stack ? stack.count : 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
