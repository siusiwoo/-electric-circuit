// 회로 계산기와 각 레벨이 실제로 풀리는지 확인하는 자체 점검
// 실행: node tools/selftest.mjs

import { Board } from '../js/circuit.js';
import { LEVELS } from '../js/levels.js';

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}${extra ? '  ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? '  ' + extra : ''}`);
  }
}

function near(a, b, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

/** 레벨 번호로 보드를 만들고 부품 목록을 놓는다 */
function setup(levelId, placements) {
  const lv = LEVELS.find((l) => l.id === levelId);
  const board = new Board(lv.cols, lv.rows);
  for (const f of lv.fixed) {
    board.place(f.key, f.type, { value: f.value, flip: f.flip, locked: true, closed: true });
  }
  for (const [key, type, opts] of placements) board.place(key, type, opts ?? {});
  return { lv, board };
}

/** game.js 의 판정 문맥을 그대로 흉내낸다 */
function context(board, res) {
  const switchKeys = [...board.parts].filter(([, p]) => p.type === 'switch').map(([k]) => k);
  const listFrom = (m) => (type) =>
    [...board.parts]
      .filter(([, p]) => p.type === type)
      .map(([k, p]) => ({ key: k, part: p, m: m.get(k) ?? {} }));
  const probe = (bools) => {
    const states = new Map(switchKeys.map((k, i) => [k, !!bools[i]]));
    const r = board.simulate({ switches: states });
    return { m: r.m, of: listFrom(r.m) };
  };
  return {
    board,
    result: res,
    byType: listFrom(res.m),
    count: (t) => board.countType(t),
    switchKeys,
    probe,
    probeAll: (v) => probe(switchKeys.map(() => v)),
  };
}

function runLevel(levelId, placements, { closeSwitches = true } = {}) {
  const { lv, board } = setup(levelId, placements);
  if (closeSwitches) for (const p of board.parts.values()) if (p.type === 'switch') p.closed = true;
  const res = board.simulate();
  const c = context(board, res);
  const status = lv.objectives.map((o) => {
    try {
      return !!o.test(c);
    } catch (e) {
      return `오류: ${e.message}`;
    }
  });
  return { lv, board, res, status };
}

/* ------------------------------------------------- 1. 기본 물리 확인 */

console.log('\n[기본 계산]');
{
  // 3V, 전구 12Ω, 내부저항 0.4Ω  →  I = 3 / 12.4 = 0.242A
  const { board } = setup(1, [
    ['h:3:3', 'bulb'],
    ['v:3:4', 'wire'],
    ['v:3:3', 'wire'],
  ]);
  const res = board.simulate();
  const bulb = res.m.get('h:3:3');
  const battery = res.m.get('h:4:3');
  check('옴의 법칙: I = V/(R+r)', near(Math.abs(bulb.I), 3 / 12.4, 0.003), `I=${bulb.I.toFixed(4)}A`);
  check('전구 전력 P = I²R', near(bulb.P, (3 / 12.4) ** 2 * 12, 0.01), `P=${bulb.P.toFixed(3)}W`);
  check('건전지 전류 = 전구 전류', near(Math.abs(battery.I), Math.abs(bulb.I), 1e-6));
  check('단자 전압 < 기전력 (내부저항)', battery.V < 3 && battery.V > 2.8, `V=${battery.V.toFixed(3)}V`);
}
{
  // 끊긴 회로 → 전류 0
  const { board } = setup(1, [
    ['h:3:3', 'bulb'],
    ['v:3:4', 'wire'],
  ]);
  const res = board.simulate();
  check('고리가 끊기면 전류 0', near(res.m.get('h:3:3').I, 0, 1e-6));
}
{
  // 합선: 건전지를 전선으로 바로 이으면 큰 전류
  const { board } = setup(1, [
    ['v:3:4', 'wire'],
    ['h:3:3', 'wire'],
    ['v:3:3', 'wire'],
  ]);
  const res = board.simulate();
  const I = Math.abs(res.m.get('h:4:3').I);
  check('합선 감지', res.m.get('h:4:3').overload && I > 5, `I=${I.toFixed(2)}A`);
}
{
  // 직렬 저항 두 개 → 전압 분배
  const { board } = setup(4, [
    ['v:3:3', 'resistor', { value: 100 }],
    ['h:3:3', 'resistor', { value: 100 }],
    ['v:3:4', 'wire'],
  ]);
  const res = board.simulate();
  const a = res.m.get('v:3:3');
  const b = res.m.get('h:3:3');
  check('직렬 분배: 같은 저항 → 전압 절반씩', near(Math.abs(a.V), Math.abs(b.V), 1e-6));
  check('직렬 분배: 합이 거의 9V', near(Math.abs(a.V) + Math.abs(b.V), 9, 0.03));
}

/* ------------------------------------------------- 2. 레벨별 정답 확인 */

const SOLUTIONS = {
  1: {
    desc: '전구 + 전선 2개로 고리 완성',
    place: [
      ['h:3:3', 'bulb'],
      ['v:3:4', 'wire'],
      ['v:3:3', 'wire'],
    ],
  },
  2: {
    desc: '고리 안에 스위치 넣기',
    place: [
      ['v:3:4', 'wire'],
      ['v:2:4', 'wire'],
      ['h:2:3', 'bulb'],
      ['v:2:3', 'switch'],
      ['v:3:3', 'wire'],
    ],
  },
  3: {
    desc: '1.5V 두 개를 극성 맞춰 직렬',
    place: [
      ['h:4:3', 'battery', { value: 1.5, flip: true }],
      ['v:3:4', 'battery', { value: 1.5, flip: false }],
      ['h:3:3', 'bulb'],
      ['v:3:3', 'wire'],
    ],
  },
  4: {
    desc: '9V + 22Ω 직렬로 전구 보호',
    place: [
      ['v:3:3', 'resistor', { value: 22 }],
      ['h:3:3', 'bulb'],
      ['v:3:4', 'wire'],
    ],
  },
  5: {
    desc: '전구 2개 병렬',
    place: [
      ['v:3:3', 'wire'],
      ['h:3:3', 'bulb'],
      ['v:3:4', 'wire'],
      ['v:2:3', 'wire'],
      ['h:2:3', 'bulb'],
      ['v:2:4', 'wire'],
    ],
  },
  6: {
    desc: 'LED 정방향 + 47Ω',
    place: [
      ['v:3:3', 'wire'],
      ['h:3:3', 'led', { flip: false }],
      ['v:3:4', 'resistor', { value: 47 }],
    ],
  },
  7: {
    desc: '스위치 2개 직렬(AND)',
    place: [
      ['v:3:3', 'switch'],
      ['h:3:3', 'motor'],
      ['v:3:4', 'switch'],
    ],
  },
};

console.log('\n[레벨 정답으로 목표가 모두 달성되는지]');
for (const [id, sol] of Object.entries(SOLUTIONS)) {
  const { lv, res, board, status } = runLevel(+id, sol.place);
  const allOk = status.every((s) => s === true);
  check(`STAGE ${id} ${lv.name} — ${sol.desc}`, allOk, allOk ? '' : JSON.stringify(status));
  if (!allOk) {
    for (const [k, p] of board.parts) {
      const m = res.m.get(k);
      console.log(
        `       ${k.padEnd(8)} ${p.type.padEnd(9)} I=${m.I.toFixed(4)}A V=${m.V.toFixed(3)}V ` +
          `P=${m.P.toFixed(3)}W bright=${(m.brightness ?? 0).toFixed(2)} spin=${m.spin ?? 0}`
      );
    }
  }
  const used = [...board.parts.values()].filter((p) => !p.locked).length;
  check(`   └ 최소 부품(별 3개) 안에 들어감`, used <= lv.par, `사용 ${used} / 기준 ${lv.par}`);
}

/* ------------------------------------------------- 3. 오답은 막히는지 */

console.log('\n[틀린 답은 통과되지 않아야 함]');
{
  // 레벨 2: 스위치를 고리 바깥(가지)에 달면 안 됨
  const { status } = runLevel(2, [
    ['h:3:3', 'bulb'],
    ['v:3:4', 'wire'],
    ['v:3:3', 'wire'],
    ['h:2:3', 'switch'], // 아무 데도 이어지지 않은 가지
  ]);
  check('스위치를 고리 밖에 달면 실패', status.some((s) => s !== true), JSON.stringify(status));
}
{
  // 레벨 3: 건전지를 반대로 끼우면 전압이 상쇄된다
  const { res, status } = runLevel(3, [
    ['h:4:3', 'battery', { value: 1.5, flip: true }],
    ['v:3:4', 'battery', { value: 1.5, flip: true }],
    ['h:3:3', 'bulb'],
    ['v:3:3', 'wire'],
  ]);
  const b = res.m.get('h:3:3');
  check('건전지 역방향 → 전구 안 켜짐', b.brightness < 0.02 && status.some((s) => s !== true), `밝기 ${(b.brightness * 100).toFixed(1)}%`);
}
{
  // 레벨 4: 저항 없이 9V → 과열
  const { res, status } = runLevel(4, [
    ['v:3:3', 'wire'],
    ['h:3:3', 'bulb'],
    ['v:3:4', 'wire'],
  ]);
  const b = res.m.get('h:3:3');
  check('9V 직결 → 전구 과열 판정', b.overload === true, `P=${b.P.toFixed(2)}W`);
  check('9V 직결 → 목표 미달', status.some((s) => s !== true));
}
{
  // 레벨 4: 100Ω 은 너무 어둡다
  const { res, status } = runLevel(4, [
    ['v:3:3', 'resistor', { value: 100 }],
    ['h:3:3', 'bulb'],
    ['v:3:4', 'wire'],
  ]);
  check(
    '100Ω → 너무 어두워 실패',
    status.some((s) => s !== true),
    `밝기 ${(res.m.get('h:3:3').brightness * 100).toFixed(0)}%`
  );
}
{
  // 레벨 5: 직렬로 두 전구를 달면 둘 다 어둡다
  const { res, status } = runLevel(5, [
    ['v:3:3', 'wire'],
    ['h:3:3', 'bulb'],
    ['v:3:4', 'bulb'],
  ]);
  const b1 = res.m.get('h:3:3');
  check(
    '전구 직렬 → 어두워서 실패',
    status.some((s) => s !== true) && b1.brightness < 0.4,
    `밝기 ${(b1.brightness * 100).toFixed(0)}%`
  );
}
{
  // 레벨 6: LED 방향이 반대면 전류가 흐르지 않는다
  const { res, status } = runLevel(6, [
    ['v:3:3', 'wire'],
    ['h:3:3', 'led', { flip: true }],
    ['v:3:4', 'resistor', { value: 47 }],
  ]);
  const led = res.m.get('h:3:3');
  check('LED 역방향 → 전류 0', near(led.I, 0, 1e-5) && status.some((s) => s !== true));
  check('LED 역방향 안내 문구', led.note.includes('방향'), led.note);
}
{
  // 레벨 6: 저항 없이 LED → 전류 과다
  const { res } = runLevel(6, [
    ['v:3:3', 'wire'],
    ['h:3:3', 'led', { flip: false }],
    ['v:3:4', 'wire'],
  ]);
  const led = res.m.get('h:3:3');
  check('LED 직결 → 전류 과다 판정', led.overload === true, `I=${(led.I * 1000).toFixed(1)}mA`);
}
{
  // 레벨 7: 스위치를 병렬(OR)로 달면 AND 조건 실패
  const { status } = runLevel(7, [
    ['v:3:3', 'switch'],
    ['h:3:3', 'motor'],
    ['v:3:4', 'wire'],
    ['h:4:4', 'wire'],
    ['v:3:5', 'switch'],
    ['h:3:4', 'wire'],
  ]);
  check('스위치 병렬(OR) → AND 목표 실패', status.some((s) => s !== true), JSON.stringify(status));
}

/* ------------------------------------------------- 4. 레벨 정의 자체 점검 */

console.log('\n[레벨 정의]');
for (const lv of LEVELS) {
  const board = new Board(lv.cols, lv.rows);
  const edges = new Set(board.allEdges());
  const badFixed = lv.fixed.filter((f) => !edges.has(f.key));
  check(`STAGE ${lv.id} 고정 부품 위치가 보드 안에 있음`, badFixed.length === 0, badFixed.map((f) => f.key).join(','));
  const ids = lv.inventory.map((i) => `${i.type}@${i.value ?? 'd'}`);
  check(`STAGE ${lv.id} 부품 상자에 중복 없음`, new Set(ids).size === ids.length);
  check(`STAGE ${lv.id} 부품 종류 9개 이하(단축키 1~9)`, lv.inventory.length <= 9, `${lv.inventory.length}종`);
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
