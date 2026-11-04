// Kit drawing helpers. One spec draws clean SVG, or rough.js strokes when html has class "hand".
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const hand = () => document.documentElement.classList.contains('hand');
  let seed = 3;

  const KINDS = {
    step:     { stroke: 'var(--ink)',      fill: 'var(--surface)',     hatch: null,             w: 2 },
    key:      { stroke: 'var(--signal)',   fill: 'var(--signal-bg)',   hatch: 'var(--signal)',  w: 3.5 },
    action:   { stroke: 'var(--action)',   fill: 'var(--action-bg)',   hatch: 'var(--action)',  w: 2 },
    data:     { stroke: 'var(--data)',     fill: 'var(--data-bg)',     hatch: 'var(--data)',    w: 2 },
    external: { stroke: 'var(--external)', fill: 'var(--external-bg)', hatch: 'var(--external)', w: 2 },
    warn:     { stroke: 'var(--warn)',     fill: 'var(--warn-bg)',     hatch: 'var(--warn)',    w: 2 },
    risk:     { stroke: 'var(--risk)',     fill: 'var(--risk-bg)',     hatch: 'var(--risk)',    w: 2 },
    planned:  { stroke: 'var(--ink-2)',    fill: 'none',               hatch: null,             w: 2, dash: [8, 7] },
    ink:      { stroke: 'var(--ink)',      fill: 'var(--ink)',         hatch: 'var(--ink)',     w: 2, solid: true },
    muted:    { stroke: 'var(--ink-2)',    fill: 'var(--ink-2)',       hatch: 'var(--ink-2)',   w: 2, solid: true },
    text:     { stroke: 'none',            fill: 'none',               hatch: null,             w: 0 },
  };
  const EDGES = {
    flow: { stroke: 'var(--ink)',    w: 2 },
    read: { stroke: 'var(--ink-2)',  w: 2, dash: [7, 7] },
    main: { stroke: 'var(--signal)', w: 5 },
    risk: { stroke: 'var(--risk)',   w: 2.5 },
    data: { stroke: 'var(--data)',   w: 2.5 },
    axis: { stroke: 'var(--ink-2)',  w: 2, head: false },
    rule: { stroke: 'var(--hair)',   w: 2, head: false },
  };

  function fixVars(g) {
    g.querySelectorAll('path').forEach(p => {
      ['stroke', 'fill'].forEach(a => {
        const v = p.getAttribute(a);
        if (v && v.startsWith('var(')) { p.style[a] = v; p.removeAttribute(a); }
      });
    });
  }

  // Draw one path. o: stroke, fill, hatch, w, dash, solid
  function shape(svg, d, o) {
    if (hand()) {
      const rc = rough.svg(svg);
      const fill = o.solid ? o.fill : (o.hatch || undefined);
      const g = rc.path(d, {
        stroke: o.stroke === 'none' ? 'transparent' : o.stroke, strokeWidth: o.w || 0.01,
        fill, fillStyle: o.solid ? 'solid' : 'hachure', hachureGap: 9, fillWeight: 1.3, hachureAngle: -41,
        roughness: o.rough ?? 1.3, bowing: 1, strokeLineDash: o.dash, seed: seed++,
      });
      fixVars(g);
      if (!o.solid && fill) g.querySelectorAll('path').forEach(p => { if (p.getAttribute('stroke-width') === '1.3') p.style.opacity = 0.38; });
      svg.appendChild(g);
      return g;
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.style.stroke = o.stroke || 'none';
    p.style.fill = o.fill || 'none';
    p.style.strokeWidth = o.w || 0;
    p.style.strokeLinejoin = 'round';
    p.style.strokeLinecap = 'round';
    if (o.dash) p.style.strokeDasharray = o.dash.join(' ');
    svg.appendChild(p);
    return p;
  }

  const rr = (x, y, w, h, r) => {
    r = Math.min(r, h / 2, w / 2);
    if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  };
  const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;

  function nodePath(n) {
    const { x, y, w, h } = n;
    switch (n.shape) {
      case 'pill': return rr(x, y, w, h, h / 2);
      case 'circle': return ell(x + w / 2, y + h / 2, w / 2, h / 2);
      case 'diamond': return `M${x + w / 2} ${y}L${x + w} ${y + h / 2}L${x + w / 2} ${y + h}L${x} ${y + h / 2}Z`;
      case 'store': {
        const ry = 12;
        return `M${x} ${y + ry}A${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry}Z`;
      }
      case 'note': { const f = 22; return `M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`; }
      default: return rr(x, y, w, h, hand() ? 0 : 6);
    }
  }

  function port(n, side) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    return { r: [n.x + n.w, cy], l: [n.x, cy], t: [cx, n.y], b: [cx, n.y + n.h] }[side];
  }
  function sides(a, b) {
    const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
    return dy >= 0 ? ['b', 't'] : ['t', 'b'];
  }
  const horiz = s => s === 'l' || s === 'r';

  function elbow(p1, s1, p2, s2, mid) {
    if (horiz(s1) && horiz(s2)) {
      if (p1[1] === p2[1]) return [p1, p2];
      const mx = mid ?? (p1[0] + p2[0]) / 2; return [p1, [mx, p1[1]], [mx, p2[1]], p2];
    }
    if (!horiz(s1) && !horiz(s2)) {
      if (p1[0] === p2[0]) return [p1, p2];
      const my = mid ?? (p1[1] + p2[1]) / 2; return [p1, [p1[0], my], [p2[0], my], p2];
    }
    return horiz(s1) ? [p1, [p2[0], p1[1]], p2] : [p1, [p1[0], p2[1]], p2];
  }

  function polyD(pts, r) {
    if (pts.length < 3 || !r) return 'M' + pts.map(p => p.join(' ')).join('L');
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
      const k = Math.min(r, l1 / 2, l2 / 2);
      const a = [cx - (cx - px) / l1 * k, cy - (cy - py) / l1 * k];
      const b = [cx + (nx - cx) / l2 * k, cy + (ny - cy) / l2 * k];
      d += `L${a[0]} ${a[1]}Q${cx} ${cy} ${b[0]} ${b[1]}`;
    }
    const e = pts[pts.length - 1];
    return d + `L${e[0]} ${e[1]}`;
  }

  function head(svg, tip, from, o) {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]), l = 9 + o.w * 2.2, s = 0.42;
    const p1 = [tip[0] - l * Math.cos(a - s), tip[1] - l * Math.sin(a - s)];
    const p2 = [tip[0] - l * Math.cos(a + s), tip[1] - l * Math.sin(a + s)];
    if (hand()) shape(svg, `M${p1.join(' ')}L${tip.join(' ')}L${p2.join(' ')}`, { stroke: o.stroke, w: o.w, rough: 0.8 });
    else shape(svg, `M${p1.join(' ')}L${tip.join(' ')}L${p2.join(' ')}Z`, { stroke: o.stroke, fill: o.stroke, w: 1 });
  }

  function label(el, cls, x, y, html, extra) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    Object.assign(d.style, { left: x + 'px', top: y + 'px' }, extra || {});
    el.appendChild(d);
    return d;
  }

  function diagram(el, spec) {
    el.classList.add('dia');
    el.style.width = spec.w + 'px';
    el.style.height = spec.h + 'px';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', spec.w); svg.setAttribute('height', spec.h);
    el.appendChild(svg);
    const byId = {};
    (spec.groups || []).forEach(g => {
      shape(svg, rr(g.x, g.y, g.w, g.h, hand() ? 0 : 10), { stroke: g.kind ? KINDS[g.kind].stroke : 'var(--ink-2)', fill: 'none', w: 1.5, dash: g.dash === false ? null : [3, 6] });
      if (g.label) label(el, 'gl', g.x + 16, g.y + 10, g.label);
    });
    (spec.nodes || []).forEach(n => {
      byId[n.id] = n;
      const k = KINDS[n.kind || 'step'];
      if (n.kind !== 'text') shape(svg, nodePath(n), { ...k, w: n.w2 || k.w });
      if (n.t || n.s) {
        const top = n.shape === 'store' ? n.y + 10 : n.y;
        const cls = 'nl' + (n.align === 'left' ? ' left' : '') + (n.kind === 'planned' ? ' muted' : '');
        label(el, cls, n.x, top, (n.t ? `<b>${n.t}</b>` : '') + (n.s ? `<span>${n.s}</span>` : ''), { width: n.w + 'px', height: (n.h - (top - n.y)) + 'px', ...(n.style || {}) });
      }
    });
    (spec.edges || []).forEach(e => {
      const o = { ...EDGES[e.kind || 'flow'] };
      let pts, d, lp;
      if (e.p) { pts = e.p; }
      else {
        const a = byId[e.a], b = byId[e.b];
        const [s1, s2] = e.sides || sides(a, b);
        const p1 = port(a, s1), p2 = port(b, s2);
        if (e.curve) {
          const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
          const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          const nx = -(p2[1] - p1[1]) / len, ny = (p2[0] - p1[0]) / len;
          const c = [mx + nx * e.curve, my + ny * e.curve];
          d = `M${p1.join(' ')}Q${c.join(' ')} ${p2.join(' ')}`;
          shape(svg, d, { ...o, fill: 'none' });
          if (o.head !== false) head(svg, p2, c, o);
          if (e.both) head(svg, p1, c, o);
          lp = [0.25 * p1[0] + 0.5 * c[0] + 0.25 * p2[0], 0.25 * p1[1] + 0.5 * c[1] + 0.25 * p2[1]];
          if (e.label) label(el, 'el', lp[0], lp[1], e.label);
          return;
        }
        pts = e.route === 'straight' ? [p1, p2] : elbow(p1, s1, p2, s2, e.mid);
      }
      shape(svg, polyD(pts, hand() ? 0 : 12), { ...o, fill: 'none' });
      if (o.head !== false && e.head !== false) head(svg, pts[pts.length - 1], pts[pts.length - 2], o);
      if (e.both) head(svg, pts[0], pts[1], o);
      if (e.label) {
        // midpoint by length
        let total = 0; const segs = [];
        for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
        let t = total * (e.at ?? 0.5), i = 0;
        while (t > segs[i] && i < segs.length - 1) { t -= segs[i]; i++; }
        const f = t / segs[i];
        lp = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
        label(el, 'el', lp[0], lp[1], e.label);
      }
    });
    (spec.after || []).forEach(fn => fn(svg, el));
    return { svg, el };
  }

  // Charts. Each draws into a fresh diagram surface so both finishes apply.
  function hbars(el, c) {
    const rowH = c.rowH || 58, lw = c.labelW || 240, bw = c.w - lw - 120;
    const max = c.max || Math.max(...c.rows.map(r => r.v));
    const h = c.rows.length * rowH;
    const { svg } = diagram(el, { w: c.w, h });
    c.rows.forEach((r, i) => {
      const y = i * rowH + 10, len = Math.max(4, bw * r.v / max);
      const k = KINDS[r.kind || 'ink'];
      shape(svg, rr(lw, y, len, rowH - 22, 0), { stroke: hand() ? k.stroke : 'none', fill: k.solid ? k.fill : k.stroke, hatch: k.stroke, solid: !hand(), w: 2 });
      label(el, 'el', 0, y + (rowH - 22) / 2, r.label, { transform: 'translateY(-50%)', color: 'var(--ink)', padding: 0 });
      label(el, 'el', lw + len + 14, y + (rowH - 22) / 2, r.vl ?? r.v, { transform: 'translateY(-50%)', padding: 0, color: 'var(--ink)', fontWeight: 600 });
    });
    if (c.target != null) {
      const x = lw + bw * c.target / max;
      shape(svg, `M${x} 0V${h}`, { stroke: 'var(--signal)', w: 3, dash: [6, 6] });
      label(el, 'el', x, -18, c.targetLabel || 'target', { color: 'var(--ink)' });
    }
  }

  function progress(el, c) {
    const h = 34;
    const { svg } = diagram(el, { w: c.w, h: h + 40 });
    shape(svg, rr(0, 0, c.w, h, 0), { stroke: 'var(--ink-2)', fill: 'none', w: 1.5 });
    const fill = c.w * c.v / c.max;
    shape(svg, rr(0, 0, fill, h, 0), { stroke: hand() ? 'var(--ink)' : 'none', fill: 'var(--ink)', hatch: 'var(--ink)', solid: !hand(), w: 2 });
    if (c.target != null) {
      const x = c.w * c.target / c.max;
      shape(svg, `M${x} -10V${h + 10}`, { stroke: 'var(--signal)', w: 4 });
      label(el, 'el', x, h + 26, c.targetLabel, { color: 'var(--ink)' });
    }
    (c.ticks || []).forEach(t => label(el, 'el', c.w * t.v / c.max, h + 26, t.l, { background: 'transparent' }));
  }

  function stacked(el, c) {
    const h = 44, total = c.parts.reduce((s, p) => s + p.v, 0);
    const { svg } = diagram(el, { w: c.w, h: h + 50 });
    let x = 0;
    c.parts.forEach(p => {
      const w = c.w * p.v / total, k = KINDS[p.kind];
      shape(svg, rr(x, 0, w - 4, h, 0), { stroke: hand() ? k.stroke : 'none', fill: k.solid ? k.fill : k.stroke, hatch: k.stroke, solid: !hand(), w: 2 });
      label(el, 'el', x, h + 26, `${p.l} <b style="color:var(--ink)">${p.v}</b>`, { transform: 'translateY(-50%)', padding: 0, background: 'transparent' });
      x += w;
    });
  }

  function line(el, c) {
    const pad = 10, H = c.h, W = c.w - 140;
    const { svg } = diagram(el, { w: c.w, h: H + 40 });
    const max = c.max, n = c.pts.length;
    const P = c.pts.map((v, i) => [pad + i * (W - pad) / (n - 1), H - v / max * H]);
    shape(svg, `M0 ${H}H${W}`, { stroke: 'var(--hair)', w: 2 });
    if (c.target != null) {
      const y = H - c.target / max * H;
      shape(svg, `M0 ${y}H${W}`, { stroke: 'var(--signal)', w: 3, dash: [6, 6] });
      label(el, 'el', 0, y - 22, c.targetLabel, { transform: 'translateY(-50%)', padding: 0, color: 'var(--ink)' });
    }
    shape(svg, 'M' + P.map(p => p.join(' ')).join('L'), { stroke: 'var(--ink)', w: 3, fill: 'none' });
    const e = P[n - 1];
    shape(svg, ell(e[0], e[1], 7, 7), { stroke: 'var(--ink)', fill: 'var(--ink)', hatch: 'var(--ink)', solid: true, w: 2 });
    label(el, 'el', e[0] + 14, e[1], c.endLabel, { transform: 'translateY(-50%)', padding: 0, color: 'var(--ink)', fontWeight: 600 });
    (c.xl || []).forEach((t, i) => label(el, 'el', P[t[0]][0], H + 24, t[1], { background: 'transparent' }));
  }

  window.KIT = { diagram, hbars, progress, stacked, line, shape };
})();
