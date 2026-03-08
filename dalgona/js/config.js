// ============================================================
// config.js — 게임 설정 상수
// ============================================================

const CFG = {
  GRID: 600,
  CELL: 1,
  get CANVAS_SIZE() { return this.GRID * this.CELL; },
  get CENTER() { return this.GRID / 2; },

  COOKIE_RADIUS_RATIO: 0.45,
  get COOKIE_RADIUS() { return Math.floor(this.GRID * this.COOKIE_RADIUS_RATIO); },

  OUTLINE_THICKNESS: 4,
  TIME_LIMIT: 75,


  // HP
  HP_OUTLINE: 1,
  HP_INNER: 4,
  HP_OUTER: 3,
  HP_OUTER_WEAK_CHANCE: 0.35,

  // ── 균열 전파 ──────────────────────────────

  // 클릭으로 셀이 파괴되었을 때의 전파 강도
  CRACK_BASE_INTENSITY: 0.90,
  // 클릭했지만 셀이 아직 안 부서졌을 때의 전파 강도
  CRACK_MINOR_INTENSITY: 0.8,

  // 전파 대상 셀의 "투과율" (높을수록 균열이 잘 전달됨)
  CRACK_OUTLINE_TRANSMIT: 0.92,     // 윤곽선 → 매우 잘 전파
  CRACK_OUTSIDE_TRANSMIT: 0.8,     // 외부 → 중간
  CRACK_INSIDE_TRANSMIT: 0.8,      // 내부 → 잘 안 전파 (보호)

  // 세대별 감쇠율 (전파원 셀이 윤곽선이냐에 따라 다름)
  CRACK_DECAY_OUTLINE: 0.9,        // 윤곽선→윤곽선 연쇄: 천천히 감쇠
  CRACK_DECAY_NORMAL: 0.9,         // 비윤곽선 경유: 빠르게 감쇠

  CRACK_DIAG_FACTOR: 0.8,          // 대각선 방향 감쇠
  CRACK_MAX_DEPTH: 30,              // 최대 전파 깊이
  CRACK_CONTINUE_CHANCE: 0.80,      // 안 부서진 셀에서 균열 계속 전파할 확률

  // 클릭 시 충격파 반경 (셀 단위)
  CLICK_IMPACT_RADIUS: 5,           // 반경 내 셀에 직접 데미지
  CLICK_IMPACT_OUTLINE_PROB: 0.85,  // 충격파 범위 내 윤곽선 셀 적중 확률
  CLICK_IMPACT_OTHER_PROB: 0.80,    // 충격파 범위 내 비윤곽선 셀 적중 확률

  // 승리/패배 조건
  WIN_OUTLINE_RATIO: 0.98,
  LOSE_INSIDE_RATIO: 0.18,

  // ──────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────New parameter─────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────────
  
  CROSS_DIR: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  DIAG_DIR: [[1, 1], [-1, 1], [-1, -1], [1, -1]],

  PIN_THICKNESS: 4,
  OUTLINE_HP_INIT: 25,
  NORMAL_HP_INIT:  80,
  HP_BUBBLE_CHANCE: 0.4,
  HP_BUBBLE_LOWER_BOUND: 20,

  MAX_PROPAGATION_DEPTH: 35,
  DAMAGE_INIT: 65,
  DECAY_BROKEN: 0.95,
  DECAY_TOUGH: 0.8,
  DECAY_MIDDLE: 0.9,
  DECAY_WEAK: 0.9,
  BONUS_BROKEN: 1.01,
};
