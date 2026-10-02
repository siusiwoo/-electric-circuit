// 3D 화면: 회로판, 부품 모형, 전류 흐름 애니메이션, 마우스 집기

import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { SPECS, resistorBands, partLabel } from './parts.js';

export const CELL = 1.6;

const COL = {
  copper: 0xd98b47,
  lead: 0xb9c2cf,
  gold: 0xe8c268,
  board: 0x16233a,
  beige: 0xd9c9a3,
  battery: 0x8d2b35,
  metal: 0x9aa6b4,
  dark: 0x2a3344,
  accent: 0x5ad1ff,
  led: 0xff4d5e,
};

/* ---------------------------------------------------------------- 공용 재료 */

const MAT = {
  copper: new THREE.MeshStandardMaterial({ color: COL.copper, metalness: 0.85, roughness: 0.35 }),
  lead: new THREE.MeshStandardMaterial({ color: COL.lead, metalness: 0.9, roughness: 0.3 }),
  gold: new THREE.MeshStandardMaterial({ color: COL.gold, metalness: 0.95, roughness: 0.25 }),
  beige: new THREE.MeshStandardMaterial({ color: COL.beige, roughness: 0.6 }),
  battery: new THREE.MeshStandardMaterial({ color: COL.battery, metalness: 0.5, roughness: 0.45 }),
  metal: new THREE.MeshStandardMaterial({ color: COL.metal, metalness: 0.85, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: COL.dark, roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: 0xe5484d, roughness: 0.5 }),
};

const GEO = {
  pad: new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14),
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,190,0.65)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW_TEX = glowTexture();

function makeTextSprite(text, opts = {}) {
  const size = opts.size ?? 44;
  const color = opts.color ?? '#e9f6ff';
  const bg = opts.bg ?? 'rgba(10,16,30,0.75)';
  const font = `bold ${size}px "Malgun Gothic", "Segoe UI", sans-serif`;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 30;
  const h = size + 22;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = bg;
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  const scale = 0.26;
  sprite.scale.set((w / h) * scale, scale, 1);
  return sprite;
}

function boardTexture(cols, rows) {
  const px = 48;
  const w = (cols - 1 + 1) * px;
  const h = (rows - 1 + 1) * px;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#16233a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 1400; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }

  const x = (c0) => (c0 + 0.5) * px;
  const y = (r0) => (r0 + 0.5) * px;

  ctx.strokeStyle = 'rgba(110,170,230,0.14)';
  ctx.lineWidth = 3;
  for (let r = 0; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(x(0), y(r));
    ctx.lineTo(x(cols - 1), y(r));
    ctx.stroke();
  }
  for (let col = 0; col < cols; col++) {
    ctx.beginPath();
    ctx.moveTo(x(col), y(0));
    ctx.lineTo(x(col), y(rows - 1));
    ctx.stroke();
  }

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      ctx.beginPath();
      ctx.arc(x(col), y(r), px * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a44f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x(col), y(r), px * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1424';
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------- 부품 모형들 */

function addLeads(group, bodyHalf, y = 0.15) {
  for (const s of [-1, 1]) {
    const end = CELL * 0.43;
    const len = end - bodyHalf;
    if (len > 0.03) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), MAT.lead);
      m.rotation.z = Math.PI / 2;
      m.position.set(s * (bodyHalf + len / 2), y, 0);
      m.castShadow = true;
      group.add(m);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, y, 8), MAT.lead);
    post.position.set(s * end, y / 2, 0);
    group.add(post);
    const pad = new THREE.Mesh(GEO.pad, MAT.gold);
    pad.position.set(s * end, 0.025, 0);
    group.add(pad);
  }
}

function buildWire() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, CELL * 0.86, 12),
    MAT.copper.clone()
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.15;
  body.castShadow = true;
  g.add(body);
  addLeads(g, CELL * 0.43);
  g.userData.flowMat = body.material;
  return g;
}

