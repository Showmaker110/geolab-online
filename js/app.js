/* GeoLab — 动态几何与函数绘图
 * 纯前端、零依赖、可直接用浏览器打开。
 */
(function () {
  'use strict';

  const MP = window.MathParse;
  const Geom = window.Geom;

  /* =========================================================
     0. 工具函数
     ========================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SERIES_PALETTE = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
  const SERIES_TEXT_PALETTE = {
    '#2563eb': '#1d4ed8',
    '#059669': '#047857',
    '#dc2626': '#b91c1c',
    '#d97706': '#92400e',
    '#7c3aed': '#6d28d9',
    '#0891b2': '#0e7490',
    '#db2777': '#be185d',
    '#65a30d': '#3f6212',
    '#ea580c': '#c2410c',
    '#4f46e5': '#4338ca'
  };
  const PLOT = {
    background: '#fbfcff',
    minorGrid: '#f1f5fa',
    majorGrid: '#e4eaf3',
    axis: '#93a4bb',
    tick: '#64748b',
    label: '#64748b',
    labelHalo: 'rgba(251, 252, 255, 0.94)',
    pointStroke: '#ffffff'
  };
  const STORAGE_KEY = 'geolab.state.v1';
  const HISTORY_LIMIT = 80;
  const BASE_SCALE = 64;

  function fmt(v, digits = 2) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '未定义';
    if (Object.is(v, -0)) v = 0;
    const abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e7 || abs < 1e-5)) {
      return v.toExponential(2).replace('e+', 'e');
    }
    let s = v.toFixed(digits);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  function pretty(text) {
    return String(text)
      .replace(/\bpi\b/g, 'π')
      .replace(/\btau\b/g, 'τ')
      .replace(/\*/g, '·')
      .replace(/\^2\b/g, '²')
      .replace(/\^3\b/g, '³');
  }

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function niceStep(raw) {
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    let m;
    if (n < 1.5) m = 1;
    else if (n < 3.5) m = 2;
    else if (n < 7.5) m = 5;
    else m = 10;
    return m * pow;
  }

  function tickText(v, step) {
    const decimals = clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 8);
    let s = decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* =========================================================
     1. 图标与工具定义
     ========================================================= */
  const ICONS = {
    move: '<path d="M5 3l13.6 8-5.9 1.5L9.3 19z"/>',
    point: '<path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
    line: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.9"/><circle cx="20" cy="4" r="1.9"/>',
    segment: '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.9" fill="currentColor"/><circle cx="19" cy="5" r="1.9" fill="currentColor"/>',
    vector: '<path d="M4 20L16.5 7.5"/><path d="M19 5l-6.7 1.4 3.3 5.3z" fill="currentColor" stroke="none"/>',
    circle: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
    polygon: '<path d="M12 4.3L20 19H4z"/>',
    midpoint: '<path d="M4 19L20 5"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><circle cx="4" cy="19" r="1.2"/><circle cx="20" cy="5" r="1.2"/>',
    intersect: '<path d="M4 6l16 12M20 6L4 18"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
    perpendicular: '<path d="M4 19h16M12 19V5"/><path d="M12 15h4v4"/>',
    parallel: '<path d="M4 8l16-4M4 20l16-4"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>'
  };

  const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.2 9.5-6.2S21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c6 0 9.5 6 9.5 6a17 17 0 01-3 3.6M6.3 6.4C3.8 8.2 2.5 12 2.5 12s3.5 6.2 9.5 6.2c1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/></svg>';

  const TOOLS = [
    { id: 'move', label: '移动', key: 'V' },
    { id: 'point', label: '点', key: 'P' },
    { sep: true },
    { id: 'line', label: '直线', key: 'L' },
    { id: 'segment', label: '线段', key: 'S' },
    { id: 'vector', label: '向量', key: 'W' },
    { sep: true },
    { id: 'circle', label: '圆', key: 'C' },
    { id: 'polygon', label: '多边形', key: 'G' },
    { sep: true },
    { id: 'midpoint', label: '中点', key: 'M' },
    { id: 'intersect', label: '交点', key: 'I' },
    { id: 'perpendicular', label: '垂线', key: 'N' },
    { id: 'parallel', label: '平行线', key: 'R' },
    { sep: true },
    { id: 'delete', label: '删除', key: 'D' }
  ];

  const COMMAND_NAMES = new Set([
    'line', 'segment', 'vector', 'circle', 'polygon', 'midpoint', 'intersection',
    'intersect', 'perpendicularline', 'parallelline', 'perpendicularbisector'
  ]);

  const TYPE_LABEL = { point: '点', number: '数值', function: '函数', implicit: '隐式曲线', line: '直线', segment: '线段', vector: '向量', circle: '圆', polygon: '多边形' };

  /* =========================================================
     2. DOM 引用
     ========================================================= */
  const canvas = document.getElementById('board');
  let ctx = canvas.getContext('2d');
  const canvasWrap = document.getElementById('canvasWrap');
  const toolbarEl = document.getElementById('toolbar');
  const algebraEl = document.getElementById('algebra');
  const inputEl = document.getElementById('cmdInput');
  const submitBtn = document.getElementById('cmdSubmit');
  const hintEl = document.getElementById('toolHint');
  const toastEl = document.getElementById('toast');
  const emptyState = document.getElementById('emptyState');
  const objCountEl = document.getElementById('objCount');
  const cursorPosEl = document.getElementById('cursorPos');
  const zoomInfoEl = document.getElementById('zoomInfo');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const helpModal = document.getElementById('helpModal');
  const appEl = document.getElementById('app');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const zoomResetBtn = document.getElementById('zoomReset');
  const newBtn = document.getElementById('newBtn');
  const exportBtn = document.getElementById('exportBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpInline = document.getElementById('helpInline');
  const sidebarNewBtn = document.getElementById('sidebarNewBtn');
  const sidebarExportBtn = document.getElementById('sidebarExportBtn');

  /* =========================================================
     3. 状态
     ========================================================= */
  let doc = { objects: [], counters: { id: 1, color: 0 } };
  const view = { cx: 0, cy: 0, scale: BASE_SCALE };
  const UI = {
    tool: 'move',
    selectedId: null,
    hoverId: null,
    pending: [],
    pointer: { x: 0, y: 0, inside: false },
    drag: null,
    lastClick: null
  };

  let W = 1, H = 1, DPR = 1;
  let scope = Object.create(null);
  let byId = new Map();
  let nameMap = new Map();
  let rowMap = new Map();
  let history = [];
  let redoStack = [];
  let saveTimer = 0;
  let sliderGesture = null;
  let drawQueued = false;
  let toastTimer = 0;
  let commandReservedName = null;
  let helpReturnFocus = null;

  /* =========================================================
     4. 持久化与历史
     ========================================================= */
  function serializeDoc() {
    return JSON.stringify(doc, (key, value) => (typeof key === 'string' && key.startsWith('_') ? undefined : value));
  }

  function normalizeDoc(input) {
    const d = input && typeof input === 'object' ? input : {};
    const objects = Array.isArray(d.objects) ? d.objects.filter(o => o && typeof o === 'object' && o.id && o.name && o.type) : [];
    let maxId = 0;
    for (const o of objects) {
      const n = parseInt(String(o.id).replace(/^o/, ''), 10);
      if (Number.isFinite(n)) maxId = Math.max(maxId, n);
      if (!o.color) o.color = SERIES_PALETTE[0];
      if (o.visible === undefined) o.visible = true;
    }
    const counters = Object.assign({ id: 1, color: 0 }, d.counters || {});
    counters.id = Math.max(counters.id || 1, maxId + 1);
    counters.color = counters.color || 0;
    return { objects, counters };
  }

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ doc: JSON.parse(serializeDoc()), view: { ...view } }));
    } catch (err) { /* 忽略存储失败 */ }
  }

  function saveSoon() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 400);
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.doc || !Array.isArray(data.doc.objects)) return false;
      doc = normalizeDoc(data.doc);
      if (data.view && Number.isFinite(data.view.cx) && Number.isFinite(data.view.cy) && Number.isFinite(data.view.scale)) {
        view.cx = data.view.cx;
        view.cy = data.view.cy;
        view.scale = clamp(data.view.scale, 2, 6000);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function updateHistoryButtons() {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function commitAction(before) {
    const after = serializeDoc();
    if (after !== before) {
      history.push(before);
      if (history.length > HISTORY_LIMIT) history.shift();
      redoStack.length = 0;
      updateHistoryButtons();
      hideToast();
      refreshAll();
    } else {
      requestDraw();
    }
  }

  function runAction(fn) {
    const before = serializeDoc();
    try {
      fn();
    } catch (err) {
      restoreSnapshot(before);
      throw err;
    }
    commitAction(before);
  }

  function restoreSnapshot(snapshot) {
    try {
      doc = normalizeDoc(JSON.parse(snapshot));
    } catch (err) {
      return;
    }
    rebuildMaps();
    UI.selectedId = UI.selectedId && byId.has(UI.selectedId) ? UI.selectedId : null;
    UI.hoverId = null;
    UI.drag = null;
    UI.pending = UI.pending.filter(id => byId.has(id));
    refreshAll();
    updateToolHint();
  }

  function undo() {
    finishSliderGesture();
    if (!history.length) return;
    const current = serializeDoc();
    const prev = history.pop();
    redoStack.push(current);
    restoreSnapshot(prev);
    updateHistoryButtons();
    saveSoon();
    showToast('已撤销', 'info');
  }

  function redo() {
    finishSliderGesture();
    if (!redoStack.length) return;
    const current = serializeDoc();
    const next = redoStack.pop();
    history.push(current);
    if (history.length > HISTORY_LIMIT) history.shift();
    restoreSnapshot(next);
    updateHistoryButtons();
    saveSoon();
    showToast('已重做', 'info');
  }

  /* =========================================================
     5. 名称与对象创建
     ========================================================= */
  const RESERVED_EXTRA = new Set(['nan', 'infinity', 'undefined', 'true', 'false', 'null']);

  function validateNameFormat(name) {
    if (!MP.isIdentifier(name)) {
      throw new Error('名称需以字母、汉字或下划线开头，且不能包含空格');
    }
    if (MP.isReservedName(name) || RESERVED_EXTRA.has(name.toLowerCase()) || COMMAND_NAMES.has(name.toLowerCase())) {
      throw new Error(`“${name}”是保留名称，请换一个`);
    }
  }

  function rebuildMaps() {
    byId = new Map();
    nameMap = new Map();
    for (const o of doc.objects) {
      byId.set(o.id, o);
      nameMap.set(o.name, o);
    }
  }

  function getObject(id) {
    return byId.get(id) || null;
  }

  function findByName(name) {
    return nameMap.get(name) || null;
  }

  function nextId() {
    let id;
    do {
      id = 'o' + doc.counters.id++;
    } while (byId.has(id));
    return id;
  }

  function pickColor() {
    const c = SERIES_PALETTE[doc.counters.color % SERIES_PALETTE.length];
    doc.counters.color++;
    return c;
  }

  function seriesTextColor(color) {
    return SERIES_TEXT_PALETTE[color] || color;
  }

  function firstFreeName(candidates) {
    const used = new Set(doc.objects.map(o => o.name));
    for (const name of candidates) {
      if (name === commandReservedName) continue;
      if (!used.has(name) && !MP.isReservedName(name) && !RESERVED_EXTRA.has(name.toLowerCase()) && !COMMAND_NAMES.has(name.toLowerCase())) {
        return name;
      }
    }
    return null;
  }

  function generateName(type) {
    if (type === 'point') {
      for (let cycle = 0; cycle < 200; cycle++) {
        const arr = [];
        for (let i = 0; i < 26; i++) {
          const base = String.fromCharCode(65 + i);
          arr.push(cycle === 0 ? base : base + cycle);
        }
        const found = firstFreeName(arr);
        if (found) return found;
      }
    }
    if (type === 'function') {
      for (let cycle = 0; cycle < 200; cycle++) {
        const arr = [];
        for (const base of ['f', 'g', 'h']) arr.push(cycle === 0 ? base : base + cycle);
        const found = firstFreeName(arr);
        if (found) return found;
      }
    }
    if (type === 'polygon') {
      for (let i = 1; i < 1000; i++) {
        const name = 'poly' + i;
        if (!findByName(name)) return name;
      }
    }
    for (let cycle = 0; cycle < 200; cycle++) {
      const arr = [];
      for (let i = 0; i < 26; i++) {
        const base = String.fromCharCode(97 + i);
        arr.push(cycle === 0 ? base : base + cycle);
      }
      const found = firstFreeName(arr);
      if (found) return found;
    }
    return 'x' + Date.now();
  }

  function addObject(obj, explicitName, inheritedColor) {
    const name = explicitName || generateName(obj.type);
    if (explicitName) validateNameFormat(explicitName);
    if (findByName(name)) throw new Error(`名称 “${name}” 已被占用`);
    const o = Object.assign({
      id: nextId(),
      name,
      visible: true,
      color: inheritedColor || pickColor()
    }, obj);
    doc.objects.push(o);
    byId.set(o.id, o);
    nameMap.set(o.name, o);
    return o;
  }

  function setSliderRange(o) {
    const v = Number.isFinite(o.value) ? o.value : 0;
    const margin = Math.max(10, Math.ceil(Math.abs(v) * 1.5));
    o.min = -margin;
    o.max = margin;
    o.step = Number.isInteger(v) ? 0.1 : 0.01;
  }

  function createFreePoint(x, y, name) {
    return addObject({ type: 'point', mode: 'free', x, y, deps: [] }, name);
  }

  function createPointFromSpec(spec, name) {
    return addObject(Object.assign({ type: 'point' }, spec), name);
  }

  function createNumberFromSpec(spec, name) {
    return addObject(Object.assign({ type: 'number' }, spec), name);
  }

  function createIntersectionPoint(A, B, index, name) {
    return addObject({
      type: 'point',
      mode: 'intersect',
      a: A.id,
      b: B.id,
      index,
      deps: []
    }, name || null, A.color);
  }

  function createMidpointOfPoints(A, B) {
    return addObject({
      type: 'point',
      mode: 'midpoint',
      a: A.id,
      b: B.id,
      deps: []
    }, null, A.color);
  }

  function createMidpointOfSegment(seg) {
    return addObject({
      type: 'point',
      mode: 'midpoint',
      seg: seg.id,
      deps: []
    }, null, seg.color);
  }

  function createTwoPointShape(tool, A, B, name) {
    if (A.id === B.id || Math.hypot(A._x - B._x, A._y - B._y) < 1e-9) {
      throw new Error('需要两个不同的点');
    }
    const type = tool === 'line' ? 'line' : tool;
    const label = tool === 'line' ? 'Line' : tool === 'segment' ? 'Segment' : 'Vector';
    return addObject({
      type,
      mode: 'two',
      a: A.id,
      b: B.id,
      def: `${label}(${A.name}, ${B.name})`
    }, name || null, A.color);
  }

  function createCircleThrough(center, through, name) {
    if (center.id === through.id) throw new Error('请选择圆上另一个点');
    if (Math.hypot(center._x - through._x, center._y - through._y) < 1e-9) {
      throw new Error('圆的半径不能为 0');
    }
    return addObject({
      type: 'circle',
      mode: 'through',
      center: center.id,
      through: through.id,
      def: `Circle(${center.name}, ${through.name})`
    }, name || null, center.color);
  }

  function createPolygon(points, name) {
    if (points.length < 3) throw new Error('多边形至少需要 3 个顶点');
    const ids = new Set(points.map(p => p.id));
    if (ids.size !== points.length) throw new Error('多边形顶点不能重复');
    return addObject({
      type: 'polygon',
      points: points.map(p => p.id),
      def: `Polygon(${points.map(p => p.name).join(', ')})`
    }, name || null, points[0].color);
  }

  function createRelationLine(tool, through, base, name) {
    const mode = tool === 'perpendicular' ? 'perp' : 'parallel';
    const label = tool === 'perpendicular' ? 'PerpendicularLine' : 'ParallelLine';
    return addObject({
      type: 'line',
      mode,
      through: through.id,
      base: base.id,
      def: `${label}(${through.name}, ${base.name})`
    }, name || null, through.color);
  }

  function createBisector(A, B, name) {
    if (A.id === B.id) throw new Error('需要两个不同的点');
    return addObject({
      type: 'line',
      mode: 'bisector',
      a: A.id,
      b: B.id,
      def: `PerpendicularBisector(${A.name}, ${B.name})`
    }, name || null, A.color);
  }

  /* =========================================================
     6. 重新计算（依赖关系核心）
     ========================================================= */
  function numberNameSet(excludeName) {
    const set = new Set();
    for (const o of doc.objects) {
      if (o.type === 'number' && o.name !== excludeName) set.add(o.name);
    }
    return set;
  }

  function numberDepsFromVars(vars, excludeIds) {
    const ids = [];
    for (const name of vars) {
      const o = findByName(name);
      if (!o || o.type !== 'number') continue;
      if (excludeIds && excludeIds.has(o.id)) continue;
      ids.push(o.id);
    }
    return ids;
  }

  function ensureNumberCompiled(o) {
    if (!o._compiled) {
      const ast = o._ast || (o._ast = MP.parse(o.expr));
      o._compiled = MP.compile(ast, { varMap: {}, numbers: numberNameSet(o.name) });
    }
    return o._compiled;
  }

  function ensureCoordCompiled(o) {
    if (!o._fnX) {
      const ax = o._astX || (o._astX = MP.parse(o.xExpr));
      const ay = o._astY || (o._astY = MP.parse(o.yExpr));
      const numbers = numberNameSet();
      o._fnX = MP.compile(ax, { varMap: {}, numbers }).fn;
      o._fnY = MP.compile(ay, { varMap: {}, numbers }).fn;
    }
  }

  function ensureFunctionCompiled(o) {
    if (o._fn) return;
    try {
      const ast = o._ast || (o._ast = MP.parse(o.expr));
      const vm = o.type === 'implicit'
        ? { x: 'x', y: 'y' }
        : { [o.varName || 'x']: 'x' };
      o._fn = MP.compile(ast, { varMap: vm, numbers: numberNameSet() }).fn;
      o._compileError = null;
    } catch (err) {
      o._fn = null;
      o._compileError = err.message;
    }
  }

  function recompute() {
    rebuildMaps();
    const newScope = Object.create(null);
    scope = newScope;

    // 数值对象优先计算
    for (const o of doc.objects) {
      if (o.type !== 'number') continue;
      if (o.mode === 'expr') {
        try {
          const compiled = ensureNumberCompiled(o);
          o._value = compiled.fn(0, 0, newScope);
          o._valid = Number.isFinite(o._value);
        } catch (err) {
          o._value = NaN;
          o._valid = false;
          o._error = err.message;
        }
      } else {
        o._value = o.value;
        o._valid = Number.isFinite(o.value);
      }
      newScope[o.name] = o._valid ? o._value : NaN;
    }

    // 其余对象按创建顺序计算（依赖对象总是先创建）
    for (const o of doc.objects) {
      switch (o.type) {
        case 'number':
          break;
        case 'point':
          recomputePoint(o);
          break;
        case 'line':
          recomputeLine(o);
          break;
        case 'segment':
        case 'vector':
          recomputeSegment(o);
          break;
        case 'circle':
          recomputeCircle(o);
          break;
        case 'polygon':
          recomputePolygon(o);
          break;
        case 'function':
        case 'implicit':
          ensureFunctionCompiled(o);
          o._valid = !!o._fn;
          break;
      }
    }
  }

  function recomputePoint(o) {
    o._valid = false;
    o._x = NaN;
    o._y = NaN;
    try {
      if (o.mode === 'free') {
        o._x = o.x;
        o._y = o.y;
        o._valid = Number.isFinite(o.x) && Number.isFinite(o.y);
        return;
      }
      if (o.mode === 'expr') {
        ensureCoordCompiled(o);
        o._x = o._fnX(0, 0, scope);
        o._y = o._fnY(0, 0, scope);
        o._valid = Number.isFinite(o._x) && Number.isFinite(o._y);
        return;
      }
      if (o.mode === 'midpoint') {
        let A = null, B = null;
        if (o.seg) {
          const s = getObject(o.seg);
          if (s && s._valid) {
            A = { _x: s._ax, _y: s._ay, _valid: true };
            B = { _x: s._bx, _y: s._by, _valid: true };
          }
        } else {
          A = getObject(o.a);
          B = getObject(o.b);
        }
        if (A && B && A._valid && B._valid) {
          o._x = (A._x + B._x) / 2;
          o._y = (A._y + B._y) / 2;
          o._valid = true;
        }
        return;
      }
      if (o.mode === 'intersect') {
        const A = getObject(o.a);
        const B = getObject(o.b);
        const pts = getIntersections(A, B);
        const p = pts[o.index];
        if (p) {
          o._x = p.x;
          o._y = p.y;
          o._valid = true;
        }
      }
    } catch (err) {
      o._valid = false;
      o._error = err.message;
    }
  }

  function directionOf(o) {
    if (!o || !o._valid) return null;
    if (o.type === 'line') {
      let dx = o._x2 - o._x1;
      let dy = o._y2 - o._y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-12) return null;
      return { x: dx / len, y: dy / len };
    }
    if (o.type === 'segment' || o.type === 'vector') {
      let dx = o._bx - o._ax;
      let dy = o._by - o._ay;
      const len = Math.hypot(dx, dy);
      if (len < 1e-12) return null;
      return { x: dx / len, y: dy / len };
    }
    return null;
  }

  function recomputeLine(o) {
    o._valid = false;
    if (o.mode === 'two') {
      const A = getObject(o.a);
      const B = getObject(o.b);
      if (A && B && A._valid && B._valid) {
        o._x1 = A._x;
        o._y1 = A._y;
        o._x2 = B._x;
        o._y2 = B._y;
        o._valid = Math.hypot(o._x2 - o._x1, o._y2 - o._y1) > 1e-12;
      }
      return;
    }
    if (o.mode === 'perp' || o.mode === 'parallel') {
      const through = getObject(o.through);
      const base = getObject(o.base);
      const dir = directionOf(base);
      if (through && through._valid && dir) {
        let dx = dir.x, dy = dir.y;
        if (o.mode === 'perp') { const t = dx; dx = -dy; dy = t; }
        o._x1 = through._x;
        o._y1 = through._y;
        o._x2 = through._x + dx;
        o._y2 = through._y + dy;
        o._valid = true;
      }
      return;
    }
    if (o.mode === 'bisector') {
      const A = getObject(o.a);
      const B = getObject(o.b);
      if (A && B && A._valid && B._valid) {
        const dx = B._x - A._x;
        const dy = B._y - A._y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-12) return;
        const mx = (A._x + B._x) / 2;
        const my = (A._y + B._y) / 2;
        o._x1 = mx;
        o._y1 = my;
        o._x2 = mx - dy / len;
        o._y2 = my + dx / len;
        o._valid = true;
      }
    }
  }

  function recomputeSegment(o) {
    o._valid = false;
    const A = getObject(o.a);
    const B = getObject(o.b);
    if (A && B && A._valid && B._valid) {
      o._ax = A._x;
      o._ay = A._y;
      o._bx = B._x;
      o._by = B._y;
      o._valid = true;
    }
  }

  function recomputeCircle(o) {
    o._valid = false;
    const C = getObject(o.center);
    if (!C || !C._valid) return;
    let r = NaN;
    if (o.mode === 'through') {
      const T = getObject(o.through);
      if (!T || !T._valid) return;
      r = Math.hypot(T._x - C._x, T._y - C._y);
    } else {
      if (o.radiusExpr) {
        try {
          if (!o._radiusCompiled) {
            const ast = o._radiusAst || (o._radiusAst = MP.parse(o.radiusExpr));
            o._radiusCompiled = MP.compile(ast, { varMap: {}, numbers: numberNameSet() });
          }
          r = o._radiusCompiled.fn(0, 0, scope);
        } catch (err) {
          r = NaN;
        }
      } else {
        r = o.radius;
      }
    }
    if (Number.isFinite(r) && r > 1e-9) {
      o._cx = C._x;
      o._cy = C._y;
      o._r = r;
      o._valid = true;
    }
  }

  function recomputePolygon(o) {
    o._valid = false;
    const pts = [];
    for (const id of o.points) {
      const p = getObject(id);
      if (!p || !p._valid) return;
      pts.push({ x: p._x, y: p._y });
    }
    if (pts.length >= 3) {
      o._pts = pts;
      o._valid = true;
    }
  }

  function getIntersections(A, B) {
    if (!A || !B || !A._valid || !B._valid) return [];
    const kindA = A.type === 'circle' ? 'circle' : (A.type === 'line' || A.type === 'segment' || A.type === 'vector') ? 'line' : null;
    const kindB = B.type === 'circle' ? 'circle' : (B.type === 'line' || B.type === 'segment' || B.type === 'vector') ? 'line' : null;
    if (!kindA || !kindB) return [];

    const endpoints = (o) => o.type === 'line'
      ? { p1: { x: o._x1, y: o._y1 }, p2: { x: o._x2, y: o._y2 }, infinite: true }
      : { p1: { x: o._ax, y: o._ay }, p2: { x: o._bx, y: o._by }, infinite: false };

    let result = [];
    if (kindA === 'line' && kindB === 'line') {
      const a = endpoints(A);
      const b = endpoints(B);
      const hit = Geom.lineLineIntersection(a.p1, a.p2, b.p1, b.p2);
      if (hit) {
        const okA = a.infinite || (hit.t >= -1e-9 && hit.t <= 1 + 1e-9);
        const okB = b.infinite || (hit.u >= -1e-9 && hit.u <= 1 + 1e-9);
        if (okA && okB) result = [{ x: hit.x, y: hit.y }];
      }
    } else if (kindA === 'line' && kindB === 'circle') {
      result = intersectLineCircle(A, B);
    } else if (kindA === 'circle' && kindB === 'line') {
      result = intersectLineCircle(B, A);
    } else {
      result = Geom.circleCircleIntersection(
        { x: A._cx, y: A._cy }, A._r,
        { x: B._cx, y: B._cy }, B._r
      ).map(p => ({ x: p.x, y: p.y }));
    }

    const unique = [];
    for (const p of result) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (unique.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-7)) continue;
      unique.push(p);
    }
    return unique;
  }

  function intersectLineCircle(L, C) {
    const p1 = L.type === 'line' ? { x: L._x1, y: L._y1 } : { x: L._ax, y: L._ay };
    const p2 = L.type === 'line' ? { x: L._x2, y: L._y2 } : { x: L._bx, y: L._by };
    const dir = { x: p2.x - p1.x, y: p2.y - p1.y };
    let pts = Geom.lineCircleIntersection(p1, dir, { x: C._cx, y: C._cy }, C._r);
    if (L.type !== 'line') {
      pts = pts.filter(p => p.t >= -1e-9 && p.t <= 1 + 1e-9);
    }
    return pts.map(p => ({ x: p.x, y: p.y }));
  }

  /* =========================================================
     7. 表达式规格构建
     ========================================================= */
  function buildPointSpec(tuple, excludeName) {
    const astX = MP.parse(tuple.x);
    const astY = MP.parse(tuple.y);
    const numbers = numberNameSet(excludeName);
    const cX = MP.compile(astX, { varMap: {}, numbers });
    const cY = MP.compile(astY, { varMap: {}, numbers });
    const vars = new Set([...MP.variables(astX), ...MP.variables(astY)]);
    if (vars.size === 0) {
      const x = cX.fn(0, 0, scope);
      const y = cY.fn(0, 0, scope);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('点的坐标不是有效数值');
      }
      return { mode: 'free', x, y, deps: [] };
    }
    return {
      mode: 'expr',
      xExpr: tuple.x,
      yExpr: tuple.y,
      deps: numberDepsFromVars(vars)
    };
  }

  function applyPointSpec(o, spec) {
    o.mode = spec.mode;
    o.x = spec.x;
    o.y = spec.y;
    o.xExpr = spec.xExpr;
    o.yExpr = spec.yExpr;
    o.deps = spec.deps || [];
    delete o.seg;
    delete o.a;
    delete o.b;
    delete o.index;
    delete o._fnX;
    delete o._fnY;
    delete o._astX;
    delete o._astY;
  }

  function createOrUpdatePoint(tuple, explicitName) {
    const existing = explicitName ? findByName(explicitName) : null;
    if (explicitName) validateNameFormat(explicitName);
    if (existing && existing.type !== 'point') {
      throw new Error(`名称 “${explicitName}” 已被其他类型的对象占用`);
    }
    const spec = buildPointSpec(tuple, explicitName);
    if (existing) {
      applyPointSpec(existing, spec);
      return existing;
    }
    return createPointFromSpec(spec, explicitName);
  }

  function buildNumberSpec(exprText, explicitName) {
    const ast = MP.parse(exprText);
    const numbers = numberNameSet(explicitName);
    const compiled = MP.compile(ast, { varMap: {}, numbers });
    const vars = MP.variables(ast);
    if (vars.size === 0) {
      const value = compiled.fn(0, 0, scope);
      if (!Number.isFinite(value)) throw new Error('数值表达式的结果不是有效数值');
      return { mode: 'free', value, expr: exprText, deps: [] };
    }
    const deps = numberDepsFromVars(vars);
    // 依赖必须已在数组更早位置创建，避免循环依赖
    const existingIdx = explicitName ? doc.objects.findIndex(o => o.name === explicitName) : -1;
    const selfIndex = existingIdx >= 0 ? existingIdx : doc.objects.length;
    for (const id of deps) {
      const idx = doc.objects.findIndex(o => o.id === id);
      if (idx >= selfIndex) throw new Error('数值定义只能引用先创建的数值对象');
    }
    const probe = compiled.fn(0, 0, scope);
    return {
      mode: 'expr',
      expr: exprText,
      deps,
      value: Number.isFinite(probe) ? probe : 0
    };
  }

  function applyNumberSpec(o, spec) {
    o.mode = spec.mode;
    o.expr = spec.expr;
    o.deps = spec.deps || [];
    o.value = spec.value;
    delete o._compiled;
    delete o._ast;
    if (spec.mode === 'free') setSliderRange(o);
  }

  function createOrUpdateNumber(exprText, explicitName) {
    const existing = explicitName ? findByName(explicitName) : null;
    if (explicitName) validateNameFormat(explicitName);
    if (existing && existing.type !== 'number') {
      throw new Error(`名称 “${explicitName}” 已被其他类型的对象占用`);
    }
    const spec = buildNumberSpec(exprText, explicitName);
    if (existing) {
      applyNumberSpec(existing, spec);
      return existing;
    }
    const o = createNumberFromSpec(spec, explicitName);
    if (spec.mode === 'free') setSliderRange(o);
    return o;
  }

  function buildFunctionSpec(exprText, varName) {
    if (MP.isReservedName(varName) && varName !== 'x' && varName !== 'y') {
      throw new Error(`自变量不能命名为 “${varName}”`);
    }
    if (varName === 'y') throw new Error('函数自变量不能是 y');
    const existingVarObj = findByName(varName);
    if (existingVarObj) {
      throw new Error(`自变量 “${varName}” 与已有对象重名`);
    }
    const ast = MP.parse(exprText);
    const numbers = numberNameSet();
    const compiled = MP.compile(ast, { varMap: { [varName]: 'x' }, numbers });
    const vars = MP.variables(ast);
    const deps = numberDepsFromVars(vars);
    return { expr: exprText, varName, deps, ast, fn: compiled.fn };
  }

  function createOrUpdateFunction(exprText, varName, explicitName, isEquation) {
    const existing = explicitName ? findByName(explicitName) : null;
    if (explicitName) {
      validateNameFormat(explicitName);
      if (varName === explicitName) throw new Error('自变量不能与函数同名');
    }
    if (existing && existing.type !== 'function') {
      throw new Error(`名称 “${explicitName}” 已被其他类型的对象占用`);
    }
    const spec = buildFunctionSpec(exprText, varName);
    if (existing) {
      existing.expr = spec.expr;
      existing.varName = spec.varName;
      existing.deps = spec.deps;
      existing.equation = !!isEquation;
      existing._ast = spec.ast;
      existing._fn = spec.fn;
      existing._compileError = null;
      return existing;
    }
    return addObject({
      type: 'function',
      expr: spec.expr,
      varName: spec.varName,
      deps: spec.deps,
      equation: !!isEquation,
      _ast: spec.ast,
      _fn: spec.fn
    }, explicitName);
  }

  function buildImplicitSpec(lhs, rhs) {
    const expr = `(${lhs}) - (${rhs})`;
    const ast = MP.parse(expr);
    const compiled = MP.compile(ast, { varMap: { x: 'x', y: 'y' }, numbers: numberNameSet() });
    const vars = MP.variables(ast);
    if (!vars.has('x') && !vars.has('y')) {
      throw new Error('方程中需要包含 x 或 y');
    }
    return { expr, ast, fn: compiled.fn, deps: numberDepsFromVars(vars) };
  }

  function createOrUpdateImplicit(lhs, rhs, explicitName) {
    const existing = explicitName ? findByName(explicitName) : null;
    if (explicitName) validateNameFormat(explicitName);
    if (existing && existing.type !== 'implicit') {
      throw new Error(`名称 “${explicitName}” 已被其他类型的对象占用`);
    }
    const spec = buildImplicitSpec(lhs, rhs);
    if (existing) {
      existing.lhs = lhs;
      existing.rhs = rhs;
      existing.expr = spec.expr;
      existing.deps = spec.deps;
      existing._ast = spec.ast;
      existing._fn = spec.fn;
      existing._compileError = null;
      return existing;
    }
    return addObject({
      type: 'implicit',
      lhs,
      rhs,
      expr: spec.expr,
      deps: spec.deps,
      _ast: spec.ast,
      _fn: spec.fn
    }, explicitName);
  }

  /* =========================================================
     8. 输入解释与命令
     ========================================================= */
  function parseKnownCommand(text) {
    const shape = MP.parseCommandShape(text);
    if (!shape) return null;
    const lower = shape.name.toLowerCase();
    if (MP.functionNames.has(lower)) return null;
    if (lower === 'intersect') return { key: 'intersection', args: shape.args, name: shape.name };
    if (!COMMAND_NAMES.has(lower)) return null;
    return { key: lower, args: shape.args, name: shape.name };
  }

  function planPoint(arg) {
    const text = String(arg).trim();
    if (!text) throw new Error('点参数为空');
    const tuple = MP.parsePointTuple(text);
    if (tuple) {
      const spec = buildPointSpec(tuple, null);
      return { kind: 'literal', spec };
    }
    if (MP.isIdentifier(text)) {
      const o = findByName(text);
      if (!o) throw new Error(`找不到对象 “${text}”`);
      if (o.type !== 'point') throw new Error(`“${text}” 不是点`);
      return { kind: 'ref', id: o.id };
    }
    throw new Error(`“${text}” 不是点`);
  }

  function materializePointPlan(plan) {
    if (plan.kind === 'ref') {
      const o = getObject(plan.id);
      if (!o) throw new Error('引用的点不存在');
      return o;
    }
    return createPointFromSpec(plan.spec, null);
  }

  function planObjectRef(arg, allowedTypes, what) {
    const text = String(arg).trim();
    if (!MP.isIdentifier(text)) throw new Error(`${what}需要对象名称`);
    const o = findByName(text);
    if (!o) throw new Error(`找不到对象 “${text}”`);
    if (!allowedTypes.includes(o.type)) throw new Error(`“${text}” 不能作为${what}`);
    return o;
  }

  function executeCommand(cmd, explicitName) {
    if (explicitName) {
      validateNameFormat(explicitName);
      if (findByName(explicitName)) throw new Error(`名称 “${explicitName}” 已被占用`);
    }
    // 防止命令内部自动创建的点抢占命令结果要使用的名称
    commandReservedName = explicitName || null;
    try {
      const args = cmd.args.map(a => String(a).trim()).filter(a => a.length > 0);
      const key = cmd.key;
      const requireCount = (n, label) => {
        if (args.length !== n) throw new Error(`${label} 需要 ${n} 个参数`);
      };

      if (key === 'line' || key === 'segment' || key === 'vector') {
        requireCount(2, cmd.name);
        const plans = [planPoint(args[0]), planPoint(args[1])];
        const A = materializePointPlan(plans[0]);
        const B = materializePointPlan(plans[1]);
        return createTwoPointShape(key, A, B, explicitName);
      }

      if (key === 'circle') {
        requireCount(2, cmd.name);
        const centerPlan = planPoint(args[0]);
        const center = materializePointPlan(centerPlan);
        const secondText = args[1];
        const tuple = MP.parsePointTuple(secondText);
        if (tuple) {
          const through = createPointFromSpec(buildPointSpec(tuple, null), null);
          return createCircleThrough(center, through, explicitName);
        }
        if (MP.isIdentifier(secondText)) {
          const o = findByName(secondText);
          if (o && o.type === 'point') return createCircleThrough(center, o, explicitName);
          if (o && o.type === 'number') {
            return addObject({
              type: 'circle',
              mode: 'radius',
              center: center.id,
              radiusExpr: secondText,
              deps: [o.id],
              def: `Circle(${center.name}, ${secondText})`
            }, explicitName, center.color);
          }
          if (o && o.type !== 'number') throw new Error('圆的第二个参数必须是点或数值');
        }
        const ast = MP.parse(secondText);
        const compiled = MP.compile(ast, { varMap: {}, numbers: numberNameSet() });
        const vars = MP.variables(ast);
        let radius = null;
        if (vars.size === 0) {
          radius = compiled.fn(0, 0, scope);
          if (!Number.isFinite(radius) || radius <= 0) throw new Error('半径必须是正数');
        }
        return addObject({
          type: 'circle',
          mode: 'radius',
          center: center.id,
          radius: radius != null ? radius : undefined,
          radiusExpr: radius != null ? undefined : secondText,
          deps: radius != null ? [] : numberDepsFromVars(vars),
          def: `Circle(${center.name}, ${secondText})`
        }, explicitName, center.color);
      }

      if (key === 'polygon') {
        if (args.length < 3) throw new Error('Polygon 至少需要 3 个点');
        const plans = args.map(planPoint);
        const pts = plans.map(materializePointPlan);
        return createPolygon(pts, explicitName);
      }

      if (key === 'midpoint') {
        if (args.length === 1) {
          const seg = planObjectRef(args[0], ['segment', 'vector'], '中点参数');
          return addObject({
            type: 'point',
            mode: 'midpoint',
            seg: seg.id,
            deps: []
          }, explicitName, seg.color);
        }
        if (args.length !== 2) throw new Error('Midpoint 需要一个线段或两个点');
        const plans = [planPoint(args[0]), planPoint(args[1])];
        const A = materializePointPlan(plans[0]);
        const B = materializePointPlan(plans[1]);
        if (A.id === B.id) throw new Error('需要两个不同的点');
        return addObject({
          type: 'point',
          mode: 'midpoint',
          a: A.id,
          b: B.id,
          deps: []
        }, explicitName, A.color);
      }

      if (key === 'intersection') {
        requireCount(2, cmd.name);
        const A = planObjectRef(args[0], ['line', 'segment', 'vector', 'circle'], '交点参数');
        const B = planObjectRef(args[1], ['line', 'segment', 'vector', 'circle'], '交点参数');
        if (A.id === B.id) throw new Error('请选择两个不同的对象');
        recompute();
        const pts = getIntersections(A, B);
        if (!pts.length) throw new Error('两个对象当前没有交点');
        return pts.map((p, i) => createIntersectionPoint(A, B, i, i === 0 ? explicitName : null))[0];
      }

      if (key === 'perpendicularline' || key === 'parallelline') {
        requireCount(2, cmd.name);
        const throughPlan = planPoint(args[0]);
        const through = materializePointPlan(throughPlan);
        const base = planObjectRef(args[1], ['line', 'segment', 'vector'], '基准直线');
        return createRelationLine(
          key === 'perpendicularline' ? 'perpendicular' : 'parallel',
          through,
          base,
          explicitName
        );
      }

      if (key === 'perpendicularbisector') {
        requireCount(2, cmd.name);
        const plans = [planPoint(args[0]), planPoint(args[1])];
        const A = materializePointPlan(plans[0]);
        const B = materializePointPlan(plans[1]);
        return createBisector(A, B, explicitName);
      }

      throw new Error(`未知命令 “${cmd.name}”`);
    } finally {
      commandReservedName = null;
    }
  }

  function interpret(rawText) {
    recompute();
    const text = String(rawText || '').trim();
    if (!text) return null;
    const eq = MP.findTopLevelEquals(text);

    if (eq >= 0) {
      const left = text.slice(0, eq).trim();
      const right = text.slice(eq + 1).trim();
      if (!left) throw new Error('等号左侧为空');
      if (!right) throw new Error('等号右侧为空');

      const fnMatch = left.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(\s*([\p{L}_][\p{L}\p{N}_]*)\s*\)$/u);
      if (fnMatch) {
        return createOrUpdateFunction(right, fnMatch[2], fnMatch[1], false);
      }

      if (left === 'y') {
        return createOrUpdateFunction(right, 'x', null, true);
      }

      const cmd = parseKnownCommand(right);
      if (cmd) {
        if (!MP.isIdentifier(left)) throw new Error('命令赋值左侧必须是名称');
        return executeCommand(cmd, left);
      }

      const tuple = MP.parsePointTuple(right);
      if (tuple) {
        if (!MP.isIdentifier(left)) throw new Error('点的赋值左侧必须是名称');
        return createOrUpdatePoint(tuple, left);
      }

      if (MP.isIdentifier(left)) {
        if (left === 'x') return createOrUpdateImplicit(left, right, null);
        if (MP.isReservedName(left)) throw new Error(`“${left}”是保留名称，不能作为对象名`);
        const ast = MP.parse(right);
        const vars = MP.variables(ast);
        if (vars.has('y')) throw new Error('函数表达式中不能包含 y；请使用“左边 = 右边”的方程形式');
        if (vars.has('x')) return createOrUpdateFunction(right, 'x', left, false);
        return createOrUpdateNumber(right, left);
      }

      return createOrUpdateImplicit(left, right, null);
    }

    const cmd = parseKnownCommand(text);
    if (cmd) return executeCommand(cmd, null);

    const tuple = MP.parsePointTuple(text);
    if (tuple) return createOrUpdatePoint(tuple, null);

    const ast = MP.parse(text);
    const vars = MP.variables(ast);
    if (vars.has('y')) return createOrUpdateImplicit(text, '0', null);
    if (vars.has('x')) return createOrUpdateFunction(text, 'x', null, false);
    return createOrUpdateNumber(text, null);
  }

  function submitInput() {
    finishSliderGesture();
    const text = inputEl.value;
    if (!text.trim()) return;
    let main = null;
    try {
      runAction(() => { main = interpret(text); });
    } catch (err) {
      showToast(err.message || '输入无法识别');
      inputEl.classList.remove('shake');
      void inputEl.offsetWidth;
      inputEl.classList.add('shake');
      inputEl.focus();
      return;
    }
    inputEl.value = '';
    if (main && main.id) selectObject(main.id);
    inputEl.focus();
  }

  /* =========================================================
     9. 命中检测
     ========================================================= */
  function hitTest(sx, sy, allowedTypes) {
    const allowed = allowedTypes ? new Set(allowedTypes) : null;
    const wx = view.cx + (sx - W / 2) / view.scale;
    const wy = view.cy - (sy - H / 2) / view.scale;
    const px = 1 / view.scale;

    const passes = [
      ['point'],
      ['line', 'segment', 'vector', 'circle'],
      ['polygon'],
      ['function', 'implicit']
    ];

    for (const pass of passes) {
      for (let i = doc.objects.length - 1; i >= 0; i--) {
        const o = doc.objects[i];
        if (!o.visible || o._valid === false) continue;
        if (!pass.includes(o.type)) continue;
        if (allowed && !allowed.has(o.type)) continue;

        if (o.type === 'point') {
          if (Number.isFinite(o._x) && Number.isFinite(o._y)) {
            if (Geom.dist2(wx, wy, o._x, o._y) * view.scale * view.scale < 11 * 11) return o;
          }
          continue;
        }
        if (o.type === 'segment' || o.type === 'vector') {
          if (Geom.pointSegmentDistance(wx, wy, o._ax, o._ay, o._bx, o._by) * view.scale < 8) return o;
          continue;
        }
        if (o.type === 'line') {
          if (!Number.isFinite(o._x1)) continue;
          const ax = W / 2 + (o._x1 - view.cx) * view.scale;
          const ay = H / 2 - (o._y1 - view.cy) * view.scale;
          const bx = W / 2 + (o._x2 - view.cx) * view.scale;
          const by = H / 2 - (o._y2 - view.cy) * view.scale;
          const dx = bx - ax, dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) continue;
          const d = Math.abs(dy * (sx - ax) - dx * (sy - ay)) / len;
          if (d < 8) return o;
          continue;
        }
        if (o.type === 'circle') {
          const cx = W / 2 + (o._cx - view.cx) * view.scale;
          const cy = H / 2 - (o._cy - view.cy) * view.scale;
          const r = o._r * view.scale;
          if (Math.abs(Math.hypot(sx - cx, sy - cy) - r) < 8) return o;
          continue;
        }
        if (o.type === 'polygon') {
          if (Geom.pointInPolygon(wx, wy, o._pts)) return o;
          for (let k = 0; k < o._pts.length; k++) {
            const a = o._pts[k];
            const b = o._pts[(k + 1) % o._pts.length];
            if (Geom.pointSegmentDistance(wx, wy, a.x, a.y, b.x, b.y) * view.scale < 8) return o;
          }
          continue;
        }
        if (o.type === 'function' && o._fn) {
          if (sx < 0 || sx > W) continue;
          let y;
          try { y = o._fn(wx, 0, scope); } catch (err) { continue; }
          if (!Number.isFinite(y)) continue;
          const fy = H / 2 - (y - view.cy) * view.scale;
          if (Math.abs(fy - sy) < 8) return o;
          continue;
        }
        if (o.type === 'implicit' && o._fn) {
          try {
            const v = o._fn(wx, wy, scope);
            if (!Number.isFinite(v)) continue;
            const h = Math.max(1e-6, px * 0.5);
            const gx = (o._fn(wx + h, wy, scope) - o._fn(wx - h, wy, scope)) / (2 * h);
            const gy = (o._fn(wx, wy + h, scope) - o._fn(wx, wy - h, scope)) / (2 * h);
            const grad = Math.hypot(gx, gy);
            if (grad < 1e-9) continue;
            const distWorld = Math.abs(v) / grad;
            if (distWorld * view.scale < 8) return o;
          } catch (err) { /* 忽略 */ }
        }
      }
    }
    return null;
  }

  /* =========================================================
     10. 画布渲染
     ========================================================= */
  function makeTransform(vw, vh, v) {
    return {
      w: vw,
      h: vh,
      v,
      sx: wx => vw / 2 + (wx - v.cx) * v.scale,
      sy: wy => vh / 2 - (wy - v.cy) * v.scale,
      wx: sx => v.cx + (sx - vw / 2) / v.scale,
      wy: sy => v.cy - (sy - vh / 2) / v.scale
    };
  }

  function drawGrid(TCtx) {
    const v = TCtx.v;
    const w = TCtx.w, h = TCtx.h;
    const left = v.cx - w / 2 / v.scale;
    const right = v.cx + w / 2 / v.scale;
    const top = v.cy + h / 2 / v.scale;
    const bottom = v.cy - h / 2 / v.scale;
    const step = niceStep(90 / v.scale);
    const minor = step / 5;
    const showMinor = minor * v.scale >= 11;
    const x0 = TCtx.sx(0);
    const y0 = TCtx.sy(0);

    if (showMinor) {
      ctx.save();
      ctx.strokeStyle = PLOT.minorGrid;
      ctx.lineWidth = 1;
      const i0 = Math.floor(left / minor), i1 = Math.ceil(right / minor);
      for (let i = i0; i <= i1; i++) {
        const wx = i * minor;
        if (Math.abs(wx / step - Math.round(wx / step)) < 1e-7) continue;
        const sx = Math.round(TCtx.sx(wx)) + 0.5;
        if (sx < -1 || sx > w + 1) continue;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      const j0 = Math.floor(bottom / minor), j1 = Math.ceil(top / minor);
      for (let j = j0; j <= j1; j++) {
        const wy = j * minor;
        if (Math.abs(wy / step - Math.round(wy / step)) < 1e-7) continue;
        const sy = Math.round(TCtx.sy(wy)) + 0.5;
        if (sy < -1 || sy > h + 1) continue;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = PLOT.majorGrid;
    ctx.lineWidth = 1;
    const ia = Math.floor(left / step), ib = Math.ceil(right / step);
    for (let i = ia; i <= ib; i++) {
      const sx = Math.round(TCtx.sx(i * step)) + 0.5;
      if (sx < -1 || sx > w + 1) continue;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    const ja = Math.floor(bottom / step), jb = Math.ceil(top / step);
    for (let j = ja; j <= jb; j++) {
      const sy = Math.round(TCtx.sy(j * step)) + 0.5;
      if (sy < -1 || sy > h + 1) continue;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }
    ctx.restore();

    const axisVisibleX = y0 >= 0 && y0 <= h;
    const axisVisibleY = x0 >= 0 && x0 <= w;

    if (axisVisibleX) {
      ctx.save();
      ctx.strokeStyle = PLOT.axis;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y0) + 0.5);
      ctx.lineTo(w, Math.round(y0) + 0.5);
      ctx.stroke();
      // 箭头
      ctx.fillStyle = PLOT.axis;
      ctx.beginPath();
      ctx.moveTo(w - 2, y0);
      ctx.lineTo(w - 10, y0 - 4);
      ctx.lineTo(w - 10, y0 + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (axisVisibleY) {
      ctx.save();
      ctx.strokeStyle = PLOT.axis;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.round(x0) + 0.5, 0);
      ctx.lineTo(Math.round(x0) + 0.5, h);
      ctx.stroke();
      ctx.fillStyle = PLOT.axis;
      ctx.beginPath();
      ctx.moveTo(x0, 2);
      ctx.lineTo(x0 - 4, 10);
      ctx.lineTo(x0 + 4, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = PLOT.tick;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';

    if (axisVisibleX) {
      ctx.textAlign = 'center';
      for (let i = ia; i <= ib; i++) {
        const wx = i * step;
        if (Math.abs(wx) < 1e-9) continue;
        const sx = TCtx.sx(wx);
        if (sx < 22 || sx > w - 22) continue;
        const ty = y0 + 15 > h - 8 ? y0 - 9 : y0 + 15;
        ctx.fillText(tickText(wx, step), sx, ty);
      }
    }
    if (axisVisibleY) {
      ctx.textAlign = 'right';
      for (let j = ja; j <= jb; j++) {
        const wy = j * step;
        if (Math.abs(wy) < 1e-9) continue;
        const sy = TCtx.sy(wy);
        if (sy < 14 || sy > h - 14) continue;
        const tx = x0 - 8 < 28 ? x0 + 8 : x0 - 8;
        ctx.textAlign = x0 - 8 < 28 ? 'left' : 'right';
        ctx.fillText(tickText(wy, step), tx, sy);
      }
    }

    if (axisVisibleX && axisVisibleY) {
      ctx.textAlign = 'right';
      ctx.fillStyle = PLOT.label;
      ctx.font = 'italic 12px "Cambria Math", Georgia, serif';
      ctx.fillText('O', x0 - 6, y0 + 13);
    }
    ctx.restore();

    if (axisVisibleX) {
      ctx.save();
      ctx.fillStyle = PLOT.label;
      ctx.font = 'italic 13px "Cambria Math", Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText('x', w - 9, y0 - 12);
      ctx.restore();
    }
    if (axisVisibleY) {
      ctx.save();
      ctx.fillStyle = PLOT.label;
      ctx.font = 'italic 13px "Cambria Math", Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('y', x0 + 10, 14);
      ctx.restore();
    }
  }

  function drawLabel(labelCtx, text, x, y, color, TCtx, opts = {}) {
    labelCtx.save();
    labelCtx.font = opts.font || 'italic 600 14px "Cambria Math", Georgia, "Times New Roman", serif';
    labelCtx.textAlign = 'left';
    labelCtx.textBaseline = 'middle';
    const width = labelCtx.measureText(text).width;
    let px = x;
    if (px + width > TCtx.w - 6) px = TCtx.w - width - 6;
    if (px < 6) px = 6;
    let py = y;
    if (py < 11) py = 11;
    if (py > TCtx.h - 9) py = TCtx.h - 9;
    labelCtx.lineJoin = 'round';
    labelCtx.lineWidth = 3.4;
    labelCtx.strokeStyle = PLOT.labelHalo;
    labelCtx.strokeText(text, px, py);
    labelCtx.fillStyle = color;
    labelCtx.fillText(text, px, py);
    labelCtx.restore();
  }

  function isHot(o, opts) {
    return !opts.exporting && (o.id === UI.selectedId || o.id === UI.hoverId);
  }

  function strokePath(path, o, width, opts) {
    if (isHot(o, opts)) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = width + 7;
      ctx.stroke(path);
      ctx.restore();
    }
    ctx.strokeStyle = o.color;
    ctx.lineWidth = width;
    ctx.stroke(path);
  }

  function drawExplicit(o, TCtx, opts) {
    if (!o.visible || !o._fn) return;
    const path = new Path2D();
    let started = false;
    let prevSy = 0;
    const stepPx = 1.4;
    const w = TCtx.w, h = TCtx.h;
    for (let sx = 0; sx <= w; sx += stepPx) {
      const wx = TCtx.wx(sx);
      let wy;
      try { wy = o._fn(wx, 0, scope); } catch (err) { wy = NaN; }
      if (!Number.isFinite(wy)) { started = false; continue; }
      const sy = TCtx.sy(wy);
      if (!Number.isFinite(sy) || Math.abs(sy) > 1e6) { started = false; continue; }
      if (!started) {
        path.moveTo(sx, sy);
        started = true;
      } else {
        const jump = Math.abs(sy - prevSy);
        if (jump > h * 3.5 && Math.abs(prevSy) > h * 2 && Math.abs(sy) > h * 2) path.moveTo(sx, sy);
        else path.lineTo(sx, sy);
      }
      prevSy = sy;
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    strokePath(path, o, 2.1, opts);
    ctx.restore();

    if (o.name) {
      for (const frac of [0.72, 0.62, 0.38, 0.28, 0.82, 0.2]) {
        const sx = w * frac;
        let wy;
        try { wy = o._fn(TCtx.wx(sx), 0, scope); } catch (err) { wy = NaN; }
        if (!Number.isFinite(wy)) continue;
        const sy = TCtx.sy(wy);
        if (sy > 26 && sy < h - 24) {
          drawLabel(ctx, o.name, sx + 8, sy - 11, seriesTextColor(o.color), TCtx);
          break;
        }
      }
    }
  }

  function drawImplicit(o, TCtx, opts) {
    if (!o.visible || !o._fn) return;
    const w = TCtx.w, h = TCtx.h;
    const step = 5;
    const cols = Math.ceil(w / step) + 1;
    const rows = Math.ceil(h / step) + 1;
    const vals = new Float64Array(cols * rows);
    let anyFinite = false;
    for (let i = 0; i < rows; i++) {
      const sy = i * step;
      const wy = TCtx.wy(sy);
      for (let j = 0; j < cols; j++) {
        const sx = j * step;
        let val;
        try { val = o._fn(TCtx.wx(sx), wy, scope); } catch (err) { val = NaN; }
        if (!Number.isFinite(val)) val = NaN;
        else anyFinite = true;
        vals[i * cols + j] = val;
      }
    }
    if (!anyFinite) return;

    const path = new Path2D();
    let labelPt = null;
    const edgePoint = (xa, ya, va, xb, yb, vb) => {
      const d = va - vb;
      const t = Math.abs(d) < 1e-12 ? 0.5 : va / d;
      return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t };
    };

    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const v0 = vals[i * cols + j];
        const v1 = vals[i * cols + j + 1];
        const v2 = vals[(i + 1) * cols + j + 1];
        const v3 = vals[(i + 1) * cols + j];
        if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2) || !Number.isFinite(v3)) continue;
        const idx = (v0 > 0 ? 1 : 0) | (v1 > 0 ? 2 : 0) | (v2 > 0 ? 4 : 0) | (v3 > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = j * step, y = i * step;
        const T = () => edgePoint(x, y, v0, x + step, y, v1);
        const R = () => edgePoint(x + step, y, v1, x + step, y + step, v2);
        const Bp = () => edgePoint(x, y + step, v3, x + step, y + step, v2);
        const L = () => edgePoint(x, y, v0, x, y + step, v3);
        const add = (a, b) => {
          if (!labelPt) {
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            if (mx > w * 0.55 && mx < w * 0.85 && my > h * 0.15 && my < h * 0.85) labelPt = { x: mx, y: my };
          }
          path.moveTo(a.x, a.y);
          path.lineTo(b.x, b.y);
        };
        switch (idx) {
          case 1: case 14: add(L(), T()); break;
          case 2: case 13: add(T(), R()); break;
          case 3: case 12: add(L(), R()); break;
          case 4: case 11: add(R(), Bp()); break;
          case 6: case 9: add(T(), Bp()); break;
          case 7: case 8: add(L(), Bp()); break;
          case 5: {
            let vc = 0;
            try { vc = o._fn(TCtx.wx(x + step / 2), TCtx.wy(y + step / 2), scope); } catch (err) { vc = 0; }
            if (vc > 0) { add(L(), T()); add(R(), Bp()); }
            else { add(T(), R()); add(Bp(), L()); }
            break;
          }
          case 10: {
            let vc = 0;
            try { vc = o._fn(TCtx.wx(x + step / 2), TCtx.wy(y + step / 2), scope); } catch (err) { vc = 0; }
            if (vc > 0) { add(T(), R()); add(Bp(), L()); }
            else { add(L(), T()); add(R(), Bp()); }
            break;
          }
        }
      }
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    strokePath(path, o, 2.1, opts);
    ctx.restore();
    if (labelPt) drawLabel(ctx, o.name, labelPt.x + 7, labelPt.y - 10, seriesTextColor(o.color), TCtx);
  }

  function drawPoint(o, TCtx, opts) {
    if (!o.visible || !o._valid) return;
    const x = TCtx.sx(o._x);
    const y = TCtx.sy(o._y);
    if (x < -30 || x > TCtx.w + 30 || y < -30 || y > TCtx.h + 30) return;
    const hot = isHot(o, opts);
    ctx.save();
    if (hot) {
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(x, y, hot ? 5.8 : 5, 0, Math.PI * 2);
    ctx.fillStyle = o.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PLOT.pointStroke;
    ctx.stroke();
    ctx.restore();
    drawLabel(ctx, o.name, x + 9, y - 10, seriesTextColor(o.color), TCtx);
  }

  function drawLineObject(o, TCtx, opts) {
    if (!o.visible || !o._valid) return;
    const isLine = o.type === 'line';
    let x1, y1, x2, y2;
    if (isLine) {
      x1 = TCtx.sx(o._x1); y1 = TCtx.sy(o._y1);
      x2 = TCtx.sx(o._x2); y2 = TCtx.sy(o._y2);
    } else {
      x1 = TCtx.sx(o._ax); y1 = TCtx.sy(o._ay);
      x2 = TCtx.sx(o._bx); y2 = TCtx.sy(o._by);
    }
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;

    let path = new Path2D();
    let labelX, labelY;
    if (isLine) {
      const dx = x2 - x1, dy = y2 - y1;
      const clipped = Geom.clipLineToRect({ x: x1, y: y1 }, { x: dx, y: dy }, TCtx.w, TCtx.h);
      if (!clipped) return;
      path.moveTo(clipped[0].x, clipped[0].y);
      path.lineTo(clipped[1].x, clipped[1].y);
      const mx = clipped[0].x + (clipped[1].x - clipped[0].x) * 0.28;
      const my = clipped[0].y + (clipped[1].y - clipped[0].y) * 0.28;
      const len = Math.hypot(clipped[1].x - clipped[0].x, clipped[1].y - clipped[0].y) || 1;
      let nx = -(clipped[1].y - clipped[0].y) / len;
      let ny = (clipped[1].x - clipped[0].x) / len;
      if (ny > 0) { nx = -nx; ny = -ny; }
      labelX = mx + nx * 12 + 4;
      labelY = my + ny * 12;
    } else {
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      if (segLen < 0.4) return;
      path.moveTo(x1, y1);
      path.lineTo(x2, y2);
      const frac = o.type === 'vector' ? 0.55 : 0.38;
      const lx = x1 + (x2 - x1) * frac;
      const ly = y1 + (y2 - y1) * frac;
      let nx = -(y2 - y1) / segLen;
      let ny = (x2 - x1) / segLen;
      if (ny > 0) { nx = -nx; ny = -ny; }
      labelX = lx + nx * 12;
      labelY = ly + ny * 12;
      if (o.type === 'vector') {
        // 箭头
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const size = 9;
        path.moveTo(x2, y2);
        path.lineTo(x2 - size * Math.cos(ang - 0.42), y2 - size * Math.sin(ang - 0.42));
        path.moveTo(x2, y2);
        path.lineTo(x2 - size * Math.cos(ang + 0.42), y2 - size * Math.sin(ang + 0.42));
      }
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(path, o, 2, opts);
    ctx.restore();
    drawLabel(ctx, o.name, labelX, labelY, seriesTextColor(o.color), TCtx);
  }

  function drawCircleObject(o, TCtx, opts) {
    if (!o.visible || !o._valid) return;
    const cx = TCtx.sx(o._cx);
    const cy = TCtx.sy(o._cy);
    const r = o._r * TCtx.v.scale;
    if (!Number.isFinite(r) || r < 0.4) return;
    const path = new Path2D();
    path.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.save();
    ctx.lineCap = 'round';
    strokePath(path, o, 2, opts);
    ctx.restore();

    const candidates = [
      { x: cx, y: cy - r },
      { x: cx + r, y: cy },
      { x: cx, y: cy + r },
      { x: cx - r, y: cy }
    ];
    for (const p of candidates) {
      if (p.x > 12 && p.x < TCtx.w - 60 && p.y > 16 && p.y < TCtx.h - 10) {
        drawLabel(ctx, o.name, p.x + 7, p.y - 10, seriesTextColor(o.color), TCtx);
        break;
      }
    }
  }

  function drawPolygonObject(o, TCtx, opts) {
    if (!o.visible || !o._valid || !o._pts.length) return;
    const path = new Path2D();
    for (let i = 0; i < o._pts.length; i++) {
      const p = o._pts[i];
      const x = TCtx.sx(p.x);
      const y = TCtx.sy(p.y);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    ctx.save();
    if (isHot(o, opts)) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = o.color;
      ctx.fill(path);
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 9;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = o.color;
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();

    let sx = 0, sy = 0;
    for (const p of o._pts) { sx += TCtx.sx(p.x); sy += TCtx.sy(p.y); }
    drawLabel(ctx, o.name, sx / o._pts.length + 9, sy / o._pts.length - 8, seriesTextColor(o.color), TCtx);
  }

  function drawPreview(TCtx) {
    if (!UI.pointer.inside || UI.tool === 'move' || UI.tool === 'delete') return;
    const pts = UI.pending.map(id => getObject(id)).filter(o => o && o.type === 'point' && o._valid);
    const cursorX = TCtx.wx(UI.pointer.x);
    const cursorY = TCtx.wy(UI.pointer.y);
    const cursorSX = UI.pointer.x;
    const cursorSY = UI.pointer.y;

    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)';
    ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';

    if (UI.tool === 'line' || UI.tool === 'segment' || UI.tool === 'vector') {
      if (pts.length === 1) {
        const p = pts[0];
        const x1 = TCtx.sx(p._x), y1 = TCtx.sy(p._y);
        if (UI.tool === 'line') {
          const clipped = Geom.clipLineToRect({ x: x1, y: y1 }, { x: cursorSX - x1, y: cursorSY - y1 }, TCtx.w, TCtx.h);
          if (clipped) {
            ctx.beginPath();
            ctx.moveTo(clipped[0].x, clipped[0].y);
            ctx.lineTo(clipped[1].x, clipped[1].y);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(cursorSX, cursorSY);
          ctx.stroke();
          if (UI.tool === 'vector') {
            const ang = Math.atan2(cursorSY - y1, cursorSX - x1);
            const size = 9;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(cursorSX, cursorSY);
            ctx.lineTo(cursorSX - size * Math.cos(ang - 0.42), cursorSY - size * Math.sin(ang - 0.42));
            ctx.moveTo(cursorSX, cursorSY);
            ctx.lineTo(cursorSX - size * Math.cos(ang + 0.42), cursorSY - size * Math.sin(ang + 0.42));
            ctx.stroke();
          }
        }
      }
    } else if (UI.tool === 'circle') {
      if (pts.length === 1) {
        const p = pts[0];
        const x1 = TCtx.sx(p._x), y1 = TCtx.sy(p._y);
        const r = Math.hypot(cursorSX - x1, cursorSY - y1);
        if (r > 1) {
          ctx.beginPath();
          ctx.arc(x1, y1, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(cursorSX, cursorSY);
          ctx.stroke();
        }
      }
    } else if (UI.tool === 'polygon') {
      if (pts.length >= 1) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const x = TCtx.sx(p._x), y = TCtx.sy(p._y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(cursorSX, cursorSY);
        if (pts.length >= 2) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }
    } else if (UI.tool === 'midpoint') {
      if (pts.length === 1) {
        const p = pts[0];
        const x1 = TCtx.sx(p._x), y1 = TCtx.sy(p._y);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(cursorSX, cursorSY);
        ctx.stroke();
        const mx = (x1 + cursorSX) / 2, my = (y1 + cursorSY) / 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(37,99,235,.15)';
        ctx.fill();
        ctx.stroke();
      }
    } else if (UI.tool === 'perpendicular' || UI.tool === 'parallel') {
      if (pts.length === 1) {
        const hover = UI.hoverId ? getObject(UI.hoverId) : null;
        const base = hover && ['line', 'segment', 'vector'].includes(hover.type) ? hover : null;
        const dir = base ? directionOf(base) : null;
        if (dir) {
          let dx = dir.x, dy = dir.y;
          if (UI.tool === 'perpendicular') { const t = dx; dx = -dy; dy = t; }
          const sx1 = TCtx.sx(pts[0]._x), sy1 = TCtx.sy(pts[0]._y);
          const clipped = Geom.clipLineToRect(
            { x: sx1, y: sy1 },
            { x: dx, y: -dy },
            TCtx.w, TCtx.h
          );
          if (clipped) {
            ctx.beginPath();
            ctx.moveTo(clipped[0].x, clipped[0].y);
            ctx.lineTo(clipped[1].x, clipped[1].y);
            ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  function drawDragTooltip(TCtx) {
    if (!UI.drag || UI.drag.type !== 'point') return;
    const o = getObject(UI.drag.id);
    if (!o || !o._valid) return;
    const x = TCtx.sx(o._x);
    const y = TCtx.sy(o._y);
    const text = `${o.name} (${fmt(o._x, 2)}, ${fmt(o._y, 2)})`;
    ctx.save();
    ctx.font = '600 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 16;
    let bx = x + 16;
    let by = y - 44;
    if (bx + bw > TCtx.w - 8) bx = x - bw - 16;
    if (by < 8) by = y + 20;
    roundRect(ctx, bx, by, bw, 26, 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + 8, by + 13);
    ctx.restore();
  }

  function drawScene(renderCtx, vw, vh, opts) {
    const TCtx = makeTransform(vw, vh, opts.view);
    const previousCtx = ctx;
    ctx = renderCtx;
    try {
      drawSceneCore(TCtx, opts);
    } finally {
      ctx = previousCtx;
    }
  }

  function drawSceneCore(TCtx, opts) {
    ctx.save();
    ctx.fillStyle = PLOT.background;
    ctx.fillRect(0, 0, TCtx.w, TCtx.h);
    ctx.restore();

    drawGrid(TCtx);

    for (const o of doc.objects) {
      if (o.type === 'function') drawExplicit(o, TCtx, opts);
      if (o.type === 'implicit') drawImplicit(o, TCtx, opts);
    }
    for (const o of doc.objects) if (o.type === 'polygon') drawPolygonObject(o, TCtx, opts);
    for (const o of doc.objects) if (o.type === 'circle') drawCircleObject(o, TCtx, opts);
    for (const o of doc.objects) {
      if (o.type === 'line' || o.type === 'segment' || o.type === 'vector') {
        drawLineObject(o, TCtx, opts);
      }
    }
    for (const o of doc.objects) if (o.type === 'point') drawPoint(o, TCtx, opts);

    if (!opts.exporting) {
      drawPreview(TCtx);
      drawDragTooltip(TCtx);
    }

    if (opts.exporting) {
      ctx.save();
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(100,116,139,.55)';
      ctx.textAlign = 'right';
      ctx.fillText('GeoLab', TCtx.w - 14, TCtx.h - 12);
      ctx.restore();
    }
  }

  /* =========================================================
     11. 画布尺寸 / 绘制调度
     ========================================================= */
  function resizeBoard() {
    const rect = canvasWrap.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    updateZoomInfo();
    requestDraw();
  }

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    window.requestAnimationFrame(() => {
      drawQueued = false;
      drawBoard();
    });
  }

  function drawBoard() {
    recompute();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawScene(ctx, W, H, { view, exporting: false });
  }

  function liveUpdate() {
    recompute();
    refreshAlgebraValues();
    requestDraw();
    saveSoon();
  }

  function refreshAll() {
    recompute();
    renderAlgebra();
    updateEmptyState();
    updateToolHint();
    updateSelectionUI();
    requestDraw();
    saveSoon();
  }

  /* =========================================================
     12. 工具与指针交互
     ========================================================= */
  function eventPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function toWorld(sx, sy) {
    return {
      x: view.cx + (sx - W / 2) / view.scale,
      y: view.cy - (sy - H / 2) / view.scale
    };
  }

  function toScreen(wx, wy) {
    return {
      x: W / 2 + (wx - view.cx) * view.scale,
      y: H / 2 - (wy - view.cy) * view.scale
    };
  }

  function updateCursorPos(world) {
    if (!world) {
      cursorPosEl.textContent = '';
      return;
    }
    cursorPosEl.textContent = `x = ${fmt(world.x, 2)} · y = ${fmt(world.y, 2)}`;
  }

  function updateCursorStyle(hover) {
    let cursor = 'default';
    if (UI.drag && UI.drag.type !== 'pan') cursor = 'grabbing';
    else if (UI.drag && UI.drag.type === 'pan') cursor = 'grabbing';
    else if (UI.tool === 'move') {
      if (hover && hover.type === 'point' && hover.mode === 'free') cursor = 'grab';
      else if (hover) cursor = 'pointer';
    } else if (UI.tool === 'delete') cursor = 'pointer';
    else cursor = 'crosshair';
    canvas.style.cursor = cursor;
  }

  function ensurePointAt(sx, sy, world) {
    const hit = hitTest(sx, sy, ['point']);
    if (hit) return hit;
    let created = null;
    runAction(() => { created = createFreePoint(world.x, world.y); });
    return created;
  }

  function clearPending() {
    UI.pending = [];
    UI.lastClick = null;
    updateToolHint();
    requestDraw();
  }

  function finishPolygon() {
    if (UI.tool !== 'polygon') return;
    const pts = UI.pending.map(id => getObject(id)).filter(o => o && o.type === 'point');
    if (pts.length < 3) {
      showToast('多边形至少需要 3 个顶点', 'info');
      return;
    }
    try {
      let poly = null;
      runAction(() => { poly = createPolygon(pts); });
      clearPending();
      if (poly) selectObject(poly.id);
    } catch (err) {
      showToast(err.message);
    }
  }

  function handleToolClick(tool, world, sx, sy) {
    recompute();
    try {
      if (tool === 'point') {
        const hit = hitTest(sx, sy, ['point']);
        if (hit) { selectObject(hit.id); return; }
        let created = null;
        runAction(() => { created = createFreePoint(world.x, world.y); });
        if (created) selectObject(created.id);
        return;
      }

      if (tool === 'line' || tool === 'segment' || tool === 'vector') {
        const p = ensurePointAt(sx, sy, world);
        if (!p) return;
        if (UI.pending.length === 0) {
          UI.pending = [p.id];
          selectObject(p.id);
          updateToolHint();
          requestDraw();
          return;
        }
        const first = getObject(UI.pending[0]);
        if (!first || first.id === p.id) return;
        let created = null;
        runAction(() => { created = createTwoPointShape(tool, first, p); });
        UI.pending = [];
        updateToolHint();
        if (created) selectObject(created.id);
        requestDraw();
        return;
      }

      if (tool === 'circle') {
        const p = ensurePointAt(sx, sy, world);
        if (!p) return;
        if (UI.pending.length === 0) {
          UI.pending = [p.id];
          selectObject(p.id);
          updateToolHint();
          requestDraw();
          return;
        }
        const first = getObject(UI.pending[0]);
        if (!first) { clearPending(); return; }
        if (first.id === p.id) {
          showToast('请选择圆上另一个点', 'info');
          return;
        }
        let created = null;
        runAction(() => { created = createCircleThrough(first, p); });
        UI.pending = [];
        updateToolHint();
        if (created) selectObject(created.id);
        requestDraw();
        return;
      }

      if (tool === 'polygon') {
        const now = performance.now();
        const last = UI.lastClick;
        if (UI.pending.length >= 3 && last && now - last.t < 360 && Math.hypot(sx - last.x, sy - last.y) < 7) {
          finishPolygon();
          return;
        }
        if (UI.pending.length >= 3) {
          const first = getObject(UI.pending[0]);
          if (first && first._valid) {
            const fs = toScreen(first._x, first._y);
            if (Math.hypot(sx - fs.x, sy - fs.y) < 12) {
              finishPolygon();
              return;
            }
          }
        }
        const p = ensurePointAt(sx, sy, world);
        if (!p) return;
        if (UI.pending.includes(p.id)) return;
        UI.pending.push(p.id);
        UI.lastClick = { t: now, x: sx, y: sy };
        selectObject(p.id);
        updateToolHint();
        requestDraw();
        return;
      }

      if (tool === 'midpoint') {
        const segHit = hitTest(sx, sy, ['segment', 'vector']);
        if (UI.pending.length === 0 && segHit) {
          let created = null;
          runAction(() => { created = createMidpointOfSegment(segHit); });
          if (created) selectObject(created.id);
          return;
        }
        const p = ensurePointAt(sx, sy, world);
        if (!p) return;
        if (UI.pending.length === 0) {
          UI.pending = [p.id];
          selectObject(p.id);
          updateToolHint();
          requestDraw();
          return;
        }
        const first = getObject(UI.pending[0]);
        if (!first || first.id === p.id) return;
        let created = null;
        runAction(() => { created = createMidpointOfPoints(first, p); });
        UI.pending = [];
        updateToolHint();
        if (created) selectObject(created.id);
        requestDraw();
        return;
      }

      if (tool === 'intersect') {
        const hit = hitTest(sx, sy, ['line', 'segment', 'vector', 'circle']);
        if (!hit) {
          const curve = hitTest(sx, sy, ['function', 'implicit']);
          if (curve) showToast('函数与隐式曲线的交点暂不支持', 'info');
          return;
        }
        if (UI.pending.length === 0) {
          UI.pending = [hit.id];
          selectObject(hit.id);
          updateToolHint();
          requestDraw();
          return;
        }
        if (UI.pending[0] === hit.id) return;
        const A = getObject(UI.pending[0]);
        const B = hit;
        if (!A) { clearPending(); return; }
        let created = null;
        runAction(() => {
          recompute();
          const pts = getIntersections(A, B);
          if (!pts.length) throw new Error('两个对象当前没有交点');
          const list = pts.map((p, i) => createIntersectionPoint(A, B, i));
          created = list[0] || null;
        });
        UI.pending = [];
        updateToolHint();
        if (created) selectObject(created.id);
        requestDraw();
        return;
      }

      if (tool === 'perpendicular' || tool === 'parallel') {
        if (UI.pending.length === 0) {
          const p = ensurePointAt(sx, sy, world);
          if (!p) return;
          UI.pending = [p.id];
          selectObject(p.id);
          updateToolHint();
          requestDraw();
          return;
        }
        const base = hitTest(sx, sy, ['line', 'segment', 'vector']);
        if (!base) {
          showToast('请单击一条直线或线段', 'info');
          return;
        }
        const through = getObject(UI.pending[0]);
        if (!through) { clearPending(); return; }
        let created = null;
        runAction(() => { created = createRelationLine(tool, through, base); });
        UI.pending = [];
        updateToolHint();
        if (created) selectObject(created.id);
        requestDraw();
        return;
      }

      if (tool === 'delete') {
        const hit = hitTest(sx, sy);
        if (!hit) return;
        deleteObjectById(hit.id);
      }
    } catch (err) {
      showToast(err.message || '操作失败');
      clearPending();
    }
  }

  function onPointerDown(e) {
    if (e.button === 2) return;
    if (appEl.classList.contains('sidebar-open')) {
      appEl.classList.remove('sidebar-open');
      return;
    }
    finishSliderGesture();
    const { x, y } = eventPoint(e);
    UI.pointer = { x, y, inside: true };
    const world = toWorld(x, y);
    canvas.setPointerCapture?.(e.pointerId);

    if (e.button === 1) {
      UI.drag = { type: 'pan', lastX: x, lastY: y };
      updateCursorStyle(null);
      return;
    }
    if (e.button !== 0) return;

    if (UI.tool === 'move') {
      const hit = hitTest(x, y);
      if (hit) {
        selectObject(hit.id);
        if (hit.type === 'point' && hit.mode === 'free') {
          UI.drag = {
            type: 'point',
            id: hit.id,
            ox: hit.x - world.x,
            oy: hit.y - world.y,
            before: serializeDoc()
          };
          updateCursorStyle(hit);
          requestDraw();
        }
      } else {
        selectObject(null);
        UI.drag = { type: 'pan', lastX: x, lastY: y };
        updateCursorStyle(null);
      }
      return;
    }

    handleToolClick(UI.tool, world, x, y);
  }

  function onPointerMove(e) {
    const { x, y } = eventPoint(e);
    const inside = x >= 0 && y >= 0 && x <= W && y <= H;
    UI.pointer = { x, y, inside };

    if (UI.drag && UI.drag.type === 'point') {
      const p = getObject(UI.drag.id);
      if (p) {
        const world = toWorld(x, y);
        p.x = world.x + UI.drag.ox;
        p.y = world.y + UI.drag.oy;
        liveUpdate();
        updateCursorPos(world);
      }
      return;
    }

    if (UI.drag && UI.drag.type === 'pan') {
      const dx = x - UI.drag.lastX;
      const dy = y - UI.drag.lastY;
      view.cx -= dx / view.scale;
      view.cy += dy / view.scale;
      UI.drag.lastX = x;
      UI.drag.lastY = y;
      updateCursorPos(toWorld(x, y));
      saveSoon();
      requestDraw();
      return;
    }

    if (!inside) {
      if (UI.hoverId) {
        UI.hoverId = null;
        updateCursorStyle(null);
        requestDraw();
      }
      updateCursorPos(null);
      return;
    }

    const hover = hitTest(x, y);
    const newHoverId = hover ? hover.id : null;
    if (newHoverId !== UI.hoverId) {
      UI.hoverId = newHoverId;
      requestDraw();
    } else if (UI.pending.length && UI.tool !== 'move') {
      requestDraw();
    }
    updateCursorStyle(hover);
    updateCursorPos(toWorld(x, y));
  }

  function onPointerUp(e) {
    try { canvas.releasePointerCapture?.(e.pointerId); } catch (err) { /* 忽略 */ }
    if (UI.drag && UI.drag.type === 'point') {
      const before = UI.drag.before;
      UI.drag = null;
      commitAction(before);
      updateHistoryButtons();
    } else if (UI.drag && UI.drag.type === 'pan') {
      UI.drag = null;
      saveSoon();
    }
    const { x, y } = eventPoint(e);
    updateCursorStyle(hitTest(x, y));
    requestDraw();
  }

  function onPointerLeave() {
    if (UI.drag) return;
    UI.pointer.inside = false;
    UI.hoverId = null;
    updateCursorPos(null);
    requestDraw();
  }

  function onWheel(e) {
    e.preventDefault();
    const { x, y } = eventPoint(e);
    const factor = clamp(Math.exp(-e.deltaY * 0.0014), 0.68, 1.45);
    zoomAt(x, y, factor);
  }

  function zoomAt(sx, sy, factor) {
    const world = toWorld(sx, sy);
    const newScale = clamp(view.scale * factor, 2, 6000);
    view.scale = newScale;
    view.cx = world.x - (sx - W / 2) / newScale;
    view.cy = world.y + (sy - H / 2) / newScale;
    updateZoomInfo();
    saveSoon();
    requestDraw();
  }

  function defaultScaleForViewport() {
    return clamp(W / 16, 32, BASE_SCALE);
  }

  function updateZoomInfo() {
    zoomInfoEl.textContent = Math.round(view.scale / defaultScaleForViewport() * 100) + '%';
  }

  function resetView() {
    view.cx = 0;
    view.cy = 0;
    view.scale = defaultScaleForViewport();
    updateZoomInfo();
    saveSoon();
    requestDraw();
  }

  /* =========================================================
     13. 删除与依赖
     ========================================================= */
  function refsOf(o) {
    const refs = [];
    const add = (v) => { if (v) refs.push(v); };
    switch (o.type) {
      case 'number':
      case 'function':
      case 'implicit':
        (o.deps || []).forEach(add);
        break;
      case 'point':
        (o.deps || []).forEach(add);
        add(o.a); add(o.b); add(o.seg);
        break;
      case 'line':
        add(o.a); add(o.b); add(o.through); add(o.base);
        break;
      case 'segment':
      case 'vector':
        add(o.a); add(o.b);
        break;
      case 'circle':
        add(o.center); add(o.through);
        (o.deps || []).forEach(add);
        break;
      case 'polygon':
        (o.points || []).forEach(add);
        break;
    }
    return refs;
  }

  function collectDependents(rootId) {
    const doomed = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of doc.objects) {
        if (doomed.has(o.id)) continue;
        for (const ref of refsOf(o)) {
          if (doomed.has(ref)) {
            doomed.add(o.id);
            changed = true;
            break;
          }
        }
      }
    }
    return doomed;
  }

  function deleteObjectById(id) {
    const o = getObject(id);
    if (!o) return;
    const doomed = collectDependents(id);
    const count = doomed.size - 1;
    try {
      runAction(() => {
        doc.objects = doc.objects.filter(x => !doomed.has(x.id));
        if (UI.selectedId && doomed.has(UI.selectedId)) UI.selectedId = null;
        if (UI.hoverId && doomed.has(UI.hoverId)) UI.hoverId = null;
        UI.pending = UI.pending.filter(pid => !doomed.has(pid));
      });
      if (count > 0) showToast(`已删除对象及 ${count} 个依赖对象`, 'info');
      clearPending();
    } catch (err) {
      showToast(err.message || '删除失败');
    }
  }

  /* =========================================================
     14. 代数面板
     ========================================================= */
  function refName(id) {
    const o = getObject(id);
    return o ? o.name : '?';
  }

  function pointRHS(o) {
    if (o.mode === 'free') return `(${fmt(o.x, 3)}, ${fmt(o.y, 3)})`;
    if (o.mode === 'expr') return `(${esc(pretty(o.xExpr))}, ${esc(pretty(o.yExpr))})`;
    if (o.mode === 'midpoint') {
      return o.seg ? `Midpoint(${esc(refName(o.seg))})` : `Midpoint(${esc(refName(o.a))}, ${esc(refName(o.b))})`;
    }
    if (o.mode === 'intersect') {
      return `Intersection(${esc(refName(o.a))}, ${esc(refName(o.b))})`;
    }
    return '点';
  }

  function lineEquation(o) {
    if (!o._valid) return '未定义';
    const dx = o._x2 - o._x1;
    const dy = o._y2 - o._y1;
    if (Math.abs(dx) < 1e-9) return `x = ${fmt(o._x1, 3)}`;
    const m = dy / dx;
    const b = o._y1 - m * o._x1;
    if (Math.abs(m) < 1e-9) return `y = ${fmt(b, 3)}`;
    let slope;
    if (Math.abs(m - 1) < 1e-9) slope = 'x';
    else if (Math.abs(m + 1) < 1e-9) slope = '−x';
    else slope = `${fmt(m, 3).replace(/^-/, '−')}x`;
    if (Math.abs(b) < 1e-9) return `y = ${slope}`;
    return `y = ${slope} ${b > 0 ? '+' : '−'} ${fmt(Math.abs(b), 3)}`;
  }

  function objectValue(o) {
    if (o.type === 'number') return fmt(o._value, 4);
    if (o.type === 'point') return o._valid ? `(${fmt(o._x, 2)}, ${fmt(o._y, 2)})` : '未定义';
    if (o.type === 'segment' || o.type === 'vector') {
      if (!o._valid) return '未定义';
      return `长度 = ${fmt(Math.hypot(o._bx - o._ax, o._by - o._ay), 3)}`;
    }
    if (o.type === 'line') return lineEquation(o);
    if (o.type === 'circle') return o._valid ? `半径 = ${fmt(o._r, 3)}` : '未定义';
    if (o.type === 'polygon') return o._valid ? `面积 = ${fmt(Geom.polygonArea(o._pts), 3)}` : '未定义';
    return '';
  }

  function titleHTML(o) {
    const color = seriesTextColor(o.color || SERIES_PALETTE[0]);
    const name = `<span class="obj-name" style="color:${color}">${esc(o.name)}</span>`;
    let html;
    if (o.type === 'point') {
      html = `${name}<span class="obj-def"> = ${pointRHS(o)}</span>`;
    } else if (o.type === 'number') {
      html = `${name}<span class="obj-def"> = ${esc(pretty(o.expr || fmt(o._value, 4)))}</span>`;
    } else if (o.type === 'function') {
      html = `${name}<span class="obj-def">(${esc(o.varName || 'x')}) = ${esc(pretty(o.expr))}</span>`;
    } else if (o.type === 'implicit') {
      html = `${name}<span class="obj-def">: ${esc(pretty(o.lhs))} = ${esc(pretty(o.rhs))}</span>`;
    } else {
      html = `${name}<span class="obj-def">: ${esc(o.def || TYPE_LABEL[o.type])}</span>`;
    }
    return `${html}<span class="sr-only">，${esc(TYPE_LABEL[o.type] || '')}</span>`;
  }

  function makeRow(o) {
    const row = document.createElement('div');
    row.className = 'obj-row' + (o.visible === false ? ' is-hidden' : '');
    row.dataset.id = o.id;
    if (o.id === UI.selectedId) row.classList.add('is-selected');

    const eye = document.createElement('button');
    eye.className = 'row-eye';
    eye.type = 'button';
    eye.dataset.role = 'eye';
    eye.setAttribute('aria-label', o.visible === false ? '显示对象' : '隐藏对象');
    eye.title = o.visible === false ? '显示对象' : '隐藏对象';
    eye.innerHTML = o.visible === false ? ICON_EYE_OFF : ICON_EYE;

    const body = document.createElement('div');
    body.className = 'row-body';

    const title = document.createElement('div');
    title.className = 'obj-title';
    title.innerHTML = titleHTML(o);
    body.appendChild(title);

    let valueEl = null;
    if (o.type === 'number' && o.mode === 'free') {
      valueEl = document.createElement('div');
      valueEl.className = 'obj-value slider-wrap';
      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'slider';
      range.dataset.role = 'slider';
      range.min = o.min;
      range.max = o.max;
      range.step = o.step;
      range.value = o.value;
      range.setAttribute('aria-label', `${o.name} 的值`);
      const val = document.createElement('span');
      val.className = 'slider-val';
      val.dataset.role = 'slider-val';
      val.textContent = fmt(o._value, 3);
      valueEl.appendChild(range);
      valueEl.appendChild(val);
    } else {
      const val = objectValue(o);
      if (val) {
        valueEl = document.createElement('div');
        valueEl.className = 'obj-value' + (o._valid === false ? ' is-undefined' : '');
        valueEl.textContent = val;
      }
    }
    if (valueEl) body.appendChild(valueEl);

    const del = document.createElement('button');
    del.className = 'row-del';
    del.type = 'button';
    del.dataset.role = 'delete';
    del.title = '删除';
    del.setAttribute('aria-label', '删除');
    del.innerHTML = ICON_TRASH;

    row.appendChild(eye);
    row.appendChild(body);
    row.appendChild(del);
    return { row, title, valueEl };
  }

  function renderAlgebra() {
    const scroll = algebraEl.scrollTop;
    rowMap = new Map();
    algebraEl.innerHTML = '';
    if (!doc.objects.length) {
      const empty = document.createElement('div');
      empty.className = 'algebra-empty';
      empty.innerHTML = '<p>还没有对象</p><span>在输入框输入 <code>y = x^2</code> 开始作图</span>';
      algebraEl.appendChild(empty);
    } else {
      for (const o of doc.objects) {
        const refs = makeRow(o);
        rowMap.set(o.id, refs);
        algebraEl.appendChild(refs.row);
      }
    }
    algebraEl.scrollTop = scroll;
    updateSelectionUI();
    objCountEl.textContent = `${doc.objects.length} 个对象`;
  }

  function refreshAlgebraValues() {
    rebuildMaps();
    for (const [id, refs] of rowMap) {
      const o = getObject(id);
      if (!o) continue;
      refs.title.innerHTML = titleHTML(o);
      if (refs.valueEl) {
        if (o.type === 'number' && o.mode === 'free') {
          const range = refs.valueEl.querySelector('[data-role="slider"]');
          const val = refs.valueEl.querySelector('[data-role="slider-val"]');
          if (range && document.activeElement !== range) range.value = o.value;
          if (val) val.textContent = fmt(o._value, 3);
        } else {
          const val = objectValue(o);
          if (val) {
            refs.valueEl.textContent = val;
            refs.valueEl.classList.toggle('is-undefined', o._valid === false);
            if (refs.valueEl.style.display === 'none') refs.valueEl.style.display = '';
          }
        }
      }
      refs.row.classList.toggle('is-hidden', o.visible === false);
      const eye = refs.row.querySelector('[data-role="eye"]');
      if (eye) {
        eye.innerHTML = o.visible === false ? ICON_EYE_OFF : ICON_EYE;
        eye.setAttribute('aria-label', o.visible === false ? '显示对象' : '隐藏对象');
        eye.title = o.visible === false ? '显示对象' : '隐藏对象';
      }
    }
    updateSelectionUI();
  }

  function updateSelectionUI() {
    for (const [id, refs] of rowMap) {
      refs.row.classList.toggle('is-selected', id === UI.selectedId);
    }
  }

  function ensureRowVisible(id) {
    const refs = rowMap.get(id);
    if (!refs) return;
    const contRect = algebraEl.getBoundingClientRect();
    const rowRect = refs.row.getBoundingClientRect();
    if (rowRect.bottom > contRect.bottom - 8) {
      algebraEl.scrollTop += rowRect.bottom - contRect.bottom + 8;
    } else if (rowRect.top < contRect.top + 8) {
      algebraEl.scrollTop -= contRect.top - rowRect.top + 8;
    }
  }

  function selectObject(id) {
    UI.selectedId = id && getObject(id) ? id : null;
    updateSelectionUI();
    if (UI.selectedId) ensureRowVisible(UI.selectedId);
    requestDraw();
  }

  function editableDefinition(o) {
    if (o.type === 'number') {
      return `${o.name} = ${o.expr || fmt(o._value, 6)}`;
    }
    if (o.type === 'point' && (o.mode === 'free' || o.mode === 'expr')) {
      const x = o.mode === 'free' ? fmt(o.x, 6) : o.xExpr;
      const y = o.mode === 'free' ? fmt(o.y, 6) : o.yExpr;
      return `${o.name} = (${x}, ${y})`;
    }
    if (o.type === 'function') {
      return `${o.name}(${o.varName || 'x'}) = ${o.expr}`;
    }
    return null;
  }

  function toggleVisibility(id) {
    const o = getObject(id);
    if (!o) return;
    runAction(() => {
      o.visible = o.visible === false;
      if (!o.visible && UI.hoverId === id) UI.hoverId = null;
    });
  }

  function beginSliderGesture() {
    const armTimer = (gesture) => {
      window.clearTimeout(gesture.timer);
      gesture.timer = window.setTimeout(() => {
        try { finishSliderGesture(); } catch (err) { /* 忽略 */ }
      }, 1200);
    };
    if (sliderGesture) {
      armTimer(sliderGesture);
      return;
    }
    const gesture = { before: serializeDoc(), timer: 0 };
    sliderGesture = gesture;
    armTimer(gesture);
  }

  function finishSliderGesture() {
    if (!sliderGesture) return;
    const before = sliderGesture.before;
    window.clearTimeout(sliderGesture.timer);
    sliderGesture = null;
    commitAction(before);
  }

  /* =========================================================
     15. 工具栏与提示
     ========================================================= */
  function buildToolbar() {
    toolbarEl.innerHTML = TOOLS.map(t => {
      if (t.sep) return '<div class="tool-sep"></div>';
      return `<button type="button" class="tool" data-tool="${t.id}" data-tip="${t.label}  (${t.key})" aria-label="${t.label}" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[t.id]}</svg>
      </button>`;
    }).join('');
    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tool]');
      if (btn) setTool(btn.dataset.tool);
    });
  }

  function setTool(tool) {
    finishSliderGesture();
    if (!TOOLS.some(t => t.id === tool)) return;
    UI.tool = tool;
    UI.pending = [];
    UI.lastClick = null;
    if (window.innerWidth <= 900) appEl.classList.remove('sidebar-open');
    for (const btn of $$('.tool', toolbarEl)) {
      const active = btn.dataset.tool === tool;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    updateToolHint();
    updateCursorStyle(null);
    requestDraw();
  }

  function updateToolHint() {
    if (UI.tool === 'move') {
      hintEl.classList.remove('show');
      return;
    }
    const hints = {
      point: '单击画布创建点 · Esc 取消',
      line: '依次单击两个点，确定一条直线',
      segment: '依次单击两个点，确定一条线段',
      vector: '先单击起点，再单击终点',
      circle: '先单击圆心，再单击圆上一点',
      polygon: '依次单击顶点；点击起点、按 Enter 或双击完成',
      midpoint: '单击一条线段，或依次单击两个点',
      intersect: '依次单击两个对象（直线/线段/圆）',
      perpendicular: '先单击点，再单击一条直线',
      parallel: '先单击点，再单击一条直线',
      delete: '单击要删除的对象（关联对象会一并删除）'
    };
    let text = hints[UI.tool] || '';
    if (UI.pending.length) {
      if (UI.tool === 'polygon') text = `已选 ${UI.pending.length} 个顶点 · 点击起点、按 Enter 或双击完成`;
      else if (['line', 'segment', 'vector', 'midpoint'].includes(UI.tool)) text = '再单击第二个点';
      else if (UI.tool === 'circle') text = '再单击圆上一点';
      else if (UI.tool === 'intersect') text = '再单击第二个对象';
      else if (UI.tool === 'perpendicular' || UI.tool === 'parallel') text = '现在单击一条直线或线段';
    }
    hintEl.innerHTML = `<span class="hint-dot"></span>${esc(text)}<span class="hint-esc">Esc 取消</span>`;
    hintEl.classList.add('show');
  }

  function updateEmptyState() {
    emptyState.classList.toggle('visible', doc.objects.length === 0);
  }

  function showToast(message, type = 'error') {
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'toast show ' + type;
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3200);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    toastEl.classList.remove('show');
  }

  /* =========================================================
     16. 导出、新建、帮助
     ========================================================= */
  function exportPNG() {
    try {
      finishSliderGesture();
      recompute();
      const factor = 2;
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.round(W * factor));
      off.height = Math.max(1, Math.round(H * factor));
      const octx = off.getContext('2d');
      octx.setTransform(factor, 0, 0, factor, 0, 0);
      drawScene(octx, W, H, { view, exporting: true });
      off.toBlob((blob) => {
        if (!blob) { showToast('导出失败'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        a.href = url;
        a.download = `geolab-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast('图片已导出', 'success');
      }, 'image/png');
    } catch (err) {
      showToast('导出失败：' + (err.message || err));
    }
  }

  function newDocument() {
    if (doc.objects.length && !window.confirm('新建作图会清空当前内容，确定继续吗？')) return;
    finishSliderGesture();
    const before = serializeDoc();
    doc.objects = [];
    doc.counters = { id: 1, color: 0 };
    view.cx = 0;
    view.cy = 0;
    view.scale = BASE_SCALE;
    UI.selectedId = null;
    UI.hoverId = null;
    UI.pending = [];
    UI.drag = null;
    inputEl.value = '';
    updateZoomInfo();
    commitAction(before);
    showToast('已新建空白作图', 'success');
  }

  function openHelp() {
    if (helpModal.classList.contains('open')) return;
    helpReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    helpModal.classList.add('open');
    helpModal.setAttribute('aria-hidden', 'false');
    const focusClose = () => {
      const closeBtn = helpModal.querySelector('.modal-close');
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    };
    focusClose();
    window.setTimeout(focusClose, 0);
  }

  function closeHelp() {
    if (!helpModal.classList.contains('open')) return;
    const target = helpReturnFocus;
    helpReturnFocus = null;
    if (target && target.isConnected) target.focus({ preventScroll: true });
    helpModal.classList.remove('open');
    helpModal.setAttribute('aria-hidden', 'true');
  }

  function trapModalFocus(e) {
    const focusables = Array.from(helpModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.getClientRects().length > 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!helpModal.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* =========================================================
     17. 事件绑定
     ========================================================= */
  function bindEvents() {
    submitBtn.addEventListener('click', submitInput);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInput();
      } else if (e.key === 'Escape') {
        inputEl.blur();
      }
    });

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    algebraEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.slider')) {
        beginSliderGesture();
        e.stopPropagation();
      }
    });
    algebraEl.addEventListener('click', (e) => {
      const row = e.target.closest('.obj-row');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('[data-role="eye"]')) { toggleVisibility(id); return; }
      if (e.target.closest('[data-role="delete"]')) { deleteObjectById(id); return; }
      if (e.target.closest('.slider')) return;
      selectObject(id);
    });
    algebraEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('.slider') || e.target.closest('button')) return;
      const row = e.target.closest('.obj-row');
      if (!row) return;
      const o = getObject(row.dataset.id);
      if (!o) return;
      const text = editableDefinition(o);
      if (!text) {
        showToast('该对象由作图命令生成，暂不支持直接编辑', 'info');
        return;
      }
      inputEl.value = text;
      inputEl.focus();
      inputEl.setSelectionRange(text.length, text.length);
    });
    algebraEl.addEventListener('input', (e) => {
      const range = e.target.closest('[data-role="slider"]');
      if (!range) return;
      const row = e.target.closest('.obj-row');
      if (!row) return;
      const o = getObject(row.dataset.id);
      if (!o || o.type !== 'number') return;
      beginSliderGesture();
      const v = parseFloat(range.value);
      if (!Number.isFinite(v)) return;
      o.value = v;
      const val = row.querySelector('[data-role="slider-val"]');
      if (val) val.textContent = fmt(v, 3);
      liveUpdate();
    });
    algebraEl.addEventListener('change', (e) => {
      if (e.target.closest('[data-role="slider"]')) finishSliderGesture();
    });

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    zoomInBtn.addEventListener('click', () => zoomAt(W / 2, H / 2, 1.22));
    zoomOutBtn.addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.22));
    zoomResetBtn.addEventListener('click', resetView);
    newBtn.addEventListener('click', newDocument);
    sidebarNewBtn.addEventListener('click', newDocument);
    exportBtn.addEventListener('click', exportPNG);
    sidebarExportBtn.addEventListener('click', exportPNG);
    helpBtn.addEventListener('click', openHelp);
    helpInline.addEventListener('click', openHelp);
    sidebarToggle.addEventListener('click', () => appEl.classList.toggle('sidebar-open'));

    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal || e.target.closest('[data-close]')) {
        closeHelp();
        return;
      }
      const fill = e.target.closest('[data-fill]');
      if (fill) {
        inputEl.value = fill.dataset.fill;
        closeHelp();
        inputEl.focus();
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      }
    });

    for (const btn of $$('[data-run]')) {
      btn.addEventListener('click', () => {
        inputEl.value = btn.dataset.run;
        submitInput();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (helpModal.classList.contains('open')) {
        if (e.key === 'Escape') closeHelp();
        else if (e.key === 'Tab') trapModalFocus(e);
        return;
      }
      const typing = e.target instanceof HTMLElement && (
        e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' || e.target.isContentEditable
      );

      if (e.key === 'Escape') {
        if (helpModal.classList.contains('open')) { closeHelp(); return; }
        if (typing) { e.target.blur(); return; }
        if (UI.pending.length) { clearPending(); updateToolHint(); return; }
        if (UI.selectedId) { selectObject(null); return; }
      }

      if (typing) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Enter') {
        const active = document.activeElement;
        const activeIsControl = active && active !== document.body && (
          active.tagName === 'BUTTON' || active.tagName === 'A' ||
          active.getAttribute('role') === 'button'
        );
        if (activeIsControl) return;
        if (UI.tool === 'polygon' && UI.pending.length >= 3) {
          e.preventDefault();
          finishPolygon();
        } else {
          inputEl.focus();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (UI.selectedId) {
          e.preventDefault();
          deleteObjectById(UI.selectedId);
        }
        return;
      }

      const map = {
        v: 'move', p: 'point', l: 'line', s: 'segment', w: 'vector',
        c: 'circle', g: 'polygon', m: 'midpoint', i: 'intersect',
        n: 'perpendicular', r: 'parallel', d: 'delete'
      };
      if (!mod && !e.altKey && !e.shiftKey && map[e.key.toLowerCase()]) {
        setTool(map[e.key.toLowerCase()]);
      }
    });

    window.addEventListener('resize', resizeBoard);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resizeBoard());
      ro.observe(canvasWrap);
    }
  }

  /* =========================================================
     18. 初始化
     ========================================================= */
  function init() {
    buildToolbar();
    const restored = loadFromStorage();
    doc = normalizeDoc(doc);
    rebuildMaps();
    bindEvents();
    if (window.ResizeObserver) {
      // resizeBoard 由 ResizeObserver 触发
    }
    resizeBoard();
    if (!restored) view.scale = defaultScaleForViewport();
    updateZoomInfo();
    updateHistoryButtons();
    for (const btn of $$('.tool', toolbarEl)) {
      const active = btn.dataset.tool === 'move';
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    refreshAll();
    updateSelectionUI();
    updateEmptyState();
    updateToolHint();
    if (!restored && !doc.objects.length) {
      // 首次打开时的空状态
      updateEmptyState();
    }
    // 调试/自动化 API
    window.GeoLab = {
      input(text) {
        inputEl.value = text;
        submitInput();
      },
      getDocument() {
        return JSON.parse(serializeDoc());
      },
      getObjects() {
        return doc.objects.map(o => ({
          id: o.id, name: o.name, type: o.type, valid: o._valid !== false,
          x: o._x, y: o._y, value: o._value, section: o.type
        }));
      },
      setTool,
      selectObject,
      undo,
      redo,
      resetView,
      clear() {
        finishSliderGesture();
        const before = serializeDoc();
        doc.objects = [];
        doc.counters = { id: 1, color: 0 };
        UI.selectedId = null;
        UI.pending = [];
        inputEl.value = '';
        commitAction(before);
      }
    };
  }

  init();
})();

