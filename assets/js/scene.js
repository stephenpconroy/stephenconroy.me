/* Three cities, painted: New York, Hà Nội and Hong Kong, each shown in its own light at this moment.
   Everything is drawn in code on a canvas, in layers that move at different speeds as you travel between cities. */
(function () {
  'use strict';
  var stage = document.querySelector('.scene');
  if (!stage) return;
  var canvas = stage.querySelector('.scene-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var params = new URLSearchParams(location.search);
  var forcedHour = params.has('scene-hour') ? parseFloat(params.get('scene-hour')) : null;
  var forcedCity = params.has('scene-city') ? parseFloat(params.get('scene-city')) : null;

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  var hexCache = {};
  function hex(c) {
    if (typeof c !== 'string') return c;
    if (hexCache[c]) return hexCache[c];
    var h = c.replace('#', '');
    return (hexCache[c] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  }
  function mix(a, b, t) { a = hex(a); b = hex(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) {
    c = hex(c);
    var s = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
    return a == null ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + a + ')';
  }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function noise1(seed) {
    var r = rng(seed), v = [];
    for (var i = 0; i < 512; i++) v.push(r());
    return function (x) { var i0 = Math.floor(x), f = x - i0; return lerp(v[i0 & 511], v[(i0 + 1) & 511], smooth(f)); };
  }
  function fbm(n, x) { return (n(x) * 0.55 + n(x * 2.1 + 17) * 0.28 + n(x * 4.3 + 41) * 0.17); }

  /* ---------- light through the day ---------- */
  var PAL = {
    night:  { skyTop: '#0B1533', skyMid: '#1B2C5C', skyLow: '#3A4D80', haze: '#30447A', tint: '#5A72B8', shadow: '#0B1230', light: 0.24, cloudLight: '#5B6CA0', cloudShade: '#1E2B57', stars: 1, window: 1, water: '#1A2A57', waterDeep: '#0A1330', glow: '#F4EED6', bird: 0 },
    dawn:   { skyTop: '#5B7DBA', skyMid: '#E8B9B4', skyLow: '#FFD9AE', haze: '#F0CBB6', tint: '#FFC79E', shadow: '#4B4A7A', light: 0.72, cloudLight: '#FFE6D2', cloudShade: '#B593AE', stars: 0.08, window: 0.25, water: '#A2AACB', waterDeep: '#5F6E9E', glow: '#FFE2A8', bird: 0.6 },
    day:    { skyTop: '#3A86D6', skyMid: '#86BFEC', skyLow: '#DCEFF7', haze: '#CBE3F0', tint: '#FFF4DC', shadow: '#3B5878', light: 1, cloudLight: '#FFFFFF', cloudShade: '#AFC4DD', stars: 0, window: 0, water: '#78B0DA', waterDeep: '#3976AE', glow: '#FFF6DA', bird: 1 },
    golden: { skyTop: '#4B79BE', skyMid: '#EFC08F', skyLow: '#FFD08C', haze: '#F3CC9E', tint: '#FFC072', shadow: '#5B4A70', light: 0.86, cloudLight: '#FFE8C4', cloudShade: '#C6909B', stars: 0, window: 0.12, water: '#CDA684', waterDeep: '#6A6C9A', glow: '#FFD47E', bird: 0.8 },
    dusk:   { skyTop: '#22356A', skyMid: '#8B6E9F', skyLow: '#F0A07E', haze: '#B48A9E', tint: '#E89A8B', shadow: '#25284F', light: 0.48, cloudLight: '#F2B39E', cloudShade: '#5C4C7B', stars: 0.35, window: 0.75, water: '#5E5C89', waterDeep: '#283160', glow: '#FFA273', bird: 0.3 }
  };
  var KEYS = [[0, 'night'], [5, 'night'], [6.3, 'dawn'], [8.4, 'day'], [15.6, 'day'], [17.4, 'golden'], [19.0, 'dusk'], [20.6, 'night'], [24, 'night']];
  function mixPal(a, b, t) {
    var o = {};
    for (var k in a) o[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : mix(a[k], b[k], t);
    return o;
  }
  function palAt(h) {
    h = ((h % 24) + 24) % 24;
    for (var i = 0; i < KEYS.length - 1; i++) {
      if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) {
        var t = smooth((h - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]));
        return mixPal(PAL[KEYS[i][1]], PAL[KEYS[i + 1][1]], t);
      }
    }
    return mixPal(PAL.night, PAL.night, 0);
  }
  function hourIn(zone) {
    if (forcedHour != null && !isNaN(forcedHour)) return forcedHour;
    try {
      var h = 0, m = 0;
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date())
        .forEach(function (p) { if (p.type === 'hour') h = parseInt(p.value, 10) % 24; if (p.type === 'minute') m = parseInt(p.value, 10); });
      return h + m / 60;
    } catch (e) { return 12; }
  }
  // A material colour, lit by the time of day and softened by distance.
  function shade(base, pal, fog) {
    var lit = mix(base, pal.tint, 0.16);
    lit = mix(lit, pal.shadow, (1 - pal.light) * 0.82);
    return mix(lit, pal.haze, fog);
  }

  /* ---------- canvas plumbing ---------- */
  var W = 0, H = 0, dpr = 1, WT = 0.7;
  function layer(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, g: g, w: w, h: h };
  }
  function soften(L, px) {
    var M = layer(L.w, L.h);
    if ('filter' in M.g) M.g.filter = 'blur(' + px + 'px)';
    M.g.drawImage(L.c, 0, 0, L.w, L.h);
    return M;
  }
  // A building with a lit face, a shaded side and a varied top.
  function tower(g, x, base, w, h, color, pal, fog, r, u, dense) {
    var face = rgb(shade(color, pal, fog)), side = rgb(shade(mix(color, '#1A2236', 0.32), pal, fog));
    g.fillStyle = face; g.fillRect(x, base - h, w, h + 6 * u);
    g.fillStyle = side; g.fillRect(x + w * 0.72, base - h, w * 0.28, h + 6 * u);
    var kind = r();
    g.fillStyle = face;
    if (kind < 0.2) { g.fillRect(x + w * 0.18, base - h - 10 * u, w * 0.64, 10 * u); g.fillStyle = side; g.fillRect(x + w * 0.62, base - h - 10 * u, w * 0.2, 10 * u); }
    else if (kind < 0.34) { poly(g, [x, base - h, x + w, base - h, x + w, base - h - w * 0.45]); }
    else if (kind < 0.46) { poly(g, [x, base - h, x + w, base - h, x + w / 2, base - h - w * 0.5]); }
    else if (kind < 0.6) { g.fillRect(x + w * 0.45, base - h - 22 * u, 1.3 * u, 22 * u); }
    lights(g, x, base - h, w * 0.72, h, u, pal, r, dense);
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

  // Window lights: warm dots at night, faint glass by day.
  function lights(g, x, y, w, h, u, pal, r, dense) {
    var step = 5.2 * u, rowStep = 6.4 * u, lit = pal.window;
    if (lit > 0.04) {
      for (var yy = y + 4 * u; yy < y + h - 3 * u; yy += rowStep) {
        for (var xx = x + 2.5 * u; xx < x + w - 2.5 * u; xx += step) {
          if (r() < lit * (dense || 0.42)) {
            g.fillStyle = rgb(mix('#FFD27D', '#FFF1C9', r()), 0.55 + r() * 0.45);
            g.fillRect(xx, yy, 1.6 * u, 2.2 * u);
          }
        }
      }
    }
    if (pal.light > 0.6) {
      g.fillStyle = rgb(pal.skyLow, 0.16 * pal.light);
      for (var gx = x + 3 * u; gx < x + w - 2 * u; gx += 7 * u) g.fillRect(gx, y + 3 * u, 1.2 * u, h - 6 * u);
    }
  }
  // A soft rounded canopy of leaves, lit from the upper left.
  function canopy(g, x, y, rad, base, pal, fog, r, blossom) {
    var dark = rgb(shade(mix(base, '#123022', 0.35), pal, fog)), mid = rgb(shade(base, pal, fog)), hi = rgb(shade(mix(base, '#E8F2B0', 0.35), pal, fog));
    g.fillStyle = dark;
    for (var i = 0; i < 9; i++) circle(g, x + (r() - 0.5) * rad * 1.5, y + (r() - 0.3) * rad * 0.8, rad * (0.45 + r() * 0.35));
    g.fillStyle = mid;
    for (var j = 0; j < 8; j++) circle(g, x + (r() - 0.6) * rad * 1.2, y - rad * 0.25 + (r() - 0.5) * rad * 0.6, rad * (0.35 + r() * 0.3));
    g.fillStyle = hi;
    for (var k = 0; k < 6; k++) circle(g, x - rad * 0.35 + (r() - 0.5) * rad * 0.7, y - rad * 0.45 + (r() - 0.5) * rad * 0.4, rad * (0.12 + r() * 0.16));
    if (blossom) {
      g.fillStyle = rgb(shade(blossom, pal, fog * 0.8));
      for (var b = 0; b < 26; b++) circle(g, x + (r() - 0.5) * rad * 1.6, y - rad * 0.2 + (r() - 0.5) * rad * 0.9, rad * (0.05 + r() * 0.07));
    }
  }

  /* ---------- clouds ---------- */
  function cloudSprite(w, h, pal, seed) {
    var L = layer(w, h), g = L.g, r = rng(seed), base = h * 0.84, pad = h * 0.06, puffs = [];
    var n = 13 + Math.floor(r() * 6);
    for (var i = 0; i < n; i++) {
      var k = r(), edge = Math.max(0.15, 1 - Math.abs(k - 0.5) * 1.6);
      var rad = h * (0.1 + 0.2 * r()) * (0.55 + 0.6 * edge);
      var px = lerp(rad + pad, w - rad - pad, k);
      puffs.push({ x: px, y: Math.max(rad + pad, base - rad * (0.25 + 0.75 * r() * edge)), r: rad });
    }
    for (var t = 0; t < 3; t++) {
      var tr = h * (0.17 + r() * 0.1);
      puffs.push({ x: w * (0.36 + r() * 0.28), y: Math.max(tr + pad, base - h * (0.34 + r() * 0.16)), r: tr });
    }
    function shape(dx, dy, sc) { g.beginPath(); puffs.forEach(function (p) { g.moveTo(p.x + dx * p.r + p.r * sc, p.y + dy * p.r); g.arc(p.x + dx * p.r, p.y + dy * p.r, p.r * sc, 0, Math.PI * 2); }); g.fill(); }
    g.save();
    g.beginPath(); g.rect(0, 0, w, base); g.clip();
    var shadeG = g.createLinearGradient(0, base - h * 0.75, 0, base);
    shadeG.addColorStop(0, rgb(mix(pal.cloudShade, pal.cloudLight, 0.3))); shadeG.addColorStop(1, rgb(mix(pal.cloudShade, pal.skyLow, 0.18)));
    g.fillStyle = shadeG; shape(0, 0, 1);
    g.globalCompositeOperation = 'source-atop';
    if ('filter' in g) g.filter = 'blur(1.5px)';
    var lightG = g.createLinearGradient(0, base - h * 0.9, 0, base - h * 0.1);
    lightG.addColorStop(0, rgb(pal.cloudLight)); lightG.addColorStop(1, rgb(mix(pal.cloudLight, pal.cloudShade, 0.28)));
    g.fillStyle = lightG; shape(-0.16, -0.22, 0.88);
    g.fillStyle = rgb(mix(pal.cloudLight, '#FFFFFF', 0.55), 0.55); shape(-0.26, -0.34, 0.62);
    if ('filter' in g) g.filter = 'none';
    var fade = g.createLinearGradient(0, base - h * 0.22, 0, base);
    fade.addColorStop(0, rgb(pal.cloudShade, 0)); fade.addColorStop(1, rgb(mix(pal.cloudShade, pal.skyLow, 0.4), 0.6));
    g.fillStyle = fade; g.fillRect(0, 0, w, base);
    g.restore();
    return L;
  }
  function makeClouds(pal, seed) {
    var r = rng(seed), list = [], u = H / 760;
    var spec = [[0.18, 0.2, 1.0], [0.62, 0.12, 1.35], [0.92, 0.26, 0.9], [0.4, 0.34, 0.65], [1.15, 0.16, 1.1], [-0.15, 0.3, 0.8]];
    spec.forEach(function (s, i) {
      var w = 420 * u * s[2] * (0.9 + r() * 0.3), h = w * (0.42 + r() * 0.12);
      list.push({ sprite: cloudSprite(w, h, pal, seed * 31 + i * 7), x: s[0], y: s[1] * H, w: w, h: h, speed: 2 + r() * 3 });
    });
    return list;
  }

  /* ---------- New York ---------- */
  function paintNY(pal) {
    var LW = W * 1.3, u = H / 760, wt = H * WT, out = { layers: [] };
    var far = layer(LW, H), g = far.g, r = rng(1010), fog = 0.5, col = rgb(shade('#6E7894', pal, fog));
    g.fillStyle = col;
    var x = -10;
    while (x < LW) { var bw = (16 + r() * 34) * u, bh = (40 + r() * 110) * u; g.fillRect(x, wt - bh, bw, bh + 4); lights(g, x, wt - bh, bw, bh, u, pal, r, 0.25); g.fillStyle = col; x += bw - 1.5 * u; }
    // Empire State Building
    var ex = LW * 0.36, e = 2.6 * u;
    g.fillStyle = col;
    poly(g, [ex - 17 * e, wt, ex - 17 * e, wt - 24 * e, ex - 11 * e, wt - 24 * e, ex - 11 * e, wt - 72 * e, ex - 8 * e, wt - 72 * e, ex - 8 * e, wt - 82 * e,
      ex - 5 * e, wt - 82 * e, ex - 5 * e, wt - 88 * e, ex - 3 * e, wt - 88 * e, ex - 1.5 * e, wt - 96 * e, ex - 0.4 * e, wt - 108 * e,
      ex + 0.4 * e, wt - 108 * e, ex + 1.5 * e, wt - 96 * e, ex + 3 * e, wt - 88 * e, ex + 5 * e, wt - 88 * e, ex + 5 * e, wt - 82 * e,
      ex + 8 * e, wt - 82 * e, ex + 8 * e, wt - 72 * e, ex + 11 * e, wt - 72 * e, ex + 11 * e, wt - 24 * e, ex + 17 * e, wt - 24 * e, ex + 17 * e, wt]);
    lights(g, ex - 11 * e, wt - 72 * e, 22 * e, 48 * e, u, pal, r, 0.3);
    if (pal.window > 0.3) { g.fillStyle = rgb('#FFE7B0', 0.8 * pal.window); g.fillRect(ex - 4 * e, wt - 87 * e, 8 * e, 4 * e); }
    // Chrysler Building
    var cx = LW * 0.53, c = 2.4 * u;
    g.fillStyle = col;
    g.fillRect(cx - 10 * c, wt - 70 * c, 20 * c, 70 * c);
    for (var tier = 0; tier < 6; tier++) {
      var tw = (9 - tier * 1.5) * c, ty = wt - (70 + tier * 4.2) * c;
      g.beginPath(); g.moveTo(cx - tw, ty); g.lineTo(cx - tw, ty - 2 * c); g.arc(cx, ty - 2 * c, tw, Math.PI, 0); g.lineTo(cx + tw, ty); g.closePath(); g.fill();
      if (pal.window > 0.2 || pal.light > 0.75) {
        g.fillStyle = pal.window > 0.2 ? rgb('#FFE2A0', 0.85 * pal.window) : rgb(pal.glow, 0.35);
        for (var k = -2; k <= 2; k++) poly(g, [cx + k * tw * 0.36 - 0.9 * c, ty - 1 * c, cx + k * tw * 0.36 + 0.9 * c, ty - 1 * c, cx + k * tw * 0.36, ty - 3.4 * c]);
        g.fillStyle = col;
      }
    }
    poly(g, [cx - 1.2 * c, wt - 95 * c, cx + 1.2 * c, wt - 95 * c, cx, wt - 112 * c]);
    lights(g, cx - 10 * c, wt - 70 * c, 20 * c, 64 * c, u, pal, r, 0.28);
    far = soften(far, 0.9);
    out.layers.push({ p: 0.32, L: far });

    // Mid: closer blocks with rooftop water towers.
    var mid = layer(LW, H), m = mid.g, mfog = 0.24, mcol = rgb(shade('#5A6178', pal, mfog)), brick = rgb(shade('#8A5A4A', pal, mfog + 0.05));
    x = -20;
    while (x < LW) {
      var w2 = (30 + r() * 46) * u, h2 = (26 + r() * 70) * u;
      m.fillStyle = r() > 0.5 ? mcol : brick; m.fillRect(x, wt - h2, w2, h2 + 4);
      lights(m, x, wt - h2, w2, h2, u, pal, r, 0.4);
      if (r() > 0.45) {
        var tx = x + w2 * (0.25 + r() * 0.5), tb = wt - h2, tr = 6 * u;
        m.fillStyle = rgb(shade('#4A3A30', pal, mfog));
        m.fillRect(tx - tr * 0.8, tb - 7 * u, 1.2 * u, 7 * u); m.fillRect(tx + tr * 0.6, tb - 7 * u, 1.2 * u, 7 * u);
        m.fillStyle = rgb(shade('#7B5A42', pal, mfog));
        m.fillRect(tx - tr, tb - 18 * u, tr * 2, 11 * u);
        poly(m, [tx - tr * 1.1, tb - 18 * u, tx + tr * 1.1, tb - 18 * u, tx, tb - 24 * u]);
      }
      x += w2 + (r() > 0.7 ? 6 * u : -1);
    }
    out.layers.push({ p: 0.58, L: mid });

    // Near: the Brooklyn Bridge, stone towers and a web of cables.
    var near = layer(LW, H), n = near.g, stone = rgb(shade('#A38E78', pal, 0.05)), cable = rgb(shade('#3F4452', pal, 0.04), 0.85);
    var deck = wt - 52 * u, tX = LW * 0.7, tTop = wt - 300 * u, tW = 58 * u;
    n.fillStyle = rgb(shade('#6E5B4B', pal, 0.05));
    n.fillRect(0, deck, LW, 10 * u);
    n.fillStyle = rgb(shade('#4A3E35', pal, 0.05)); n.fillRect(0, deck + 10 * u, LW, 3 * u);
    n.fillStyle = stone; n.fillRect(tX - tW / 2, tTop, tW, wt - tTop + 10 * u);
    n.fillRect(tX - tW / 2 - 4 * u, tTop - 6 * u, tW + 8 * u, 8 * u);
    n.save(); n.globalCompositeOperation = 'destination-out';
    [-1, 1].forEach(function (sgn) {
      var ax = tX + sgn * tW * 0.22, aw = tW * 0.17;
      n.beginPath(); n.moveTo(ax - aw, deck + 2 * u); n.lineTo(ax - aw, tTop + 70 * u);
      n.quadraticCurveTo(ax - aw, tTop + 40 * u, ax, tTop + 30 * u); n.quadraticCurveTo(ax + aw, tTop + 40 * u, ax + aw, tTop + 70 * u);
      n.lineTo(ax + aw, deck + 2 * u); n.closePath(); n.fill();
    });
    n.restore();
    n.fillStyle = rgb(shade('#7C6A58', pal, 0.05)); n.fillRect(tX - tW / 2, tTop + 18 * u, tW, 3 * u);
    n.strokeStyle = cable; n.lineWidth = 1.6 * u;
    [-1, 1].forEach(function (side) {
      var sx = tX + side * tW * 0.42, endX = side < 0 ? -LW * 0.05 : LW * 1.1;
      n.beginPath(); n.moveTo(sx, tTop + 4 * u); n.quadraticCurveTo((sx + endX) / 2, deck + 10 * u, endX, deck - 120 * u); n.stroke();
      n.lineWidth = 0.7 * u;
      for (var s = 1; s < 26; s++) {
        var t = s / 26, qx = lerp(lerp(sx, (sx + endX) / 2, t), lerp((sx + endX) / 2, endX, t), t);
        var qy = lerp(lerp(tTop + 4 * u, deck + 10 * u, t), lerp(deck + 10 * u, deck - 120 * u, t), t);
        if (qy < deck) { n.beginPath(); n.moveTo(qx, qy); n.lineTo(qx, deck); n.stroke(); }
      }
      for (var d = 1; d <= 7; d++) { n.beginPath(); n.moveTo(sx, tTop + 10 * u); n.lineTo(sx + side * d * 26 * u, deck); n.stroke(); }
      n.lineWidth = 1.6 * u;
    });
    if (pal.window > 0.3) {
      for (var lx = 10 * u; lx < LW; lx += 34 * u) {
        var gl = n.createRadialGradient(lx, deck - 3 * u, 0, lx, deck - 3 * u, 9 * u);
        gl.addColorStop(0, rgb('#FFE2A0', 0.9 * pal.window)); gl.addColorStop(1, rgb('#FFE2A0', 0));
        n.fillStyle = gl; circle(n, lx, deck - 3 * u, 9 * u);
      }
    }
    out.layers.push({ water: true, p: 0.85 });
    out.layers.push({ p: 0.95, L: near });
    out.reflect = [far, mid, near];
    out.extra = function (g, x, alpha, t) { tug(g, x, alpha, t, pal); };
    return out;
  }
  function tug(g, x, alpha, t, pal) {
    var u = H / 760, wt = H * WT, LW = W * 1.3, px = x + ((t * 9 * u) % (LW + 200 * u)) - 100 * u, py = wt + 46 * u;
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = rgb(shade('#8E3B2E', pal, 0.04)); poly(g, [px - 26 * u, py, px + 30 * u, py, px + 22 * u, py + 9 * u, px - 22 * u, py + 9 * u]);
    g.fillStyle = rgb(shade('#EDE6D8', pal, 0.04)); g.fillRect(px - 10 * u, py - 12 * u, 20 * u, 12 * u);
    g.fillStyle = rgb(shade('#2D3240', pal, 0.04)); g.fillRect(px - 2 * u, py - 20 * u, 4 * u, 8 * u);
    if (pal.window > 0.3) { g.fillStyle = rgb('#FFD98A', pal.window); g.fillRect(px - 7 * u, py - 9 * u, 3 * u, 3 * u); g.fillRect(px + 3 * u, py - 9 * u, 3 * u, 3 * u); }
    g.restore();
  }

  /* ---------- Hà Nội ---------- */
  function paintHN(pal) {
    var LW = W * 1.3, u = H / 760, wt = H * WT, out = { layers: [] }, r = rng(2014);
    // Far: a soft line of trees and low buildings across the lake.
    var far = layer(LW, H), g = far.g, nz = noise1(77), fog = 0.5;
    g.fillStyle = rgb(shade('#5E7F66', pal, fog));
    g.beginPath(); g.moveTo(0, wt);
    for (var x = 0; x <= LW; x += 6) g.lineTo(x, wt - (38 + fbm(nz, x / (90 * u)) * 60) * u);
    g.lineTo(LW, wt); g.closePath(); g.fill();
    g.fillStyle = rgb(shade('#9AA0A8', pal, fog));
    for (var b = 0; b < 7; b++) { var bx = LW * (0.08 + r() * 0.84), bw = (14 + r() * 18) * u, bh = (70 + r() * 70) * u; g.fillRect(bx, wt - bh, bw, bh); lights(g, bx, wt - bh, bw, bh, u, pal, r, 0.3); g.fillStyle = rgb(shade('#9AA0A8', pal, fog)); }
    far = soften(far, 1);
    out.layers.push({ p: 0.3, L: far });

    // Mid: tube houses along the far shore, painted walls, tiled roofs and big trees.
    var mid = layer(LW, H), m = mid.g, mfog = 0.16;
    var walls = ['#D8B15C', '#E6D2A2', '#C98159', '#A8C29C', '#EADBB9', '#D9A35C'];
    x = -10;
    var shore = wt - 6 * u;
    while (x < LW) {
      var hw = (26 + r() * 22) * u, hh = (46 + r() * 58) * u;
      if (r() > 0.78) {
        canopy(m, x + hw * 0.6, shore - hh * 0.9, hw * 0.9, '#3F7A48', pal, mfog, r, r() > 0.5 ? '#D9472F' : null);
        x += hw * 0.9; continue;
      }
      var wall = walls[Math.floor(r() * walls.length)];
      m.fillStyle = rgb(shade(wall, pal, mfog)); m.fillRect(x, shore - hh, hw, hh + 6 * u);
      m.fillStyle = rgb(shade('#9C4A33', pal, mfog));
      poly(m, [x - 2 * u, shore - hh, x + hw * 0.5, shore - hh - 9 * u, x + hw + 2 * u, shore - hh]);
      var shutter = rgb(shade('#4F7A5C', pal, mfog));
      for (var fl = 0; fl < Math.floor(hh / (17 * u)); fl++) {
        var wy = shore - hh + 8 * u + fl * 17 * u;
        m.fillStyle = shutter; m.fillRect(x + hw * 0.22, wy, hw * 0.22, 9 * u); m.fillRect(x + hw * 0.56, wy, hw * 0.22, 9 * u);
        if (pal.window > 0.15 && r() < pal.window * 0.6) { m.fillStyle = rgb('#FFCF7A', 0.9); m.fillRect(x + hw * 0.24, wy + 1.5 * u, hw * 0.52, 6 * u); }
        m.fillStyle = rgb(shade('#6B5A48', pal, mfog)); m.fillRect(x + hw * 0.15, wy + 10 * u, hw * 0.7, 1.4 * u);
      }
      x += hw;
    }
    // Ngọc Sơn temple roofs among trees, on the right.
    var tx = LW * 0.83, ty = shore - 34 * u;
    canopy(m, tx - 40 * u, ty - 30 * u, 44 * u, '#3C7446', pal, mfog, r);
    canopy(m, tx + 52 * u, ty - 24 * u, 40 * u, '#3C7446', pal, mfog, r, '#D9472F');
    m.fillStyle = rgb(shade('#C9B48A', pal, mfog)); m.fillRect(tx - 34 * u, ty, 68 * u, 34 * u);
    function eaveRoof(cx, y, w, h) {
      m.beginPath(); m.moveTo(cx - w * 0.62, y - h * 0.15); m.quadraticCurveTo(cx - w * 0.5, y + h * 0.05, cx - w * 0.38, y);
      m.lineTo(cx - w * 0.28, y - h); m.lineTo(cx + w * 0.28, y - h); m.lineTo(cx + w * 0.38, y);
      m.quadraticCurveTo(cx + w * 0.5, y + h * 0.05, cx + w * 0.62, y - h * 0.15); m.lineTo(cx + w * 0.5, y + h * 0.12); m.lineTo(cx - w * 0.5, y + h * 0.12); m.closePath(); m.fill();
    }
    m.fillStyle = rgb(shade('#7A3A2A', pal, mfog)); eaveRoof(tx, ty, 100 * u, 16 * u); eaveRoof(tx, ty - 20 * u, 70 * u, 13 * u);
    out.layers.push({ p: 0.55, L: mid });
    out.layers.push({ water: true, p: 0.85 });

    // Near: the Turtle Tower on its islet, and the red Thê Húc bridge.
    var near = layer(LW, H), n = near.g, nfog = 0.04, ix = LW * 0.52, iy = wt + 34 * u, t = 1.45 * u;
    n.fillStyle = rgb(shade('#4E6B45', pal, nfog));
    n.beginPath(); n.ellipse(ix, iy, 70 * u, 13 * u, 0, Math.PI, 0); n.fill();
    canopy(n, ix + 46 * u, iy - 26 * u, 22 * u, '#3E7A46', pal, nfog, r);
    var stoneC = rgb(shade('#CDBF9A', pal, nfog)), stoneD = rgb(shade('#7E7458', pal, nfog));
    var tiers = [[30, 26], [24, 20], [18, 16]], yb = iy - 4 * u;
    tiers.forEach(function (tr) {
      n.fillStyle = stoneC; n.fillRect(ix - tr[0] * t, yb - tr[1] * t, tr[0] * 2 * t, tr[1] * t);
      n.fillStyle = stoneD;
      var count = tr[0] > 26 ? 3 : 2;
      for (var a = 0; a < count; a++) {
        var ax = ix + (a - (count - 1) / 2) * tr[0] * 0.62 * t, aw = 4.4 * t, ah = tr[1] * 0.55 * t, ay = yb - 3 * t;
        n.beginPath(); n.moveTo(ax - aw, ay); n.lineTo(ax - aw, ay - ah + aw); n.arc(ax, ay - ah + aw, aw, Math.PI, 0); n.lineTo(ax + aw, ay); n.closePath(); n.fill();
      }
      n.fillStyle = rgb(shade('#A99C76', pal, nfog)); n.fillRect(ix - tr[0] * t - 2 * t, yb - tr[1] * t - 2 * t, tr[0] * 2 * t + 4 * t, 2.4 * t);
      yb -= tr[1] * t + 2 * t;
    });
    n.fillStyle = stoneC; n.fillRect(ix - 7 * t, yb - 10 * t, 14 * t, 10 * t);
    n.fillStyle = rgb(shade('#6E5A44', pal, nfog));
    poly(n, [ix - 13 * t, yb - 9 * t, ix + 13 * t, yb - 9 * t, ix + 6 * t, yb - 17 * t, ix - 6 * t, yb - 17 * t]);
    poly(n, [ix - 2 * t, yb - 17 * t, ix + 2 * t, yb - 17 * t, ix, yb - 23 * t]);
    // Thê Húc bridge
    var bx0 = LW * 0.75, bx1 = LW * 1.12, by = wt + 8 * u, red = rgb(shade('#C2392A', pal, nfog)), redD = rgb(shade('#7E2219', pal, nfog));
    n.strokeStyle = red; n.lineWidth = 7 * u; n.lineCap = 'round';
    n.beginPath(); n.moveTo(bx0, by); n.quadraticCurveTo((bx0 + bx1) / 2, by - 70 * u, bx1, by - 10 * u); n.stroke();
    n.strokeStyle = redD; n.lineWidth = 2 * u;
    n.beginPath(); n.moveTo(bx0, by + 6 * u); n.quadraticCurveTo((bx0 + bx1) / 2, by - 62 * u, bx1, by - 2 * u); n.stroke();
    n.strokeStyle = red; n.lineWidth = 2 * u;
    n.beginPath(); n.moveTo(bx0, by - 16 * u); n.quadraticCurveTo((bx0 + bx1) / 2, by - 86 * u, bx1, by - 26 * u); n.stroke();
    for (var p = 0; p <= 18; p++) {
      var k = p / 18, qx = lerp(lerp(bx0, (bx0 + bx1) / 2, k), lerp((bx0 + bx1) / 2, bx1, k), k);
      var q1 = lerp(lerp(by, by - 70 * u, k), lerp(by - 70 * u, by - 10 * u, k), k);
      var q2 = lerp(lerp(by - 16 * u, by - 86 * u, k), lerp(by - 86 * u, by - 26 * u, k), k);
      n.beginPath(); n.moveTo(qx, q1); n.lineTo(qx, q2); n.stroke();
    }
    n.lineCap = 'butt';
    if (pal.window > 0.3) {
      for (var lp = 0; lp <= 6; lp++) {
        var kk = lp / 6, lx = lerp(lerp(bx0, (bx0 + bx1) / 2, kk), lerp((bx0 + bx1) / 2, bx1, kk), kk), ly = lerp(lerp(by - 16 * u, by - 86 * u, kk), lerp(by - 86 * u, by - 26 * u, kk), kk);
        var gl = n.createRadialGradient(lx, ly - 4 * u, 0, lx, ly - 4 * u, 10 * u);
        gl.addColorStop(0, rgb('#FFD58A', 0.95 * pal.window)); gl.addColorStop(1, rgb('#FFD58A', 0));
        n.fillStyle = gl; circle(n, lx, ly - 4 * u, 10 * u);
      }
    }
    // Lotus leaves along the near water.
    for (var lo = 0; lo < 14; lo++) {
      var lxx = LW * (0.03 + r() * 0.3), lyy = H * (0.86 + r() * 0.12), lr = (9 + r() * 14) * u;
      n.fillStyle = rgb(shade('#3F7A4A', pal, 0.02)); n.beginPath(); n.ellipse(lxx, lyy, lr, lr * 0.32, 0, 0, Math.PI * 2); n.fill();
      n.fillStyle = rgb(shade('#7FB06A', pal, 0.02)); n.beginPath(); n.ellipse(lxx - lr * 0.2, lyy - lr * 0.06, lr * 0.55, lr * 0.14, 0, 0, Math.PI * 2); n.fill();
      if (r() > 0.75) { n.fillStyle = rgb(shade('#F2A6B6', pal, 0.02)); poly(n, [lxx - 4 * u, lyy - 2 * u, lxx + 4 * u, lyy - 2 * u, lxx, lyy - 12 * u]); }
    }
    var fr = rng(303);
    canopy(n, LW * 0.93, 30 * u, 120 * u, '#356B3E', pal, 0.02, fr, '#D9472F');
    canopy(n, LW * 0.8, -10 * u, 90 * u, '#3C7446', pal, 0.02, fr, '#E0553A');
    canopy(n, LW * 1.02, 140 * u, 80 * u, '#2F6238', pal, 0.02, fr, '#D9472F');
    out.layers.push({ p: 0.95, L: near });
    out.reflect = [far, mid, near];
    var strands = [];
    var rs = rng(88);
    for (var s = 0; s < 44; s++) strands.push({ x: 0.02 + rs() * 0.2, len: (90 + rs() * 200) * (1 - rs() * 0.3), ph: rs() * 6.28, w: 0.6 + rs() * 1.1 });
    out.extra = function (gg, x, alpha, time) { willow(gg, x, alpha, time, pal, strands); petals(gg, x, alpha, time, pal); };
    return out;
  }
  function willow(g, x, alpha, t, pal, strands) {
    var u = H / 760, LW = W * 1.3, leaf = rgb(shade('#6FA556', pal, 0.02)), mid = rgb(shade('#4C8A45', pal, 0.02)), dark = rgb(shade('#2C5A32', pal, 0.02));
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = dark;
    for (var c = 0; c < 9; c++) circle(g, x + LW * (0.01 + c * 0.028), -20 * u + Math.sin(c * 2.3) * 18 * u, (46 + (c % 3) * 14) * u);
    g.fillStyle = mid;
    for (var c2 = 0; c2 < 7; c2++) circle(g, x + LW * (0.02 + c2 * 0.03), -34 * u + Math.cos(c2 * 1.7) * 14 * u, (30 + (c2 % 2) * 12) * u);
    strands.forEach(function (s, i) {
      var x0 = x + s.x * LW, len = s.len * u, sway = Math.sin(t * 0.8 + s.ph) * 8 * u * (s.len / 200);
      g.strokeStyle = i % 4 === 0 ? dark : mid; g.lineWidth = s.w * u;
      g.beginPath(); g.moveTo(x0, 10 * u); g.quadraticCurveTo(x0 + sway * 0.3, len * 0.55, x0 + sway, len); g.stroke();
      g.fillStyle = i % 3 === 0 ? dark : (i % 3 === 1 ? mid : leaf);
      for (var k = 0.12; k < 1; k += 0.045) {
        var lx = x0 + sway * k * k, ly = 10 * u + (len - 10 * u) * k, side = (Math.floor(k * 40) % 2 ? 1 : -1);
        g.beginPath(); g.ellipse(lx + side * 2.2 * u, ly, 4.6 * u, 1.7 * u, side * 1.1, 0, Math.PI * 2); g.fill();
      }
    });
    g.restore();
  }
  var petalSeed = rng(5);
  var petalList = [];
  for (var pi = 0; pi < 18; pi++) petalList.push({ x: petalSeed(), y: petalSeed(), s: 0.6 + petalSeed(), ph: petalSeed() * 6.28 });
  function petals(g, x, alpha, t, pal) {
    if (pal.light < 0.5) return;
    var u = H / 760, LW = W * 1.3;
    g.save(); g.globalAlpha = alpha * 0.9; g.fillStyle = rgb(shade('#D9472F', pal, 0));
    petalList.forEach(function (p) {
      var px = x + ((p.x * LW + t * 14 * u * p.s) % LW), py = ((p.y * H * 0.7 + t * 10 * u * p.s) % (H * 0.75)) + H * 0.05;
      g.beginPath(); g.ellipse(px + Math.sin(t + p.ph) * 8 * u, py, 3 * u * p.s, 1.6 * u * p.s, t + p.ph, 0, Math.PI * 2); g.fill();
    });
    g.restore();
  }

  /* ---------- Hong Kong ---------- */
  function paintHK(pal) {
    var LW = W * 1.3, u = H / 760, wt = H * WT, out = { layers: [] }, r = rng(2021);
    // Far ridge: Victoria Peak and its neighbours.
    var far = layer(LW, H), g = far.g, nz = noise1(9);
    var grad = g.createLinearGradient(0, wt - 330 * u, 0, wt);
    grad.addColorStop(0, rgb(shade('#6E9A78', pal, 0.42))); grad.addColorStop(1, rgb(shade('#4F7F5E', pal, 0.55)));
    g.fillStyle = grad; g.beginPath(); g.moveTo(0, wt);
    for (var x = 0; x <= LW; x += 5) {
      var k = x / LW, hump = Math.exp(-Math.pow((k - 0.42) / 0.2, 2)) * 150 + Math.exp(-Math.pow((k - 0.8) / 0.14, 2)) * 90;
      g.lineTo(x, wt - (120 + hump + fbm(nz, x / (70 * u)) * 60) * u);
    }
    g.lineTo(LW, wt); g.closePath(); g.fill();
    far = soften(far, 1.2);
    out.layers.push({ p: 0.22, L: far });
    // Nearer ridge, with painted foliage.
    var ridge = layer(LW, H), rg = ridge.g, nz2 = noise1(31), top = [];
    rg.fillStyle = rgb(shade('#3E6E4C', pal, 0.24)); rg.beginPath(); rg.moveTo(0, wt);
    for (var x2 = 0; x2 <= LW; x2 += 5) { var yy = wt - (70 + fbm(nz2, x2 / (60 * u)) * 90 + Math.exp(-Math.pow((x2 / LW - 0.3) / 0.25, 2)) * 60) * u; top.push(yy); rg.lineTo(x2, yy); }
    rg.lineTo(LW, wt); rg.closePath(); rg.fill();
    for (var f = 0; f < 900; f++) {
      var fx = r() * LW, idx = Math.floor(fx / 5), ty = top[idx] || wt, fy = ty + r() * (wt - ty);
      rg.fillStyle = rgb(shade(r() > 0.5 ? '#5C8C5E' : '#2D5A3C', pal, 0.24), 0.5);
      circle(rg, fx, fy, (1.5 + r() * 3) * u);
    }
    out.layers.push({ p: 0.38, L: ridge });

    // The skyline along the harbour.
    var mid = layer(LW, H), m = mid.g, mfog = 0.12, glass = ['#7D8FA6', '#A7B3C1', '#6A7A92', '#C9C1B0', '#8FA0AE', '#B9A891', '#D3D6D8'];
    var shoreY = wt - 4 * u;
    x = -10;
    while (x < LW) {
      var bw0 = (18 + r() * 30) * u, bh0 = (70 + r() * 110) * u;
      tower(m, x, shoreY - 24 * u, bw0, bh0, glass[Math.floor(r() * glass.length)], pal, 0.4, r, u, 0.4);
      x += bw0 + (r() * 10 - 3) * u;
    }
    x = -10;
    while (x < LW) {
      var bw = (16 + r() * 28) * u, bh = (34 + r() * 96) * u;
      tower(m, x, shoreY, bw, bh, glass[Math.floor(r() * glass.length)], pal, mfog, r, u, 0.55);
      x += bw - 1 * u;
    }
    m.fillStyle = rgb(shade('#3E4A44', pal, 0.1)); m.fillRect(0, shoreY - 3 * u, LW, 8 * u);
    // Two International Finance Centre
    var ix = LW * 0.33, iw = 34 * u, ih = 400 * u, icol = rgb(shade('#9AA8B6', pal, mfog));
    m.fillStyle = icol;
    poly(m, [ix - iw / 2, shoreY + 4 * u, ix - iw / 2, shoreY - ih * 0.82, ix - iw * 0.4, shoreY - ih * 0.9, ix - iw * 0.32, shoreY - ih * 0.96, ix - iw * 0.18, shoreY - ih,
      ix + iw * 0.18, shoreY - ih, ix + iw * 0.32, shoreY - ih * 0.96, ix + iw * 0.4, shoreY - ih * 0.9, ix + iw / 2, shoreY - ih * 0.82, ix + iw / 2, shoreY + 4 * u]);
    lights(m, ix - iw / 2, shoreY - ih * 0.8, iw, ih * 0.8, u, pal, r, 0.6);
    m.fillStyle = rgb(pal.skyLow, 0.18 * pal.light); m.fillRect(ix - iw * 0.08, shoreY - ih * 0.98, iw * 0.04, ih * 0.97);
    // Bank of China Tower: stepped triangular prisms with cross bracing.
    var bx = LW * 0.5, bw2 = 40 * u, bh2 = 330 * u, bcol = rgb(shade('#7E8DA0', pal, mfog));
    m.fillStyle = bcol;
    poly(m, [bx - bw2 / 2, shoreY + 4 * u, bx - bw2 / 2, shoreY - bh2 * 0.55, bx, shoreY - bh2 * 0.72, bx, shoreY - bh2 * 0.86, bx + bw2 * 0.2, shoreY - bh2,
      bx + bw2 / 2, shoreY - bh2 * 0.9, bx + bw2 / 2, shoreY + 4 * u]);
    m.fillRect(bx + bw2 * 0.14, shoreY - bh2 - 40 * u, 1.4 * u, 40 * u); m.fillRect(bx + bw2 * 0.28, shoreY - bh2 - 30 * u, 1.4 * u, 30 * u);
    m.strokeStyle = pal.window > 0.3 ? rgb('#F4F0E0', 0.75 * pal.window) : rgb(mix(pal.skyLow, '#FFFFFF', 0.4), 0.55);
    m.lineWidth = 1.4 * u;
    for (var seg = 0; seg < 4; seg++) {
      var y0 = shoreY - seg * bh2 * 0.14, y1 = y0 - bh2 * 0.14;
      m.beginPath(); m.moveTo(bx - bw2 / 2, y0); m.lineTo(bx + bw2 / 2, y1); m.moveTo(bx + bw2 / 2, y0); m.lineTo(bx - bw2 / 2, y1); m.stroke();
    }
    // Central Plaza, with its pyramid crown and mast.
    var px = LW * 0.62, pw = 30 * u, ph = 310 * u;
    m.fillStyle = rgb(shade('#BBA98A', pal, mfog));
    poly(m, [px - pw / 2, shoreY + 4 * u, px - pw / 2, shoreY - ph, px, shoreY - ph - 22 * u, px + pw / 2, shoreY - ph, px + pw / 2, shoreY + 4 * u]);
    m.fillRect(px - 0.7 * u, shoreY - ph - 70 * u, 1.4 * u, 50 * u);
    lights(m, px - pw / 2, shoreY - ph, pw, ph, u, pal, r, 0.6);
    if (pal.window > 0.3) {
      m.fillStyle = rgb('#B4E0FF', 0.7 * pal.window); poly(m, [px - pw * 0.3, shoreY - ph - 2 * u, px, shoreY - ph - 18 * u, px + pw * 0.3, shoreY - ph - 2 * u]);
    }
    out.layers.push({ p: 0.6, L: mid });
    out.layers.push({ water: true, p: 0.85 });
    out.reflect = [far, ridge, mid];
    out.extra = function (gg, xx, alpha, time) { ferry(gg, xx, alpha, time, pal); };
    return out;
  }
  function ferry(g, x, alpha, t, pal) {
    var u = H / 760, wt = H * WT, LW = W * 1.3, span = LW + 300 * u, px = x - 150 * u + ((t * 12 * u) % span), py = wt + 70 * u;
    var green = rgb(shade('#2F6B4A', pal, 0.03)), white = rgb(shade('#F2EEE4', pal, 0.03)), dark = rgb(shade('#22262E', pal, 0.03));
    g.save(); g.globalAlpha = alpha;
    g.fillStyle = rgb(pal.waterDeep, 0.35); g.beginPath(); g.ellipse(px, py + 16 * u, 72 * u, 5 * u, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = white; poly(g, [px - 66 * u, py, px + 66 * u, py, px + 58 * u, py + 14 * u, px - 58 * u, py + 14 * u]);
    g.fillStyle = green; g.fillRect(px - 60 * u, py - 14 * u, 120 * u, 14 * u);
    g.fillStyle = white; g.fillRect(px - 52 * u, py - 26 * u, 104 * u, 12 * u);
    g.fillStyle = green; g.fillRect(px - 54 * u, py - 30 * u, 108 * u, 4 * u);
    g.fillStyle = pal.window > 0.3 ? rgb('#FFD98A', 0.95) : dark;
    for (var w = -46; w < 46; w += 9) g.fillRect(px + w * u, py - 23 * u, 5 * u, 5 * u);
    g.fillStyle = dark; g.fillRect(px - 3 * u, py - 40 * u, 6 * u, 10 * u);
    g.fillStyle = rgb('#FFFFFF', 0.35); g.fillRect(px - 70 * u, py + 13 * u, 26 * u, 1.5 * u);
    g.restore();
  }

  /* ---------- the world ---------- */
  var CITIES = [
    { zone: 'America/New_York', paint: paintNY },
    { zone: 'Asia/Ho_Chi_Minh', paint: paintHN },
    { zone: 'Asia/Hong_Kong', paint: paintHK }
  ];
  var stars = [], grain = null, mottle = null;
  function build() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    W = Math.max(320, Math.round(rect.width)); H = Math.max(360, Math.round(rect.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CITIES.forEach(function (c, i) {
      c.hour = hourIn(c.zone);
      c.pal = palAt(c.hour);
      c.art = c.paint(c.pal);
      c.art.layers.forEach(function (L) { if (L.L) feather(L.L); });
      c.clouds = makeClouds(c.pal, 100 + i * 13);
    });
    var r = rng(4);
    stars = [];
    for (var s = 0; s < 170; s++) stars.push({ x: r(), y: r() * WT * 0.85, s: 0.4 + r() * 1.2, ph: r() * 6.28 });
    var gc = layer(180, 180), gg = gc.g, rr = rng(12);
    var img = gg.getImageData(0, 0, gc.c.width, gc.c.height);
    for (var p = 0; p < img.data.length; p += 4) { var v = 110 + rr() * 140; img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255; }
    gg.putImageData(img, 0, 0);
    grain = ctx.createPattern(gc.c, 'repeat');
    // A seamless tile of soft paint blotches: painted on a 3x3 field, blurred, then cut from the centre.
    var T = 420, big = layer(T * 3, T * 3), bg = big.g, mr = rng(77);
    if ('filter' in bg) bg.filter = 'blur(10px)';
    for (var q = 0; q < 260; q++) {
      var qx = mr() * T, qy = mr() * T, qr = 12 + mr() * 46;
      bg.fillStyle = mr() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
      for (var ox = 0; ox < 3; ox++) for (var oy = 0; oy < 3; oy++) circle(bg, qx + ox * T, qy + oy * T, qr);
    }
    var mc = layer(T, T);
    mc.g.drawImage(big.c, T * dpr, T * dpr, T * dpr, T * dpr, 0, 0, T, T);
    mottle = ctx.createPattern(mc.c, 'repeat');
  }

  function sunPos(h) {
    if (h >= 6 && h <= 18.8) { var k = (h - 6) / 12.8; return { x: 0.12 + 0.76 * k, y: WT - Math.sin(Math.PI * k) * 0.56, moon: false }; }
    var hh = h < 6 ? h + 24 : h, k2 = (hh - 18.8) / 11.2;
    return { x: 0.12 + 0.76 * k2, y: WT - Math.sin(Math.PI * k2) * 0.5, moon: true };
  }

  var cam = { x: 2, v: 0, target: 2 }, pointer = { x: 0, y: 0, tx: 0, ty: 0 }, time = 0, last = 0;
  function drawSky(pal) {
    var g = ctx.createLinearGradient(0, 0, 0, H * WT);
    g.addColorStop(0, rgb(pal.skyTop)); g.addColorStop(0.58, rgb(pal.skyMid)); g.addColorStop(1, rgb(pal.skyLow));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (pal.stars > 0.02) {
      stars.forEach(function (s) {
        var a = pal.stars * (0.45 + 0.55 * Math.sin(time * 1.3 + s.ph * 3)) * (1 - s.y / WT * 0.6);
        if (a <= 0.02) return;
        ctx.fillStyle = rgb('#FFF8E6', a); ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      });
    }
  }
  function drawSun(city, w, offset) {
    var pal = city.pal, sp = sunPos(city.hour);
    if (sp.y > WT + 0.02) return;
    var x = sp.x * W + offset * 0.06, y = sp.y * H, R = H * (sp.moon ? 0.028 : 0.034);
    ctx.save(); ctx.globalAlpha = w;
    ctx.globalCompositeOperation = 'screen';
    var glow = ctx.createRadialGradient(x, y, R * 0.5, x, y, H * (sp.moon ? 0.22 : 0.42));
    glow.addColorStop(0, rgb(pal.glow, sp.moon ? 0.35 : 0.7)); glow.addColorStop(1, rgb(pal.glow, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgb(mix(pal.glow, '#FFFFFF', 0.45)); circle(ctx, x, y, R);
    if (sp.moon) { ctx.fillStyle = rgb(pal.skyMid, 0.85); circle(ctx, x + R * 0.42, y - R * 0.2, R * 0.86); }
    ctx.restore();
  }
  function drawAtmosphere(city, w, offset) {
    var pal = city.pal, sp = sunPos(city.hour), wt = H * WT;
    ctx.save(); ctx.globalAlpha = w; ctx.globalCompositeOperation = 'screen';
    var band = ctx.createLinearGradient(0, wt - H * 0.16, 0, wt + H * 0.02);
    band.addColorStop(0, rgb(pal.glow, 0)); band.addColorStop(0.8, rgb(pal.glow, 0.22 * (0.4 + pal.light * 0.6))); band.addColorStop(1, rgb(pal.glow, 0));
    ctx.fillStyle = band; ctx.fillRect(0, wt - H * 0.16, W, H * 0.18);
    if (!sp.moon && sp.y < WT && pal.light > 0.55) {
      var sx = sp.x * W + offset * 0.06, sy = sp.y * H;
      for (var k = 0; k < 6; k++) {
        var a = -0.5 + k * 0.2 + Math.sin(time * 0.15 + k) * 0.03, len = H * 1.1, spread = 0.035;
        var rg = ctx.createLinearGradient(sx, sy, sx + Math.sin(a) * len, sy + Math.cos(a) * len);
        rg.addColorStop(0, rgb(pal.glow, 0.12)); rg.addColorStop(1, rgb(pal.glow, 0));
        ctx.fillStyle = rg;
        poly(ctx, [sx, sy, sx + Math.sin(a - spread) * len, sy + Math.cos(a - spread) * len, sx + Math.sin(a + spread) * len, sy + Math.cos(a + spread) * len]);
      }
    }
    ctx.restore();
  }
  function drawClouds(city, w, offset) {
    var drift = time * 1;
    city.clouds.forEach(function (c) {
      var span = W * 1.6, x = ((c.x * W + offset * 0.16 + drift * c.speed + pointer.x * 6) % span + span) % span - W * 0.3;
      ctx.globalAlpha = w;
      ctx.drawImage(c.sprite.c, x, c.y + pointer.y * 4, c.w, c.h);
    });
    ctx.globalAlpha = 1;
  }
  function drawWater(city, x, w) {
    var pal = city.pal, wt = H * WT, wh = H - wt, LW = W * 1.3;
    ctx.save(); ctx.globalAlpha = w;
    var g = ctx.createLinearGradient(0, wt, 0, H);
    g.addColorStop(0, rgb(mix(pal.skyLow, pal.water, 0.45))); g.addColorStop(0.35, rgb(pal.water)); g.addColorStop(1, rgb(pal.waterDeep));
    ctx.fillStyle = g; ctx.fillRect(0, wt, W, wh);
    ctx.globalAlpha = w * 0.36;
    var step = 3;
    for (var y = 0; y < wh; y += step) {
      var src = wt - y * 1.2 - 1;
      if (src < 0) break;
      var off = Math.sin(y * 0.13 + time * 1.5) * (0.4 + y * 0.018);
      city.art.reflect.forEach(function (L) { ctx.drawImage(L.c, 0, src * dpr, L.c.width, step * dpr, x + off, wt + y, LW, step); });
    }
    ctx.globalAlpha = w;
    var sp = sunPos(city.hour);
    if (sp.y < WT) {
      var sx = sp.x * W;
      for (var k = 0; k < 46; k++) {
        var yy = wt + 4 + Math.pow(k / 46, 1.4) * wh, spread = 8 + (yy - wt) * 0.35;
        var a = (0.25 + 0.35 * Math.sin(time * 2.4 + k * 1.7)) * (sp.moon ? 0.5 : 0.85);
        ctx.fillStyle = rgb(pal.glow, Math.max(0, a));
        ctx.fillRect(sx + Math.sin(k * 12.9898) * spread, yy, 6 + (k % 5) * 3, 1.2);
      }
    }
    var shine = ctx.createLinearGradient(0, wt, 0, wt + 14);
    shine.addColorStop(0, rgb(pal.skyLow, 0.5)); shine.addColorStop(1, rgb(pal.skyLow, 0));
    ctx.fillStyle = shine; ctx.fillRect(0, wt, W, 14);
    ctx.restore();
  }
  function drawBirds(pal, w) {
    if (pal.bird < 0.1) return;
    ctx.save(); ctx.globalAlpha = w * pal.bird * 0.75; ctx.strokeStyle = rgb(shade('#2A2F3A', pal, 0.2)); ctx.lineWidth = 1.3;
    var u = H / 760;
    for (var b = 0; b < 6; b++) {
      var bx = ((time * (18 + b * 2) * u + b * 70 * u) % (W + 200)) - 100, by = H * 0.22 + Math.sin(time * 0.6 + b) * 12 * u + b * 9 * u;
      var flap = Math.sin(time * 7 + b * 1.3) * 3 * u;
      ctx.beginPath(); ctx.moveTo(bx - 6 * u, by - flap); ctx.quadraticCurveTo(bx - 2 * u, by - 3 * u, bx, by); ctx.quadraticCurveTo(bx + 2 * u, by - 3 * u, bx + 6 * u, by - flap); ctx.stroke();
    }
    ctx.restore();
  }

  function feather(L) {
    var g = L.g, fg = g.createLinearGradient(0, 0, L.w, 0);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.07, 'rgba(0,0,0,1)'); fg.addColorStop(0.93, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.globalCompositeOperation = 'destination-in'; g.fillStyle = fg; g.fillRect(0, 0, L.w, L.h); g.restore();
  }
  function render() {
    var c = clamp(cam.x, 0, 2), i0 = Math.min(1, Math.floor(c)), f = c - i0;
    var skyPal = mixPal(CITIES[i0].pal, CITIES[i0 + 1].pal, smooth(f));
    drawSky(skyPal);
    CITIES.forEach(function (city, i) {
      var w = clamp(1 - Math.abs(i - c), 0, 1);
      if (w <= 0.001) return;
      var offset = (i - c) * W;
      drawSun(city, w, offset);
      drawClouds(city, w, offset);
      drawAtmosphere(city, w, offset);
    });
    drawBirds(skyPal, 1);
    CITIES.forEach(function (city, i) {
      var w = clamp(1 - Math.abs(i - c), 0, 1);
      if (w <= 0.001) return;
      var offset = (i - c) * W, LW = W * 1.3, near = 0;
      city.art.layers.forEach(function (L) {
        var x = -(LW - W) / 2 + offset * L.p - pointer.x * 14 * L.p;
        if (L.water) { drawWater(city, x, smooth(w)); near = x; return; }
        ctx.globalAlpha = L.p < 0.5 ? smooth(w) : w;
        ctx.drawImage(L.L.c, x, pointer.y * 6 * L.p * -1, LW, H);
        near = x;
      });
      ctx.globalAlpha = 1;
      if (city.art.extra) city.art.extra(ctx, near, w, time);
    });
    // Paper grain and a soft vignette.
    if (mottle) { ctx.save(); ctx.globalAlpha = 0.34; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = mottle; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (grain) { ctx.save(); ctx.globalAlpha = 0.09; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    var v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(10,14,30,0)'); v.addColorStop(1, 'rgba(10,14,30,0.22)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- motion and interaction ---------- */
  var running = false, visible = true, intro = [], dragging = null, onCity = null;
  function step(now) {
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!reduced) time += dt;
    if (intro.length && now >= intro[0].at) cam.target = intro.shift().to;
    if (!dragging) {
      var k = 22, d = 2 * Math.sqrt(k);
      cam.v += ((cam.target - cam.x) * k - cam.v * d) * dt;
      cam.x += cam.v * dt;
    }
    pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
    render();
    var nearest = Math.round(clamp(cam.x, 0, 2));
    if (nearest !== onCity) { onCity = nearest; announce(nearest); }
    if (visible) requestAnimationFrame(step); else running = false;
  }
  function start() { if (!running) { running = true; last = 0; requestAnimationFrame(step); } }

  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-city]'));
  var captions = Array.prototype.slice.call(document.querySelectorAll('[data-caption]'));
  function announce(i) {
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(parseInt(b.getAttribute('data-city'), 10) === i)); });
    captions.forEach(function (c) { c.classList.toggle('is-on', parseInt(c.getAttribute('data-caption'), 10) === i); });
  }
  function go(i) { intro = []; cam.target = clamp(i, 0, 2); if (reduced) { cam.x = cam.target; cam.v = 0; } start(); }
  buttons.forEach(function (b) { b.addEventListener('click', function () { go(parseInt(b.getAttribute('data-city'), 10)); }); });

  canvas.addEventListener('pointerdown', function (e) {
    intro = []; dragging = { x: e.clientX, cam: cam.x, t: performance.now(), lastX: e.clientX, v: 0 };
    canvas.setPointerCapture(e.pointerId); stage.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    var r = stage.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!dragging) return;
    var now = performance.now(), dx = e.clientX - dragging.x;
    cam.x = clamp(dragging.cam - dx / (W * 0.9), -0.15, 2.15);
    dragging.v = (dragging.lastX - e.clientX) / Math.max(1, now - dragging.t) / W * 1000; dragging.lastX = e.clientX; dragging.t = now;
  });
  function endDrag() {
    if (!dragging) return;
    var v = dragging.v; dragging = null; stage.classList.remove('is-dragging');
    cam.v = 0; cam.target = clamp(Math.round(cam.x + clamp(v * 0.25, -0.6, 0.6)), 0, 2);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', function () { pointer.tx = 0; pointer.ty = 0; });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(Math.round(cam.target) - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { go(Math.round(cam.target) + 1); e.preventDefault(); }
  });

  build();
  if (forcedCity != null && !isNaN(forcedCity)) { cam.x = cam.target = clamp(forcedCity, 0, 2); }
  else if (!reduced) {
    cam.x = 0; cam.target = 0;
    var t0 = performance.now();
    intro = [{ at: t0 + 1600, to: 1 }, { at: t0 + 4600, to: 2 }];
  }
  render(); announce(Math.round(cam.x)); onCity = Math.round(cam.x);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) start(); }).observe(stage);
  }
  start();
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { build(); render(); }, 150); });
  setInterval(function () { build(); }, 5 * 60 * 1000);
  stage.classList.add('is-live');
})();