function buildBattery(part) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); // + 를 +X 쪽에 두고 만든 뒤 통째로 돌린다
  const L = CELL * 0.6;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, L, 20), MAT.battery);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  inner.add(body);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.1, 20), MAT.metal);
  band.rotation.z = Math.PI / 2;
  band.position.x = L * 0.34;
  inner.add(band);

  const capMinus = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 20), MAT.metal);
  capMinus.rotation.z = Math.PI / 2;
  capMinus.position.x = -L / 2 - 0.02;
  inner.add(capMinus);

  const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 14), MAT.metal);
  nub.rotation.z = Math.PI / 2;
  nub.position.x = L / 2 + 0.05;
  inner.add(nub);

  const plus = makeTextSprite('+', { size: 46, color: '#ff9d9d', bg: 'rgba(0,0,0,0)' });
  plus.position.set(L * 0.17, 0.34, 0);
  inner.add(plus);
  const minus = makeTextSprite('−', { size: 46, color: '#9ecbff', bg: 'rgba(0,0,0,0)' });
  minus.position.set(-L * 0.3, 0.34, 0);
  inner.add(minus);

  inner.position.y = 0.3;
  inner.rotation.y = part.flip ? 0 : Math.PI;
  g.add(inner);

  addLeads(g, L / 2 + 0.06, 0.15);
  const label = makeTextSprite(partLabel(part));
  label.position.set(0, 0.78, 0);
  g.add(label);
  return g;
}

function buildResistor(part) {
  const g = new THREE.Group();
  const half = 0.26;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, half * 2, 18), MAT.beige);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.17;
  body.castShadow = true;
  g.add(body);

  const bands = resistorBands(part.value ?? SPECS.resistor.R);
  bands.forEach((hex, i) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.168, 0.168, 0.06, 18),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.5 })
    );
    m.rotation.z = Math.PI / 2;
    m.position.set(-0.15 + i * 0.11, 0.17, 0);
    g.add(m);
  });

  addLeads(g, half, 0.17);
  const label = makeTextSprite(partLabel(part));
  label.position.set(0, 0.62, 0);
  g.add(label);
  return g;
}

function buildSwitch() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.34), MAT.dark);
  base.position.y = 0.2;
  base.castShadow = true;
  g.add(base);

  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 10), MAT.gold);
    post.position.set(s * 0.26, 0.34, 0);
    g.add(post);
  }

  const pivot = new THREE.Group();
  pivot.position.set(-0.26, 0.42, 0);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.055, 0.1), MAT.metal);
  lever.position.x = 0.26;
  lever.castShadow = true;
  pivot.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), MAT.red);
  knob.position.x = 0.54;
  pivot.add(knob);
  g.add(pivot);

  addLeads(g, 0.36, 0.2);
  g.userData.lever = pivot;
  return g;
}

function buildBulb() {
  const g = new THREE.Group();
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.22, 16), MAT.metal);
  socket.position.y = 0.26;
  socket.castShadow = true;
  g.add(socket);

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xdff1ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    metalness: 0,
  });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), glassMat);
  glass.position.y = 0.62;
  g.add(glass);

  const filMat = new THREE.MeshStandardMaterial({
    color: 0x5a4a30,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1,
  });
  const filament = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 18), filMat);
  filament.rotation.x = Math.PI / 2;
  filament.position.y = 0.6;
  g.add(filament);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: GLOW_TEX,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
  );
  halo.position.y = 0.62;
  halo.scale.setScalar(1.4);
  g.add(halo);

  const light = new THREE.PointLight(0xffd79a, 0, 6, 2);
  light.position.y = 0.62;
  g.add(light);

  addLeads(g, 0.19, 0.15);
  g.userData.emitter = { filMat, glassMat, halo, light, color: new THREE.Color(0xffc871) };
  return g;
}

function buildLed(part) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); // 애노드(+)를 +X 쪽에 두고 만든다

  const shellMat = new THREE.MeshStandardMaterial({
    color: COL.led,
    transparent: true,
    opacity: 0.45,
    roughness: 0.15,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 18), shellMat);
  body.position.y = 0.3;
  inner.add(body);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    shellMat
  );
  dome.position.y = 0.45;
  inner.add(dome);

  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 18), shellMat);
  flange.position.y = 0.17;
  inner.add(flange);

  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x5a1a20,
    emissive: new THREE.Color(0x000000),
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), coreMat);
  core.position.y = 0.34;
  inner.add(core);

  // 음극(−) 쪽 평평한 표시
  const flat = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.3), MAT.dark);
  flat.position.set(-0.18, 0.17, 0);
  inner.add(flat);

  const mark = makeTextSprite('+', { size: 40, color: '#ffc9c9', bg: 'rgba(0,0,0,0)' });
  mark.position.set(0.3, 0.26, 0);
  inner.add(mark);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: GLOW_TEX,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    })
  );
  halo.position.y = 0.4;
  halo.scale.setScalar(1.1);
  inner.add(halo);

  const light = new THREE.PointLight(0xff5566, 0, 4, 2);
  light.position.y = 0.42;
  inner.add(light);

  inner.rotation.y = part.flip ? 0 : Math.PI;
  g.add(inner);
  addLeads(g, 0.2, 0.15);
  g.userData.emitter = { filMat: coreMat, glassMat: shellMat, halo, light, color: new THREE.Color(0xff4d5e) };
  return g;
}

