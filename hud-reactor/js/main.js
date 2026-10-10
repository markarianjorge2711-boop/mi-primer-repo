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
  var BUDGET = 140000; // lowered automatically (halved, up to twice) if frames run long

  var stack = null;
  try { stack = new R.DiscStack(glCanvas); stack.build(BUDGET); }
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

  function camera(t) {
    // slow breathing of the viewing angle, a few degrees, closes on the loop
    var yaw = 0.0 + 0.05 * Math.sin(TAU * t / LOOP);
    var pitch = 0.0 + 0.03 * Math.sin(TAU * t / LOOP * 2 + 1.1);
    var eye = [TARGET[0] + CAM_DIST * Math.sin(yaw) * Math.cos(pitch),
      TARGET[1] + CAM_DIST * Math.sin(pitch),
      TARGET[2] + CAM_DIST * Math.cos(yaw) * Math.cos(pitch)];
    var aspect = LW / LH;
    // keep the stack the same size on narrow landscape windows
    var fov = aspect < 1.5 ? 2 * Math.atan(Math.tan(FOV / 2) * 1.5 / aspect) : FOV;
    var proj = M.perspective(fov, aspect, 0.1, 60);
    var view = M.lookAt(eye, TARGET, [0, 1, 0]);
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

  /* performance guard: if frames take > 20 ms, halve the points (once) */
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
    if (stack && !perf.checked && sim > 3 && !document.hidden) {
      perf.samples.push(raw * 1000);
      var sum = perf.samples.reduce(function (a, b) { return a + b; }, 0);
      if (perf.samples.length >= 90 || (perf.samples.length >= 12 && sum > 2500)) {
        var s = perf.samples.slice().sort(function (a, b) { return a - b; });
        perf.measuredMs = s[s.length >> 1];
        perf.samples = [];
        perf.halvings = perf.halvings || 0;
        if (perf.measuredMs > 20 && perf.halvings < 2) {
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
