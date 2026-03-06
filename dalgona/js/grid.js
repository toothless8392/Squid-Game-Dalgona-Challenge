// ============================================================
// grid.js — 그리드 초기화 및 셀 관리
// ============================================================
class PerlinNoise {
  constructor(seed) {
    // 순열 테이블 생성 (256개 값을 섞어서 2배로 확장)
    this.perm = this._buildPermutation(seed);
  }

  // --- 시드 기반 순열 테이블 ---
  _buildPermutation(seed) {
    const p = Array.from({ length: 256 }, (_, i) => i);

    // Fisher-Yates 셔플 (시드 기반 간이 RNG)
    let s = seed;
    const rng = () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // 길이 512로 확장 (모듈로 연산 대신 직접 참조 가능)
    return [...p, ...p];
  }

  // --- Fade 함수: 6t⁵ - 15t⁴ + 10t³ ---
  // 격자 경계에서 1차·2차 도함수가 0이 되어 매끄러운 보간 보장
  _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // --- 선형 보간 ---
  _lerp(a, b, t) {
    return a + t * (b - a);
  }

  // --- 격자점의 그래디언트 벡터와 거리 벡터의 내적 ---
  // 해시값으로 4방향 중 하나를 선택하는 최적화 버전
  _grad(hash, x, y) {
    const h = hash & 3;        // 하위 2비트 → 0,1,2,3
    switch (h) {
      case 0: return  x + y;   // 그래디언트 ( 1,  1)
      case 1: return -x + y;   // 그래디언트 (-1,  1)
      case 2: return  x - y;   // 그래디언트 ( 1, -1)
      case 3: return -x - y;   // 그래디언트 (-1, -1)
    }
  }

  // ============================================================
  //  핵심: noise2D(x, y) → -1 ~ +1
  // ============================================================
  noise2D(x, y) {
    const p = this.perm;

    // ① 입력 좌표가 속한 격자 셀 찾기 (정수 부분)
    const xi = Math.floor(x) & 255;   // & 255 = 순열 테이블 범위 내로
    const yi = Math.floor(y) & 255;

    // ② 셀 내 상대 위치 (소수 부분, 0~1)
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // ③ Fade 함수로 보간 가중치 계산
    const u = this._fade(xf);
    const v = this._fade(yf);

    // ④ 네 꼭짓점의 해시값 (순열 테이블 체이닝)
    const aa = p[p[xi    ] + yi    ];   // 좌하
    const ab = p[p[xi    ] + yi + 1];   // 좌상
    const ba = p[p[xi + 1] + yi    ];   // 우하
    const bb = p[p[xi + 1] + yi + 1];   // 우상

    // ⑤ 각 꼭짓점의 그래디언트·거리 내적값을 보간
    const x1 = this._lerp(
      this._grad(aa, xf,     yf),       // 좌하 기여
      this._grad(ba, xf - 1, yf),       // 우하 기여
      u
    );
    const x2 = this._lerp(
      this._grad(ab, xf,     yf - 1),   // 좌상 기여
      this._grad(bb, xf - 1, yf - 1),   // 우상 기여
      u
    );

    return this._lerp(x1, x2, v);       // 최종 보간
  }

  // ============================================================
  //  fBm: 옥타브 합성 (fractal Brownian motion)
  // ============================================================
  fbm(x, y, octaves = 3, persistence = 0.5, lacunarity = 3.0) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxAmplitude = 0;  // 정규화용

    for (let i = 0; i < octaves; i++) {
      total += amplitude * this.noise2D(x * frequency, y * frequency);
      maxAmplitude += amplitude;
      amplitude *= persistence;    // 진폭 감소
      frequency *= lacunarity;     // 주파수 증가
    }

    return total / maxAmplitude;   // -1 ~ +1 범위로 정규화
  }
}

