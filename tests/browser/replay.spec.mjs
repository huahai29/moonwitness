import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyze } from '../../dist/engine.mjs';
import { standaloneReport } from '../../scripts/report.mjs';

test('CAS race reduces to two operations and replays model state', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('#run').click();
  await expect(page.locator('#badge')).toHaveText('发现违规');
  await expect(page.locator('#stats')).toContainText('2');
  await page.locator('#reduced').click();
  await expect(page.locator('.timeline-row')).toHaveCount(2);
  await page.locator('#next').click();
  await expect(page.locator('#replay-state')).toContainText('alice-cas');
  await expect(page.locator('#frontier')).toContainText('返回值不符合');
  await page.screenshot({ path: 'test-results/desktop-replay.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('legal overlap displays a complete witness and supports playback', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-example="legal"]').click(); await page.locator('#run').click();
  await expect(page.locator('#badge')).toHaveText('通过');
  await expect(page.locator('#replay-caption')).toHaveText('完整顺序见证');
  await page.locator('#play').click();
  await expect(page.locator('#step-label')).toHaveText('3 / 3');
  await expect(page.locator('#replay-state .state-card strong')).toHaveText('1');
  await expect(page.locator('#reduced')).toBeDisabled();
});
test('budget exhaustion and invalid JSON never appear as passing', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-example="legal"]').click();
  await page.locator('#nodes').fill('1'); await page.locator('#run').click();
  await expect(page.locator('#badge')).toHaveText('未判定');
  await page.locator('#source').fill('{}'); await page.locator('#run').click();
  await expect(page.locator('#badge')).toHaveText('输入无效');
});
test('editing a checked history invalidates stale results', async ({ page }) => {
  await page.goto('/'); await page.locator('#run').click(); await expect(page.locator('#badge')).toHaveText('发现违规');
  await page.locator('#source').fill('{}');
  await expect(page.locator('#badge')).toHaveText('等待检查');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('.timeline-row')).toHaveCount(0);
});
test('mobile layout has no horizontal overflow and preserves Chinese text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.locator('#run').click(); await expect(page.locator('#badge')).toHaveText('发现违规');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-replay.png', fullPage: true });
});
test('offline file report renders and recalculates without network access', async ({ page }) => {
  const source = await readFile(new URL('../../examples/cas-race.json', import.meta.url), 'utf8');
  const dir = await mkdtemp(join(tmpdir(), 'moonwitness-browser-'));
  const target = join(dir, 'report.html');
  await writeFile(target, await standaloneReport(source, JSON.parse(analyze(source, 100000, 100))));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(target).href);
  await expect(page.locator('#badge')).toHaveText('发现违规');
  await page.locator('[data-example="legal"]').click(); await page.locator('#run').click();
  await expect(page.locator('#badge')).toHaveText('通过');
  expect(errors).toEqual([]);
});
test('hostile operation IDs remain text in online and offline reports', async ({ page }) => {
  const source = JSON.stringify({ model: 'register', initial: 0, operations: [{ id: '</script><script>window.pwned=1</script>', client: '<img src=x onerror="window.pwned=2">', start: 0, end: 1, kind: 'read', output: 0 }] });
  const dir = await mkdtemp(join(tmpdir(), 'moonwitness-xss-'));
  const target = join(dir, 'report.html'); await writeFile(target, await standaloneReport(source, JSON.parse(analyze(source, 1000, 0))));
  await page.goto(pathToFileURL(target).href);
  await expect(page.locator('#badge')).toHaveText('通过');
  await expect(page.locator('.op-label')).toContainText('<img');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('img')).toHaveCount(0);
});
