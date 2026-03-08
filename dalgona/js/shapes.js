// ============================================================
// shapes.js — 다각형 기반 SDF 모양 정의
//
// 모든 도형을 꼭짓점 배열로 정의한 뒤 sdPolygon()으로
// 정확한 signed distance를 계산한다.
// ============================================================

const Shapes = (() => {
  const C = () => CFG.CENTER;
  const S = () => CFG.GRID / 84;  // 기준 스케일 (GRID=84 → 1x)

  // ──────────────────────────────────────────────
  // 유틸: 닫힌 다각형에 대한 Signed Distance
  // ──────────────────────────────────────────────
  function sdPolygon(px, py, verts) {
    const n = verts.length;
    let minDist2 = Infinity;
    let crossings = 0;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = verts[i][0], ay = verts[i][1];
      const bx = verts[j][0], by = verts[j][1];

      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey;
      let t = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = px - (ax + t * ex);
      const dy = py - (ay + t * ey);
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist2) minDist2 = d2;

      if ((ay > py) !== (by > py)) {
        const xInt = ax + (py - ay) / (by - ay) * (bx - ax);
        if (px < xInt) crossings++;
      }
    }

    const dist = Math.sqrt(minDist2);
    return (crossings & 1) ? -dist : dist;
  }

  // ──────────────────────────────────────────────
  // 1) 별 ⭐  — 10개 꼭짓점 (외곽 5 + 내곽 5)
  // ──────────────────────────────────────────────
  function starVerts(cx, cy, outerR, innerR) {
    const v = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI / 5) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      v.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return v;
  }

  // ──────────────────────────────────────────────
  // 2) 하트 ❤️ — 파라메트릭 곡선 샘플링
  //    x(t) = 16 sin³(t)
  //    y(t) = 13cos(t) − 5cos(2t) − 2cos(3t) − cos(4t)
  // ──────────────────────────────────────────────
  function heartVerts(cx, cy, scale) {
    const v = [];
    const N = 80;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      // 원래 수식에서 y가 위로 양수이므로, 캔버스(아래로 양수)에 맞게 부호 반전
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2*t)
                    - 2 * Math.cos(3*t) - Math.cos(4*t));
      v.push([cx + hx * scale, cy + hy * scale]);
    }
    return v;
  }

  // ──────────────────────────────────────────────
  // 3) 우산 ☂️ — 돔(상반원) + 손잡이(직선) + 갈고리(하반원)
  // ──────────────────────────────────────────────
  function umbrellaVerts(cx, cy, s) {
    const v = [];
    const domeR    = 22 * s;
    const domeY    = cy - 4 * s;     // 돔 중심 Y
    const handleW  = 2.5 * s;        // 손잡이 반폭
    const handleBot = cy + 22 * s;   // 손잡이 하단
    const hookR    = 5 * s;          // 갈고리 반지름

    // 돔 상반원 (왼 → 오, 호)
    const domeN = 40;
    for (let i = 0; i <= domeN; i++) {
      const a = Math.PI + (i / domeN) * Math.PI; // π → 2π
      v.push([cx + domeR * Math.cos(a), domeY + domeR * Math.sin(a)]);
    }

    // 우측 외부 4분원 (오 → 왼)
    const c1N = 10;
    const c1R = 5 * Math.SQRT2 * s;
    let c1X = cx + 17 * s, c1Y = domeY + 5 * s;
    let a = Math.PI / 4, da = Math.PI / 2 / c1N;
    for (let i = 0; i < c1N; ++i) {
      a += da;
      v.push([c1X + c1R * Math.cos(a), c1Y - c1R * Math.sin(a)]);
    }

    // 우측 내부 4분원 (오 → 왼)
    a = Math.PI / 4;
    c1X -= 10 * s;
    for (let i = 0; i < c1N; ++i) {
      a += da;
      v.push([c1X + c1R * Math.cos(a), c1Y - c1R * Math.sin(a)]);
    }

    // 우산 기둥과 손잡이 교점
    v.push([cx + 2 * s, cy + 18 * s]);

    // 손잡이 내부 갈고리 반원 (왼 → 오)
    const c2N = 20;
    let c2R = 4 * s;
    a = Math.PI, da = Math.PI / c2N;
    let c2X = cx + 6 * s, c2Y = cy + 18 * s;
    for (let i = 0; i < c2N; ++i) {
      a -= da;
      v.push([c2X + c2R * Math.cos(a), c2Y + c2R * Math.sin(a)]);
    }

    // 손잡이 끝부분 반원 (왼 → 오)
    a = Math.PI;
    c2X += 6 * s;
    c2R /= 2;
    for (let i = 0; i < c2N; ++i) {
      a -= da;
      v.push([c2X + c2R * Math.cos(a), c2Y - c2R * Math.sin(a)]);
    }

    // 손잡이 외부 갈고리 반원 (오 → 왼)
    a = 0;
    c2X -= 6 * s;
    c2R *= 4;
    for (let i = 0; i < c2N; ++i) {
      a += da;
      v.push([c2X + c2R * Math.cos(a), c2Y + c2R * Math.sin(a)]);
    }

    // 기둥과 사분원 교점
    v.push([cx - 2 * s, cy - 4 * s]);

    // 좌측 내부 사분원 (오 → 왼)
    a = Math.PI / 4;
    c1X = cx - 7 * s;
    for (let i = 0; i < c1N; ++i) {
      a += da;
      v.push([c1X + c1R * Math.cos(a), c1Y - c1R * Math.sin(a)]);
    }

    // 좌측 외부 사분원 (오 → 왼)
    a = Math.PI / 4;
    c1X -= 10 * s;
    for (let i = 0; i < c1N; ++i) {
      a += da;
      v.push([c1X + c1R * Math.cos(a), c1Y - c1R * Math.sin(a)]);
    }

    return v;
  }

  // ──────────────────────────────────────────────
  // 4) 삼각형 🔺 — 정삼각형
  // ──────────────────────────────────────────────
  function triangleVerts(cx, cy, R) {
    const v = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI / 3) - Math.PI / 2;
      v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    return v;
  }

  // ──────────────────────────────────────────────
  // Shape 정의 (꼭짓점 캐싱)
  // ──────────────────────────────────────────────
  const defs = {
    star: {
      name: '별', icon: '⭐', _v: null,
      sdf(x, y) {
        if (!this._v) this._v = starVerts(C(), C(), 24 * S(), 10 * S());
        return sdPolygon(x, y, this._v);
      }
    },
    heart: {
      name: '하트', icon: '❤️', _v: null,
      sdf(x, y) {
        if (!this._v) this._v = heartVerts(C(), C() + 2 * S(), S() * 1.15);
        return sdPolygon(x, y, this._v);
      }
    },
    circle: {
      name: '원', icon: '⭕',
      sdf(x, y) {
        const dx = x - C(), dy = y - C();
        return Math.sqrt(dx * dx + dy * dy) - 20 * S();
      }
    },
    umbrella: {
      name: '우산', icon: '☂️', _v: null,
      sdf(x, y) {
        if (!this._v) this._v = umbrellaVerts(C(), C(), S());
        return sdPolygon(x, y, this._v);
      }
    },
    triangle: {
      name: '삼각형', icon: '🔺', _v: null,
      sdf(x, y) {
        if (!this._v) this._v = triangleVerts(C(), C() + 2 * S(), 22 * S());
        return sdPolygon(x, y, this._v);
      }
    }
  };

  function invalidateCache() {
    for (const shape of Object.values(defs)) {
      if ('_v' in shape) shape._v = null;
    }
  }

  return { defs, invalidateCache, sdPolygon };
})();
