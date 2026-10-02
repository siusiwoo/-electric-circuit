// 회로판 모델
//
// 보드는 cols x rows 개의 접점(노드)으로 된 격자다.
// 부품은 이웃한 두 접점 사이의 '칸(edge)'에 하나씩 놓인다.
//   가로 칸 h:r:c  →  (r,c) - (r,c+1)
//   세로 칸 v:r:c  →  (r,c) - (r+1,c)

import { analyzeNodes } from './solver.js';
import { SPECS, OPEN_R } from './parts.js';

export class Board {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    /** @type {Map<string, object>} 칸 키 → 부품 */
    this.parts = new Map();
  }

  node(r, c) {
    return r * this.cols + c;
  }

  parseEdge(key) {
    const [o, r, c] = key.split(':');
    return { o, r: +r, c: +c };
  }

  /** 칸의 두 끝 접점 */
  edgeNodes(key) {
    const { o, r, c } = this.parseEdge(key);
    return o === 'h'
      ? [this.node(r, c), this.node(r, c + 1)]
      : [this.node(r, c), this.node(r + 1, c)];
  }

  /** 보드의 모든 칸 키 */
  allEdges() {
    const keys = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (c + 1 < this.cols) keys.push(`h:${r}:${c}`);
        if (r + 1 < this.rows) keys.push(`v:${r}:${c}`);
      }
    }
    return keys;
  }

  place(key, type, opts = {}) {
    const part = {
      type,
      value: opts.value ?? null,
      flip: !!opts.flip,
      closed: opts.closed ?? false, // 스위치는 기본 '열림'
      locked: !!opts.locked,
      burnt: false,
    };
    this.parts.set(key, part);
    return part;
  }

  remove(key) {
    const part = this.parts.get(key);
    if (!part || part.locked) return false;
    this.parts.delete(key);
    return true;
  }

  countType(type) {
    let n = 0;
    for (const p of this.parts.values()) if (p.type === type) n++;
    return n;
  }

  /** 소자 하나의 저항값 (전압원이 없는 단순 소자용) */
  #resistanceOf(part) {
    const spec = SPECS[part.type];
    if (part.burnt) return OPEN_R;
    switch (part.type) {
      case 'wire':
        return spec.R;
      case 'switch':
        return spec === undefined ? OPEN_R : SPECS.wire.R;
      default:
        return part.value ?? spec.R;
    }
  }

  /**
   * 부품들을 계산용 소자 목록으로 바꾼다.
   * 건전지는 (이상적 전압원 + 내부저항), 켜진 LED는 (Vf 전압원 + Rs)로 쪼갠다.
   */
  #buildElements(switchStates, ledOn) {
    const els = [];
    for (const [key, part] of this.parts) {
      const [a, b] = this.edgeNodes(key);

      if (part.type === 'switch') {
        const closed = switchStates && switchStates.has(key) ? switchStates.get(key) : part.closed;
        if (closed && !part.burnt) els.push({ kind: 'R', a, b, R: SPECS.wire.R });
        continue; // 열린 스위치는 아예 없는 것으로 본다
      }

      if (part.burnt) {
        els.push({ kind: 'R', a, b, R: OPEN_R });
        continue;
      }

      if (part.type === 'battery') {
        const spec = SPECS.battery;
        const V = part.value ?? spec.V;
        const plus = part.flip ? b : a;
        const minus = part.flip ? a : b;
        const mid = `${key}#m`;
        els.push({ kind: 'V', a: mid, b: minus, V });
        els.push({ kind: 'R', a: mid, b: plus, R: spec.r });
        continue;
      }

      if (part.type === 'led') {
        const spec = SPECS.led;
        const anode = part.flip ? b : a;
        const cathode = part.flip ? a : b;
        if (ledOn.get(key)) {
          const mid = `${key}#m`;
          els.push({ kind: 'R', a: anode, b: mid, R: spec.Rs });
          els.push({ kind: 'V', a: mid, b: cathode, V: spec.Vf });
        } else {
          els.push({ kind: 'R', a, b, R: OPEN_R });
        }
        continue;
      }

      els.push({ kind: 'R', a, b, R: this.#resistanceOf(part) });
    }
    return els;
  }

  /**
   * 회로를 계산한다.
   * @param {{switches?: Map<string, boolean>}} opts
   * @returns {{ok:boolean, voltage:Map, m:Map<string,object>, warnings:string[]}}
   *   m: 칸 키 → { I, V, P, brightness, spin, overload, open }
   */
  simulate(opts = {}) {
    const switchStates = opts.switches ?? null;

    // LED는 방향에 따라 켜지거나 끊기므로, 상태가 안정될 때까지 몇 번 다시 푼다.
    const ledOn = new Map();
    for (const [key, part] of this.parts) {
      if (part.type === 'led') ledOn.set(key, !part.burnt);
    }

    let voltage = new Map();
    let ok = true;
    for (let iter = 0; iter < 12; iter++) {
      const result = analyzeNodes(this.#buildElements(switchStates, ledOn));
      voltage = result.voltage;
      ok = result.ok;
      if (!ok) break;

      let changed = false;
      for (const [key, part] of this.parts) {
        if (part.type !== 'led' || part.burnt) continue;
        const [a, b] = this.edgeNodes(key);
        const anode = part.flip ? b : a;
        const cathode = part.flip ? a : b;
        const Va = voltage.get(anode) ?? 0;
        const Vc = voltage.get(cathode) ?? 0;
        if (ledOn.get(key)) {
          const Vm = voltage.get(`${key}#m`) ?? 0;
          if ((Va - Vm) / SPECS.led.Rs < -1e-9) {
            ledOn.set(key, false);
            changed = true;
          }
        } else if (Va - Vc > SPECS.led.Vf + 1e-9) {
          ledOn.set(key, true);
          changed = true;
        }
      }
      if (!changed) break;
    }

    return this.#measure(voltage, ok, switchStates, ledOn);
  }

  #measure(voltage, ok, switchStates, ledOn) {
    const m = new Map();
    const warnings = [];
    const V = (n) => voltage.get(n) ?? 0;

    for (const [key, part] of this.parts) {
      const [a, b] = this.edgeNodes(key);
      const spec = SPECS[part.type];
      const r = {
        I: 0,
        V: V(a) - V(b),
        P: 0,
        brightness: 0,
        spin: 0,
        overload: false,
        open: false,
        note: '',
      };

      if (part.burnt) {
        r.open = true;
        r.note = '고장';
        m.set(key, r);
        continue;
      }

      switch (part.type) {
        case 'battery': {
          const plus = part.flip ? b : a;
          const minus = part.flip ? a : b;
          const Imid = (V(`${key}#m`) - V(plus)) / spec.r; // + 단자에서 나가는 전류
          r.I = plus === a ? -Imid : Imid;
          r.V = V(plus) - V(minus);
          r.P = Math.abs(r.V * Imid);
          if (Math.abs(Imid) > spec.Iwarn) {
            r.overload = true;
            r.note = '합선 위험';
            warnings.push('합선! 건전지에 전류가 너무 많이 흐릅니다. 전구나 저항을 거쳐 가도록 연결하세요.');
          }
          break;
        }
        case 'led': {
          if (!ledOn.get(key)) {
            r.I = 0;
            r.open = true;
            r.note = '방향 반대 (R키로 뒤집기)';
            break;
          }
          const anode = part.flip ? b : a;
          const Id = (V(anode) - V(`${key}#m`)) / spec.Rs;
          r.I = anode === a ? Id : -Id;
          r.P = Math.abs(r.V * Id);
          r.brightness = Math.max(0, Id / spec.Inom);
          if (Id > spec.Iburn) {
            r.overload = true;
            r.note = '전류 과다';
          }
          break;
        }
        case 'switch': {
          const closed = switchStates && switchStates.has(key) ? switchStates.get(key) : part.closed;
          if (!closed) {
            r.I = 0;
            r.open = true;
            r.note = '열림';
            break;
          }
          r.I = r.V / SPECS.wire.R;
          r.note = '닫힘';
          break;
        }
        default: {
          const R = part.value ?? spec.R;
          r.I = r.V / R;
          r.P = r.I * r.I * R;
          if (part.type === 'bulb') {
            r.brightness = r.P / spec.Prated;
            if (r.P > spec.Pburn) {
              r.overload = true;
              r.note = '과열';
            }
          } else if (part.type === 'motor') {
            r.spin = r.P > spec.Pspin ? Math.min(2, r.P / spec.Pnom) : 0;
            if (r.P > spec.Pburn) {
              r.overload = true;
              r.note = '과열';
            }
          } else if (part.type === 'resistor' && r.P > spec.Pburn) {
            r.overload = true;
            r.note = '과열';
          }
          break;
        }
      }
      m.set(key, r);
    }

    if (!ok) warnings.push('회로를 계산할 수 없습니다. 부품 연결을 확인하세요.');
    return { ok, voltage, m, warnings: [...new Set(warnings)] };
  }
}
