/* GeoLab — 几何计算工具 */
(function (global) {
  'use strict';

  const EPS = 1e-9;

  function dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  }

  function dist2(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return dx * dx + dy * dy;
  }

  /** 点到线段的距离 */
  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < EPS) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function pointInPolygon(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / ((yj - yi) || EPS) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** 无限直线交点；返回 {x,y,t,u} 或 null */
  function lineLineIntersection(p1, p2, p3, p4) {
    const rX = p2.x - p1.x, rY = p2.y - p1.y;
    const sX = p4.x - p3.x, sY = p4.y - p3.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-12) return null;
    const qpX = p3.x - p1.x, qpY = p3.y - p1.y;
    const t = (qpX * sY - qpY * sX) / denom;
    const u = (qpX * rY - qpY * rX) / denom;
    return { x: p1.x + t * rX, y: p1.y + t * rY, t, u };
  }

  /** 直线（参数式）与圆交点，返回 [{x,y,t}] */
  function lineCircleIntersection(p, dir, center, radius) {
    const fx = p.x - center.x;
    const fy = p.y - center.y;
    const a = dir.x * dir.x + dir.y * dir.y;
    if (a < 1e-12) return [];
    const b = 2 * (fx * dir.x + fy * dir.y);
    const c = fx * fx + fy * fy - radius * radius;
    let disc = b * b - 4 * a * c;
    if (disc < -1e-9) return [];
    if (disc < 0) disc = 0;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    const pts = [{ x: p.x + t1 * dir.x, y: p.y + t1 * dir.y, t: t1 }];
    if (Math.abs(t2 - t1) > 1e-8) {
      pts.push({ x: p.x + t2 * dir.x, y: p.y + t2 * dir.y, t: t2 });
    }
    return pts;
  }

  function circleCircleIntersection(c1, r1, c2, r2) {
    const d = dist(c1.x, c1.y, c2.x, c2.y);
    if (d < EPS) return [];
    if (d > r1 + r2 + 1e-9) return [];
    if (d < Math.abs(r1 - r2) - 1e-9) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    let h2 = r1 * r1 - a * a;
    if (h2 < 0) h2 = 0;
    const h = Math.sqrt(h2);
    const mx = c1.x + a * (c2.x - c1.x) / d;
    const my = c1.y + a * (c2.y - c1.y) / d;
    const rx = -(c2.y - c1.y) * (h / d);
    const ry = (c2.x - c1.x) * (h / d);
    const pts = [{ x: mx + rx, y: my + ry }];
    if (h > 1e-8) pts.push({ x: mx - rx, y: my - ry });
    return pts;
  }

  /**
   * 将无限直线裁剪到矩形 [0,0,w,h]。
   * p 为线上一点，dir 为方向；返回两个端点或 null。
   */
  function clipLineToRect(p, dir, w, h) {
    const dx = dir.x, dy = dir.y;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return null;
    let t0 = -Infinity, t1 = Infinity;

    function clip(pv, qv) {
      if (Math.abs(pv) < 1e-12) return qv >= 0;
      const r = qv / pv;
      if (pv < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    if (!clip(-dx, p.x)) return null;
    if (!clip(dx, w - p.x)) return null;
    if (!clip(-dy, p.y)) return null;
    if (!clip(dy, h - p.y)) return null;
    if (t0 > t1) return null;
    if (!isFinite(t0) || !isFinite(t1)) return null;
    return [
      { x: p.x + dx * t0, y: p.y + dy * t0 },
      { x: p.x + dx * t1, y: p.y + dy * t1 }
    ];
  }

  function polygonArea(pts) {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    }
    return Math.abs(area) / 2;
  }

  const api = {
    EPS,
    dist,
    dist2,
    pointSegmentDistance,
    pointInPolygon,
    lineLineIntersection,
    lineCircleIntersection,
    circleCircleIntersection,
    clipLineToRect,
    polygonArea
  };

  global.Geom = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

