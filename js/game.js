/* ============================================================
   EGGHEAD: STAY UNSTABLE — game loop, physics, UI and progression
   ============================================================ */
(function () {
  'use strict';

  var T = window.THREE;
  var A = window.EggAudio;

  /* =========================================================
     0. persistence
     ========================================================= */
  var SAVE_KEY = 'egghead_stay_unstable_save_v1';

  var DEFAULT_SAVE = {
    bestTime: 0,
    bestScore: 0,
    runs: 0,
    suit: 'onyx',
    shades: 'classic',
    pose: 'CONFIDENT',
    music: true,
    sfx: true,
    unlocked: { suit_onyx: 1, shade_classic: 1, pose_stiff: 1 }
  };

  var save = load();
  function load() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SAVE));
      var o = JSON.parse(raw);
      var out = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      for (var k in o) if (o.hasOwnProperty(k)) {
        if (k === 'unlocked') { for (var u in o.unlocked) out.unlocked[u] = 1; }
        else out[k] = o[k];
      }
      return out;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_SAVE)); }
  }
  function persist() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { }
  }

  /* =========================================================
     1. unlock catalogue  (cosmetic only — never affects fairness)
     ========================================================= */
  /* Thresholds are tuned to the real survival curve: a first run earns a
     couple of items, and the last ones need a genuinely good run. */
  var UNLOCKS = [
    { id: 'suit_onyx',     type: 'suit',  key: 'onyx',      name: 'ONYX SUIT',      req: 0 },
    { id: 'suit_cobalt',   type: 'suit',  key: 'cobalt',    name: 'COBALT SUIT',    req: 4 },
    { id: 'suit_rose',     type: 'suit',  key: 'rose',      name: 'ROSE SUIT',      req: 8 },
    { id: 'suit_mint',     type: 'suit',  key: 'mint',      name: 'MINT SUIT',      req: 12 },
    { id: 'suit_gold',     type: 'suit',  key: 'gold',      name: 'GOLD SUIT',      req: 17 },
    { id: 'suit_midnight', type: 'suit',  key: 'midnight',  name: 'MIDNIGHT SUIT',  req: 24 },

    { id: 'shade_classic', type: 'shades', key: 'classic',  name: 'CLASSIC BLACK',  req: 0 },
    { id: 'shade_amber',   type: 'shades', key: 'amber',    name: 'HAZARD AMBER',   req: 6 },
    { id: 'shade_rose',    type: 'shades', key: 'rose',     name: 'ROSE TINT',      req: 10 },
    { id: 'shade_chrome',  type: 'shades', key: 'chrome',   name: 'CHROMED OUT',    req: 15 },
    { id: 'shade_neon',    type: 'shades', key: 'neon',     name: 'NEON CYAN',      req: 22 },

    { id: 'pose_stiff',    type: 'pose',  key: 'CONFIDENT', name: 'STIFF UPPER',    req: 0 },
    { id: 'pose_showboat', type: 'pose',  key: 'EPIC_SAVE', name: 'SHOWBOAT',       req: 7 },
    { id: 'pose_nervous',  type: 'pose',  key: 'WOBBLE',    name: 'NERVOUS',        req: 11 },
    { id: 'pose_rubber',   type: 'pose',  key: 'SLIP',      name: 'RUBBER LEGS',    req: 16 },
    { id: 'pose_meltdown', type: 'pose',  key: 'RESET',     name: 'MELTDOWN',       req: 26 }
  ];

  function isUnlocked(id) { return !!save.unlocked[id]; }
  function unlockCount() {
    var n = 0;
    for (var i = 0; i < UNLOCKS.length; i++) if (isUnlocked(UNLOCKS[i].id)) n++;
    return n;
  }
  function nextLocked(req) {
    var best = null, gap = null;
    for (var i = 0; i < UNLOCKS.length; i++) {
      var u = UNLOCKS[i];
      if (u.req > req) { if (best == null || u.req < best.req) best = u; }
      else if (!isUnlocked(u.id)) { if (best == null || u.req < best.req) best = u; }
    }
    if (!best) return null;
    return { item: best, gap: Math.max(0, best.req - req) };
  }

  /* =========================================================
     2. constants
     ========================================================= */
  var COM_H = 1.30;           // height of the centre of mass above the feet
  var RESTORE = 4.2;          // how hard the egg tries to pull itself upright
  var DAMP = 1.25;            // wobble damping — low enough to look panicky
  var LEAN_V = 0.55;          // body lag: lean trails behind the sliding feet
  var LEAN_A = 0.045;         // short inertia kick when the feet accelerate
  var SLOPE_GAIN = 0.50;      // direct toppling torque from a tilted deck
  var SLOPE_FOOT = 0.36;      // downhill skate of the feet on a tilted deck
  var MAX_FOOT_SPEED = 1.55;
  var MAX_FOOT_ACC = 5.0;
  var WIND_K = 1.15;
  var SAVE_COOLDOWN = 2.6;
  var SAVE_BONUS = 25;
  var DECK_RX = window.EggWorld.RX;
  var DECK_RZ = window.EggWorld.RZ;
  var SURFACE_Y = window.EggWorld.SURFACE_Y;

  /* =========================================================
     3. dom
     ========================================================= */
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('gl');
  var el = {
    boot: $('screenBoot'), bootFill: $('bootFill'), bootNote: $('bootNote'),
    menu: $('screenMenu'), pause: $('screenPause'), over: $('screenOver'),
    appearance: $('screenAppearance'),
    hud: $('hud'),
    hudTime: $('hudTime'), hudScore: $('hudScore'), hudBest: $('hudBest'),
    dangerTrack: $('dangerTrack'), dangerFill: $('dangerFill'),
    hazardToast: $('hazardToast'), hazardName: $('hazardName'),
    saveBadge: $('saveBadge'), hint: $('hint'),
    saveMeter: $('saveMeter'), saveMeterFill: $('saveMeterFill'),
    menuBestTime: $('menuBestTime'), menuBestScore: $('menuBestScore'),
    menuUnlockCount: $('menuUnlockCount'),
    pauseTime: $('pauseTime'), pauseScore: $('pauseScore'),
    overTitle: $('overTitle'), overRecord: $('overRecord'),
    overTime: $('overTime'), overScore: $('overScore'),
    overBestTime: $('overBestTime'), overBestScore: $('overBestScore'),
    overBlunder: $('overBlunder'),
    nextUnlockBox: $('nextUnlockBox'), nextUnlockName: $('nextUnlockName'),
    nextUnlockFill: $('nextUnlockFill'), nextUnlockGap: $('nextUnlockGap'),
    allUnlockedBox: $('allUnlockedBox'),
    wardrobeGrid: $('wardrobeGrid'),
    flash: $('flash'),
    btnMusic: $('btnMusic'), btnMusic2: $('btnMusic2'),
    btnSfx: $('btnSfx'), btnSfx2: $('btnSfx2')
  };

  /* =========================================================
     4. renderer / scene
     ========================================================= */
  var renderer, scene, camera, world, char, charPivot, fxGroup;
  var clock = { last: 0, elapsed: 0, frames: 0 };
  var simQuiet = false;   // set while a headless tuning sweep is running

  var camState = { x: 0, y: 2.15, z: 5.0, shake: 0, shakeSeed: 0, dist: 5.0, menuOrbit: 0 };

  var webglOK = true;
  function initGL() {
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { webglOK = false; return false; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    if ('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    scene = new T.Scene();
    scene.fog = new T.Fog(0x2a3158, 9, 40);

    camera = new T.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 140);
    camera.position.set(0, camState.y, camState.z);

    /* lights */
    var hemi = new T.HemisphereLight(0xc3d4ff, 0x2a2340, 0.62);
    scene.add(hemi);

    var key = new T.DirectionalLight(0xfff1da, 1.25);
    key.position.set(4.2, 8.5, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 26;
    key.shadow.camera.left = -4.2;
    key.shadow.camera.right = 4.2;
    key.shadow.camera.top = 4.6;
    key.shadow.camera.bottom = -3.0;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.022;
    scene.add(key);

    var rim = new T.DirectionalLight(0x92b8ff, 0.42);
    rim.position.set(-5.5, 3.2, -5.0);
    scene.add(rim);

    scene.add(new T.AmbientLight(0xffffff, 0.16));

    /* world */
    world = window.EggWorld.create(scene);
    world.onHop = function () { A.sfx('bounce'); addShake(0.10); };
    world.onLand = function (power) {
      A.sfx('thud');
      addShake(0.16 * power);
      if (char) char.joltGlasses(-0.5 * power);
      fxRing(new T.Vector3(worldPlatformX(), SURFACE_Y + 0.02, 0), 0xd8e4ff, 2.2, 0.45);
    };

    /* character container on the deck */
    charPivot = new T.Group();
    charPivot.position.y = SURFACE_Y;
    world.platform.add(charPivot);

    char = window.EggCharacter.create();
    charPivot.add(char.root);
    charPivot.add(char.contactShadow);

    /* effects */
    fxGroup = new T.Group();
    world.platform.add(fxGroup);

    applyLook();
    window.addEventListener('resize', onResize);
    onResize();
    return true;
  }

  function worldPlatformX() { return world.kin.offX(); }

  function onResize() {
    if (!renderer) return;
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the egg nicely framed in every portrait aspect ratio
    var a = camera.aspect;
    var fit = a < 0.60 ? (0.60 / a) : 1;
    camState.dist = 5.0 * Math.min(1.42, fit);
    camera.updateProjectionMatrix();
  }

  /* =========================================================
     5. simple fx pool (rings + sparks)
     ========================================================= */
  var rings = [], sparks = [];
  function fxRing(pos, color, maxScale, life) {
    var m = new T.Mesh(
      new T.RingGeometry(0.32, 0.42, 26),
      new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.userData = { t: 0, life: life || 0.5, max: maxScale || 2 };
    fxGroup.add(m);
    rings.push(m);
  }
  function fxBurst(pos, color, count) {
    count = count || 12;
    var g = new T.BufferGeometry();
    var p = new Float32Array(count * 3);
    var v = [];
    for (var i = 0; i < count; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      var a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.8;
      v.push(new T.Vector3(Math.cos(a) * s, 1.4 + Math.random() * 2.0, Math.sin(a) * s * 0.6));
    }
    g.setAttribute('position', new T.BufferAttribute(p, 3));
    var pts = new T.Points(g, new T.PointsMaterial({ color: color, size: 0.075, transparent: true, opacity: 0.95, depthWrite: false }));
    pts.userData = { t: 0, life: 0.65, vel: v };
    fxGroup.add(pts);
    sparks.push(pts);
  }
  function updateFX(dt) {
    for (var i = rings.length - 1; i >= 0; i--) {
      var r = rings[i], u = r.userData;
      u.t += dt;
      var k = u.t / u.life;
      r.scale.setScalar(1 + k * u.max);
      r.material.opacity = Math.max(0, 0.75 * (1 - k));
      if (k >= 1) { fxGroup.remove(r); r.geometry.dispose(); r.material.dispose(); rings.splice(i, 1); }
    }
    for (var j = sparks.length - 1; j >= 0; j--) {
      var s = sparks[j], u2 = s.userData;
      u2.t += dt;
      var arr = s.geometry.attributes.position.array;
      for (var n = 0; n < u2.vel.length; n++) {
        u2.vel[n].y -= 7.5 * dt;
        arr[n * 3] += u2.vel[n].x * dt;
        arr[n * 3 + 1] += u2.vel[n].y * dt;
        arr[n * 3 + 2] += u2.vel[n].z * dt;
      }
      s.geometry.attributes.position.needsUpdate = true;
      s.material.opacity = Math.max(0, 0.95 * (1 - u2.t / u2.life));
      if (u2.t >= u2.life) { fxGroup.remove(s); s.geometry.dispose(); s.material.dispose(); sparks.splice(j, 1); }
    }
  }
  function clearFX() {
    rings.forEach(function (r) { fxGroup.remove(r); });
    sparks.forEach(function (s) { fxGroup.remove(s); });
    rings.length = 0; sparks.length = 0;
  }

  /* =========================================================
     6. game state
     ========================================================= */
  var G = {
    mode: 'boot',              // boot | menu | playing | paused | falling | over
    time: 0,
    score: 0,
    saves: 0,
    lean: 0, leanVel: 0,
    sx: 0, sz: 0, vsx: 0, vsz: 0,
    slip: 0,
    danger: 0,
    tier: 0,
    saveCd: 0,
    saveT: 0,
    stateT: 0,
    cause: {},
    lastCause: 'UNEXPLAINED',
    fall: null,
    fallTimer: 0,
    input: 0,
    inputTarget: 0,
    newRecord: false,
    startFx: 0
  };

  function resetRun() {
    G.time = 0; G.score = 0; G.saves = 0;
    G.lean = 0; G.leanVel = 0;
    G.sx = 0; G.sz = 0; G.vsx = 0; G.vsz = 0;
    G.slip = 0; G.danger = 0; G.tier = 0;
    G.saveCd = 0; G.saveT = 9;
    G.stateT = 0;
    G.cause = {};
    G.fall = null; G.fallTimer = 0;
    G.input = 0; G.inputTarget = 0;
    G.newRecord = false;

    world.reset();
    clearFX();

    if (char.root.parent !== charPivot) charPivot.add(char.root);
    char.root.position.set(0, 0, 0);
    char.root.rotation.set(0, 0, 0);
    char.parts.tilt.rotation.set(0, 0, 0);
    char.contactShadow.visible = true;
    char.setPose(save.pose, 2.6);
    char.setState('confident');
  }

  /* =========================================================
     7. physics step
     ========================================================= */
  function stepPhysics(dt) {
    var k = world.kin;
    var phi = k.tilt();
    var yawRate = k.yawRate();
    var offAcc = k.offXAcc();
    var bounceAcc = k.bounceAcc();
    var wind = k.windPower() * k.windDir();

    /* ---- foot drive: the player pushes the base left / right ----
       This is a FORCE, not a position lock. Letting go means the feet
       keep whatever momentum the deck gave them — that is the whole
       game. A velocity servo here would silently cancel every hazard. */
    var prevVsx = G.vsx;
    var grip = 1 - G.slip * 0.5;                 // slipping feet steer badly
    var acc = G.inputTarget * MAX_FOOT_ACC;
    G.vsx += acc * grip * dt;
    var footAcc = (G.vsx - prevVsx) / Math.max(dt, 1e-4);

    /* ---- external pushes on the feet ---- */
    var pseudo = 0;
    pseudo += -offAcc * 0.70;                    // inertia when the deck slides
    pseudo += -yawRate * yawRate * G.sx * 0.35;  // centrifugal throw
    pseudo += wind * WIND_K * 0.55;              // a fan blows the whole agent
    pseudo += -9.81 * SLOPE_FOOT * Math.sin(phi); // a tilted deck is downhill
    pseudo += -Math.sign(Math.sin(phi)) * G.slip * 2.6;  // skate downhill

    /* ---- slip builds on steep, spinning or hopped decks ---- */
    var slipSources = Math.min(1, Math.abs(Math.sin(phi)) * 2.2 + Math.abs(yawRate) * 0.6 + Math.abs(bounceAcc) * 0.022);
    G.slip += ((slipSources > 0.15 ? slipSources : 0) - G.slip) * Math.min(1, dt * 3.5);

    G.vsx += pseudo * dt;
    G.vsx *= Math.pow(0.985, dt * 60);
    /* skittering feet have a top speed — nothing can fling you faster */
    G.vsx = Math.max(-MAX_FOOT_SPEED, Math.min(MAX_FOOT_SPEED, G.vsx));

    /* ---- lateral (z) drift caused by the spinning deck ---- */
    G.vsz += (-yawRate * G.sx * 4.0 - G.sz * 5.0) * dt;
    G.vsz *= Math.pow(0.94, dt * 60);
    G.sz += G.vsz * dt;
    G.sz = Math.max(-0.9, Math.min(0.9, G.sz));

    /* ---- integrate the base ---- */
    G.sx += G.vsx * dt;

    /* ---- the body: a wobbly spring that trails behind the feet ----
       It self-rights, but slope, wind, hops and slippery feet can all
       throw it past the point of no return.                                  */
    var comAcc = -9.81 * SLOPE_GAIN * Math.sin(phi) + wind * WIND_K * 0.55;
    var leanAcc = -RESTORE * Math.sin(G.lean)
      - DAMP * G.leanVel
      - LEAN_V * G.vsx
      - LEAN_A * footAcc
      + comAcc / COM_H
      + bounceAcc * 0.035
      + (Math.random() - 0.5) * G.slip * 1.4;

    G.leanVel += leanAcc * dt;
    G.lean += G.leanVel * dt;

    /* ---- causes (for the "most absurd mistake" readout) ---- */
    var comX = G.sx + COM_H * Math.sin(G.lean);
    addCause('LEANED TOO FAR INTO THE VOID', Math.abs(G.lean) / 1.2 * dt);
    addCause('SIMPLY DRIFTED OFF', Math.abs(comX) / DECK_RX * dt * 0.7);
    addCause('BLOWN AWAY BY A MINI FAN', wind > 0.2 ? wind * dt * 0.5 : 0);
    addCause('SLIPPED ON A SPINNING DECK', Math.abs(yawRate) > 0.2 ? Math.abs(G.vsz) * dt : 0);
    if (G.tier >= 5) addCause('LAUNCHED BY THE SPRING', Math.abs(bounceAcc) * 0.004 * dt);
    if (G.tier >= 2) addCause('LEFT BEHIND BY THE SLIDING FLOOR', Math.abs(offAcc) * 0.03 * dt);

    /* ---- danger readout ---- */
    var ellipse = Math.sqrt((comX / DECK_RX) * (comX / DECK_RX) + (G.sz / DECK_RZ) * (G.sz / DECK_RZ));
    G.danger = Math.max(0, Math.min(1, ellipse));

    /* ---- failure tests ---- */
    if (G.mode !== 'playing') return;

    var feetEllipse = Math.sqrt((G.sx / DECK_RX) * (G.sx / DECK_RX) + (G.sz / DECK_RZ) * (G.sz / DECK_RZ));

    if (ellipse > 1.0) { fail(pickCause('DRIFTED OFF THE EDGE')); return; }
    if (feetEllipse > 1.06) { fail(pickCause('STOOD ON THE VERY EDGE')); return; }
    if (Math.abs(G.lean) > 1.35) { fail(pickCause('LEANED TOO FAR INTO THE VOID')); return; }
  }

  function addCause(name, amount) {
    if (!(amount > 0)) return;
    G.cause[name] = (G.cause[name] || 0) + amount;
  }
  function pickCause(fallback) {
    var best = fallback, bestV = 0;
    for (var k in G.cause) if (G.cause[k] > bestV) { bestV = G.cause[k]; best = k; }
    // platform-specific flavour wins over the generic leaning entry
    if (G.tier >= 4 && G.cause['BLOWN AWAY BY A MINI FAN'] > bestV * 0.35) best = 'BLOWN AWAY BY A MINI FAN';
    if (G.tier >= 3 && G.cause['SLIPPED ON A SPINNING DECK'] > bestV * 0.45) best = 'SLIPPED ON A SPINNING DECK';
    if (G.tier >= 5 && G.cause['LAUNCHED BY THE SPRING'] > bestV * 0.5) best = 'LAUNCHED BY THE SPRING';
    if (G.tier >= 2 && G.cause['LEFT BEHIND BY THE SLIDING FLOOR'] > bestV * 0.5) best = 'LEFT BEHIND BY THE SLIDING FLOOR';
    return best;
  }

  /* =========================================================
     8. the flail save
     ========================================================= */
  function trySave() {
    if (G.mode !== 'playing' || G.saveCd > 0) { A.sfx('click'); return; }
    var dir = G.lean >= 0 ? 1 : -1;
    var power = 2.4 + Math.abs(G.lean) * 2.6;

    G.leanVel -= dir * power;
    G.lean -= dir * 0.18;
    G.vsx -= Math.sign(G.sx) * 0.55;
    G.saveCd = SAVE_COOLDOWN;
    G.saveT = 0;
    G.saves++;
    G.score += SAVE_BONUS;

    char.setState('save');
    char.setPose('EPIC_SAVE', 16);
    char.joltGlasses(-1.5);
    char.joltBody(-dir * 0.35);
    addShake(0.22);
    A.sfx('save', { pitch: Math.min(14, G.saves * 2) });
    fxRing(new T.Vector3(worldPlatformX() + G.sx, SURFACE_Y + 0.05, G.sz), 0xffce58, 2.6, 0.5);
    fxBurst(new T.Vector3(worldPlatformX() + G.sx, SURFACE_Y + 0.9, G.sz), 0xffe9a8, 12);
    showBadge('FLAIL SAVE! <b>+' + SAVE_BONUS + '</b>');
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) { } }
  }

  function showBadge(html) {
    el.saveBadge.innerHTML = html;
    el.saveBadge.classList.add('show');
    clearTimeout(showBadge._t);
    showBadge._t = setTimeout(function () { el.saveBadge.classList.remove('show'); }, 900);
  }

  /* =========================================================
     9. failure + results
     ========================================================= */
  function fail(reason) {
    if (G.mode !== 'playing') return;
    G.mode = 'falling';
    G.fallTimer = 0;
    G.lastCause = reason || 'UNEXPLAINED';

    A.sfx('fail');
    A.setDanger(0);
    A.setWind(0);
    A.setIntensity(0);
    addShake(0.5);
    flash();

    // detach from the deck so the tumble is genuinely free
    var wp = new T.Vector3();
    char.root.getWorldPosition(wp);
    scene.attach(char.root);
    char.root.position.copy(wp);

    var comX = G.sx + COM_H * Math.sin(G.lean);
    var dir = comX >= 0 ? 1 : -1;
    var spin = world.kin.yaw();
    G.fall = {
      vx: Math.cos(spin) * dir * (1.1 + Math.abs(G.leanVel) * 0.55),
      vz: -Math.sin(spin) * dir * (1.1 + Math.abs(G.leanVel) * 0.55),
      vy: 2.35,
      wz: dir * (2.6 + Math.abs(G.leanVel) * 1.4),
      wx: (Math.random() - 0.5) * 3.2
    };

    char.setState('fall');
    char.setPose('FALL', 9);
    char.joltGlasses(-2.2);
    el.dangerTrack.classList.remove('show');

    // FX: sand-bag puff
    fxBurst(new T.Vector3(wp.x, wp.y + 0.6, wp.z), 0xffffff, 16);
  }

  function updateFall(dt) {
    var f = G.fall;
    if (!f) return;
    G.fallTimer += dt;

    f.vy -= 15.5 * dt;
    char.root.position.x += f.vx * dt;
    char.root.position.y += f.vy * dt;
    char.root.position.z += f.vz * dt;
    char.root.rotation.x += f.wx * dt;
    char.root.rotation.z += f.wz * dt;

    resolveDeckCollision();

    if (char.root.position.y < -4.5) {
      char.root.visible = false;
    }
    if (G.fallTimer > 1.5) showResults();
  }

  /* keeps the tumbling egg from passing through the deck */
  var _tmpV = new T.Vector3(), _tmpV2 = new T.Vector3();
  function resolveDeckCollision() {
    world.platform.updateMatrixWorld(true);
    var pts = [0.0, 0.95];
    for (var i = 0; i < pts.length; i++) {
      char.root.localToWorld(_tmpV.set(0, pts[i], 0));
      _tmpV2.copy(_tmpV);
      world.platform.worldToLocal(_tmpV2);
      var r = 0.17;
      var e = Math.sqrt((_tmpV2.x / DECK_RX) * (_tmpV2.x / DECK_RX) + (_tmpV2.z / DECK_RZ) * (_tmpV2.z / DECK_RZ));
      if (e < 1.0 && _tmpV2.y - r < SURFACE_Y) {
        var push = (SURFACE_Y + r) - _tmpV2.y;
        _tmpV2.y += push;
        world.platform.localToWorld(_tmpV2);
        char.root.position.add(_tmpV2.sub(_tmpV));
        if (G.fall.vy < 0) {
          G.fall.vy = Math.abs(G.fall.vy) * 0.34;
          A.sfx('thud');
          addShake(0.14);
          if (G.fallTimer < 1.2) G.fallTimer = 1.25;
        }
      }
    }
  }

  function showResults() {
    G.mode = 'over';
    A.stopMusic();

    var t = G.time;
    G.newRecord = t > save.bestTime;
    if (G.newRecord) save.bestTime = t;
    if (G.score > save.bestScore) save.bestScore = Math.floor(G.score);
    save.runs = (save.runs || 0) + 1;
    persist();

    el.overTime.textContent = t.toFixed(1) + 's';
    el.overScore.textContent = Math.floor(G.score);
    el.overBestTime.textContent = save.bestTime.toFixed(1) + 's';
    el.overBestScore.textContent = save.bestScore;
    el.overBlunder.textContent = G.lastCause;
    el.overTitle.textContent = G.newRecord ? 'NEW PERSONAL BEST' : 'RUN OVER';
    el.overRecord.classList.toggle('hidden', !G.newRecord);
    if (G.newRecord) A.sfx('record');

    var nl = nextLocked(save.bestTime);
    if (nl) {
      el.nextUnlockBox.classList.remove('hidden');
      el.allUnlockedBox.classList.add('hidden');
      el.nextUnlockName.textContent = nl.item.name;
      var prev = 0;
      for (var i = 0; i < UNLOCKS.length; i++) if (UNLOCKS[i].req <= nl.item.req && UNLOCKS[i].req > prev) prev = UNLOCKS[i].req;
      var pct = nl.item.req <= 0 ? 100 : Math.max(0, Math.min(100, ((save.bestTime - prev) / (nl.item.req - prev)) * 100));
      el.nextUnlockFill.style.width = pct + '%';
      el.nextUnlockGap.textContent = nl.gap > 0.05
        ? nl.gap.toFixed(1) + 's TO GO'
        : 'READY · PLAY A RUN TO CLAIM IT';
    } else {
      el.nextUnlockBox.classList.add('hidden');
      el.allUnlockedBox.classList.remove('hidden');
    }

    refreshMenuStats();
    setScreen('over');
  }

  /* =========================================================
     10. per-frame game update
     ========================================================= */
  function updateGame(dt) {
    if (G.mode !== 'playing') return;

    G.stateT += dt;
    G.time += dt;
    G.score += dt * 10;

    /* unlock announcements mid-run */
    checkUnlocks(G.time);

    /* difficulty tier */
    var tier = world.tierAt(G.time);
    if (tier !== G.tier) {
      G.tier = tier;
      world.setTier(tier);
      var info = world.tierInfo(tier);
      el.hazardName.textContent = info.name;
      el.hazardToast.classList.add('show');
      clearTimeout(updateGame._toast);
      updateGame._toast = setTimeout(function () { el.hazardToast.classList.remove('show'); }, 1700);
      A.sfx(tier >= 4 ? 'fan' : (tier >= 1 ? 'bounce' : 'milestone'));
      A.setIntensity(tier);
    }

    /* input smoothing for a weighty feel */
    G.inputTarget += (G.input - G.inputTarget) * Math.min(1, dt * 16);

    /* cooldowns */
    if (G.saveCd > 0) G.saveCd = Math.max(0, G.saveCd - dt);
    G.saveT += dt;

    stepPhysics(dt);

    /* music intensity follows survival time */
    A.setIntensity(Math.min(5, Math.floor(G.time / 9)));

    /* hint fades once the player has had a moment */
    if (G.time > 3.6 && !el.hint.classList.contains('fade')) el.hint.classList.add('fade');

    /* audio feedback tied to real events */
    A.setDanger(G.danger);
    A.setWind(G.tier >= 4 ? G.danger * 0.8 + 0.15 : 0);

    /* pose selection */
    updateCharacter(dt);

    /* position on deck */
    char.root.position.set(G.sx, 0, G.sz);

    /* HUD */
    if (!simQuiet) {
      el.hudTime.textContent = G.time.toFixed(1);
      el.hudScore.textContent = Math.floor(G.score);
      el.hudTime.classList.toggle('hot', G.danger > 0.72);
      var pct = Math.min(50, G.danger * 50);
      el.dangerFill.style.width = pct + '%';
      el.dangerTrack.classList.toggle('critical', G.danger > 0.7);
      el.dangerTrack.classList.toggle('show', G.time > 0.5);
      var ready = G.saveCd <= 0;
      el.saveMeterFill.style.width = (ready ? 100 : (1 - G.saveCd / SAVE_COOLDOWN) * 100) + '%';
      el.saveMeter.classList.toggle('cooling', !ready);
      el.saveMeter.classList.toggle('ready', ready);
      el.hudBest.textContent = save.bestTime.toFixed(1);
    }

    /* milestone ticks */
    var sec = Math.floor(G.time);
    if (sec !== updateGame._lastSec) {
      updateGame._lastSec = sec;
      if (sec > 0 && sec % 5 === 0) A.sfx('tick');
    }
  }

  function updateCharacter(dt) {
    var state;
    if (G.danger > 0.55 || G.slip > 0.25) state = 'slip';
    else if (G.saveT < 0.55) state = 'save';
    else if (G.danger > 0.16) state = 'wobble';
    else state = 'confident';

    if (state === 'slip') char.setPose('SLIP', 9);
    else if (state === 'save') { /* pose already punched in trySave */ }
    else if (state === 'wobble') char.setPose('WOBBLE', 6);
    else char.setPose(save.pose, 3.2);

    char.setState(state);

    // positive lean = centre of mass drifting towards +X, and a positive
    // rotation.z tips the egg towards -X, hence the negation
    char.parts.tilt.rotation.z = -G.lean;
    char.parts.tilt.rotation.x = G.sz * 0.30;

    char.contactShadow.position.set(G.sx, 0, G.sz);
    var sh = Math.max(0.35, 1 - G.danger * 0.35);
    char.contactShadow.scale.setScalar(sh);
    char.contactShadow.material.opacity = 0.9 * sh;

    char.update({
      dt: dt,
      state: state,
      lean: G.lean,
      leanVel: G.leanVel,
      danger: G.danger,
      slideZ: G.sz,
      grounded: true,
      airTime: world.kin.bounceY() > 0.02 ? 0.1 : 0,
      saveT: G.saveT
    });

    /* squeaking shoes while slipping */
    if (G.slip > 0.4 && !updateCharacter._squeak) {
      updateCharacter._squeak = true;
      A.sfx('slip');
      setTimeout(function () { updateCharacter._squeak = false; }, 700);
    }
  }

  /* =========================================================
     11. camera
     ========================================================= */
  function updateCamera(dt) {
    var targetDist = camState.dist;
    if (G.mode === 'falling') targetDist = camState.dist * 1.14;
    camState.z += (targetDist - camState.z) * Math.min(1, dt * 3);

    var fx = 0;
    if (G.mode === 'playing' || G.mode === 'falling') {
      var wp = _tmpV.set(0, 0, 0);
      char.root.getWorldPosition(wp);
      fx = wp.x;
    } else if (G.mode === 'menu' || G.mode === 'appearance' || G.mode === 'boot') {
      camState.menuOrbit += dt * 0.22;
      fx = Math.sin(camState.menuOrbit) * 0.10;
    }

    var followX = fx * 0.32;
    camState.x += (followX - camState.x) * Math.min(1, dt * 2.6);

    /* shake */
    camState.shake *= Math.pow(0.0025, dt);
    if (camState.shake < 0.0005) camState.shake = 0;
    camState.shakeSeed += dt * 42;
    var sx = Math.sin(camState.shakeSeed * 1.7) * camState.shake;
    var sy = Math.cos(camState.shakeSeed * 2.3) * camState.shake;

    var baseY = G.mode === 'falling' ? 1.85 : 2.15;
    var baseZ = camState.z;
    var menuZ = baseZ + (G.mode === 'menu' || G.mode === 'appearance' ? 0.35 : 0);

    camera.position.set(
      camState.x + sx,
      baseY + sy + (G.mode === 'menu' ? 0.12 : 0),
      menuZ
    );

    var lookY = (G.mode === 'falling' ? 1.15 : 1.32) + sy * 0.4;
    camera.lookAt(camState.x * 0.42 + sx * 0.6, lookY, 0);

    /* gentle FOV breathing keeps the frame alive */
    var fov = 50 + Math.sin(clock.elapsed * 0.31) * 0.7 + camState.shake * 40;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  function addShake(v) { camState.shake = Math.min(0.5, camState.shake + v); }

  function flash() {
    el.flash.classList.add('on');
    setTimeout(function () { el.flash.classList.remove('on'); }, 40);
  }

  /* =========================================================
     12. screens
     ========================================================= */
  function setScreen(name) {
    el.boot.classList.toggle('active', name === 'boot');
    el.menu.classList.toggle('active', name === 'menu');
    el.pause.classList.toggle('active', name === 'pause');
    el.over.classList.toggle('active', name === 'over');
    el.appearance.classList.toggle('active', name === 'appearance');
    el.hud.style.opacity = (name === 'playing' || name === 'pause' || name === 'falling') ? '1' : '0';
    el.hud.style.transition = 'opacity .3s ease';
    el.hud.classList.toggle('hud-inert', !(name === 'playing' || name === 'pause'));
  }

  function startRun() {
    A.unlock();
    A.sfx('start');
    A.startMusic();
    A.setIntensity(0);
    resetRun();
    G.mode = 'playing';
    updateGame._lastSec = 0;
    el.hint.classList.remove('fade');
    char.root.visible = true;
    char.contactShadow.visible = true;
    setScreen('playing');
    refreshMenuStats();
  }

  function goMenu() {
    A.stopMusic();
    A.silence();
    G.mode = 'menu';
    resetRun();
    char.setPose(save.pose, 2.2);
    char.setState('confident');
    setScreen('menu');
    refreshMenuStats();
  }

  function pauseRun() {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    el.pauseTime.textContent = G.time.toFixed(1) + 's';
    el.pauseScore.textContent = Math.floor(G.score);
    A.silence();
    setScreen('pause');
  }

  function resumeRun() {
    if (G.mode !== 'paused') return;
    G.mode = 'playing';
    setScreen('playing');
    A.startMusic();
  }

  function showAppearance() {
    G.mode = 'appearance';
    renderWardrobe();
    setScreen('appearance');
    A.sfx('click');
  }

  /* =========================================================
     13. wardrobe
     ========================================================= */
  var wardrobeTab = 'suits';
  var TAB_TYPES = { suits: 'suit', shades: 'shades', poses: 'pose' };
  function renderWardrobe() {
    var grid = el.wardrobeGrid;
    grid.innerHTML = '';
    var list = UNLOCKS.filter(function (u) { return u.type === TAB_TYPES[wardrobeTab]; });

    list.forEach(function (u) {
      var owned = isUnlocked(u.id);
      var equipped = (u.type === 'suit' && save.suit === u.key)
        || (u.type === 'shades' && save.shades === u.key)
        || (u.type === 'pose' && save.pose === u.key);

      var card = document.createElement('button');
      card.className = 'card' + (owned ? '' : ' locked') + (equipped ? ' equipped' : '');
      card.type = 'button';

      var sw = document.createElement('div');
      sw.className = 'swatch' + (u.type === 'shades' ? ' glasses' : (u.type === 'pose' ? ' pose' : ''));
      if (u.type === 'suit') {
        var c = window.EggCharacter.SUITS[u.key];
        sw.style.background = 'linear-gradient(160deg,#' + hex(c.suit) + ',#' + hex(c.dark) + ')';
      } else if (u.type === 'shades') {
        var s2 = window.EggCharacter.SHADES[u.key];
        sw.style.background = 'linear-gradient(160deg,#' + hex(s2.frame) + ',#' + hex(s2.lens) + ')';
      }
      card.appendChild(sw);

      var nm = document.createElement('span');
      nm.className = 'card-name';
      nm.textContent = u.name;
      card.appendChild(nm);

      var req = document.createElement('span');
      req.className = 'card-req';
      req.textContent = u.req > 0 ? ('SURVIVE ' + u.req + 's') : 'DEFAULT';
      card.appendChild(req);

      if (!owned) {
        var lk = document.createElement('div');
        lk.className = 'card-lock';
        lk.textContent = 'LOCKED';
        card.appendChild(lk);
      }

      card.addEventListener('click', function () {
        if (!owned) { A.sfx('back'); return; }
        if (u.type === 'suit') save.suit = u.key;
        if (u.type === 'shades') save.shades = u.key;
        if (u.type === 'pose') save.pose = u.key;
        persist();
        applyLook();
        char.setPose(save.pose, 3.0);
        A.sfx('click');
        renderWardrobe();
        refreshMenuStats();
      });

      grid.appendChild(card);
    });
  }
  function hex(n) { return ('000000' + n.toString(16)).slice(-6); }

  function applyLook() {
    if (char) char.setLook(save.suit, save.shades);
  }

  /* =========================================================
     14. unlocks mid-run
     ========================================================= */
  function checkUnlocks(t) {
    for (var i = 0; i < UNLOCKS.length; i++) {
      var u = UNLOCKS[i];
      if (u.req > 0 && !isUnlocked(u.id) && t >= u.req) {
        save.unlocked[u.id] = 1;
        // keep the best time in sync so a quit right after still counts
        if (t > save.bestTime) save.bestTime = t;
        persist();
        A.sfx('unlock');
        showBadge('UNLOCKED · ' + u.name);
        if (navigator.vibrate) { try { navigator.vibrate([10, 40, 14]); } catch (e) { } }
        refreshMenuStats();
      }
    }
  }

  /* =========================================================
     15. menu stats + toggles
     ========================================================= */
  function refreshMenuStats() {
    el.menuBestTime.textContent = save.bestTime.toFixed(1) + 's';
    el.menuBestScore.textContent = save.bestScore;
    el.menuUnlockCount.textContent = unlockCount() + '/' + UNLOCKS.length + ' UNLOCKED';
    el.hudBest.textContent = save.bestTime.toFixed(1);
  }

  function syncToggles() {
    [el.btnMusic, el.btnMusic2].forEach(function (b) {
      if (!b) return;
      b.classList.toggle('on', save.music);
      b.querySelector('.toggle-text').textContent = 'MUSIC ' + (save.music ? 'ON' : 'OFF');
    });
    [el.btnSfx, el.btnSfx2].forEach(function (b) {
      if (!b) return;
      b.classList.toggle('on', save.sfx);
      b.querySelector('.toggle-text').textContent = 'SFX ' + (save.sfx ? 'ON' : 'OFF');
    });
  }

  function toggleMusic() {
    A.unlock();
    save.music = !save.music;
    A.setMusicOn(save.music);
    if (save.music && (G.mode === 'playing')) A.startMusic();
    persist(); syncToggles(); A.sfx('click');
  }
  function toggleSfx() {
    A.unlock();
    save.sfx = !save.sfx;
    A.setSfxOn(save.sfx);
    persist(); syncToggles();
    if (save.sfx) A.sfx('click');
  }

  /* =========================================================
     16. input
     ========================================================= */
  var touch = { id: null, x0: 0, x: 0, t0: 0, moved: 0, tapTimer: null, firedSave: false };
  var DRAG_RANGE = 62;

  function onDown(id, x, y) {
    A.unlock();
    if (G.mode !== 'playing') return;
    touch.id = id; touch.x0 = x; touch.x = x;
    touch.t0 = performance.now(); touch.moved = 0; touch.firedSave = false;
    clearTimeout(touch.tapTimer);
    touch.tapTimer = setTimeout(function () {
      if (touch.id === id && touch.moved < 14 && !touch.firedSave) {
        touch.firedSave = true;
        trySave();
      }
    }, 165);
  }
  function onMove(id, x, y) {
    if (touch.id !== id || G.mode !== 'playing') return;
    touch.x = x;
    touch.moved = Math.max(touch.moved, Math.abs(x - touch.x0));
    if (touch.moved > 14) { touch.firedSave = true; clearTimeout(touch.tapTimer); }
    var v = (x - touch.x0) / DRAG_RANGE;
    G.input = Math.max(-1, Math.min(1, v));
  }
  function onUp(id) {
    if (touch.id !== id) return;
    clearTimeout(touch.tapTimer);
    touch.id = null;
    G.input = 0;
  }

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    onDown(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    onMove(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  ['touchend', 'touchcancel'].forEach(function (ev) {
    canvas.addEventListener(ev, function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      onUp(t.identifier);
    }, { passive: false });
  });

  canvas.addEventListener('mousedown', function (e) { onDown('m', e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { onMove('m', e.clientX, e.clientY); });
  window.addEventListener('mouseup', function () { onUp('m'); });

  /* keyboard (also handy on desktop) */
  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') { A.unlock(); if (G.mode === 'playing') trySave(); e.preventDefault(); }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (G.mode === 'playing') pauseRun(); else if (G.mode === 'paused') resumeRun(); }
    if (e.code === 'Enter') {
      if (G.mode === 'menu') startRun();
      else if (G.mode === 'over') startRun();
    }
    updateKeys();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; updateKeys(); });
  function updateKeys() {
    var v = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) v -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) v += 1;
    if (touch.id === null) G.input = v;
  }

  /* =========================================================
     17. wiring
     ========================================================= */
  function bind(id, fn) { var e2 = $(id); if (e2) e2.addEventListener('click', function (ev) { ev.preventDefault(); fn(); }); }

  bind('btnPlay', startRun);
  bind('btnAppearanceMenu', showAppearance);
  bind('btnAppearanceOver', showAppearance);
  bind('btnAppearanceBack', function () { A.sfx('back'); if (save.bestTime > 0 && G.mode === 'appearance') { } afterAppearance(); });
  bind('btnPause', pauseRun);
  bind('btnResume', resumeRun);
  bind('btnRestartPause', function () { A.sfx('click'); startRun(); });
  bind('btnMenuPause', function () { A.sfx('back'); goMenu(); });
  bind('btnRetry', startRun);
  bind('btnMenuOver', function () { A.sfx('back'); goMenu(); });
  bind('btnMusic', toggleMusic);
  bind('btnMusic2', toggleMusic);
  bind('btnSfx', toggleSfx);
  bind('btnSfx2', toggleSfx);

  var cameFromOver = false;
  function afterAppearance() {
    if (cameFromOver) { setScreen('over'); G.mode = 'over'; }
    else { goMenu(); }
  }

  ['btnAppearanceMenu', 'btnAppearanceOver'].forEach(function (id) {
    var b = $(id);
    if (b) b.addEventListener('click', function () {
      cameFromOver = (id === 'btnAppearanceOver');
    });
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      wardrobeTab = tab.getAttribute('data-tab');
      A.sfx('click');
      renderWardrobe();
    });
  });

  /* =========================================================
     18. main loop
     ========================================================= */
  function loop(now) {
    requestAnimationFrame(loop);
    var t = now * 0.001;
    var dt = clock.last ? Math.min(0.05, t - clock.last) : 0.016;
    clock.last = t;
    clock.elapsed += dt;
    clock.frames++;

    if (!webglOK) return;

    var worldTime = (G.mode === 'playing' || G.mode === 'paused') ? G.time : clock.elapsed;
    if (G.mode !== 'paused') world.update(dt, worldTime);

    switch (G.mode) {
      case 'boot':
      case 'menu':
      case 'appearance':
        idleCharacter(dt);
        break;
      case 'playing':
        updateGame(dt);
        break;
      case 'paused':
        break;
      case 'falling':
        G.stateT += dt;
        char.setState('fall');
        char.update({ dt: dt, state: 'fall', lean: 0, leanVel: G.leanVel, danger: 0, grounded: false, airTime: G.stateT });
        char.parts.tilt.rotation.z += (0 - char.parts.tilt.rotation.z) * Math.min(1, dt * 2);
        updateFall(dt);
        applyLook();
        break;
      case 'over':
        char.setState('fall');
        char.update({ dt: dt, state: 'fall', lean: 0, leanVel: 0, danger: 0, grounded: false, airTime: 2 });
        break;
    }

    updateFX(dt);
    updateCamera(dt);
    A.update();

    renderer.render(scene, camera);
  }

  function idleCharacter(dt) {
    char.parts.tilt.rotation.z = Math.sin(clock.elapsed * 0.5) * -0.035;
    char.parts.tilt.rotation.x = Math.cos(clock.elapsed * 0.37) * 0.02;
    char.root.position.set(Math.sin(clock.elapsed * 0.5) * 0.02, 0, 0);
    char.contactShadow.position.set(char.root.position.x, 0, 0);
    char.contactShadow.material.opacity = 0.9;
    char.setState('confident');
    char.update({
      dt: dt, state: 'confident', lean: -char.parts.tilt.rotation.z,
      leanVel: 0, danger: 0.05, slideZ: 0, grounded: true, airTime: 0
    });
    applyLook();
  }

  /* =========================================================
     19. boot
     ========================================================= */
  function boot() {
    var steps = [
      'Polishing the sunglasses…',
      'Ironing a very small suit…',
      'Calibrating the wobble…',
      'Hiring two mini fans…',
      'Warming up the spring…'
    ];
    var p = 0, si = 0, finished = false;
    function finishBoot() {
      if (finished || !webglOK) return;
      finished = true;
      p = 100;
      el.bootFill.style.width = '100%';
      setScreen('menu');
      goMenu();
    }
    var iv = setInterval(function () {
      p += 14 + Math.random() * 16;
      if (p > 100) p = 100;
      el.bootFill.style.width = p + '%';
      var ns = Math.min(steps.length - 1, Math.floor(p / 20));
      if (ns !== si) { si = ns; el.bootNote.textContent = steps[si]; }
      if (p >= 100) {
        clearInterval(iv);
        setTimeout(finishBoot, 220);
      }
    }, 70);

    var ok = initGL();
    if (!ok) {
      el.bootNote.textContent = 'THIS DEVICE CANNOT RUN WEBGL. TRY ANOTHER BROWSER.';
      webglOK = false;
      return;
    }
    /* Safety net: if timers are throttled (background tab) we still reach the menu. */
    setTimeout(finishBoot, 3200);

    A.setMusicOn(save.music);
    A.setSfxOn(save.sfx);
    syncToggles();
    refreshMenuStats();
    setScreen('boot');
    resetRun();
    G.mode = 'boot';
    char.setPose(save.pose, 1);
    requestAnimationFrame(loop);
  }

  /* =========================================================
     20. QA / automation surface
     ========================================================= */
  window.EGG = {
    state: function () {
      return {
        mode: G.mode,
        frames: clock.frames,
        time: G.time,
        score: Math.floor(G.score),
        lean: G.lean,
        leanVel: G.leanVel,
        sx: G.sx,
        sz: G.sz,
        grounded: G.grounded,
        danger: G.danger,
        slip: G.slip,
        tier: world.tierAt(G.time),
        best: save.bestTime,
        bestScore: save.bestScore,
        unlocks: Object.keys(save.unlocked || {}).length,
        errors: window.__eggErrors || []
      };
    },
    start: function () { startRun(); },
    pause: function () { pauseRun(); },
    menu: function () { goMenu(); },
    save: function () { return trySave(); },
    forceFail: function (reason) { if (G.mode === 'playing') fail(reason || 'QA FORCE FAIL'); },
    setInput: function (v) { G.input = Math.max(-1, Math.min(1, v || 0)); },
    setTier: function (n) { world.setTier(n); },
    setTime: function (t) { G.time = t; },
    skipBoot: function () { goMenu(); },
    /* Deterministic headless run used for tuning.
       controller: 'auto' (stabilising controller) | 'none'
       opts: { kp, kd, kx, kphi } gains, { quiet } skips DOM work for faster sweeps */
    sim: function (seconds, controller, opts) {
      opts = opts || {};
      var dt = 1 / 60;
      var steps = Math.round((seconds || 20) * 60);
      var trace = [];
      var backup = JSON.stringify(save);
      simQuiet = !!opts.quiet;

      resetRun();
      G.mode = 'playing';
      G.time = 0;
      world.setTier(0);

      var kp = opts.kp != null ? opts.kp : 4;
      var kvx = opts.kvx != null ? opts.kvx : 0.18;
      /* human stand-in: the controller sees a delayed snapshot of the world */
      var lagFrames = Math.max(0, Math.round((opts.lag || 0) * 60));
      var hist = [];

      for (var i = 0; i < steps; i++) {
        var u = 0;
        if (controller === 'auto') {
          /* drive the centre of mass back over the middle of the deck.
             comXdot includes the lean rate, so the controller anticipates
             the body lag instead of fighting it. */
          var comX = G.sx + COM_H * Math.sin(G.lean);
          var comXd = G.vsx + COM_H * Math.cos(G.lean) * G.leanVel;
          if (lagFrames > 0 && i >= lagFrames) {
            comX = hist[i - lagFrames].comX;
            comXd = hist[i - lagFrames].comXd;
          }
          u = -kp * comX - kvx * comXd;
          u = Math.max(-1, Math.min(1, u));
          hist[i] = { comX: G.sx + COM_H * Math.sin(G.lean), comXd: comXd };
        } else if (controller === 'oracle') {
          /* diagnostic controller: cancels the deck tilt exactly, then PD on comX.
             Used to prove the plant is controllable at all. */
          var phi = world.kin.tilt();
          var a0 = 9.81 * SLOPE_FOOT * Math.sin(phi); // feed-forward against the tilt
          var cX = G.sx + COM_H * Math.sin(G.lean);
          var cXd = G.vsx + COM_H * Math.cos(G.lean) * G.leanVel;
          var want = a0 - (kp * cX + kvx * cXd);
          u = Math.max(-1, Math.min(1, want / MAX_FOOT_ACC));
        }
        G.input = u;
        var before = { sx: G.sx, lean: G.lean, danger: G.danger, tier: G.tier };
        world.update(dt, G.time);
        updateGame(dt);
        if (!opts.quiet && i % 20 === 0) {
          trace.push({
            t: +G.time.toFixed(2), sx: +before.sx.toFixed(3), lean: +before.lean.toFixed(3),
            vel: +G.leanVel.toFixed(2), danger: +before.danger.toFixed(2), u: +u.toFixed(2), tier: before.tier
          });
        }
        if (G.mode !== 'playing') break;
      }

      var out = { survived: +G.time.toFixed(2), endMode: G.mode, cause: G.lastCause, samples: trace.length, trace: trace };
      simQuiet = false;

      var restored = JSON.parse(backup);
      for (var kk in restored) if (restored.hasOwnProperty(kk)) save[kk] = restored[kk];
      persist();
      resetRun();
      G.mode = 'menu';
      setScreen('menu');
      return out;
    },
    /* read or write the physics tunables (handy for sweeping feel parameters) */
    tune: function (o) {
      if (o) {
        if (o.COM_H != null) COM_H = o.COM_H;
        if (o.RESTORE != null) RESTORE = o.RESTORE;
        if (o.DAMP != null) DAMP = o.DAMP;
        if (o.LEAN_V != null) LEAN_V = o.LEAN_V;
        if (o.LEAN_A != null) LEAN_A = o.LEAN_A;
        if (o.SLOPE_GAIN != null) SLOPE_GAIN = o.SLOPE_GAIN;
        if (o.SLOPE_FOOT != null) SLOPE_FOOT = o.SLOPE_FOOT;
        if (o.MAX_FOOT_SPEED != null) MAX_FOOT_SPEED = o.MAX_FOOT_SPEED;
        if (o.MAX_FOOT_ACC != null) MAX_FOOT_ACC = o.MAX_FOOT_ACC;
        if (o.WIND_K != null) WIND_K = o.WIND_K;
      }
      return {
        COM_H: COM_H, RESTORE: RESTORE, DAMP: DAMP, LEAN_V: LEAN_V, LEAN_A: LEAN_A,
        SLOPE_GAIN: SLOPE_GAIN, SLOPE_FOOT: SLOPE_FOOT, MAX_FOOT_SPEED: MAX_FOOT_SPEED,
        MAX_FOOT_ACC: MAX_FOOT_ACC, WIND_K: WIND_K
      };
    }
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
  else window.addEventListener('DOMContentLoaded', boot);
})();