const Grid = (() => {
  // Cell types
  const TYPE_OUTSIDE = 0;
  const TYPE_OUTLINE = 1;
  const TYPE_INSIDE  = 2;

  let cells = null;          // Float32 typed array가 아닌 object array (접근 편의)
  let stats = { totalOutline: 0, brokenOutline: 0, totalInside: 0, brokenInside: 0 };

  /**
   * 셀 데이터를 Struct-of-Arrays 형태로 관리
   * (성능을 위해 typed array 사용)
   */
  let hp, maxHp, type, crackLevel, broken, inCookie, noiseVal;

  function idx(x, y) { return y * CFG.GRID + x; }

  function init(shapeName) {
    const N = CFG.GRID;
    const total = N * N;

    let perlin = new PerlinNoise(Date.now());
    const noiseScale = 0.2;
    const octaves = 6;
    const persistence = 0.9;


    hp         = new Int8Array(total);
    maxHp      = new Int8Array(total);
    type       = new Uint8Array(total);
    crackLevel = new Uint8Array(total);
    broken     = new Uint8Array(total);   // 0 or 1
    inCookie   = new Uint8Array(total);   // 0 or 1
    noiseVal   = new Float32Array(total);

    stats = { totalOutline: 0, brokenOutline: 0, totalInside: 0, brokenInside: 0 };

    const shape = Shapes.defs[shapeName];
    const center = CFG.CENTER;
    const radius = CFG.COOKIE_RADIUS;
    const radiusSquare = radius * radius;
    const thickness = CFG.OUTLINE_THICKNESS;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = idx(x, y);
        const dx = x - center, dy = y - center;
        const distSquare = dx * dx + dy * dy;
        const cookie = distSquare <= radiusSquare ? 1 : 0;

        inCookie[i] = cookie;
        noiseVal[i] = Math.random() * 0.15;
        crackLevel[i] = 0;
        broken[i] = 0;

        if (cookie) {
          const sdfVal = shape.sdf(x, y);
          if (sdfVal < -thickness) {
            type[i] = TYPE_INSIDE;

            const noiseVal = perlin.fbm(x * noiseScale, y * noiseScale, octaves, persistence, )
            const normalized = noiseVal * 25 + 45;
            
            hp[i] = normalized;
            maxHp[i] = normalized;
            stats.totalInside++;
          } else if (sdfVal <= thickness * 0.5) {
            type[i] = TYPE_OUTLINE;
            hp[i] = CFG.OUTLINE_HP_INIT;
            maxHp[i] = CFG.OUTLINE_HP_INIT;
            stats.totalOutline++;
          } else {
            type[i] = TYPE_OUTSIDE;
            
            const noiseVal = perlin.fbm(x * noiseScale, y * noiseScale, octaves, persistence, )
            const normalized = noiseVal * 25 + 45;
            
            hp[i] = normalized;
            maxHp[i] = normalized;
          }
        } else {
          type[i] = TYPE_OUTSIDE;
          hp[i] = 0;
          maxHp[i] = 0;
        }
      }
    }

    // 기포 구현: 일부 셀을 약하게 만들기
    // for (let i = 0; i < total; i++) {
    //   if (inCookie[i]) {
    //     p = Math.random();
    //     if (p < CFG.HP_BUBBLE_CHANCE) {
    //       maxHp[i] = Math.floor(CFG.HP_BUBBLE_LOWER_BOUND + p * 75) >> 0;
    //       hp[i] = maxHp[i];
    //     }
    //   }
    // }
  }

  // 개별 셀 접근 헬퍼
  function get(x, y) {
    const i = idx(x, y);
    return {
      hp: hp[i], maxHp: maxHp[i], type: type[i],
      crackLevel: crackLevel[i], broken: broken[i],
      inCookie: inCookie[i], noiseVal: noiseVal[i]
    };
  }

  function getHp(x, y)         { return hp[idx(x, y)]; }
  function setHp(x, y, v)      { hp[idx(x, y)] = v; }
  function getType(x, y)       { return type[idx(x, y)]; }
  function getCrack(x, y)      { return crackLevel[idx(x, y)]; }
  function addCrack(x, y)      { crackLevel[idx(x, y)]++; }
  function isBroken(x, y)      { return broken[idx(x, y)] === 1; }
  function setBroken(x, y)     { broken[idx(x, y)] = 1; hp[idx(x, y)] = 0; }
  function isInCookie(x, y)    { return inCookie[idx(x, y)] === 1; }
  function getNoise(x, y)      { return noiseVal[idx(x, y)]; }

  // ──────────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────────
  

  // ──────────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────────

  // 직접 typed array 접근 (렌더러용)
  function arrays() {
    return { hp, maxHp, type, crackLevel, broken, inCookie, noiseVal };
  }

  return {
    TYPE_OUTSIDE, TYPE_OUTLINE, TYPE_INSIDE,
    init, get, getHp, setHp, getType, getCrack, addCrack,
    isBroken, setBroken, isInCookie, getNoise, arrays, idx,
    stats: () => stats,
  };
})();
