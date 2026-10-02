// 게임 진행: 부품 놓기/치우기, 목표 판정, 과부하 처리, 화면 갱신

import { Board } from './circuit.js';
import { LEVELS } from './levels.js';
import { View } from './view3d.js';
import { SPECS, ICONS, fmt, fmtVal, fmtCurrent } from './parts.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'circuitlab.v1';
const BURN_DELAY = 0.9; // 과부하가 이만큼 이어지면 부품이 망가진다 (초)

function loadProgress() {
  try {
    return { stars: {}, last: 0, seenHowto: false, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return { stars: {}, last: 0, seenHowto: false };
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* 저장 못 해도 게임은 계속된다 */
  }
}

function itemName(item) {
  const base = SPECS[item.type].name;
  if (item.value == null) return base;
  if (item.type === 'battery') return `${base} ${fmtVal(item.value)}V`;
  if (item.type === 'resistor') return `${base} ${fmtVal(item.value)}Ω`;
  return base;
}

const BURN_TEXT = {
  bulb: '전구의 필라멘트가 끊어졌습니다. 전류가 너무 커서 전구가 견딜 수 있는 전력을 넘었어요. 직렬로 저항을 넣어 전류를 줄여 보세요.',
  led: 'LED가 타버렸습니다. LED는 전류를 스스로 제한하지 못하므로 반드시 직렬 저항과 함께 써야 합니다.',
  battery: '건전지가 합선으로 망가졌습니다. +와 − 를 전선만으로 바로 이으면 저항이 거의 0이라 전류가 폭발적으로 커집니다.',
  motor: '모터가 과열로 멈췄습니다. 전압이 너무 높습니다.',
  resistor: '저항이 과열로 타버렸습니다. 저항도 견딜 수 있는 전력에 한계가 있습니다.',
  wire: '전선이 과열되었습니다.',
  switch: '스위치가 과열되었습니다.',
};

class Game {
  constructor() {
    this.view = new View($('scene'));
    this.progress = loadProgress();
    this.flip = false;
    this.sound = true;
    this.overload = new Map();
    this.hoverKey = null;
    this.selectedKey = null;
    this.selectedItem = null;
    this.objStatus = [];
    this.res = { ok: true, m: new Map(), warnings: [] };
    this.frame = this.frame.bind(this);

    this.#bindPointer();
    this.#bindButtons();
    this.#bindKeys();
    addEventListener('resize', () => this.view.resize());

    this.loadLevel(this.progress.last ?? 0);
    if (!this.progress.seenHowto) {
      this.showHowto();
      this.progress.seenHowto = true;
      saveProgress(this.progress);
    }
    this.lastT = performance.now();
    requestAnimationFrame(this.frame);
  }

  /* --------------------------------------------------------- 레벨 불러오기 */

  loadLevel(index) {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    const lv = LEVELS[this.levelIndex];
    this.level = lv;
    this.board = new Board(lv.cols, lv.rows);
    for (const f of lv.fixed) {
      this.board.place(f.key, f.type, { value: f.value, flip: f.flip, locked: true, closed: true });
    }
    this.inv = lv.inventory.map((it, i) => ({
      id: `${it.type}@${it.value ?? 'd'}`,
      type: it.type,
      value: it.value ?? null,
      total: it.count,
      left: it.count,
      hotkey: i + 1,
    }));
    this.selectedItem = this.inv[0]?.id ?? null;
    this.overload.clear();
    this.hoverKey = null;
    this.selectedKey = null;
    this.cleared = false;
    this.flip = false;
    this.grace = 0;
    this.startTime = performance.now();

    this.view.setGrid(lv.cols, lv.rows, this.board.allEdges());
    this.view.syncParts(this.board);
    this.view.setGhost(null, null);
    this.#renderHeader();
    this.recompute();

    this.progress.last = this.levelIndex;
    saveProgress(this.progress);
  }

  recompute() {
    this.res = this.board.simulate();
    this.view.syncParts(this.board);
    this.view.setHighlight(this.hoverKey, this.selectedKey);
    this.#renderPalette();
    this.#renderObjectives();
    this.#renderMeter();
    this.#renderWarning();
  }

  /* ------------------------------------------------------------ 목표 판정 */

  #context() {
    const board = this.board;
    const switchKeys = [...board.parts].filter(([, p]) => p.type === 'switch').map(([k]) => k);
    const listFrom = (m) => (type) =>
      [...board.parts]
        .filter(([, p]) => p.type === type)
        .map(([k, p]) => ({ key: k, part: p, m: m.get(k) ?? { I: 0, V: 0, P: 0, brightness: 0, spin: 0 } }));
    const probe = (bools) => {
      const states = new Map(switchKeys.map((k, i) => [k, !!bools[i]]));
      const r = board.simulate({ switches: states });
      return { m: r.m, of: listFrom(r.m) };
    };
    return {
      board,
      result: this.res,
      byType: listFrom(this.res.m),
      count: (t) => board.countType(t),
      switchKeys,
      probe,
      probeAll: (v) => probe(switchKeys.map(() => v)),
    };
  }

  #evaluate() {
    const objectives = this.level.objectives ?? [];
    if (!objectives.length) return [];
    const c = this.#context();
    return objectives.map((o) => {
      try {
        return !!o.test(c);
      } catch {
        return false;
      }
    });
  }

  get usedParts() {
    let n = 0;
    for (const p of this.board.parts.values()) if (!p.locked) n++;
    return n;
  }

  #onClear() {
    this.cleared = true;
    const seconds = (performance.now() - this.startTime) / 1000;
    const used = this.usedParts;
    const par = this.level.par ?? 999;
    const stars = used <= par ? 3 : used <= par + 3 ? 2 : 1;
    const id = this.level.id;
    this.progress.stars[id] = Math.max(this.progress.stars[id] ?? 0, stars);
    saveProgress(this.progress);

    this.beep(660, 0.09);
    setTimeout(() => this.beep(880, 0.12), 110);
    setTimeout(() => this.#showClear(stars, seconds, used, par), 500);
  }

  /* --------------------------------------------------- 과부하 / 매 프레임 */

  #tick(dt) {
    // 안내 창이 떠 있는 동안이나 고친 직후에는 과열 시간을 세지 않는다
    if (!$('overlay').classList.contains('hidden')) return;
    if (this.grace > 0) {
      this.grace -= dt;
      return;
    }
    const burned = [];
    for (const [key, part] of this.board.parts) {
      const m = this.res.m.get(key);
      if (!m || part.burnt) continue;
      const spec = SPECS[part.type];
      const bad = part.type === 'battery' ? Math.abs(m.I) > spec.Iburn : m.overload;
      if (bad) {
        const t = (this.overload.get(key) ?? 0) + dt;
        this.overload.set(key, t);
        if (t >= BURN_DELAY) {
          part.burnt = true;
          this.overload.delete(key);
          burned.push(part.type);
        }
      } else if (this.overload.has(key)) {
        const t = this.overload.get(key) - dt * 2;
        if (t <= 0) this.overload.delete(key);
        else this.overload.set(key, t);
      }
    }
    if (burned.length) {
      this.beep(140, 0.25, 'sawtooth');
      this.recompute();
      this.#showBurn(burned);
    }
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.#tick(dt);
    this.view.update(this.board, this.res, dt);
    this.#renderTimer();
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------- 부품 놓기/치우기 */

  placeAt(key) {
    const item = this.inv.find((i) => i.id === this.selectedItem);
    if (!item) return;
    if (item.left <= 0) {
      this.toast(`${itemName(item)}이(가) 남아 있지 않습니다`);
      return;
    }
    this.board.place(key, item.type, { value: item.value, flip: this.flip });
    item.left--;
    this.beep(640, 0.05);
    this.recompute();
  }

  removeAt(key) {
    const part = this.board.parts.get(key);
    if (!part) return;
    if (part.locked) {
      this.toast('고정된 부품은 치울 수 없습니다');
      return;
    }
    const item = this.inv.find(
      (i) => i.type === part.type && (i.value ?? null) === (part.value ?? null)
    );
    this.board.remove(key);
    if (item) item.left = Math.min(item.total, item.left + 1);
    if (this.selectedKey === key) this.selectedKey = null;
    this.overload.delete(key);
    this.beep(300, 0.05);
    this.recompute();
  }

  flipAt(key) {
    const part = key && this.board.parts.get(key);
    if (part && SPECS[part.type].polar) {
      if (part.locked) {
        this.toast('고정된 부품은 돌릴 수 없습니다');
        return;
      }
      part.flip = !part.flip;
      this.beep(480, 0.05);
      this.recompute();
      return;
    }
    this.flip = !this.flip;
    this.toast(`놓을 방향을 ${this.flip ? '반대로' : '기본으로'} 바꿨습니다`);
    this.#updateGhost();
  }

  repairAll() {
    for (const p of this.board.parts.values()) p.burnt = false;
    this.overload.clear();
    this.grace = 3; // 회로를 고칠 시간을 준다 (초)
    this.toast('부품을 고쳤습니다. 3초 안에 회로를 바로잡으세요!');
    this.recompute();
  }

  /* --------------------------------------------------------- 입력 연결 */

  #bindPointer() {
    const canvas = $('scene');
    let down = null;

    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
    });

    canvas.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
      const hit = this.view.pick(e.clientX, e.clientY);
      const key = hit?.key ?? null;
      if (key !== this.hoverKey) {
        this.hoverKey = key;
        this.view.setHighlight(this.hoverKey, this.selectedKey);
        this.#updateGhost();
        if (!this.selectedKey) this.#renderMeter();
      }
    });

    canvas.addEventListener('pointerleave', () => {
      this.hoverKey = null;
      this.view.setHighlight(null, this.selectedKey);
      this.view.setGhost(null, null);
    });

    canvas.addEventListener('pointerup', (e) => {
      if (down && !down.moved) this.#click(e.clientX, e.clientY, down.button);
      down = null;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  #click(x, y, button) {
    const hit = this.view.pick(x, y);
    if (!hit) {
      this.selectedKey = null;
      this.view.setHighlight(this.hoverKey, null);
      this.#renderMeter();
      return;
    }
    if (button === 2) {
      this.removeAt(hit.key);
      return;
    }
    if (button !== 0) return;

    if (hit.kind === 'slot') {
      this.placeAt(hit.key);
      this.selectedKey = hit.key;
      this.#renderMeter();
    } else {
      const part = this.board.parts.get(hit.key);
      this.selectedKey = hit.key;
      if (part && part.type === 'switch' && !part.burnt) {
        part.closed = !part.closed;
        this.beep(part.closed ? 540 : 360, 0.05);
        this.recompute();
      } else {
        this.#renderMeter();
      }
    }
    this.view.setHighlight(this.hoverKey, this.selectedKey);
    this.#updateGhost();
  }

  #bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        return;
      }
      if (!$('overlay').classList.contains('hidden')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && this.inv[n - 1]) {
        this.selectItem(this.inv[n - 1].id);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'r':
          this.flipAt(this.hoverKey ?? this.selectedKey);
          break;
        case 'delete':
        case 'backspace':
          if (this.hoverKey ?? this.selectedKey) this.removeAt(this.hoverKey ?? this.selectedKey);
          break;
        case ' ': {
          const k = this.hoverKey ?? this.selectedKey;
          const p = k && this.board.parts.get(k);
          if (p && p.type === 'switch') {
            p.closed = !p.closed;
            this.recompute();
          }
          e.preventDefault();
          break;
        }
        case 't':
          this.view.topView();
          break;
        case 'v':
          this.view.resetView();
          break;
        case 'h':
          this.showHint();
          break;
      }
    });
  }

  #bindButtons() {
    $('btnHint').onclick = () => this.showHint();
    $('btnReset').onclick = () => this.loadLevel(this.levelIndex);
    $('btnLevels').onclick = () => this.showLevels();
    $('btnView').onclick = () => this.view.resetView();
    $('btnTop').onclick = () => this.view.topView();
    $('btnSound').onclick = () => {
      this.sound = !this.sound;
      $('btnSound').classList.toggle('muted', !this.sound);
      if (this.sound) this.beep(620, 0.05);
    };
    $('modalClose').onclick = () => this.closeModal();
    $('overlay').addEventListener('pointerdown', (e) => {
      if (e.target === $('overlay')) this.closeModal();
    });
  }

  selectItem(id) {
    this.selectedItem = id;
    this.#renderPalette();
    this.#updateGhost();
  }

  #updateGhost() {
    const item = this.inv.find((i) => i.id === this.selectedItem);
    const canPlace =
      this.hoverKey && !this.board.parts.has(this.hoverKey) && item && item.left > 0;
    if (!canPlace) {
      this.view.setGhost(null, null);
      return;
    }
    this.view.setGhost(this.hoverKey, { type: item.type, value: item.value, flip: this.flip });
  }

  /* --------------------------------------------------------------- 화면 */

  #renderHeader() {
    const lv = this.level;
    $('stageNo').textContent = lv.id;
    $('levelName').textContent = lv.name;
    $('levelSub').textContent = lv.subtitle;
    $('goalText').textContent = lv.goal;
  }

  #renderTimer() {
    const s = Math.floor((performance.now() - this.startTime) / 1000);
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if ($('timer').textContent !== txt) $('timer').textContent = txt;
  }

  #renderPalette() {
    const box = $('palette');
    box.innerHTML = '';
    for (const item of this.inv) {
      const el = document.createElement('div');
      el.className = 'pitem';
      if (item.id === this.selectedItem) el.classList.add('active');
      if (item.left <= 0) el.classList.add('out');
      const spec = SPECS[item.type];
      el.title = `${itemName(item)} — ${spec.detail}`;
      el.innerHTML = `
        ${ICONS[item.type]}
        <div class="nm">${itemName(item)}<small>${spec.desc}</small></div>
        <div class="cnt">${item.left}</div>
        <div class="kb">${item.hotkey}</div>`;
      el.onclick = () => this.selectItem(item.id);
      box.appendChild(el);
    }
  }

  #renderObjectives() {
    const ul = $('objectives');
    ul.innerHTML = '';
    const objectives = this.level.objectives ?? [];
    if (!objectives.length) {
      ul.innerHTML = '<li class="none">자유 모드입니다. 정해진 목표 없이 마음대로 만들어 보세요.</li>';
      return;
    }
    this.objStatus = this.#evaluate();
    objectives.forEach((o, i) => {
      const li = document.createElement('li');
      const done = this.objStatus[i];
      li.className = done ? 'done' : '';
      li.innerHTML = `<span class="mk">${done ? '✓' : ''}</span><span>${o.text}</span>`;
      ul.appendChild(li);
    });
    if (this.objStatus.every(Boolean) && !this.cleared) this.#onClear();
  }

  #renderMeter() {
    const box = $('meter');
    const key = this.selectedKey ?? this.hoverKey;
    const part = key ? this.board.parts.get(key) : null;

    if (!part) {
      const batteries = [...this.board.parts]
        .filter(([, p]) => p.type === 'battery')
        .map(([k, p]) => ({ p, m: this.res.m.get(k) }));
      if (!batteries.length) {
        box.className = 'meter empty';
        box.textContent = '부품을 클릭하면 전압·전류·전력을 보여줍니다.';
        return;
      }
      const totalI = batteries.reduce((s, b) => s + Math.abs(b.m?.I ?? 0), 0);
      const totalV = batteries.reduce((s, b) => s + (b.p.value ?? SPECS.battery.V), 0);
      box.className = 'meter';
      box.innerHTML = `
        <div class="mname">회로 전체 <span>건전지 ${batteries.length}개</span></div>
        ${row('전원 전압 합', `${fmtVal(totalV)} V`)}
        ${row('흐르는 전류', fmtCurrent(totalI))}
        <div class="note">부품을 클릭하면 자세히 볼 수 있습니다.</div>`;
      return;
    }

    const m = this.res.m.get(key) ?? { I: 0, V: 0, P: 0 };
    const spec = SPECS[part.type];
    let html = `<div class="mname">${itemName({ type: part.type, value: part.value })}
      <span>${part.burnt ? '고장' : m.note || ''}</span></div>`;
    html += row('전압 V', `${fmt(m.V)} V`);
    html += row('전류 I', fmtCurrent(Math.abs(m.I)));
    html += row('전력 P', `${fmt(m.P)} W`);
    if (['resistor', 'bulb', 'motor'].includes(part.type)) {
      html += row('저항 R', `${fmtVal(part.value ?? spec.R)} Ω`);
    }
    if (part.type === 'bulb' || part.type === 'led') {
      const b = Math.max(0, Math.min(1.35, m.brightness));
      html += row('밝기', `${Math.round(m.brightness * 100)} %`);
      html += `<div class="bar"><i style="width:${Math.min(100, b * 74)}%"></i></div>`;
    }
    if (part.type === 'motor') {
      html += row('회전', m.spin > 0 ? `${Math.round(m.spin * 100)} %` : '멈춤');
    }
    if (part.type === 'battery') {
      html += row('내부 저항', `${fmtVal(spec.r)} Ω`);
    }
    const t = this.overload.get(key);
    if (t) html += `<div class="note">⚠ 과열 중! ${(BURN_DELAY - t).toFixed(1)}초 뒤 고장</div>`;
    box.className = 'meter';
    box.innerHTML = html;
  }

  #renderWarning() {
    const el = $('warning');
    const msg = this.res.warnings[0];
    if (!msg) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = `⚠ ${msg}`;
    el.classList.remove('hidden');
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), 1700);
  }

  /* -------------------------------------------------------------- 모달 */

  showModal(html, handlers = {}) {
    $('modalBody').innerHTML = html;
    $('overlay').classList.remove('hidden');
    for (const [sel, fn] of Object.entries(handlers)) {
      $('modalBody')
        .querySelectorAll(sel)
        .forEach((el) => (el.onclick = fn));
    }
  }

  closeModal() {
    $('overlay').classList.add('hidden');
  }

  showHowto() {
    this.showModal(
      `<h2>회로 공작소</h2>
      <p>건전지·전선·전구를 격자 위에 놓아 실제로 전류가 흐르는 회로를 만드는 게임입니다.
      전압과 전류는 옴의 법칙으로 매 순간 실제로 계산되기 때문에, 잘못 연결하면 전구가 정말 타버립니다.</p>
      <h3>조작</h3>
      <div class="howto">
        <div><kbd>클릭</kbd></div><div>빈 칸에 부품 놓기 / 스위치 열고 닫기</div>
        <div><kbd>우클릭</kbd></div><div>부품 치우기 (부품은 상자로 돌아갑니다)</div>
        <div><kbd>R</kbd></div><div>건전지·LED 방향 뒤집기</div>
        <div><kbd>1</kbd>~<kbd>9</kbd></div><div>부품 고르기</div>
        <div><kbd>드래그</kbd></div><div>시점 돌리기 · 휠로 확대</div>
        <div><kbd>T</kbd><kbd>V</kbd></div><div>위에서 보기 / 시점 초기화</div>
      </div>
      <div class="foot"><button class="btn primary" data-go>시작하기</button></div>`,
      { '[data-go]': () => this.closeModal() }
    );
  }

  showHint() {
    this.showModal(
      `<h2>힌트</h2><p>${this.level.hint}</p>
      <div class="foot"><button class="btn primary" data-go>알겠어요</button></div>`,
      { '[data-go]': () => this.closeModal() }
    );
  }

  #showBurn(types) {
    const list = [...new Set(types)];
    this.showModal(
      `<h2>부품이 망가졌어요</h2>
      ${list.map((t) => `<p><b>${SPECS[t].name}</b> — ${BURN_TEXT[t] ?? '과부하로 망가졌습니다.'}</p>`).join('')}
      <div class="foot">
        <button class="btn" data-reset>처음부터</button>
        <button class="btn primary" data-fix>고치고 계속하기</button>
      </div>`,
      {
        '[data-fix]': () => {
          this.repairAll();
          this.closeModal();
        },
        '[data-reset]': () => {
          this.loadLevel(this.levelIndex);
          this.closeModal();
        },
      }
    );
  }

  #showClear(stars, seconds, used, par) {
    const last = this.levelIndex >= LEVELS.length - 1;
    this.showModal(
      `<h2>통과!</h2>
      <div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="statline"><div>걸린 시간 <b>${seconds.toFixed(1)}초</b></div>
        <div>쓴 부품 <b>${used}개</b></div><div>최소 <b>${par}개</b></div></div>
      ${this.level.lesson ? `<h3>이번에 배운 것</h3><p>${this.level.lesson}</p>` : ''}
      <div class="foot">
        <button class="btn" data-stay>더 만져보기</button>
        ${last ? '' : '<button class="btn primary" data-next>다음 레벨 →</button>'}
      </div>`,
      {
        '[data-stay]': () => this.closeModal(),
        '[data-next]': () => {
          this.loadLevel(this.levelIndex + 1);
          this.closeModal();
        },
      }
    );
  }

  showLevels() {
    const items = LEVELS.map((lv, i) => {
      const s = this.progress.stars[lv.id] ?? 0;
      return `<button class="lvbtn ${i === this.levelIndex ? 'cur' : ''}" data-i="${i}">
        <div class="n">STAGE ${lv.id}</div>
        <div class="t">${lv.name}</div>
        <div class="s">${s ? '★'.repeat(s) : ''}</div>
      </button>`;
    }).join('');
    this.showModal(`<h2>레벨 선택</h2><div class="lvgrid">${items}</div>`, {
      '.lvbtn': (e) => {
        this.loadLevel(+e.currentTarget.dataset.i);
        this.closeModal();
      },
    });
  }

  /* --------------------------------------------------------------- 소리 */

  beep(freq, dur = 0.06, type = 'triangle') {
    if (!this.sound) return;
    try {
      this.ac ??= new (window.AudioContext || window.webkitAudioContext)();
      const ac = this.ac;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ac.destination);
      const t = ac.currentTime;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      this.sound = false;
    }
  }
}

function row(label, value) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

// 개발·시험용으로 콘솔에서 게임 상태를 들여다볼 수 있게 열어 둔다
window.game = new Game();
