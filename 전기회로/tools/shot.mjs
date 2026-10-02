// 브라우저에서 실제로 열어 보고 오류와 화면을 확인한다
// 실행: node tools/shot.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game, null, { timeout: 15000 });
await page.waitForTimeout(1200);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  저장: ${OUT}/${name}.png`);
}

// 1) 첫 화면(조작 안내 모달)
await shot('1-intro');

await page.click('#modalBody [data-go]');
await page.waitForTimeout(400);
await shot('2-stage1-empty');

// 2) 스테이지 1 풀기: 전구 + 전선 2개
await page.evaluate(() => {
  const g = window.game;
  g.selectItem('bulb@d');
  g.placeAt('h:3:3');
  g.selectItem('wire@d');
  g.placeAt('v:3:4');
});
await page.waitForTimeout(500);
await shot('3-stage1-partial');

await page.evaluate(() => window.game.placeAt('v:3:3'));
await page.waitForTimeout(1300);
await shot('4-stage1-clear');

const report = await page.evaluate(() => {
  const g = window.game;
  return {
    brightness: g.res.m.get('h:3:3').brightness,
    objectives: g.objStatus,
    cleared: g.cleared,
    modalOpen: !document.getElementById('overlay').classList.contains('hidden'),
  };
});
console.log('  스테이지1 상태:', JSON.stringify(report));

// 3) 자유 모드에서 여러 부품 렌더링 확인
await page.evaluate(() => {
  const g = window.game;
  g.closeModal();
  g.loadLevel(7); // 자유 모드 (index 7 = STAGE 8)
  g.selectItem('battery@9');
  g.placeAt('h:5:3');
  g.selectItem('wire@d');
  g.placeAt('v:4:3');
  g.placeAt('v:4:4');
  g.selectItem('bulb@d');
  g.placeAt('h:4:3');
  g.selectItem('motor@d');
  g.placeAt('h:2:5');
  g.selectItem('led@d');
  g.placeAt('h:2:2');
  g.selectItem('resistor@47');
  g.placeAt('v:2:2');
  g.selectItem('switch@d');
  g.placeAt('h:1:4');
});
await page.waitForTimeout(900);
await shot('5-sandbox');

// 4) 합선시켜서 경고가 뜨는지
await page.evaluate(() => {
  const g = window.game;
  g.loadLevel(0);
  g.selectItem('wire@d');
  g.placeAt('v:3:3');
  g.placeAt('h:3:3');
  g.placeAt('v:3:4');
});
await page.waitForTimeout(1600);
await shot('6-short-circuit');
const shortState = await page.evaluate(() => {
  const g = window.game;
  // 타버린 건전지 때문에 멀쩡한 전선까지 검게 변하지 않았는지 확인한다
  const colorOf = (key) => {
    const mesh = g.view.meshes.get(key);
    let hex = null;
    mesh.traverse((o) => {
      if (o.isMesh && hex === null && o.material.color) hex = o.material.color.getHex();
    });
    return hex.toString(16);
  };
  return {
    warning: document.getElementById('warning').textContent.slice(0, 20),
    batteryBurnt: g.board.parts.get('h:4:3').burnt,
    wireBurnt: g.board.parts.get('h:3:3').burnt,
    wireColor: colorOf('h:3:3'),
    batteryColor: colorOf('h:4:3'),
  };
});
console.log('  합선 결과:', JSON.stringify(shortState));

// 5) 위에서 보기
await page.evaluate(() => {
  window.game.closeModal();
  window.game.loadLevel(4);
  const g = window.game;
  g.selectItem('wire@d');
  g.placeAt('v:3:3');
  g.placeAt('v:3:4');
  g.placeAt('v:2:3');
  g.placeAt('v:2:4');
  g.selectItem('bulb@d');
  g.placeAt('h:3:3');
  g.placeAt('h:2:3');
  g.view.topView();
});
await page.waitForTimeout(1200);
await shot('7-parallel-top');

console.log('\n콘솔 로그 / 오류:');
console.log(logs.length ? logs.map((l) => '  ' + l).join('\n') : '  (없음)');

await browser.close();
