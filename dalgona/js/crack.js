// ============================================================
// crack.js — BFS 기반 확률적 균열 전파 알고리즘 (개선판)
//
// 변경점:
//   - 클릭 시 충격파 반경(CLICK_IMPACT_RADIUS) 내 셀에 직접 데미지
//   - 셀 타입별 투과율 분리 (윤곽선 > 외부 >> 내부)
//   - 윤곽선을 경유하는 전파는 감쇠가 느려 연쇄 파괴 발생
//   - 비윤곽선으로도 확률적으로 충격이 "새어나감"
// ============================================================
class Queue {
    constructor(capacity = 1024) {
        this.buffer = new Array(capacity);
        this.head = 0;
        this.tail = 0;
        this.size = 0;
        this.capacity = capacity;
    }

    push(value) {
        if (this.size === this.capacity) this._resize();
        this.buffer[this.tail] = value;
        this.tail = (this.tail + 1) % this.capacity;
        this.size++;
    }
    pop() {
        if (this.size === 0) return null;
        const value = this.buffer[this.head];
        this.buffer[this.head] = undefined;
        this.head = (this.head + 1) % this.capacity;
        this.size--;
        return value;
    }

    _resize() {        
        const newBuffer = new Array(this.capacity);
        for (let i = 0; i < this.size; i++)
            newBuffer[i] = this.buffer[(this.head + i) % this.capacity];
        this.head = 0;
        this.tail = this.size;
        this.capacity *= 2;
        this.buffer = newBuffer;
    }
}

