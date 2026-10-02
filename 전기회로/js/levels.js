// 스테이지 정의
//
// objectives 의 test(c) 는 회로 계산 결과로 판정한다.
//   c.byType('bulb')      현재 상태의 부품 목록 [{key, part, m}]
//   c.probe([true,false]) 스위치를 강제로 바꿔 다시 계산 (순서는 c.switchKeys)
//   c.probeAll(true)      모든 스위치를 닫고 다시 계산
//   c.count('wire')       놓인 개수

const GRID = { cols: 7, rows: 5 };
const BATTERY_SLOT = 'h:4:3';

export const LEVELS = [
  {
    id: 1,
    name: '불을 켜라',
    subtitle: '닫힌 고리를 만들기',
    goal: '전선으로 건전지와 전구를 이어서 전구를 켜세요.',
    hint: '전류는 건전지 +에서 나와 한 바퀴 돌아 -로 돌아와야 흐릅니다. 중간에 한 칸이라도 비어 있으면 불이 켜지지 않아요.',
    lesson: '전류는 끊긴 곳이 없는 "닫힌 회로"에서만 흐릅니다. 이것이 모든 전기회로의 출발점입니다.',
    ...GRID,
    par: 4,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 3 }],
    inventory: [
      { type: 'wire', count: 10 },
      { type: 'bulb', count: 1 },
    ],
    objectives: [
      {
        text: '전구가 70% 이상 밝게 켜진다',
        test: (c) => c.byType('bulb').some((b) => b.m.brightness >= 0.7),
      },
    ],
  },

  {
    id: 2,
    name: '스위치 달기',
    subtitle: '전류를 끊고 잇기',
    goal: '스위치를 회로에 넣어, 닫으면 켜지고 열면 꺼지게 만드세요.',
    hint: '스위치는 회로 고리 "안"에 들어가야 합니다. 옆으로 비껴 달면 열어도 전류가 그대로 흘러요. 부품을 클릭하면 스위치가 열리고 닫힙니다.',
    lesson: '스위치는 회로의 길을 끊는 부품입니다. 고리 바깥에 달면 아무 역할도 하지 못합니다.',
    ...GRID,
    par: 5,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 3 }],
    inventory: [
      { type: 'wire', count: 10 },
      { type: 'bulb', count: 1 },
      { type: 'switch', count: 1 },
    ],
    objectives: [
      {
        text: '스위치를 닫으면 전구가 켜진다',
        test: (c) => c.count('switch') >= 1 && c.probeAll(true).of('bulb').some((b) => b.m.brightness >= 0.7),
      },
      {
        text: '스위치를 열면 전구가 꺼진다',
        test: (c) =>
          c.count('switch') >= 1 &&
          c.probeAll(false).of('bulb').every((b) => b.m.brightness < 0.02),
      },
    ],
  },

  {
    id: 3,
    name: '건전지 직렬',
    subtitle: '전압을 더하기',
    goal: '1.5V 건전지 2개로 전구를 80% 이상 밝게 켜세요.',
    hint: '건전지를 한 줄로 이어 붙이면 전압이 더해집니다(1.5V + 1.5V = 3V). 단, +와 -가 서로 맞물려야 합니다. R키로 방향을 뒤집으세요.',
    lesson: '건전지를 직렬로 이으면 전압이 더해집니다. 방향을 반대로 끼우면 서로 상쇄되어 전압이 0에 가까워집니다.',
    ...GRID,
    par: 5,
    fixed: [],
    inventory: [
      { type: 'battery', value: 1.5, count: 2 },
      { type: 'wire', count: 10 },
      { type: 'bulb', count: 1 },
    ],
    objectives: [
      { text: '건전지 2개를 모두 사용한다', test: (c) => c.count('battery') === 2 },
      {
        text: '전구가 80% 이상 밝게 켜진다',
        test: (c) => c.byType('bulb').some((b) => b.m.brightness >= 0.8),
      },
    ],
  },

  {
    id: 4,
    name: '전구를 지켜라',
    subtitle: '저항으로 전류 줄이기',
    goal: '9V 건전지에 전구를 연결하되, 저항을 골라 전구가 타지 않게 하세요. (밝기 60~130%)',
    hint: '전구에 그냥 연결하면 전류가 너무 커서 필라멘트가 끊어집니다. 옴의 법칙 I = V / R : 저항을 직렬로 넣으면 전체 저항이 커져 전류가 줄어듭니다. 4개 중 알맞은 하나를 고르세요.',
    lesson: '전구가 받는 전력 P = I²R 입니다. 전압이 높으면 직렬 저항으로 전류를 줄여야 부품이 버틸 수 있습니다.',
    ...GRID,
    par: 5,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 9 }],
    inventory: [
      { type: 'wire', count: 10 },
      { type: 'bulb', count: 1 },
      { type: 'resistor', value: 10, count: 1 },
      { type: 'resistor', value: 22, count: 1 },
      { type: 'resistor', value: 47, count: 1 },
      { type: 'resistor', value: 100, count: 1 },
    ],
    objectives: [
      {
        text: '전구 밝기가 60% ~ 130% 사이',
        test: (c) => c.byType('bulb').some((b) => b.m.brightness >= 0.6 && b.m.brightness <= 1.3),
      },
      {
        text: '타버린 부품이 없다',
        test: (c) => ![...c.board.parts.values()].some((p) => p.burnt),
      },
    ],
  },

  {
    id: 5,
    name: '병렬 연결',
    subtitle: '전구 2개를 똑같이 밝게',
    goal: '건전지 하나로 전구 2개를 모두 80% 이상 밝게 켜세요.',
    hint: '전구 2개를 한 줄로(직렬) 이으면 전압을 나눠 갖기 때문에 둘 다 어두워집니다. 두 전구가 각각 건전지에 바로 연결되도록 길을 두 갈래로 나누세요(병렬).',
    lesson: '병렬로 연결하면 두 부품에 같은 전압이 걸립니다. 집의 전등이 병렬인 이유 — 하나를 꺼도 다른 하나는 그대로 켜집니다.',
    ...GRID,
    par: 7,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 3 }],
    inventory: [
      { type: 'wire', count: 14 },
      { type: 'bulb', count: 2 },
    ],
    objectives: [
      { text: '전구 2개를 모두 사용한다', test: (c) => c.count('bulb') === 2 },
      {
        text: '두 전구 모두 밝기 80% 이상',
        test: (c) => {
          const bulbs = c.byType('bulb');
          return bulbs.length === 2 && bulbs.every((b) => b.m.brightness >= 0.8);
        },
      },
    ],
  },

  {
    id: 6,
    name: 'LED 방향',
    subtitle: '한쪽으로만 흐르는 전류',
    goal: 'LED를 올바른 방향으로 끼우고, 저항으로 보호해서 켜세요.',
    hint: 'LED는 한쪽 방향으로만 전류가 흐릅니다. 불이 안 들어오면 R키로 방향을 뒤집어 보세요. 저항 없이 연결하면 바로 타버립니다.',
    lesson: 'LED는 극성이 있는 부품이고, 전류를 스스로 제한하지 못합니다. 그래서 늘 직렬 저항과 함께 씁니다.',
    ...GRID,
    par: 6,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 3 }],
    inventory: [
      { type: 'wire', count: 12 },
      { type: 'led', count: 1 },
      { type: 'resistor', value: 47, count: 1 },
      { type: 'resistor', value: 100, count: 1 },
    ],
    objectives: [
      {
        text: 'LED가 50% 이상 밝게 켜진다',
        test: (c) => c.byType('led').some((l) => l.m.brightness >= 0.5),
      },
      {
        text: '타버린 부품이 없다',
        test: (c) => ![...c.board.parts.values()].some((p) => p.burnt),
      },
    ],
  },

  {
    id: 7,
    name: '두 손 스위치',
    subtitle: 'AND 회로 만들기',
    goal: '스위치 2개를 "둘 다" 닫아야 모터가 도는 회로를 만드세요.',
    hint: '두 스위치를 한 줄로(직렬) 이으면, 둘 중 하나만 열려도 길이 끊깁니다. 이것이 AND 조건입니다. 나란히(병렬) 달면 하나만 닫아도 돌아가니 조건을 못 지켜요.',
    lesson: '직렬 스위치는 AND, 병렬 스위치는 OR 입니다. 위험한 기계에 양손 버튼을 쓰는 이유가 바로 이 직렬 회로입니다.',
    ...GRID,
    par: 6,
    fixed: [{ key: BATTERY_SLOT, type: 'battery', value: 4.5 }],
    inventory: [
      { type: 'wire', count: 12 },
      { type: 'motor', count: 1 },
      { type: 'switch', count: 2 },
    ],
    objectives: [
      { text: '스위치를 정확히 2개 사용한다', test: (c) => c.count('switch') === 2 },
      {
        text: '둘 다 닫으면 모터가 돈다',
        test: (c) =>
          c.count('switch') === 2 && c.probe([true, true]).of('motor').some((m) => m.m.spin > 0),
      },
      {
        text: '하나만 닫으면 모터가 멈춘다',
        test: (c) =>
          c.count('switch') === 2 &&
          [c.probe([true, false]), c.probe([false, true])].every((p) =>
            p.of('motor').every((m) => m.m.spin === 0)
          ),
      },
    ],
  },

  {
    id: 8,
    name: '자유 모드',
    subtitle: '마음대로 만들어 보기',
    goal: '모든 부품을 자유롭게 써서 원하는 회로를 만들어 보세요. 목표는 없습니다.',
    hint: '부품을 클릭하면 아래쪽 측정창에 전압·전류·전력이 표시됩니다. 합선을 일부러 만들어 보고 전류가 얼마나 커지는지도 확인해 보세요.',
    lesson: '',
    cols: 9,
    rows: 6,
    par: 999,
    sandbox: true,
    fixed: [],
    inventory: [
      { type: 'wire', count: 60 },
      { type: 'battery', value: 1.5, count: 6 },
      { type: 'battery', value: 9, count: 3 },
      { type: 'switch', count: 6 },
      { type: 'bulb', count: 6 },
      { type: 'resistor', value: 47, count: 6 },
      { type: 'resistor', value: 220, count: 6 },
      { type: 'led', count: 6 },
      { type: 'motor', count: 3 },
    ],
    objectives: [],
  },
];
