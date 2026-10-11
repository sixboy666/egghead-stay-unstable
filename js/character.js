/* ============================================================
   EGGHEAD: STAY UNSTABLE — character model, rig and animation
   A fully procedural, connected mesh hierarchy (no floating parts):
   feet -> legs -> hips -> torso -> shoulders -> arms -> hands,
   plus an egg head carrying the trademark sunglasses.
   Every joint is a parented pivot, so nothing can detach, snap or
   intersperse, no matter how silly the motion gets.
   ============================================================ */
(function (global) {
  'use strict';

  var T = global.THREE;

  /* ---------------- proportion constants ---------------- */
  var HIP_Y = 0.69;          // hip height above the platform (feet land exactly on y=0)
  var THIGH_L = 0.32;
  var SHIN_L = 0.32;
  var BODY_H = 0.58;
  var BODY_R = 0.245;
  var HEAD_H = 0.56;
  var HEAD_R = 0.235;
  var HEAD_PIVOT_Y = 0.62;   // relative to hip pivot
  var SHOULDER_Y = 0.40;
  var SHOULDER_X = 0.215;
  var UPPER_ARM = 0.23;
  var FORE_ARM = 0.20;

  var SEG = 24;

  /* ---------------- looks ---------------- */
  var SUITS = {
    onyx:     { name: 'ONYX SUIT',      suit: 0x242a3d, dark: 0x1b2032, tie: 0x4a5a86, shirt: 0xf2eee2, lamp: 0x2f3750 },
    cobalt:   { name: 'COBALT SUIT',    suit: 0x2a4a94, dark: 0x1e356d, tie: 0xd8e4ff, shirt: 0xf4f7ff, lamp: 0x36569f },
    rose:     { name: 'ROSE SUIT',      suit: 0xa8455c, dark: 0x7d3145, tie: 0xffe1e6, shirt: 0xfdf3f2, lamp: 0xb85a6f },
    mint:     { name: 'MINT SUIT',      suit: 0x2f8f7b, dark: 0x226b5c, tie: 0xe6fff8, shirt: 0xf2fffb, lamp: 0x3fae95 },
    gold:     { name: 'GOLD SUIT',      suit: 0xc79a34, dark: 0x9b7522, tie: 0xfff4d2, shirt: 0xfffbf0, lamp: 0xd9ad46 },
    midnight: { name: 'MIDNIGHT SUIT',  suit: 0x141726, dark: 0x0d0f1b, tie: 0x66e3c4, shirt: 0xe8e6de, lamp: 0x232a44 }
  };

  var SHADES = {
    classic: { name: 'CLASSIC BLACK', lens: 0x14161f, frame: 0x0b0c12, metal: 0 },
    amber:   { name: 'HAZARD AMBER',  lens: 0x7a3f04, frame: 0x1a1409, metal: 0.15 },
    rose:    { name: 'ROSE TINT',     lens: 0x8a2f4a, frame: 0x1c1016, metal: 0.15 },
    chrome:  { name: 'CHROMED OUT',   lens: 0x6d7f96, frame: 0xb9c4d6, metal: 0.75 },
    neon:    { name: 'NEON CYAN',     lens: 0x0d6f77, frame: 0x0a2a30, metal: 0.2 }
  };

  /* ---------------- material helper ---------------- */
  function mat(color, rough, metal, extra) {
    var m = new T.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.74 : rough,
      metalness: metal == null ? 0.04 : metal
    });
    if (extra) for (var k in extra) m[k] = extra[k];
    return m;
  }

  /* ---------------- geometry helpers ---------------- */
  function eggGeometry(radius, height, depthScale) {
    var pts = [], n = 20, i;
    for (i = 0; i <= n; i++) {
      var t = i / n, u = t * 2 - 1;
      var r = radius * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.17 * u);
      pts.push(new T.Vector2(Math.max(0.0008, r), t * height));
    }
    pts[0].x = 0.0008; pts[n].x = 0.0008;
    var g = new T.LatheGeometry(pts, SEG);
    g.translate(0, -height / 2, 0);
    if (depthScale && depthScale !== 1) g.scale(1, 1, depthScale);
    g.computeVertexNormals();
    return g;
  }

  function capsule(radius, length, seg) {
    var g = new T.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, (seg || 12));
    g.translate(0, -length / 2, 0);
    return g;
  }

  function blob(rx, ry, rz, seg) {
    var g = new T.SphereGeometry(1, (seg || 16), (seg || 12));
    g.scale(rx, ry, rz);
    return g;
  }

  function contactShadowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var tex = new T.CanvasTexture(c);
    return tex;
  }

  /* =========================================================
     POSE LIBRARY — six signature physicalities
     ========================================================= */
  function P(o) { return o || {}; }
  var r3 = function (x, y, z) { return { r: [x || 0, y || 0, z || 0] }; };
  var rp = function (x, y, z, px, py, pz) { return { r: [x || 0, y || 0, z || 0], p: [px || 0, py || 0, pz || 0] }; };

  var POSES = {
    /* 1. confident stand */
    CONFIDENT: {
      body: r3(-0.035, 0, 0), head: r3(-0.02, 0, 0),
      armL: r3(-0.14, 0, 0.30), elbL: r3(-0.34, 0, 0.34),
      armR: r3(-0.14, 0, -0.30), elbR: r3(-0.34, 0, -0.34),
      thighL: r3(0.02, 0, 0.04), kneeL: r3(0.06, 0, 0), footL: r3(-0.04, 0, 0),
      thighR: r3(0.02, 0, -0.04), kneeR: r3(0.06, 0, 0), footR: r3(-0.04, 0, 0),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(0, 0, 0)
    },
    /* 2. slight wobble */
    WOBBLE: {
      body: r3(-0.05, 0, 0.03), head: r3(0.05, 0, -0.05),
      armL: r3(-0.28, 0, 1.02), elbL: r3(-0.52, 0, 0.42),
      armR: r3(-0.28, 0, -1.02), elbR: r3(-0.52, 0, -0.42),
      thighL: r3(-0.1, 0, 0.10), kneeL: r3(0.26, 0, 0), footL: r3(-0.14, 0, 0),
      thighR: r3(-0.1, 0, -0.10), kneeR: r3(0.26, 0, 0), footR: r3(-0.14, 0, 0),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(0.06, 0, 0)
    },
    /* 3. extreme last-second save */
    EPIC_SAVE: {
      body: r3(-0.16, 0, 0), head: r3(-0.16, 0, 0),
      armL: r3(-0.42, 0, 2.18), elbL: r3(-0.72, 0, 0.5),
      armR: r3(0.34, 0, -1.42), elbR: r3(-0.5, 0, -0.6),
      thighL: r3(-0.34, 0, 0.30), kneeL: r3(0.55, 0, 0), footL: r3(-0.22, 0, -0.1),
      thighR: r3(0.42, 0, -0.10), kneeR: r3(0.20, 0, 0), footR: r3(-0.3, 0, 0.08),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(-0.14, 0, 0)
    },
    /* 4. legs slip out from under */
    SLIP: {
      body: r3(-0.22, 0, 0), head: r3(0.22, 0, 0),
      armL: r3(-0.3, 0, 1.35), elbL: r3(-0.35, 0, 0.55),
      armR: r3(-0.3, 0, -1.35), elbR: r3(-0.35, 0, -0.55),
      thighL: r3(-1.02, 0, 0.34), kneeL: r3(0.30, 0, 0), footL: r3(-0.3, 0, -0.34),
      thighR: r3(-0.46, 0, -0.46), kneeR: r3(0.78, 0, 0), footR: r3(-0.44, 0, 0.34),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(-0.3, 0, 0)
    },
    /* 5. exaggerated face-plant tumble */
    FALL: {
      body: r3(0.35, 0, 0), head: r3(0.5, 0, 0),
      armL: r3(-0.6, 0, 2.5), elbL: r3(-0.5, 0, 1.1),
      armR: r3(0.6, 0, -2.4), elbR: r3(-0.4, 0, -1.2),
      thighL: r3(-0.8, 0, 0.55), kneeL: r3(0.9, 0, 0), footL: r3(-0.5, 0, -0.5),
      thighR: r3(0.5, 0, -0.6), kneeR: r3(0.7, 0, 0), footR: r3(-0.3, 0, 0.5),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(-0.55, 0, 0)
    },
    /* 6. scrambling back up, dignity optional */
    RESET: {
      body: r3(0.48, 0, 0), head: r3(0.30, 0, 0),
      armL: r3(1.15, 0, 0.62), elbL: r3(-0.7, 0, 0.3),
      armR: r3(1.15, 0, -0.62), elbR: r3(-0.7, 0, -0.3),
      thighL: r3(-1.05, 0, 0.26), kneeL: r3(1.42, 0, 0), footL: r3(-0.4, 0, -0.2),
      thighR: r3(-0.95, 0, -0.26), kneeR: r3(1.34, 0, 0), footR: r3(-0.4, 0, 0.2),
      hipL: r3(0, 0, 0), hipR: r3(0, 0, 0), glasses: r3(0.45, 0, 0)
    }
  };

  var JOINT_NAMES = ['body', 'head', 'glasses', 'armL', 'elbL', 'armR', 'elbR',
                     'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR'];

  function copyPose(src, dst) {
    for (var i = 0; i < JOINT_NAMES.length; i++) {
      var n = JOINT_NAMES[i];
      var s = src[n] || {}, d = dst[n];
      d.r[0] = s.r ? s.r[0] : 0; d.r[1] = s.r ? s.r[1] : 0; d.r[2] = s.r ? s.r[2] : 0;
      d.p[0] = s.p ? s.p[0] : 0; d.p[1] = s.p ? s.p[1] : 0; d.p[2] = s.p ? s.p[2] : 0;
    }
  }
  function emptyPose() {
    var o = {};
    for (var i = 0; i < JOINT_NAMES.length; i++) o[JOINT_NAMES[i]] = { r: [0, 0, 0], p: [0, 0, 0] };
    return o;
  }

  /* =========================================================
     BUILD
     ========================================================= */
  function build() {
    var root = new T.Group();          // physics transform (position / yaw / tumble)
    var tilt = new T.Group();          // whole-body lean, pivoting on the feet
    root.add(tilt);

    /* ---- materials ---- */
    var M = {
      suit: mat(0x242a3d, 0.78, 0.03),
      suitDark: mat(0x1b2032, 0.82, 0.03),
      shirt: mat(0xf2eee2, 0.62, 0.02),
      tie: mat(0x4a5a86, 0.55, 0.06),
      skin: mat(0xf6efe0, 0.58, 0.02),
      lens: mat(0x14161f, 0.22, 0.10),
      frame: mat(0x0b0c12, 0.35, 0.22),
      hair: mat(0x2a2620, 0.85, 0.02)
    };

    /* ---- torso ---- */
    var bodyPivot = new T.Group();
    bodyPivot.position.y = HIP_Y;
    tilt.add(bodyPivot);

    var bodyMesh = new T.Mesh(eggGeometry(BODY_R, BODY_H, 0.94), M.suit);
    bodyMesh.position.y = BODY_H * 0.5 + 0.02;
    bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
    bodyPivot.add(bodyMesh);

    // shirt V + tie + collar  (sits just proud of the egg surface)
    var shirtV = new T.Mesh(blob(0.085, 0.115, 0.045, 12), M.shirt);
    shirtV.position.set(0, 0.46, 0.205);
    shirtV.castShadow = true;
    bodyPivot.add(shirtV);

    var tieKnot = new T.Mesh(blob(0.042, 0.038, 0.032, 10), M.tie);
    tieKnot.position.set(0, 0.435, 0.238);
    tieKnot.castShadow = true;
    bodyPivot.add(tieKnot);

    var tie = new T.Mesh(blob(0.036, 0.135, 0.028, 10), M.tie);
    tie.position.set(0, 0.29, 0.238);
    tie.rotation.x = 0.04;
    tie.castShadow = true;
    bodyPivot.add(tie);

    // lapels
    [-1, 1].forEach(function (s) {
      var lap = new T.Mesh(blob(0.055, 0.115, 0.03, 8), M.suitDark);
      lap.position.set(0.088 * s, 0.40, 0.207);
      lap.rotation.z = -0.35 * s;
      lap.castShadow = true;
      bodyPivot.add(lap);
    });

    // buttons + belt
    [0.24, 0.155].forEach(function (y, i) {
      var b = new T.Mesh(blob(0.017, 0.017, 0.012, 8), M.suitDark);
      b.position.set(0.055, y, 0.228);
      bodyPivot.add(b);
    });
    var belt = new T.Mesh(new T.TorusGeometry(0.213, 0.022, 8, 22), M.suitDark);
    belt.position.y = 0.045;
    belt.rotation.x = Math.PI / 2;
    belt.scale.z = 1;
    bodyPivot.add(belt);

    /* ---- collar + neck ---- */
    var collar = new T.Mesh(new T.CylinderGeometry(0.105, 0.125, 0.075, 18, 1, true), M.suitDark);
    collar.position.y = 0.585;
    collar.material.side = T.DoubleSide;
    collar.castShadow = true;
    bodyPivot.add(collar);

    /* ---- head ---- */
    var headPivot = new T.Group();
    headPivot.position.y = HEAD_PIVOT_Y;
    bodyPivot.add(headPivot);

    var headMesh = new T.Mesh(eggGeometry(HEAD_R, HEAD_H, 1.02), M.skin);
    headMesh.position.y = HEAD_H * 0.5 - 0.02;
    headMesh.castShadow = true; headMesh.receiveShadow = true;
    headPivot.add(headMesh);

    // tiny hair tuft so the silhouette reads as a person
    var tuft = new T.Mesh(blob(0.075, 0.05, 0.075, 10), M.hair);
    tuft.position.set(0.03, HEAD_H - 0.015, -0.02);
    tuft.rotation.z = 0.3;
    tuft.castShadow = true;
    headPivot.add(tuft);

    // moustache (a thin, extremely serious one)
    var stache = new T.Mesh(blob(0.062, 0.014, 0.026, 10), M.hair);
    stache.position.set(0, 0.075, HEAD_R * 0.94);
    headPivot.add(stache);

    /* ---- sunglasses ---- */
    var glasses = new T.Group();
    glasses.position.set(0, 0.255, 0);
    headPivot.add(glasses);

    var lensGeo = blob(0.092, 0.058, 0.030, 14);
    [-1, 1].forEach(function (s) {
      var lens = new T.Mesh(lensGeo, M.lens);
      lens.position.set(0.098 * s, 0, HEAD_R * 0.88);
      lens.rotation.z = -0.06 * s;
      lens.castShadow = true;
      glasses.add(lens);

      var frame = new T.Mesh(new T.TorusGeometry(0.094, 0.010, 6, 18), M.frame);
      frame.position.set(0.098 * s, 0, HEAD_R * 0.895);
      frame.scale.set(1, 0.68, 1);
      frame.rotation.z = -0.06 * s;
      glasses.add(frame);

      var temple = new T.Mesh(blob(0.013, 0.019, 0.058, 8), M.frame);
      temple.position.set(0.216 * s, 0.004, HEAD_R * 0.42);
      temple.rotation.y = -0.22 * s;
      glasses.add(temple);
    });
    var bridge = new T.Mesh(blob(0.028, 0.013, 0.016, 8), M.frame);
    bridge.position.set(0, 0.006, HEAD_R * 1.02);
    glasses.add(bridge);

    /* ---- arms ---- */
    var arms = {};
    [-1, 1].forEach(function (s) {
      var key = s < 0 ? 'L' : 'R';
      var shoulder = new T.Group();
      shoulder.position.set(SHOULDER_X * s, SHOULDER_Y, 0);
      bodyPivot.add(shoulder);

      var pauldron = new T.Mesh(blob(0.088, 0.082, 0.088, 12), M.suit);
      pauldron.castShadow = true;
      shoulder.add(pauldron);

      var upper = new T.Mesh(capsule(0.068, UPPER_ARM, 12), M.suit);
      upper.castShadow = true;
      shoulder.add(upper);

      var elbow = new T.Group();
      elbow.position.y = -UPPER_ARM + 0.035;
      shoulder.add(elbow);

      var fore = new T.Mesh(capsule(0.061, FORE_ARM, 12), M.suit);
      fore.castShadow = true;
      elbow.add(fore);

      var cuff = new T.Mesh(new T.CylinderGeometry(0.062, 0.062, 0.05, 12), M.shirt);
      cuff.position.y = -FORE_ARM + 0.05;
      cuff.castShadow = true;
      elbow.add(cuff);

      var wrist = new T.Group();
      wrist.position.y = -FORE_ARM + 0.01;
      elbow.add(wrist);

      var hand = new T.Mesh(blob(0.072, 0.082, 0.062, 12), M.skin);
      hand.position.y = -0.05;
      hand.castShadow = true;
      wrist.add(hand);

      // thumb nub: keeps the hand from reading as a plain ball
      var thumb = new T.Mesh(blob(0.03, 0.028, 0.03, 8), M.skin);
      thumb.position.set(0.055 * -s, -0.045, 0.028);
      wrist.add(thumb);

      arms[key] = { shoulder: shoulder, elbow: elbow, wrist: wrist };
    });

    /* ---- legs ---- */
    var legs = {};
    [-1, 1].forEach(function (s) {
      var key = s < 0 ? 'L' : 'R';
      var hip = new T.Group();
      hip.position.set(0.105 * s, HIP_Y, 0);
      tilt.add(hip);

      var thigh = new T.Mesh(capsule(0.082, THIGH_L, 12), M.suitDark);
      thigh.castShadow = true;
      hip.add(thigh);

      var knee = new T.Group();
      knee.position.y = -THIGH_L + 0.03;
      hip.add(knee);

      var shin = new T.Mesh(capsule(0.070, SHIN_L, 12), M.suitDark);
      shin.castShadow = true;
      knee.add(shin);

      var ankle = new T.Group();
      ankle.position.y = -SHIN_L + 0.03;
      knee.add(ankle);

      var shoe = new T.Mesh(blob(0.086, 0.062, 0.135, 14), M.frame);
      shoe.position.set(0, -0.045, 0.045);
      shoe.castShadow = true; shoe.receiveShadow = true;
      ankle.add(shoe);

      var sole = new T.Mesh(blob(0.09, 0.018, 0.14, 12), M.lens);
      sole.position.set(0, -0.088, 0.045);
      ankle.add(sole);

      legs[key] = { hip: hip, knee: knee, ankle: ankle };
    });

    /* ---- soft contact shadow that always hugs the feet ---- */
    var shadow = new T.Mesh(
      new T.PlaneGeometry(1.5, 1.5),
      new T.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;

    return {
      root: root, tilt: tilt,
      bodyPivot: bodyPivot, headPivot: headPivot, glasses: glasses,
      arms: arms, legs: legs, mats: M, contactShadow: shadow
    };
  }

  /* =========================================================
     CHARACTER OBJECT
     ========================================================= */
  function create() {
    var parts = build();
    var root = parts.root;

    var pose = emptyPose();       // blended base pose
    var target = emptyPose();
    var blendRate = 6;
    var poseName = 'CONFIDENT';

    var state = 'stand';
    var time = 0;
    var sway = 0;

    /* glasses spring */
    var gOffset = 0, gVel = 0;

    /* in-between helpers */
    var joltX = 0, joltVel = 0;
    var shakeX = 0, shakeY = 0, shakeAmt = 0;

    /* runtime pose output */
    var out = emptyPose();

    var api = {
      root: root,
      parts: parts,
      contactShadow: parts.contactShadow,

      setPose: function (name, rate) {
        if (!POSES[name]) name = 'CONFIDENT';
        if (name !== poseName) {
          copyPose(POSES[name], target);
          poseName = name;
        }
        if (rate != null) blendRate = rate;
      },
      getPose: function () { return poseName; },

      setState: function (s) { state = s; },

      /* impulse on the sunglasses: they slide, then spring back */
      joltGlasses: function (amount) {
        gVel += amount;
      },
      joltBody: function (amount) {
        joltVel += amount;
      },
      shake: function (amount) {
        shakeAmt = Math.min(1, shakeAmt + amount);
      },

      /* ---- look / cosmetics ---- */
      setLook: function (suitId, shadeId) {
        var s = SUITS[suitId] || SUITS.onyx;
        var sh = SHADES[shadeId] || SHADES.classic;
        parts.mats.suit.color.setHex(s.suit);
        parts.mats.suitDark.color.setHex(s.dark);
        parts.mats.tie.color.setHex(s.tie);
        parts.mats.shirt.color.setHex(s.shirt);
        parts.mats.lens.color.setHex(sh.lens);
        parts.mats.lens.metalness = 0.10 + sh.metal * 0.35;
        parts.mats.lens.roughness = 0.30 - sh.metal * 0.16;
        parts.mats.frame.color.setHex(sh.frame);
        parts.mats.frame.metalness = 0.20 + sh.metal * 0.6;
        parts.mats.frame.roughness = 0.45 - sh.metal * 0.3;
      },

      /* =====================================================
         per-frame animation
         d: {
           dt, lean, leanVel, danger (0..1), speed (lateral m/s),
           grounded, airY, saving, slipping, dead, idle
         }
         ===================================================== */
      update: function (d) {
        var dt = Math.min(0.05, d.dt);
        time += dt;

        /* ---- base pose blend ---- */
        var k = 1 - Math.exp(-blendRate * dt);
        for (var i = 0; i < JOINT_NAMES.length; i++) {
          var n = JOINT_NAMES[i];
          var p = pose[n], t = target[n], o = out[n];
          for (var a = 0; a < 3; a++) {
            p.r[a] += (t.r[a] - p.r[a]) * k;
            p.p[a] += (t.p[a] - p.p[a]) * k;
            o.r[a] = p.r[a]; o.p[a] = p.p[a];
          }
        }

        /* ---- outer jolts (impacts, platform bounces) ---- */
        joltVel += (-joltX * 190 - joltVel * 13) * dt;
        joltX += joltVel * dt;
        joltX = Math.max(-0.5, Math.min(0.5, joltX));

        /* ---- glasses spring: slides down, bounces back ---- */
        gVel += (-gOffset * 105 - gVel * 9.5) * dt;
        gOffset += gVel * dt;
        gOffset = Math.max(-0.13, Math.min(0.16, gOffset));

        var danger = Math.max(0, Math.min(1, d.danger || 0));
        var t2 = time;
        var lean = d.lean || 0;

        /* ---- state-specific procedural motion ---- */
        var hipDrop = 0;

        switch (d.state) {
          case 'confident':
            out.body.r[0] += Math.sin(t2 * 1.9) * 0.022 - 0.02;
            out.head.r[0] += Math.sin(t2 * 1.9 + 0.6) * 0.02;
            out.head.r[1] += Math.sin(t2 * 0.7) * 0.12;
            out.armL.r[2] += Math.sin(t2 * 1.9) * 0.05;
            out.armR.r[2] -= Math.sin(t2 * 1.9) * 0.05;
            break;

          case 'wobble': {
            var amp = 0.10 + danger * 0.55;
            var w = Math.sin(t2 * (4.5 + danger * 6));
            var w2 = Math.sin(t2 * (3.1 + danger * 4) + 1.2);
            out.armL.r[2] += amp * 0.55 + w * amp * 0.45;
            out.armR.r[2] -= amp * 0.55 + w2 * amp * 0.45;
            out.armL.r[0] += w2 * amp * 0.35;
            out.armR.r[0] += w * amp * 0.35;
            out.body.r[0] += w * amp * 0.10;
            out.body.r[2] += w2 * amp * 0.16;
            out.head.r[2] += w * amp * 0.30;
            out.head.r[1] += w2 * amp * 0.5;
            out.kneeL.r[0] += 0.1 + danger * 0.22;
            out.kneeR.r[0] += 0.1 + danger * 0.22;
            hipDrop = danger * 0.055;
            break;
          }

          case 'save': {
            var f = d.saveT == null ? 0 : d.saveT;
            var punch = Math.exp(-f * 5.5) * Math.cos(f * 17);
            out.armL.r[2] += 0.35 * punch;
            out.armR.r[2] -= 0.35 * punch;
            out.body.r[0] += 0.16 * punch;
            out.head.r[0] += 0.24 * punch;
            out.body.r[2] += -lean * 0.35;
            hipDrop = 0.05 * Math.max(0, punch);
            break;
          }

          case 'slip': {
            var s1 = Math.sin(t2 * 21), c1 = Math.cos(t2 * 21);
            // arms windmill front-to-back: unmistakably a cartoon slip
            out.armL.r[0] = -0.35 + s1 * 1.5;
            out.armR.r[0] = -0.35 + c1 * 1.5;
            out.armL.r[2] += 0.35 + s1 * 0.28;
            out.armR.r[2] -= 0.35 + c1 * 0.28;
            out.elbL.r[0] = -0.45 + s1 * 0.35;
            out.elbR.r[0] = -0.45 + c1 * 0.35;
            out.head.r[0] += 0.12 + Math.sin(t2 * 8) * 0.12;
            out.head.r[2] = Math.sin(t2 * 9) * 0.22;
            out.body.r[2] = Math.sin(t2 * 9) * 0.16;
            // feet skate out sideways
            out.footL.r[2] += Math.sin(t2 * 13) * 0.3;
            out.footR.r[2] -= Math.sin(t2 * 13) * 0.3;
            out.thighL.r[2] += 0.2 + Math.sin(t2 * 13) * 0.18;
            out.thighR.r[2] -= 0.2 + Math.sin(t2 * 13) * 0.18;
            hipDrop = 0.10;
            break;
          }

          case 'fall': {
            var e = Math.sin(t2 * 13) * Math.exp(-t2 * 0.35);
            out.armL.r[0] += e * 0.85;
            out.armR.r[0] -= e * 0.95;
            out.armL.r[2] += 0.2 + e * 0.4;
            out.armR.r[2] -= 0.2 + e * 0.4;
            out.elbL.r[0] += e * 0.6;
            out.elbR.r[0] -= e * 0.6;
            out.thighL.r[0] += e * 0.5;
            out.thighR.r[0] -= e * 0.5;
            out.head.r[0] += e * 0.3;
            break;
          }

          case 'reset': {
            var r1 = Math.exp(-t2 * 3.0);
            out.body.r[0] += Math.sin(t2 * 15) * 0.12 * r1;
            out.head.r[0] += Math.sin(t2 * 17) * 0.16 * r1;
            out.armL.r[0] += Math.sin(t2 * 16) * 0.35 * r1;
            out.armR.r[0] += Math.cos(t2 * 16) * 0.35 * r1;
            hipDrop = 0.06 * r1 + 0.02;
            break;
          }
        }

        /* ---- airborne: legs dangle, arms rise ---- */
        if (!d.grounded) {
          var air = Math.max(0, Math.min(1, (d.airTime || 0) * 2.4));
          out.thighL.r[0] += -0.3 * air;
          out.thighR.r[0] += -0.2 * air;
          out.kneeL.r[0] += 0.45 * air;
          out.kneeR.r[0] += 0.3 * air;
          out.armL.r[2] += 0.35 * air;
          out.armR.r[2] -= 0.35 * air;
        }

        /* ---- write joints ---- */
        // the torso group is rotated by -lean from the game loop, so the legs
        // counter-rotate back towards vertical and the shoes stay flat on the deck
        var leanComp = lean * 0.86;
        var footComp = lean - leanComp;

        applyJoint(parts.bodyPivot, out.body, joltX * 0.10, 0, hipDrop);
        applyJoint(parts.headPivot, out.head, 0, 0, 0);
        parts.glasses.position.y = 0.255 - gOffset;
        parts.glasses.rotation.z = -gOffset * 0.7;
        parts.glasses.rotation.x = (out.glasses.r[0] || 0) + gOffset * 1.1;

        applyJoint(parts.arms.L.shoulder, out.armL, 0, 0, 0);
        applyJoint(parts.arms.L.elbow, out.elbL, 0, 0, 0);
        applyJoint(parts.arms.R.shoulder, out.armR, 0, 0, 0);
        applyJoint(parts.arms.R.elbow, out.elbR, 0, 0, 0);

        applyJoint(parts.legs.L.hip, out.thighL, 0, 0, leanComp);
        applyJoint(parts.legs.L.knee, out.kneeL, 0, 0, 0);
        applyJoint(parts.legs.L.ankle, out.footL, 0, 0, footComp);
        applyJoint(parts.legs.R.hip, out.thighR, 0, 0, leanComp);
        applyJoint(parts.legs.R.knee, out.kneeR, 0, 0, 0);
        applyJoint(parts.legs.R.ankle, out.footR, 0, 0, footComp);

        /* subtle yaw twist while sliding around the spinning deck */
        var targetTwist = Math.max(-0.5, Math.min(0.5, -d.slideZ * 0.8));
        parts.bodyPivot.rotation.y += (targetTwist - parts.bodyPivot.rotation.y) * Math.min(1, dt * 4);
      }
    };

    function applyJoint(obj, o, extraX, extraY, extraZ) {
      obj.rotation.set(o.r[0] + (extraX || 0), o.r[1] + (extraY || 0), o.r[2] + (extraZ || 0));
    }

    /* initial look + pose */
    api.setLook('onyx', 'classic');
    copyPose(POSES.CONFIDENT, pose);
    copyPose(POSES.CONFIDENT, target);

    return api;
  }

  global.EggCharacter = {
    create: create,
    SUITS: SUITS,
    SHADES: SHADES,
    HEIGHT: HIP_Y + HEAD_PIVOT_Y + HEAD_H,
    HIP_Y: HIP_Y,
    BODY_R: BODY_R,
    HEAD_R: HEAD_R
  };
})(window);