const Crack = (() => {
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  let crackling = false;

  let dirtyCells = new Set();
  let lickableCells = new Set();  // 핥기로 복구 가능한 셀 인덱스

  function getDirty()  { return dirtyCells; }
  function clearDirty() { dirtyCells = new Set(); }
  function clearLickable() { lickableCells = new Set(); }
  function markDirty(x, y) { dirtyCells.add(y * CFG.GRID + x); }

  // ── 핥기: 반경 r 내 균열 셀 복구 ──
  function healAt(px, py, r) {
    if (lickableCells.size === 0) return;
    const arr = Grid.arrays();
    const rSq = r * r;
    for (const key of [...lickableCells]) {
      const x = key % N;
      const y = Math.floor(key / N);
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy <= rSq) {
        arr.broken[key] = 0;
        arr.hp[key] = arr.maxHp[key];
        markDirty(x, y);
        lickableCells.delete(key);
        const stats = Grid.stats();
        if (arr.type[key] === Grid.TYPE_INSIDE)  stats.brokenInside  = Math.max(0, stats.brokenInside  - 1);
        if (arr.type[key] === Grid.TYPE_OUTLINE) stats.brokenOutline = Math.max(0, stats.brokenOutline - 1);
      }
    }
    if (lickableCells.size === 0) Game.endLick();
  }

  // ── 셀 파괴 ──
  function breakCell(x, y) {
    if (Grid.isBroken(x, y)) return;
    Grid.setBroken(x, y);
    markDirty(x, y);

    const t = Grid.getType(x, y);
    const stats = Grid.stats();
    if (t === Grid.TYPE_OUTLINE) stats.brokenOutline++;
    if (t === Grid.TYPE_INSIDE)  stats.brokenInside++;

    Audio.break_();
    Particles.spawn(
      x * CFG.CELL + CFG.CELL / 2,
      y * CFG.CELL + CFG.CELL / 2,
      5, '#D4952B'
    );

    if (!crackling) {
      const intensity = t === Grid.TYPE_OUTLINE ? 0.8 : 1.8;
      Renderer.shake(intensity);
    }
  }

  // ── 셀 타입에 따른 투과율 ──
  function transmittance(cellType) {
    switch (cellType) {
      case Grid.TYPE_OUTLINE: return CFG.CRACK_OUTLINE_TRANSMIT;
      case Grid.TYPE_OUTSIDE: return CFG.CRACK_OUTSIDE_TRANSMIT;
      case Grid.TYPE_INSIDE:  return CFG.CRACK_INSIDE_TRANSMIT;
      default: return 0;
    }
  }

  // ── BFS 균열 전파 ──
  function propagate(startX, startY, baseIntensity) {
    const N = CFG.GRID;
    const visited = new Set();
    const queue = [{ x: startX, y: startY, intensity: baseIntensity, gen: 0 }];
    visited.add(startY * N + startX);

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.gen > CFG.CRACK_MAX_DEPTH) continue;

      // 전파원 셀이 윤곽선이면 감쇠가 느리다
      const srcIsOutline = Grid.getType(cur.x, cur.y) === Grid.TYPE_OUTLINE;
      const decay = srcIsOutline ? CFG.CRACK_DECAY_OUTLINE : CFG.CRACK_DECAY_NORMAL;

      for (const [ddx, ddy] of DIRS) {
        const nx = cur.x + ddx, ny = cur.y + ddy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;

        const key = ny * N + nx;
        if (visited.has(key)) continue;
        if (!Grid.isInCookie(nx, ny) || Grid.isBroken(nx, ny)) continue;

        const nType = Grid.getType(nx, ny);
        const trans = transmittance(nType);
        const diagF = (ddx !== 0 && ddy !== 0) ? CFG.CRACK_DIAG_FACTOR : 1.0;
        const prob  = cur.intensity * trans * diagF;

        if (Math.random() < prob) {
          visited.add(key);
          Grid.setHp(nx, ny, Grid.getHp(nx, ny) - 1);
          Grid.addCrack(nx, ny);
          markDirty(nx, ny);

          if (Grid.getHp(nx, ny) <= 0) {
            breakCell(nx, ny);
            // 파괴된 셀에서 계속 전파
            queue.push({
              x: nx, y: ny,
              intensity: cur.intensity * decay,
              gen: cur.gen + 1
            });
          } else if (Math.random() < CFG.CRACK_CONTINUE_CHANCE) {
            // 파괴 안 됐어도 균열이 더 퍼질 수 있음
            queue.push({
              x: nx, y: ny,
              intensity: cur.intensity * decay * 0.5,
              gen: cur.gen + 1
            });
          }
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────────
  function vecCosSquare(v1x, v1y, v2x, v2y) {
    const dot = v1x * v2x + v1y * v2y;
    return dot * dot / ((v1x * v1x + v1y * v1y) * (v2x * v2x + v2y * v2y));
  }

  const N = CFG.GRID;
  // visited는 boolean이 아니라 방문한 순서(세대) 저장
  const visited = new Uint8Array(N * N);
  const visitIdx = [];
  
  function giveDamage(x, y, damage) {
    const curHp = Grid.getHp(x, y);
    const snapThreshold = Grid.getType(x, y) === Grid.TYPE_OUTLINE ? 10 : 2;
    if (damage < curHp && curHp - damage > snapThreshold) {
      Grid.setHp(x, y, curHp - damage);
      markDirty(x, y);
      return false;
    } else {
      const t = Grid.getType(x, y);
      const stats = Grid.stats();
      if (!Grid.isBroken(x, y) && t === Grid.TYPE_OUTLINE) stats.brokenOutline++;
      if (!Grid.isBroken(x, y) && t === Grid.TYPE_INSIDE) stats.brokenInside++;
      Grid.setBroken(x, y);
      markDirty(x, y);

      if (!crackling) {
        Particles.spawn(
          x * CFG.CELL + CFG.CELL / 2,
          y * CFG.CELL + CFG.CELL / 2,
          3, '#D4952B'
        );
        const intensity = Grid.TYPE_OUTLINE === t ? 0.8 : 1.1;
        Renderer.shake(intensity);
      }
      return true;
    }
  }

  // Pseudo-global variables for propagateCrack
  let maxDistance = 10;
  const crackLinePoints = [];
  const crackLineDirIndices = [];

  function propagateCrack(currX, currY, originX, originY) {
    if (Math.random() < 0.9) {
      maxDistance = 6 + (Math.floor(Math.random() * 8) >> 0);
    } else {
      maxDistance = 10 + (Math.floor(Math.random() * 10) >> 0);
    }
    DFSCrack(currX, currY, originX, originY, 0);

    crackLinePoints.push([currX, currY]);

    for (let i = 0; i < (maxDistance >> 1); ++i) {
      const idx = crackLineDirIndices[i];
      const currVisitNo = visited[N * currX + currY];
      for (const [dx, dy] of NEIGHBOR_DIRECTION) {
        const neighborX = currX + dx, neighborY = currY + dy;
        if (neighborX < 0 || neighborX >= N || neighborY < 0 || neighborY >= N || visited[N * neighborX + neighborY]) continue;

        giveDamage(neighborX, neighborY, 100);
        visited[N * neighborX + neighborY] = currVisitNo;
        visitIdx.push(N * neighborX + neighborY);
      }

      currX += NEIGHBOR_DIRECTION[idx][0];
      currY += NEIGHBOR_DIRECTION[idx][1];
    }

    // Draw crack with width 3
    let i = 1, currDirIdx = crackLineDirIndices[0];
    // for (let i = 1; i < crackLineDirIndices.length; ++i) {
    //   const nextDirIdx = crackLineDirIndices[i];
    //   const currVisitNo = visited[N * currX + currY];
    //   const dx = NEIGHBOR_DIRECTION[currDirIdx][0], dy = NEIGHBOR_DIRECTION[currDirIdx][1];
    //   if (currDirIdx & 1) { // Diagonal direction
    //     const nextX = currX + dx, nextY = currY + dy;
    //     Grid.setBroken(nextX, currY);
    //     markDirty(nextX, currY);
    //     visited[N * nextX + currY] = currVisitNo;
    //     visitIdx.push(N * nextX + currY);
    //     Grid.setBroken(currX, nextY);
    //     markDirty(currX, nextY);
    //     visited[N * currX + nextY] = currVisitNo;
    //     visitIdx.push(N * currX + nextY);

    //     currX = nextX, currY = nextY;
    //   }
    //   else {
    //     const d1x = dy, d1y = -dx;
    //     const d2x = -dy, d2y = dx;
    //     Grid.setBroken(currX + d1x, currY + d1y);
    //     markDirty(currX + d1x, currY + d1y);
    //     visited[N * (currX + d1x) + (currY + d1y)] = currVisitNo;
    //     visitIdx.push(N * (currX + d1x) + (currY + d1y));
    //     Grid.setBroken(currX + d2x, currY + d2y);
    //     markDirty(currX + d2x, currY + d2y);
    //     visited[N * (currX + d2x) + (currY + d2y)] = currVisitNo;
    //     visitIdx.push(N * (currX + d2x) + (currY + d2y));

    //     currX += dx, currY += dy;

    //     if (nextDirIdx & 1) {
    //       if (((nextDirIdx + 8 - currDirIdx) & 7) < 4) {  // Left turn
    //         const d3x = NEIGHBOR_DIRECTION[(nextDirIdx + 5) & 7][0], d3y = NEIGHBOR_DIRECTION[(nextDirIdx + 5) & 7][1];
    //         Grid.setBroken(currX + d3x, currY + d3y);
    //         markDirty(currX + d3x, currY + d3y);
    //         visited[N * (currX + d3x) + (currY + d3y)] = currVisitNo;
    //         visitIdx.push(N * (currX + d3x) + (currY + d3y));
    //       }
    //       else {  // Right turn
    //         const d3x = NEIGHBOR_DIRECTION[(nextDirIdx + 3) & 7][0], d3y = NEIGHBOR_DIRECTION[(nextDirIdx + 3) & 7][1];
    //         Grid.setBroken(currX + d3x, currY + d3y);
    //         markDirty(currX + d3x, currY + d3y);
    //         visited[N * (currX + d2x) + (currY + d2y)] = currVisitNo;
    //         visitIdx.push(N * (currX + d3x) + (currY + d3y));
    //       }
    //     }
    //   }

    //   currDirIdx = nextDirIdx;
    // }

    crackLineDirIndices.length = 0;
  }


  function DFSCrack(currX, currY, originX, originY, dist) {
    if (dist > maxDistance) return;
    visited[currX * N + currY] = dist;
    giveDamage(currX, currY, 100);

    // Reference vector: guideline for crack direction
    const refX = currX - originX, refY = currY - originY;    

    let nextDirIdx = 0, minHp = 100;
    for (let i = 0; i < 8; ++i) {
      const dx = NEIGHBOR_DIRECTION[i][0], dy = NEIGHBOR_DIRECTION[i][1]
      const nextX = currX + dx, nextY = currY + dy;
      if (nextX < 0 || nextX >= N || nextY < 0 || nextY >= N || visited[nextX * N + nextY]) continue;

      const dot = refX * dx + refY * dy;
      if (dot <= 0) continue;

      const nextHp = Grid.getHp(nextX, nextY);
      if (nextHp < minHp) {
        minHp = nextHp;
        nextDirIdx = i;
      }
    }

    let d1x = NEIGHBOR_DIRECTION[nextDirIdx][0], d1y = NEIGHBOR_DIRECTION[nextDirIdx][1];    
    const nextDirIdx2 = (nextDirIdx + 7) & 7, nextDirIdx3 = (nextDirIdx + 9) & 7;
    const d2x = NEIGHBOR_DIRECTION[nextDirIdx2][0], d2y = NEIGHBOR_DIRECTION[nextDirIdx2][1];
    const d3x = NEIGHBOR_DIRECTION[nextDirIdx3][0], d3y = NEIGHBOR_DIRECTION[nextDirIdx3][1];
    const cosSq1 = vecCosSquare(refX, refY, d1x, d1y), 
          cosSq2 = vecCosSquare(refX, refY, d2x, d2y), 
          cosSq3 = vecCosSquare(refX, refY, d3x, d3y);

    const r1 = cosSq1 * minHp, r2 = cosSq2 * Grid.getHp(currX + d2x, currY + d2y), r3 = cosSq3 * Grid.getHp(currX + d3x, currY + d3y);
    const total = r1 + r2 + r3;
    const p1 = r1 / total, p2 = (r1 + r2) / total;

    const rand = Math.random();
    if (rand < p1) {
      DFSCrack(currX + d1x, currY + d1y, originX, originY, dist + 1);
      crackLineDirIndices.push(nextDirIdx);
    }
    else if (rand < p2) {
      DFSCrack(currX + d2x, currY + d2y, originX, originY, dist + 1);
      crackLineDirIndices.push(nextDirIdx2);
    }
    else {
      DFSCrack(currX + d3x, currY + d3y, originX, originY, dist + 1);
      crackLineDirIndices.push(nextDirIdx3);
    }
  }

  function propagateDamage(originX, originY) {
    const F_0 = CFG.DAMAGE_INIT;
    giveDamage(originX, originY, F_0);
    visited[N * originX + originY] = 1;
    visitIdx.push(N * originX + originY);
    Audio.break_();
    // 직접 파괴 영역 중 내부
    for (const [dx, dy] of DIRECT_CRACK_COORD_INSIDE) {
      const gx = originX + dx, gy = originY + dy;
      if (gx < 0 || gx >= N || gy < 0 || gy >= N || !Grid.isInCookie(gx, gy)) continue;
      giveDamage(gx, gy, F_0);

      const idx = N * gx + gy;
      visited[idx] = 1;
      visitIdx.push(idx);
    }

    const queue = new Queue();
    // 직접 파괴 영역의 윤곽: BFS의 출발점들
    for (const [dx, dy] of DIRECT_CRACK_COORD_LINE) {
      const gx = originX + dx, gy = originY + dy;
      if (gx < 0 || gx >= N || gy < 0 || gy >= N || !Grid.isInCookie(gx, gy)) continue;

      const idx = N * gx + gy;
      visited[idx] = 1;
      visitIdx.push(idx);
      queue.push((idx << 8) + F_0);
    }

    while (queue.size) {
      let currKey = queue.pop();
      const currF = currKey & 127;
      currKey >>= 8;
      if (visited[currKey] > CFG.MAX_PROPAGATION_DEPTH) continue;
      let currX = Math.floor(currKey / N) >> 0, currY = currKey % N;
      const currHp = Grid.getHp(currX, currY);
      giveDamage(currX, currY, currF);


      if (Grid.isBroken(currX, currY)) {
        if (currHp >= 40) {
          continue;
          // let i = 0, ddx = 0, ddy = 0;
          // for (const [dx, dy] of NEIGHBOR_DIRECTION) {
          //   const nextX = currX + dx, nextY = currY + dy;
          //   if (nextX < 0 || nextX >= N || nextY < 0 || nextY >= N || visited[nextX * N + nextY]) {
          //     i++;
          //     visited[nextX * N + nextY] = visited[currKey] + 1;
          //     continue;
          //   }

          //   const v1x = nextX - originX, v1y = nextY - originY;
          //   const dot = v1x * dx + v1y * dy;
          //   const cos = dot / Math.sqrt(((v1x * v1x + v1y * v1y) * (dx * dx + dy * dy)));
          //   if (cos * 0.5 >= Math.random()) {
          //     ddx = dx, ddy = dy;
          //   }
          //   visited[nextX * N + nextY] = visited[currKey] + 1;
          //   i++;

          // }

          // if (Math.random() < 0.7) {
          //   let nextX = currX + ddx, nextY = currY + ddy;
          //   giveDamage(nextX, nextY, currF * 2);
          //   visited[nextX * N + nextY] = visited[currX * N + currY] + 1;
          //   nextX += ddx, nextY += ddy;
          //   giveDamage(nextX, nextY, currF * 2);
          //   visited[nextX * N + nextY] = visited[currX * N + currY] + 1;
          //   ddx *= 3;
          //   ddy *= 3;
          // }
          // const nextF = Math.floor(currF * 0.96) >> 0;
          // const nextIdx = N * (currX + ddx) + (currY + ddy);
          // visited[nextIdx] = visited[currKey] + 1;
          // visitIdx.push(nextIdx);
          // queue.push((nextIdx << 8) + nextF);
        }
        else {
          for (const [dx, dy] of NEIGHBOR_DIRECTION) {
            const nextX = currX + dx, nextY = currY + dy;
            if (nextX < 0 || nextX >= N || nextY < 0 || nextY >= N || visited[nextX * N + nextY]) continue;

            let k = 1;
            if (Grid.getHp(nextX, nextY) >= 50) {
              k = CFG.DECAY_TOUGH;
            } else if (Grid.getHp(nextX, nextY) >= 35) {
              k = CFG.DECAY_MIDDLE;
            } else {
              k = CFG.DECAY_WEAK;
            }

            const nextF = (Math.floor(currF * k) >> 0);
            const nextIdx = N * nextX + nextY;
            visited[nextIdx] = visited[currKey] + 1;
            visitIdx.push(nextIdx);
            queue.push((nextIdx << 8) + nextF);
          }
        }

      } else {
        const cellType = Grid.getType(currX, currY);
        if (cellType === Grid.TYPE_OUTLINE) {
          for (const [dx, dy] of NEIGHBOR_DIRECTION) {
            const nextX = currX + dx, nextY = currY + dy;
            if (nextX < 0 || nextX >= N || nextY < 0 || nextY >= N || visited[nextX * N + nextY] || Grid.getType(nextX, nextY) !== Grid.TYPE_OUTLINE) continue;

            const nextF = (Math.floor(currF * 0.97) >> 0);
            const nextIdx = N * nextX + nextY;
            visited[nextIdx] = visited[currKey] + 1;
            visitIdx.push(nextIdx);
            queue.push((nextIdx << 8) + nextF);
          }
        } else {
          for (const [dx, dy] of NEIGHBOR_DIRECTION) {
            const nextX = currX + dx, nextY = currY + dy;
            if (nextX < 0 || nextX >= N || nextY < 0 || nextY >= N || visited[nextX * N + nextY]) continue;

            const nextIdx = N * nextX + nextY;
            visited[nextIdx] = visited[currKey] + 1;
            visitIdx.push(nextIdx);
            giveDamage(nextX, nextY, Math.floor(currF * 0.7));
          }
        }
      }
    }

    // 초기화
    for (const idx of visitIdx) {
      visited[idx] = 0;
    }
    visitIdx.length = 0;
  }
  // ──────────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────────


  // ── 내부 클릭 시 달고나를 두 조각으로 갈라냄 (미드포인트 변위) ──
  function applyInsideCrack(gx, gy) {
    const N = CFG.GRID;
    const radius = CFG.COOKIE_RADIUS;
    const arr = Grid.arrays();

    /* PCA 방식 — 주석처리
    let bxSum = 0, bySum = 0, bCount = 0;
    ... (PCA 로직) ...
    */

    // ── 가장 가까운 파괴된 윤곽선 점 기반 균열 방향 결정 ──
    // 1. 파괴된 윤곽선 셀 수집
    const brokenPts = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = Grid.idx(x, y);
        if (arr.broken[i] && arr.type[i] === Grid.TYPE_OUTLINE) {
          brokenPts.push([x, y]);
        }
      }
    }

    let startX, startY, endX, endY, normX, normY;

    const MAX_CONNECT_DIST = 0;
    if (brokenPts.length >= 3) {
      // 2. 클릭 위치에서 가장 가까운 파괴 셀까지 거리 d_min 계산
      let minDist = Infinity;
      for (const [x, y] of brokenPts) {
        const d = Math.hypot(x - gx, y - gy);
        if (d < minDist) minDist = d;
      }

      // 너무 멀면 전체 윤곽선 기준으로 폴스루 (균열은 항상 생성)
      if (minDist > MAX_CONNECT_DIST) {
        brokenPts.length = 0; // else 분기로 넘어가도록
      }
    }

    if (brokenPts.length >= 3) {
      // 3. d_min ±20% 범위 내 후보 필터링 후 랜덤 선택
      const lo = minDist * 0.8, hi = minDist * 1.2;
      const candidates = brokenPts.filter(([x, y]) => {
        const d = Math.hypot(x - gx, y - gy);
        return d >= lo && d <= hi;
      });
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      // 4. 선택된 점이 한쪽 끝, 반대 방향으로 같은 거리만큼 반대 끝
      startX = chosen[0];
      startY = chosen[1];
      const dx = gx - chosen[0], dy = gy - chosen[1];
      const dist = Math.hypot(dx, dy) || 1;
      const ndx = dx / dist, ndy = dy / dist;
      endX = gx + ndx * dist;
      endY = gy + ndy * dist;

      // 균열 수직 방향 (변위용)
      normX = -ndy;
      normY =  ndx;
    } else {
      // 파괴된 윤곽선 없으면 → 전체 윤곽선 셀 대상으로 동일 로직
      const outlinePts = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = Grid.idx(x, y);
          if (arr.type[i] === Grid.TYPE_OUTLINE) {
            outlinePts.push([x, y]);
          }
        }
      }

      let minDist = Infinity;
      for (const [x, y] of outlinePts) {
        const d = Math.hypot(x - gx, y - gy);
        if (d < minDist) minDist = d;
      }

      const lo = minDist * 0.8, hi = minDist * 1.2;
      const candidates = outlinePts.filter(([x, y]) => {
        const d = Math.hypot(x - gx, y - gy);
        return d >= lo && d <= hi;
      });
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      startX = chosen[0];
      startY = chosen[1];
      const dx = gx - chosen[0], dy = gy - chosen[1];
      const dist = Math.hypot(dx, dy) || 1;
      const ndx = dx / dist, ndy = dy / dist;
      endX = gx + ndx * dist;
      endY = gy + ndy * dist;

      normX = -ndy;
      normY =  ndx;
    }

    // 최소 균열 길이 보장 — 짧으면 반대쪽(endX/endY)을 더 늘림
    const MIN_CRACK_LEN = 20;
    const crackDx = endX - startX, crackDy = endY - startY;
    const crackLen = Math.hypot(crackDx, crackDy);
    if (crackLen < MIN_CRACK_LEN) {
      const extra = MIN_CRACK_LEN - crackLen;
      const crackNdx = crackDx / (crackLen || 1);
      const crackNdy = crackDy / (crackLen || 1);
      endX += crackNdx * extra;
      endY += crackNdy * extra;
    }

    // 미드포인트 변위로 자연스러운 균열 경로 생성
    // 클릭 위치(gx,gy)를 중간 앵커로 고정해서 반드시 지나가게 함
    function subdivide(pts, depth, rough) {
      if (depth === 0 || rough < 0.5) return pts;
      const result = [];
      for (let i = 0; i < pts.length - 1; i++) {
        result.push(pts[i]);
        const disp = (Math.random() - 0.5) * rough;
        const mx = (pts[i][0] + pts[i+1][0]) / 2 + normX * disp;
        const my = (pts[i][1] + pts[i+1][1]) / 2 + normY * disp;
        result.push([mx, my]);
      }
      result.push(pts[pts.length - 1]);
      return subdivide(result, depth - 1, rough * 0.58);
    }

    const roughness = radius * 0.10;
    // [파괴된 끝점, 클릭점, 반대 끝점] — 클릭점이 반드시 경로 위에 포함됨
    const crackPath = subdivide([[startX, startY], [gx, gy], [endX, endY]], 6, roughness);

    // 경로를 따라 픽셀 파괴
    const halfWidth = 2;
    const outlineBreakRadius = 4; // 윤곽선 셀은 더 넓은 반경으로 확실히 파괴
    for (let i = 0; i < crackPath.length - 1; i++) {
      const x0 = crackPath[i][0],   y0 = crackPath[i][1];
      const x1 = crackPath[i+1][0], y1 = crackPath[i+1][1];

      const segLen = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      const segDirX = (x1 - x0) / segLen;
      const segDirY = (y1 - y0) / segLen;
      const segNX = -segDirY;
      const segNY =  segDirX;

      for (let s = 0; s <= Math.ceil(segLen); s++) {
        const px = x0 + segDirX * s;
        const py = y0 + segDirY * s;

        // 일반 파괴 (폭 halfWidth)
        for (let w = -halfWidth; w <= halfWidth; w++) {
          const wx = Math.round(px + segNX * w);
          const wy = Math.round(py + segNY * w);
          if (wx < 0 || wx >= N || wy < 0 || wy >= N) continue;
          if (!Grid.isInCookie(wx, wy)) continue;
          giveDamage(wx, wy, 100);
          if (Grid.isBroken(wx, wy)) lickableCells.add(wy * N + wx);
          markDirty(wx, wy);
        }

        // 윤곽선 셀은 더 넓은 반경으로 확실히 파괴
        const bpx = Math.round(px), bpy = Math.round(py);
        for (let dy = -outlineBreakRadius; dy <= outlineBreakRadius; dy++) {
          for (let dx = -outlineBreakRadius; dx <= outlineBreakRadius; dx++) {
            const wx = bpx + dx, wy = bpy + dy;
            if (wx < 0 || wx >= N || wy < 0 || wy >= N) continue;
            if (!Grid.isInCookie(wx, wy)) continue;
            if (Grid.getType(wx, wy) !== Grid.TYPE_OUTLINE) continue;
            giveDamage(wx, wy, 100);
            if (Grid.isBroken(wx, wy)) lickableCells.add(wy * N + wx);
            markDirty(wx, wy);
          }
        }
      }
    }

    setTimeout(() => { crackling = false; Game.offerLick(); }, 1200);
  }

  // ── 클릭 처리 ──
  function applyClick(gx, gy) {
    const N = CFG.GRID;
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return;
    if (!Grid.isInCookie(gx, gy) || Grid.isBroken(gx, gy)) return;

    Audio.click();

    // 내부 셀 클릭 시: 반경 5 안에 온전한 윤곽선이 있으면 그쪽으로 처리
    if (crackling) return;
    if (Grid.getType(gx, gy) === Grid.TYPE_INSIDE) {
      const arr = Grid.arrays();
      let nearOx = -1, nearOy = -1, nearDist = Infinity;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
          const ni = ny * N + nx;
          if (!arr.inCookie[ni] || arr.type[ni] !== Grid.TYPE_OUTLINE || arr.broken[ni]) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearDist) { nearDist = d; nearOx = nx; nearOy = ny; }
        }
      }
      if (nearOx >= 0) {
        propagateDamage(nearOx, nearOy);
        return;
      }
      crackling = true;
      applyInsideCrack(gx, gy);
      return;
    }

    propagateDamage(gx, gy);

    /*
    // 1) 클릭한 셀에 데미지
    Grid.setHp(gx, gy, Grid.getHp(gx, gy) - 1);
    Grid.addCrack(gx, gy);
    markDirty(gx, gy);

    if (Grid.getHp(gx, gy) <= 0) {
      breakCell(gx, gy);
      // 2) 파괴 시 BFS 전파
      propagate(gx, gy, CFG.CRACK_BASE_INTENSITY);
    } else {
      // 파괴 안 됐어도 약한 전파
      propagate(gx, gy, CFG.CRACK_MINOR_INTENSITY);
      Particles.spawn(
        gx * CFG.CELL + CFG.CELL / 2,
        gy * CFG.CELL + CFG.CELL / 2,
        3, '#B87D20'
      );
    }

    // 3) 충격파: 반경 내 셀에 직접 데미지
    impactRadius(gx, gy);
    */
  }

  function reset() { crackling = false; }

  return { applyClick, getDirty, clearDirty, clearLickable, healAt, reset };
})();