function buildMotor() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.38, 20), MAT.metal);
  body.position.y = 0.34;
  body.castShadow = true;
  g.add(body);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 20), MAT.dark);
  rim.position.y = 0.4;
  g.add(rim);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10), MAT.lead);
  shaft.position.y = 0.58;
  g.add(shaft);

  const fan = new THREE.Group();
  fan.position.y = 0.64;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 12), MAT.dark);
  fan.add(hub);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x4e9bd6, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.14), bladeMat);
    blade.position.x = 0.22;
    blade.rotation.x = 0.45;
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI * 2) / 3;
    arm.add(blade);
    fan.add(arm);
  }
  g.add(fan);

  addLeads(g, 0.3, 0.15);
  g.userData.fan = fan;
  return g;
}

const BUILDERS = {
  wire: buildWire,
  battery: buildBattery,
  resistor: buildResistor,
  switch: buildSwitch,
  bulb: buildBulb,
  led: buildLed,
  motor: buildMotor,
};

export function buildPartMesh(part) {
  return (BUILDERS[part.type] ?? buildWire)(part);
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || Object.values(MAT).includes(m)) continue;
        if (m.map && m.map !== GLOW_TEX) m.map.dispose?.();
        m.dispose?.();
      }
    }
  });
}

/* ------------------------------------------------------------------- 뷰 */

