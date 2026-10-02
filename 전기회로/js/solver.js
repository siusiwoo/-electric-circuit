// 회로 계산기 : 수정 노드 해석법(Modified Nodal Analysis)
//
// 회로를 "노드(접점)"와 "소자"로 보고, 각 노드의 전압을 미지수로 하는
// 연립방정식을 세워서 푼다. 저항은 옴의 법칙(I = V/R), 전압원은
// "두 노드의 전압 차이가 V다"라는 식을 한 줄 추가하는 방식으로 다룬다.

/**
 * 부분 피벗 가우스 소거법으로 A x = b 를 푼다.
 * @returns {number[]|null} 해. 풀 수 없으면 null
 */
export function solveLinearSystem(A, b) {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-15) return null; // 특이 행렬
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const d = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * 소자 목록으로 모든 노드의 전압을 구한다.
 *
 * 소자 형식
 *   { kind:'R', a, b, R }        a-b 사이의 저항
 *   { kind:'V', a, b, V }        V(a) - V(b) = V 인 전압원
 *
 * 떨어져 있는(서로 연결되지 않은) 회로 덩어리가 여러 개여도 되도록
 * 덩어리마다 기준점(0V)을 따로 잡는다.
 *
 * @returns {{voltage: Map<any, number>, ok: boolean}}
 */
export function analyzeNodes(elements) {
  const voltage = new Map();
  if (elements.length === 0) return { voltage, ok: true };

  const nodes = [];
  const seen = new Set();
  for (const e of elements) {
    for (const t of [e.a, e.b]) {
      if (!seen.has(t)) {
        seen.add(t);
        nodes.push(t);
      }
    }
  }

  // 연결된 덩어리 찾기 (union-find)
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (n) => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(n) !== root) {
      const next = parent.get(n);
      parent.set(n, root);
      n = next;
    }
    return root;
  };
  for (const e of elements) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // 덩어리마다 첫 노드를 0V 기준점으로 삼는다
  const groundOf = new Map();
  for (const n of nodes) {
    const root = find(n);
    if (!groundOf.has(root)) groundOf.set(root, n);
  }
  const grounds = new Set(groundOf.values());

  const unknown = new Map();
  let nv = 0;
  for (const n of nodes) if (!grounds.has(n)) unknown.set(n, nv++);

  const sources = elements.filter((e) => e.kind === 'V');
  const size = nv + sources.length;
  if (size === 0) {
    for (const n of nodes) voltage.set(n, 0);
    return { voltage, ok: true };
  }

  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);
  const row = (n) => (unknown.has(n) ? unknown.get(n) : -1);
  const add = (r, c, v) => {
    if (r >= 0 && c >= 0) A[r][c] += v;
  };

  for (const e of elements) {
    if (e.kind !== 'R') continue;
    const g = 1 / Math.max(e.R, 1e-9);
    const i = row(e.a);
    const j = row(e.b);
    add(i, i, g);
    add(j, j, g);
    add(i, j, -g);
    add(j, i, -g);
  }

  sources.forEach((e, k) => {
    const r = nv + k;
    const i = row(e.a);
    const j = row(e.b);
    if (i >= 0) {
      A[i][r] += 1;
      A[r][i] += 1;
    }
    if (j >= 0) {
      A[j][r] -= 1;
      A[r][j] -= 1;
    }
    b[r] = e.V;
  });

  const x = solveLinearSystem(A, b);
  if (!x) {
    for (const n of nodes) voltage.set(n, 0);
    return { voltage, ok: false };
  }
  for (const n of nodes) voltage.set(n, grounds.has(n) ? 0 : x[unknown.get(n)]);
  return { voltage, ok: true };
}
