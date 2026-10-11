/* ============================================================
   EGGHEAD: STAY UNSTABLE — environment, platform and hazards
   The platform is a real kinematic body: it tilts, hops, slides,
   spins and eventually grows absurd attachments. The character is
   parented to it, so its feet can never punch through the deck.
   ============================================================ */
(function (global) {
  'use strict';

  var T = global.THREE;

  var DECK_RX = 1.25;     // half width  (x)
  var DECK_RZ = 1.00;     // half depth  (z)
  var DECK_H = 0.17;      // deck thickness
  var SURFACE_Y = DECK_H * 0.5;

  /* hazard tier schedule (seconds survived).
     Runs are meant to last roughly 15-30s, so a new absurdity has to land
     every few seconds rather than once a minute. */
  var TIERS = [
    { at: 0,  name: 'WARM-UP SWAY',    blunder: 'TILTED INTO OBLIVION' },
    { at: 5,  name: 'SUDDEN BOUNCE',   blunder: 'BOUNCED OFF THE FLOOR' },
    { at: 10, name: 'SLIDING FLOOR',   blunder: 'LEFT BEHIND BY THE FLOOR' },
    { at: 15, name: 'SPINNING DECK',   blunder: 'SPUN INTO THE VOID' },
    { at: 21, name: 'MINI FANS',       blunder: 'BLOWN AWAY BY A MINI FAN' },
    { at: 27, name: 'SPRING LOADED',   blunder: 'LAUNCHED BY THE SPRING' },
    { at: 34, name: 'TOTAL CHAOS',     blunder: 'OVERWHELMED BY EVERYTHING' }
  ];

  function gradientBackground() {
    var geo = new T.SphereGeometry(60, 24, 16);
    var m = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(0x323c7c) },
        mid: { value: new T.Color(0x414a8c) },
        bot: { value: new T.Color(0x1a2142) }
      },
      vertexShader: [
        'varying vec3 vP;',
        'void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot;',
        'varying vec3 vP;',
        'void main(){',
        '  float h = normalize(vP).y;',
        '  vec3 c = mix(bot, mid, smoothstep(-0.65, 0.10, h));',
        '  c = mix(c, top, smoothstep(0.05, 0.85, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    return new T.Mesh(geo, m);
  }

  function helixSpring(height, radius, coils) {
    var pts = [], n = coils * 14;
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = t * Math.PI * 2 * coils;
      pts.push(new T.Vector3(Math.cos(a) * radius, -t * height, Math.sin(a) * radius));
    }
    var curve = new T.CatmullRomCurve3(pts);
    return new T.TubeGeometry(curve, n, 0.03, 6, false);
  }

  function fan() {
    var g = new T.Group();

    var stem = new T.Mesh(new T.CylinderGeometry(0.035, 0.045, 0.30, 10), mat(0x2c3348, 0.6, 0.2));
    stem.position.y = 0.15;
    g.add(stem);

    var cage = new T.Mesh(new T.TorusGeometry(0.175, 0.022, 6, 20), mat(0x424b66, 0.45, 0.35));
    g.add(cage);
    var cage2 = new T.Mesh(new T.TorusGeometry(0.105, 0.016, 6, 16), mat(0x424b66, 0.45, 0.35));
    g.add(cage2);
    var hub = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), mat(0xe8e2d2, 0.5, 0.15));
    g.add(hub);

    var blades = new T.Group();
    var bladeMat = mat(0xdfe6f2, 0.35, 0.1);
    for (var i = 0; i < 3; i++) {
      var b = new T.Mesh(new T.BoxGeometry(0.15, 0.016, 0.075), bladeMat);
      b.position.set(0.09, 0, 0);
      b.rotation.z = 0.36;
      var holder = new T.Group();
      holder.rotation.x = (i / 3) * Math.PI * 2;
      holder.add(b);
      blades.add(holder);
    }
    g.add(blades);

    g.userData.blades = blades;
    g.userData.cage = cage;
    // fans are aimed by rotating the whole group around Y
    return g;
  }

  function mat(color, rough, metal) {
    return new T.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.7 : rough,
      metalness: metal == null ? 0.05 : metal
    });
  }

  /* soft radial sprite texture (used for the sun glow and the deck pad) */
  function glowTexture(rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(' + rgb + ',0.95)');
    g.addColorStop(0.55, 'rgba(' + rgb + ',0.34)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  }

  /* a tiny floating island: grass cap, rock cone, optional tree */
  function island(rx) {
    var g = new T.Group();
    var grass = new T.Mesh(new T.CylinderGeometry(rx, rx * 0.94, rx * 0.42, 16), mat(0x4c8f6e, 0.88, 0.02));
    g.add(grass);
    var rock = new T.Mesh(new T.ConeGeometry(rx * 0.96, rx * 1.5, 16), mat(0x2b3145, 0.9, 0.03));
    rock.rotation.x = Math.PI;
    rock.position.y = -(rx * 0.42) / 2 - rx * 0.75;
    g.add(rock);
    if (Math.random() > 0.4) {
      var trunk = new T.Mesh(new T.CylinderGeometry(0.035, 0.05, rx * 0.5, 8), mat(0x5a4636, 0.9, 0.02));
      trunk.position.set(rx * 0.18, rx * 0.42 + rx * 0.25, 0);
      g.add(trunk);
      var crown = new T.Mesh(new T.SphereGeometry(rx * 0.3, 10, 8), mat(0x5aa87c, 0.85, 0.02));
      crown.position.set(rx * 0.18, rx * 0.42 + rx * 0.55, 0);
      crown.scale.y = 1.25;
      g.add(crown);
    }
    return g;
  }

  /* ========================================================= */
  function create(scene) {
    var group = new T.Group();
    scene.add(group);

    /* ---------- backdrop ---------- */
    var bg = gradientBackground();
    bg.position.y = 4;
    scene.add(bg);

    /* ---------- sun glow + starfield ---------- */
    var sun = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture('255,232,180'), transparent: true, opacity: 0.92, depthWrite: false, fog: false
    }));
    sun.scale.set(10, 10, 1);
    sun.position.set(-14, 9, -28);
    scene.add(sun);

    var sunCore = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture('255,255,235'), transparent: true, opacity: 0.85, depthWrite: false, fog: false
    }));
    sunCore.scale.set(3.4, 3.4, 1);
    sunCore.position.copy(sun.position);
    scene.add(sunCore);

    var STAR_N = 130;
    var starGeo = new T.BufferGeometry();
    var starPos = new Float32Array(STAR_N * 3);
    for (var st = 0; st < STAR_N; st++) {
      var sx, sy, sz, sl;
      do {
        sx = Math.random() * 2 - 1; sy = Math.random(); sz = Math.random() * 2 - 1;
        sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      } while (sl < 0.28 || sy < 0.16);
      var sr = 45 + Math.random() * 9;
      starPos[st * 3] = (sx / sl) * sr;
      starPos[st * 3 + 1] = (sy / sl) * sr * 0.8 + 3;
      starPos[st * 3 + 2] = (sz / sl) * sr;
    }
    starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
    var starMat = new T.PointsMaterial({
      color: 0xcfd8ff, size: 0.32, sizeAttenuation: true,
      transparent: true, opacity: 0.8, depthWrite: false, fog: false
    });
    var stars = new T.Points(starGeo, starMat);
    scene.add(stars);

    var halo = new T.Mesh(
      new T.CircleGeometry(9, 40),
      new T.MeshBasicMaterial({ color: 0x5b6bb5, transparent: true, opacity: 0.16, depthWrite: false, fog: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -2.6;
    scene.add(halo);

    /* ---------- distant scenery (soft parallax props) ---------- */
    var props = new T.Group();
    var propMat = mat(0x323a63, 0.9, 0.02);
    var propMat2 = mat(0x3d4677, 0.9, 0.02);
    var seedPos = [
      [-6.5, -1.4, -7, 1.5], [6.2, -1.9, -6, 1.9], [-8.5, -2.4, -3, 2.2],
      [8.8, -1.2, -2.5, 1.4], [-3.4, -2.2, -9, 1.7], [4.1, -2.0, -9.5, 2.0],
      [-10.5, -2.8, -5, 2.4], [11.0, -2.6, -6, 2.1]
    ];
    seedPos.forEach(function (p, i) {
      var g2 = new T.SphereGeometry(1, 10, 8);
      g2.scale(p[3], p[3] * (i % 2 ? 0.7 : 1.25), p[3]);
      var mesh = new T.Mesh(g2, i % 3 === 0 ? propMat2 : propMat);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
      props.add(mesh);
    });
    scene.add(props);

    /* ---------- floating islands (slow bob, pure scenery) ---------- */
    var isles = [];
    [
      [-8.5, -2.5, -11, 0.9],
      [7.5, -1.6, -12, 1.1],
      [0.5, -3.5, -13.5, 1.4]
    ].forEach(function (p, i) {
      var il = island(p[3]);
      il.position.set(p[0], p[1], p[2]);
      il.rotation.y = i * 2.1;
      il.userData.baseY = p[1];
      il.userData.phase = i * 1.9;
      scene.add(il);
      isles.push(il);
    });

    /* ---------- platform ---------- */
    var platform = new T.Group();
    platform.position.y = 0;
    group.add(platform);

    var deck = new T.Mesh(
      new T.CylinderGeometry(DECK_RX, DECK_RX * 0.9, DECK_H, 44, 1),
      mat(0x3a3f52, 0.66, 0.06)
    );
    deck.scale.z = DECK_RZ / DECK_RX;
    deck.castShadow = true;
    deck.receiveShadow = true;
    platform.add(deck);

    // rim accent ring (emissive so it reads as neon)
    var rim = new T.Mesh(new T.TorusGeometry(DECK_RX * 0.995, 0.028, 8, 60), new T.MeshStandardMaterial({
      color: 0xffce58, roughness: 0.42, metalness: 0.15, emissive: 0xffce58, emissiveIntensity: 0.38
    }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = SURFACE_Y - 0.012;
    rim.scale.z = DECK_RZ / DECK_RX;
    platform.add(rim);

    var underside = new T.Mesh(
      new T.CylinderGeometry(DECK_RX * 0.88, DECK_RX * 0.55, 0.22, 30),
      mat(0x22263a, 0.8, 0.04)
    );
    underside.scale.z = DECK_RZ / DECK_RX;
    underside.position.y = -0.19;
    platform.add(underside);

    // markings so rotation is readable
    var markMat = new T.MeshBasicMaterial({ color: 0x8b93ad, transparent: true, opacity: 0.45 });
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      var tick = new T.Mesh(new T.BoxGeometry(0.02, 0.006, 0.13), markMat);
      tick.position.set(Math.cos(a) * DECK_RX * 0.86, SURFACE_Y + 0.002, Math.sin(a) * DECK_RZ * 0.86);
      tick.rotation.y = -a;
      platform.add(tick);
    }
    var ringMk = new T.Mesh(new T.TorusGeometry(DECK_RX * 0.5, 0.008, 6, 48), markMat);
    ringMk.rotation.x = Math.PI / 2;
    ringMk.position.y = SURFACE_Y + 0.002;
    ringMk.scale.z = DECK_RZ / DECK_RX;
    platform.add(ringMk);

    // centre pad where the agent likes to place his feet
    var pad = new T.Mesh(new T.TorusGeometry(0.20, 0.012, 6, 24), mat(0x66e3c4, 0.5, 0.1));
    pad.rotation.x = Math.PI / 2;
    pad.position.y = SURFACE_Y + 0.002;
    platform.add(pad);

    // soft mint glow pad on the deck top (additive, sits above markings)
    var padGlowGeo = new T.CircleGeometry(DECK_RX * 0.92, 40);
    padGlowGeo.scale(1, DECK_RZ / DECK_RX, 1);
    var padGlow = new T.Mesh(padGlowGeo, new T.MeshBasicMaterial({
      map: glowTexture('102,227,196'), transparent: true, opacity: 0.42,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    padGlow.rotation.x = -Math.PI / 2;
    padGlow.position.y = SURFACE_Y + 0.004;
    platform.add(padGlow);

    /* ---------- spring (hidden until it is needed) ---------- */
    var spring = new T.Mesh(helixSpring(1.25, 0.30, 6), mat(0x9aa3bd, 0.35, 0.55));
    spring.position.y = -0.28;
    spring.scale.y = 0;
    spring.visible = false;
    platform.add(spring);

    var springBase = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 0.16, 20), mat(0x2b3145, 0.7, 0.1));
    springBase.position.y = -1.62;
    springBase.visible = false;
    platform.add(springBase);

    /* ---------- mini fans ---------- */
    var fans = [];
    var fanDefs = [
      { angle: 0.0, dir: 1, at: DECK_RX * 0.83 },
      { angle: Math.PI, dir: -1, at: DECK_RX * 0.83 }
    ];
    fanDefs.forEach(function (fd) {
      var f = fan();
      f.scale.setScalar(0.9);
      f.position.set(Math.cos(fd.angle) * fd.at, SURFACE_Y + 0.02, Math.sin(fd.angle) * DECK_RZ * 0.7);
      f.rotation.y = fd.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      f.visible = false;
      platform.add(f);
      fans.push({ obj: f, dir: fd.dir, active: false, spin: 0, phase: Math.random() * 6.28 });
    });

    /* ---------- wind streaks ---------- */
    var WIND_N = 46;
    var windGeo = new T.BufferGeometry();
    var windPos = new Float32Array(WIND_N * 3);
    for (var w = 0; w < WIND_N; w++) {
      windPos[w * 3] = (Math.random() * 2 - 1) * 3;
      windPos[w * 3 + 1] = SURFACE_Y + 0.25 + Math.random() * 1.3;
      windPos[w * 3 + 2] = (Math.random() * 2 - 1) * 0.9;
    }
    windGeo.setAttribute('position', new T.BufferAttribute(windPos, 3));
    var windPoints = new T.Points(windGeo, new T.PointsMaterial({
      color: 0xd8e4ff, size: 0.045, transparent: true, opacity: 0.0, depthWrite: false, sizeAttenuation: true
    }));
    platform.add(windPoints);

    /* ---------- state ---------- */
    var S = {
      time: 0,
      tier: 0,
      tilt: 0, tiltVel: 0, tiltAmp: 0.055, tiltRate: 0.7, tiltTarget: 0,
      yaw: 0, yawRate: 0,
      offX: 0, offXVel: 0, offXAcc: 0,
      bounceY: 0, bounceVel: 0, bounceAcc: 0,
      hopTimer: 0, hopInterval: 0,
      springK: 0,
      gustPhase: 0,
      windPower: 0,
      windDir: 1,
      chaos: 0,
      rimBoost: 0
    };

    var api = {
      group: group,
      platform: platform,
      deck: deck,
      surfaceY: SURFACE_Y,
      RX: DECK_RX, RZ: DECK_RZ,
      props: props,

      tiers: TIERS,

      tierAt: function (t) {
        var ti = 0;
        for (var i = 0; i < TIERS.length; i++) if (t >= TIERS[i].at) ti = i;
        return ti;
      },
      tierInfo: function (i) { return TIERS[Math.max(0, Math.min(TIERS.length - 1, i))]; },

      setTier: function (n) {
        if (n === S.tier) return;
        S.tier = n;
        // fans
        for (var i = 0; i < fans.length; i++) {
          var on = (n >= 4);
          fans[i].active = on;
          fans[i].obj.visible = on;
        }
        var springOn = n >= 5;
        spring.visible = springOn;
        springBase.visible = springOn;
        S.springK = springOn ? 1 : 0;
        S.hopInterval = n >= 6 ? 1.35 : (n >= 5 ? 1.9 : 2.6);
      },

      reset: function () {
        S.time = 0; S.tier = -1; S.tilt = 0; S.tiltVel = 0; S.tiltTarget = 0;
        S.yaw = 0; S.yawRate = 0; S.offX = 0; S.offXVel = 0; S.offXAcc = 0;
        S.bounceY = 0; S.bounceVel = 0; S.bounceAcc = 0; S.hopTimer = 1.4;
        S.windPower = 0; S.gustPhase = 0; S.chaos = 0;
        platform.position.set(0, 0, 0);
        platform.rotation.set(0, 0, 0);
        for (var i = 0; i < fans.length; i++) { fans[i].active = false; fans[i].obj.visible = false; fans[i].spin = 0; }
        spring.visible = false; springBase.visible = false; S.springK = 0;
        windPoints.material.opacity = 0;
        api.setTier(0);
      },

      /* -----------------------------------------------------
         update: drives every platform motion
         ----------------------------------------------------- */
      update: function (dt, elapsed) {
        S.time = elapsed;
        var t = elapsed;
        var tier = S.tier;
        var chaos = tier >= 6 ? 1 : (tier >= 5 ? 0.75 : (tier >= 4 ? 0.55 : (tier >= 3 ? 0.4 : (tier >= 2 ? 0.25 : 0.12))));
        S.chaos = chaos;

        /* --- tilt: layered sine waves, faster and wider over time --- */
        var speedUp = 1 + t * 0.012;
        var a1 = (0.068 + chaos * 0.082) * Math.sin(t * 0.62 * speedUp);
        var a2 = (0.030 + chaos * 0.052) * Math.sin(t * 1.47 * speedUp + 1.7);
        var a3 = chaos * 0.048 * Math.sin(t * 2.9 * speedUp + 0.4);
        var tiltTarget = a1 + a2 + a3;

        /* --- hop: periodic vertical launch --- */
        if (tier >= 1) {
          S.hopTimer -= dt;
          if (S.hopTimer <= 0) {
            S.hopTimer = S.hopInterval * (0.72 + Math.random() * 0.5);
            var power = (tier >= 5 ? 3.4 : (tier >= 3 ? 2.7 : 2.1)) + chaos * 0.8;
            S.bounceVel = power;
            S.tiltVel += (Math.random() * 2 - 1) * (0.7 + chaos * 0.9);
            api.onHop && api.onHop();
          }
        }
        // spring integration: a damped spring anchored at the deck's rest height
        var prevBounceVel = S.bounceVel;
        S.bounceVel += (-S.bounceY * 62 - S.bounceVel * 3.4) * dt;
        S.bounceY += S.bounceVel * dt;
        if (S.bounceY < 0) {
          if (S.bounceVel < -0.9) { api.onLand && api.onLand(Math.min(1, -S.bounceVel / 5)); }
          S.bounceY = 0;
          S.bounceVel *= -0.16;
        }
        S.bounceAcc = (S.bounceVel - prevBounceVel) / Math.max(dt, 1e-4);

        /* --- slide: lateral translation of the whole deck --- */
        var slideAmp = tier >= 2 ? (0.24 + chaos * 0.42) : 0;
        var prevOff = S.offX;
        S.offX = slideAmp * Math.sin(t * (0.55 + chaos * 0.35));
        S.offXVel = (S.offX - prevOff) / Math.max(dt, 1e-4);
        if (api._prevOffVel == null) api._prevOffVel = 0;
        S.offXAcc = (S.offXVel - api._prevOffVel) / Math.max(dt, 1e-4);
        api._prevOffVel = S.offXVel;

        /* --- spin: yaw rotation --- */
        var wantYawRate = tier >= 3 ? (0.30 + chaos * 0.55) * (tier >= 6 ? 1.3 : 1) : 0;
        S.yawRate += (wantYawRate - S.yawRate) * Math.min(1, dt * 0.6);
        S.yaw += S.yawRate * dt;

        /* --- fans --- */
        var fanOn = fans[0] && fans[0].active;
        for (var i = 0; i < fans.length; i++) {
          var f = fans[i];
          if (!f.active) continue;
          f.spin += dt * (13 + chaos * 10);
          f.obj.userData.blades.rotation.z = f.spin;
        }
        if (fanOn) {
          S.gustPhase += dt;
          var gust = 0.55 + 0.45 * Math.sin(S.gustPhase * 2.1) * Math.sin(S.gustPhase * 0.7 + 1.1);
          S.windPower = (0.55 + chaos * 0.6) * Math.max(0.15, gust);
          S.windDir = 1;
          windPoints.material.opacity = Math.min(0.6, 0.25 + S.windPower * 0.3);
          var pos = windGeo.attributes.position.array;
          var spd = 5.5 + S.windPower * 4;
          for (var k = 0; k < WIND_N; k++) {
            pos[k * 3] += spd * dt;
            if (pos[k * 3] > 3.2) {
              pos[k * 3] = -3.2;
              pos[k * 3 + 1] = SURFACE_Y + 0.2 + Math.random() * 1.3;
              pos[k * 3 + 2] = (Math.random() * 2 - 1) * 0.95;
            }
          }
          windGeo.attributes.position.needsUpdate = true;
        } else {
          S.windPower = 0;
          windPoints.material.opacity += (0 - windPoints.material.opacity) * Math.min(1, dt * 3);
        }

        /* --- spring compression visual --- */
        if (S.springK > 0) {
          var comp = Math.max(0.06, 1 + S.bounceY * 0.55);
          spring.scale.y = comp;
          springBase.position.y = -1.62 - Math.max(0, S.bounceY * 0.35);
        }

        /* --- neon rim pulse: bright on hop/land, quick decay --- */
        S.rimBoost *= Math.exp(-dt * 5.5);
        rim.material.emissiveIntensity = 0.38 + S.rimBoost * 1.5;

        /* --- integrate the tilt spring --- */
        var tiltPrev = S.tilt;
        S.tilt += S.tiltVel * dt;
        S.tiltVel += (-(S.tilt - tiltTarget) * 26 - S.tiltVel * 5.2) * dt;
        S.tiltVel = Math.max(-3.2, Math.min(3.2, S.tiltVel));
        S.tilt = Math.max(-0.38, Math.min(0.38, S.tilt));
        S.tiltRate = (S.tilt - tiltPrev) / Math.max(dt, 1e-4);

        /* --- apply to the object --- */
        platform.position.set(S.offX, S.bounceY, 0);
        platform.rotation.set(0, S.yaw, S.tilt);

        /* --- ambient scenery drift --- */
        props.rotation.y = t * 0.008;
        props.position.y = Math.sin(t * 0.35) * 0.08;

        /* --- floating islands bob + star twinkle (cheap, no allocs) --- */
        for (var ii = 0; ii < isles.length; ii++) {
          var il = isles[ii];
          il.position.y = il.userData.baseY + Math.sin(t * 0.28 + il.userData.phase) * 0.18;
        }
        starMat.opacity = 0.72 + Math.sin(t * 1.3) * 0.10 + Math.sin(t * 2.7 + 1.4) * 0.08;
      },

      /* current kinematics, consumed by the balance solver */
      kin: {
        tilt: function () { return S.tilt; },
        tiltRate: function () { return S.tiltRate; },
        yaw: function () { return S.yaw; },
        yawRate: function () { return S.yawRate; },
        offX: function () { return S.offX; },
        offXAcc: function () { return S.offXAcc; },
        bounceY: function () { return S.bounceY; },
        bounceAcc: function () { return S.bounceAcc; },
        windPower: function () { return S.windPower; },
        windDir: function () { return S.windDir; },
        chaos: function () { return S.chaos; }
      },

      /* copy current platform transform onto an arbitrary object
         (used to park the character on the deck) */
      syncAnchor: function (obj) {
        obj.position.copy(platform.position);
        obj.rotation.copy(platform.rotation);
        obj.updateMatrixWorld(true);
      },

      /* flash the neon rim (hops and landings) */
      pulseRim: function (k) {
        S.rimBoost = Math.min(1.3, S.rimBoost + (k || 0));
      },

      onHop: null,
      onLand: null
    };

    api.reset();
    return api;
  }

  global.EggWorld = {
    create: create,
    RX: DECK_RX,
    RZ: DECK_RZ,
    SURFACE_Y: SURFACE_Y,
    TIERS: TIERS
  };
})(window);