const MAX_DOTS = 1400;

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.Fog(0x070b14, 26, 60);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(0, 12, 13);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;

    this.#setupLights();

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.boardGroup = new THREE.Group();
    this.slotGroup = new THREE.Group();
    this.partGroup = new THREE.Group();
    this.scene.add(this.boardGroup, this.slotGroup, this.partGroup);

    this.slots = new Map(); // key → mesh
    this.meshes = new Map(); // key → group
    this.phase = new Map(); // key → 전류 점의 위치(0~1)
    this.ghostCache = new Map();
    this.ghost = null;
    this.hover = null;
    this.selected = null;

    this.#setupFlowDots();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.cols = 0;
    this.rows = 0;
  }

  #setupLights() {
    this.scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x0a1020, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(6, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const s = 12;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0012;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x6ba8ff, 0.7);
    fill.position.set(-8, 6, -6);
    this.scene.add(fill);
  }

  #setupFlowDots() {
    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.058, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_DOTS
    );
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    const colors = new Float32Array(MAX_DOTS * 3).fill(1);
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.scene.add(this.dots);
    this._m4 = new THREE.Matrix4();
    this._v3 = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  /* ---------------------------------------------------------- 보드 만들기 */

  nodePos(node) {
    const r = Math.floor(node / this.cols);
    const c = node % this.cols;
    return new THREE.Vector3(
      (c - (this.cols - 1) / 2) * CELL,
      0,
      (r - (this.rows - 1) / 2) * CELL
    );
  }

  edgeCenter(key) {
    const [o, r, c] = key.split(':');
    const rr = +r;
    const cc = +c;
    const x = (cc - (this.cols - 1) / 2) * CELL + (o === 'h' ? CELL / 2 : 0);
    const z = (rr - (this.rows - 1) / 2) * CELL + (o === 'v' ? CELL / 2 : 0);
    return new THREE.Vector3(x, 0, z);
  }

  setGrid(cols, rows, edgeKeys) {
    this.cols = cols;
    this.rows = rows;

    for (const child of [...this.boardGroup.children]) {
      this.boardGroup.remove(child);
      disposeTree(child);
    }
    for (const child of [...this.slotGroup.children]) {
      this.slotGroup.remove(child);
      child.material.dispose();
    }
    this.slots.clear();

    const w = (cols - 1) * CELL + CELL;
    const d = (rows - 1) * CELL + CELL;
    const tex = boardTexture(cols, rows);
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), [
      new THREE.MeshStandardMaterial({ color: 0x0f1b2e, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x0f1b2e, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0x0b1424, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x0f1b2e, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x0f1b2e, roughness: 0.8 }),
    ]);
    board.position.y = -0.25;
    board.receiveShadow = true;
    this.boardGroup.add(board);

    const slotGeoH = new THREE.BoxGeometry(CELL * 0.82, 0.08, 0.3);
    const slotMat = new THREE.MeshBasicMaterial({
      color: 0x79d9ff,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    });
    for (const key of edgeKeys) {
      const mesh = new THREE.Mesh(slotGeoH, slotMat.clone());
      const p = this.edgeCenter(key);
      mesh.position.set(p.x, 0.05, p.z);
      if (key[0] === 'v') mesh.rotation.y = -Math.PI / 2;
      mesh.userData.key = key;
      mesh.userData.slot = true;
      this.slotGroup.add(mesh);
      this.slots.set(key, mesh);
    }

    const radius = Math.max(w, d);
    this.controls.target.set(0, 0.4, 0);
    this.camera.position.set(0, radius * 0.78, radius * 0.86);
    this.controls.update();
    this.resize();
  }

  resetView() {
    const w = (this.cols - 1) * CELL + CELL;
    const d = (this.rows - 1) * CELL + CELL;
    const radius = Math.max(w, d);
    this.controls.target.set(0, 0.4, 0);
    this.camera.position.set(0, radius * 0.78, radius * 0.86);
    this.controls.update();
  }

  topView() {
    const d = (this.rows - 1) * CELL + CELL;
    const w = (this.cols - 1) * CELL + CELL;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, Math.max(w, d) * 1.15, 0.01);
    this.controls.update();
  }

  /* ---------------------------------------------------------- 부품 동기화 */

  syncParts(board) {
    for (const [key, mesh] of [...this.meshes]) {
      if (!board.parts.has(key)) {
        this.partGroup.remove(mesh);
        disposeTree(mesh);
        this.meshes.delete(key);
        this.phase.delete(key);
        const slot = this.slots.get(key);
        if (slot) slot.visible = true;
      }
    }

    for (const [key, part] of board.parts) {
      const sig = `${part.type}|${part.value}|${part.flip}|${part.burnt}`;
      const existing = this.meshes.get(key);
      if (existing && existing.userData.sig === sig) continue;
      if (existing) {
        this.partGroup.remove(existing);
        disposeTree(existing);
      }
      const g = buildPartMesh(part);
      g.userData.key = key;
      g.userData.sig = sig;
      const p = this.edgeCenter(key);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = key[0] === 'v' ? -Math.PI / 2 : 0;
      this.partGroup.add(g);
      this.meshes.set(key, g);
      const slot = this.slots.get(key);
      if (slot) slot.visible = false;
    }
  }

  /* -------------------------------------------------------------- 미리보기 */

  setGhost(key, part) {
    if (this.ghost) {
      this.ghost.visible = false;
      this.ghost = null;
    }
    if (!key || !part) return;
    const id = `${part.type}|${part.value}|${part.flip}`;
    let g = this.ghostCache.get(id);
    if (!g) {
      g = buildPartMesh(part);
      g.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map((m) => {
            const c = m.clone();
            c.transparent = true;
            c.opacity = 0.34;
            c.depthWrite = false;
            return c;
          });
          if (o.material.length === 1) o.material = o.material[0];
          o.castShadow = false;
        }
        if (o.isSprite) o.material = Object.assign(o.material.clone(), { opacity: 0.4 });
        if (o.isLight) o.intensity = 0;
      });
      this.ghostCache.set(id, g);
      this.scene.add(g);
    }
    const p = this.edgeCenter(key);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = key[0] === 'v' ? -Math.PI / 2 : 0;
    g.visible = true;
    this.ghost = g;
  }

  setHighlight(hoverKey, selectedKey) {
    this.hover = hoverKey;
    this.selected = selectedKey;
    for (const [key, slot] of this.slots) {
      const occupied = this.meshes.has(key);
      if (key === selectedKey) {
        slot.visible = true;
        slot.material.color.setHex(0xffd166);
        slot.material.opacity = 0.42;
      } else if (key === hoverKey) {
        slot.visible = true;
        slot.material.color.setHex(0xffffff);
        slot.material.opacity = occupied ? 0.3 : 0.4;
      } else if (occupied) {
        slot.visible = false;
      } else {
        slot.visible = true;
        slot.material.color.setHex(0x79d9ff);
        slot.material.opacity = 0.07;
      }
    }
  }

  /* ------------------------------------------------------------------ 집기 */

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const partHit = this.raycaster.intersectObjects(this.partGroup.children, true)[0];
    const slotHit = this.raycaster
      .intersectObjects(this.slotGroup.children, false)
      .find((h) => h.object.visible && !this.meshes.has(h.object.userData.key));

    if (partHit && (!slotHit || partHit.distance <= slotHit.distance + 0.2)) {
      let o = partHit.object;
      while (o && !o.userData.key) o = o.parent;
      if (o) return { kind: 'part', key: o.userData.key };
    }
    if (slotHit) return { kind: 'slot', key: slotHit.object.userData.key };
    return null;
  }

  /* ------------------------------------------------------------- 매 프레임 */

  update(board, res, dt = 0.016) {
    this.controls.update();

    const emitters = [];
    for (const [key, part] of board.parts) {
      const g = this.meshes.get(key);
      const m = res.m.get(key);
      if (!g || !m) continue;

      if (part.burnt && !g.userData.burnt) {
        g.userData.burnt = true;
        // 공용 재질을 그대로 건드리면 다른 부품까지 타 보이므로 복제해서 바꾼다
        g.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const burnt = mats.map((mt) => {
            const c = mt.clone();
            if (c.color) c.color.multiplyScalar(0.22);
            if (c.emissive) c.emissive.setHex(0x000000);
            c.emissiveIntensity = 1;
            return c;
          });
          o.material = burnt.length === 1 ? burnt[0] : burnt;
        });
      }

      if (g.userData.lever) {
        const target = part.closed ? 0 : 0.55;
        g.userData.lever.rotation.z += (target - g.userData.lever.rotation.z) * Math.min(1, dt * 14);
      }
      if (g.userData.fan) {
        g.userData.fan.rotation.y += dt * (0.3 + m.spin * 16);
      }
      if (g.userData.emitter) {
        const b = part.burnt ? 0 : Math.max(0, Math.min(1.35, m.brightness));
        emitters.push({ e: g.userData.emitter, b });
      }
      if (g.userData.flowMat) {
        const hot = Math.min(1, Math.abs(m.I) / 1.5);
        g.userData.flowMat.emissive = g.userData.flowMat.emissive ?? new THREE.Color();
        g.userData.flowMat.emissive.setRGB(hot * 0.35, hot * 0.2, 0);
      }
    }

    // 조명 개수를 제한한다 (밝은 것 6개만 실제 광원으로)
    emitters.sort((a, b) => b.b - a.b);
    emitters.forEach(({ e, b }, i) => {
      const k = Math.pow(Math.min(1, b), 1.4);
      e.filMat.emissive.copy(e.color).multiplyScalar(k);
      e.filMat.emissiveIntensity = 1 + k * 2.5;
      e.halo.material.opacity = k * 0.95;
      e.halo.scale.setScalar(1.0 + k * 1.1);
      if (e.glassMat.opacity !== undefined && e.glassMat.transparent) {
        e.glassMat.opacity = 0.22 + k * 0.3;
      }
      e.light.intensity = i < 6 ? k * 9 : 0;
    });

    this.#updateFlow(dt, board, res);
    this.renderer.render(this.scene, this.camera);
  }

  #updateFlow(dt, board, res) {
    let n = 0;
    for (const [key, part] of board.parts) {
      const m = res.m.get(key);
      if (!m || part.burnt) continue;
      const mag = Math.abs(m.I);
      if (mag < 3e-4) {
        this.phase.delete(key);
        continue;
      }
      const speed = Math.min(2.4, 0.3 + Math.log10(1 + mag * 1500) * 0.45);
      let ph = this.phase.get(key) ?? 0;
      ph = (ph + dt * speed * Math.sign(m.I) + 1) % 1;
      this.phase.set(key, ph);

      const [na, nb] = board.edgeNodes(key);
      const pa = this.nodePos(na);
      const pb = this.nodePos(nb);
      const count = 3;
      const scale = 0.7 + Math.min(1, mag / 0.4) * 0.9;
      const over = m.overload ? 1 : 0;
      this._col.setRGB(0.55 + over * 0.45, 0.92 - over * 0.55, 1 - over * 0.75);

      for (let k = 0; k < count && n < MAX_DOTS; k++) {
        const t = (ph + k / count) % 1;
        this._v3.lerpVectors(pa, pb, t);
        this._v3.y = 0.15;
        this._m4.makeScale(scale, scale, scale);
        this._m4.setPosition(this._v3);
        this.dots.setMatrixAt(n, this._m4);
        this.dots.setColorAt(n, this._col);
        n++;
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
