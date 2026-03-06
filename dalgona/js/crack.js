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

  let dirtyCells = new Set();

  function getDirty()  { return dirtyCells; }
  function clearDirty() { dirtyCells = new Set(); }
  function markDirty(x, y) { dirtyCells.add(y * CFG.GRID + x); }

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

    const intensity = t === Grid.TYPE_OUTLINE ? 0.8 : 1.8;
    Renderer.shake(intensity);
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
    if (damage < curHp) {
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

      Particles.spawn(
        x * CFG.CELL + CFG.CELL / 2,
        y * CFG.CELL + CFG.CELL / 2,
        3, '#D4952B'
      );

      const intensity = Grid.TYPE_OUTLINE === t ? 0.8 : 1.1;
      Renderer.shake(intensity);
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
          if (Math.random() < 0.15) propagateCrack(currX, currY, originX, originY);
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

            visited[nextX * N + nextY] = visited[currKey] + 1;
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


  // ── 클릭 처리 ──
  function applyClick(gx, gy) {
    const N = CFG.GRID;
    if (gx < 0 || gx >= N || gy < 0 || gy >= N) return;
    if (!Grid.isInCookie(gx, gy) || Grid.isBroken(gx, gy)) return;

    Audio.click();

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

  return { applyClick, getDirty, clearDirty };
})();
