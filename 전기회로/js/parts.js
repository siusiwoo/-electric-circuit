// 부품 사양표. 게임의 모든 숫자는 여기 한 곳에서 관리한다.

export const OPEN_R = 1e7; // '끊어진 상태'를 나타내는 아주 큰 저항

export const SPECS = {
  wire: {
    name: '전선',
    R: 0.001,
    desc: '접점을 잇는다',
    detail: '두 접점을 잇는다. 저항이 거의 0이라 전압을 거의 먹지 않는다.',
  },
  battery: {
    name: '건전지',
    V: 3,
    r: 0.4, // 내부 저항
    polar: true,
    Iwarn: 2.5, // 이보다 크면 합선 경고
    Iburn: 4.0, // 이보다 오래 흐르면 건전지가 죽는다
    desc: '전압을 만든다',
    detail: '전압을 만든다. +, − 방향이 있어 R키로 뒤집을 수 있다. 직렬로 이으면 전압이 더해진다.',
  },
  switch: {
    name: '스위치',
    toggle: true,
    desc: '길을 열고 닫는다',
    detail: '클릭하면 열리고 닫힌다. 열면 그 자리에서 전류가 끊긴다.',
  },
  bulb: {
    name: '전구',
    R: 12,
    Prated: 0.75, // 이 전력에서 100% 밝기
    Pburn: 1.2, // 이보다 크면 필라멘트가 끊어진다
    desc: '전력이 클수록 밝다',
    detail: '저항 12Ω. 전력 P=I²R 이 클수록 밝고, 0.75W에서 100% 밝기다. 너무 크면 타버린다.',
  },
  resistor: {
    name: '저항',
    R: 100,
    Pburn: 2.0,
    desc: '전류를 줄인다',
    detail: '직렬로 넣으면 전체 저항이 커져 전류가 줄어든다. 전구·LED 보호에 쓴다.',
  },
  led: {
    name: 'LED',
    Vf: 2.0, // 켜지기 시작하는 전압
    Rs: 20,
    Inom: 0.015, // 100% 밝기 전류
    Iburn: 0.025,
    polar: true,
    desc: '한 방향만 통한다',
    detail: '2V 이상에서 한쪽 방향으로만 켜진다. 전류를 스스로 못 막으니 저항과 함께 써야 한다.',
  },
  motor: {
    name: '모터',
    R: 30,
    Pspin: 0.15, // 이 전력을 넘으면 돌기 시작
    Pnom: 0.6,
    Pburn: 2.5,
    desc: '날개가 돌아간다',
    detail: '저항 30Ω. 전력이 0.15W를 넘으면 돌기 시작하고, 클수록 빠르게 돈다.',
  },
};

export const PART_ORDER = ['wire', 'battery', 'switch', 'bulb', 'resistor', 'led', 'motor'];

/** 팔레트에 쓰는 회로기호 아이콘 */
export const ICONS = {
  wire: `<svg viewBox="0 0 40 24"><path d="M3 12h34" /></svg>`,
  battery: `<svg viewBox="0 0 40 24"><path d="M3 12h11M26 12h11"/><path d="M14 4v16M20 7v10"/><path d="M26 4v16" opacity=".35"/></svg>`,
  switch: `<svg viewBox="0 0 40 24"><path d="M3 16h10M27 16h10"/><path d="M13 16 27 7"/><circle cx="13" cy="16" r="2.2" fill="currentColor" stroke="none"/><circle cx="27" cy="16" r="2.2" fill="currentColor" stroke="none"/></svg>`,
  bulb: `<svg viewBox="0 0 40 24"><path d="M3 12h7M30 12h7"/><circle cx="20" cy="12" r="8"/><path d="m14.5 6.5 11 11M25.5 6.5l-11 11"/></svg>`,
  resistor: `<svg viewBox="0 0 40 24"><path d="M3 12h8l2-5 4 10 4-10 4 10 2-5h8"/></svg>`,
  led: `<svg viewBox="0 0 40 24"><path d="M3 12h11M26 12h11"/><path d="M14 5v14l12-7-12-7z"/><path d="M26 5v14"/><path d="m29 4 4-4M33 7l4-4" stroke-width="1.4"/></svg>`,
  motor: `<svg viewBox="0 0 40 24"><path d="M3 12h7M30 12h7"/><circle cx="20" cy="12" r="8"/><path d="M16.5 12h7M20 8.5v7" stroke-width="1.6"/></svg>`,
};

/** 저항값 → 색 띠 3개 (앞 두 자리 + 배수) */
const BAND_COLORS = [
  '#1a1a1a', // 0 검정
  '#6b3f1d', // 1 갈색
  '#e03a3a', // 2 빨강
  '#f08022', // 3 주황
  '#efd42a', // 4 노랑
  '#2fa84f', // 5 초록
  '#2f6ed8', // 6 파랑
  '#8b4ed8', // 7 보라
  '#8a8a8a', // 8 회색
  '#f2f2f2', // 9 흰색
];

export function resistorBands(R) {
  const v = Math.max(1, Math.round(R));
  const s = String(v);
  let d1, d2, mult;
  if (s.length === 1) {
    d1 = 0;
    d2 = v;
    mult = 0;
  } else {
    d1 = +s[0];
    d2 = +s[1];
    mult = s.length - 2;
  }
  return [BAND_COLORS[d1], BAND_COLORS[d2], BAND_COLORS[Math.min(mult, 9)]];
}

/** 3V, 1.5V 처럼 불필요한 0 을 없앤 표기 */
export function fmtVal(n) {
  return String(Number(Number(n).toFixed(2)));
}

/** 부품 위에 띄울 짧은 설명 라벨 */
export function partLabel(part) {
  const spec = SPECS[part.type];
  switch (part.type) {
    case 'battery':
      return `${fmtVal(part.value ?? spec.V)}V`;
    case 'resistor':
      return `${fmtVal(part.value ?? spec.R)}Ω`;
    default:
      return '';
  }
}

export function fmt(n, digits = 2) {
  if (!isFinite(n)) return '-';
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  if (a >= 1) return n.toFixed(2);
  if (a === 0) return '0';
  if (a >= 0.001) return n.toFixed(3);
  return n.toExponential(1);
}

/** 전류를 보기 좋은 단위로 (A / mA) */
export function fmtCurrent(I) {
  const a = Math.abs(I);
  if (a < 1e-6) return '0 A';
  if (a < 0.1) return `${(I * 1000).toFixed(1)} mA`;
  return `${I.toFixed(3)} A`;
}
