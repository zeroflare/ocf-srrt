/**
 * SMC Submarine Cable Scraper
 *
 * 從 https://smc.peering.tw/ 抓取台灣海纜動態地圖資料，包含：
 * 1. 海纜路由地理資料 (cable route data) → frontend/src/data/cables/*.json
 * 2. 發生中事件 (active incidents)       → frontend/src/data/events/active.json
 * 3. 歷史事件 (historical incidents)     → frontend/src/data/events/history.json
 * 4. 台灣對外連線統計 (stats)            → frontend/src/data/events/stats.json
 *
 * 執行方式：
 *   npx tsx smc-scraper.ts            # 直接執行
 *   npx tsx smc-scraper.ts --dry-run  # 只印出不寫檔
 */

import { chromium, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────

interface ConnectionStats {
  normal: number;
  affected: number;
  total: number;
  timestamp: string;
}

interface CableIncident {
  date: string;
  title: string;
  status: string;
  cause: string;
  description: string;
  daysElapsed: number | null;
  estimatedRepairTime: string | null;
  resolvedTime: string | null;
}

interface CableSegment {
  id: string;
  hidden: boolean;
  coordinates: [number, number][];
}

interface CableData {
  id: string;
  name: string;
  color: string;
  available_path: string[][];
  equipments: unknown[];
  segments: CableSegment[];
}

interface ScrapeResult {
  scrapeTime: string;
  source: string;
  stats: ConnectionStats;
  activeEvents: CableIncident[];
  historicalEvents: CableIncident[];
  cables: CableData[];
}

// ─── Constants ────────────────────────────────────────────────────

const SOURCE_URL = 'https://smc.peering.tw/';

const SCRAPER_DIR = import.meta.dirname ?? __dirname;
const DEFAULT_EVENTS_DIR = path.resolve(SCRAPER_DIR, '../frontend/src/data/events');
const DEFAULT_CABLES_DIR = path.resolve(SCRAPER_DIR, '../frontend/src/data/cables');

const NAVIGATION_TIMEOUT = 30_000;
const PAGE_LOAD_WAIT = 4_000;
const VIEW_SWITCH_WAIT = 2_000;

/**
 * smc.peering.tw 使用 "nacs" 作為 cable id，
 * 但專案中對應的檔案是 "frnal-nacs.json"。
 * 此 map 處理 id 不一致的情況。
 */
const CABLE_ID_TO_FILENAME: Record<string, string> = {
  nacs: 'frnal-nacs',
};

// ─── Scraper Core ─────────────────────────────────────────────────

async function dismissDialog(page: Page): Promise<void> {
  try {
    const btn = page.getByRole('button', { name: '我了解' });
    if (await btn.isVisible({ timeout: 3_000 })) {
      await btn.click();
      await page.waitForTimeout(500);
    }
  } catch {
    // Dialog might not appear — that's fine
  }
}

/**
 * 從頁面的 JS bundle 中探測所有 cable chunk 檔名，
 * 然後透過 dynamic import 逐一載入並提取結構化資料。
 */
async function scrapeCables(page: Page): Promise<CableData[]> {
  console.log('[scraper] Discovering cable chunk files from JS bundle...');

  // Step 1: 從主 bundle 找出所有 cable chunk 的映射
  const chunkMap: Array<{ cableId: string; chunkFile: string }> = await page.evaluate(async () => {
    // 找到主 bundle script
    const scriptEl = document.querySelector('script[type="module"][src*="index-"]') as HTMLScriptElement | null;
    if (!scriptEl) return [];

    const resp = await fetch(scriptEl.src);
    const bundleText = await resp.text();

    // 解析 import.meta.glob 產生的 cable chunk 映射
    const pattern = /\/src\/data\/cables\/([^"]+)\.json":\(\)=>\w+\(\(\)=>import\("\.\/([^"]+)"\)/g;
    const results: Array<{ cableId: string; chunkFile: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(bundleText)) !== null) {
      results.push({ cableId: m[1], chunkFile: m[2] });
    }
    return results;
  });

  console.log(`[scraper] Found ${chunkMap.length} cable chunks`);

  // Step 2: 逐一 import 每個 chunk，提取海纜資料
  const cables: CableData[] = [];

  for (const { cableId, chunkFile } of chunkMap) {
    try {
      const cable = await page.evaluate(async (file: string) => {
        const mod = await import(`/assets/${file}`);

        // 提取 segments，只保留 id / hidden / coordinates
        const rawSegments = Array.isArray(mod.segments) ? mod.segments : [];
        const segments = rawSegments.map((seg: Record<string, unknown>) => ({
          id: String(seg.id ?? ''),
          hidden: Boolean(seg.hidden),
          coordinates: Array.isArray(seg.coordinates) ? seg.coordinates : [],
        }));

        return {
          id: String(mod.id ?? ''),
          name: String(mod.name ?? ''),
          color: String(mod.color ?? '#3b82f6'),
          available_path: Array.isArray(mod.available_path) ? mod.available_path : [],
          equipments: Array.isArray(mod.equipments) ? mod.equipments : [],
          segments,
        };
      }, chunkFile);

      cables.push(cable);
      console.log(
        `[scraper]   ✓ ${cableId}: ${cable.name} (${cable.segments.length} segments)`,
      );
    } catch (err) {
      console.warn(`[scraper]   ✗ ${cableId}: failed to load (${err})`);
    }
  }

  return cables;
}

/**
 * 從頁面 DOM 提取事件列表（inline 版本，在瀏覽器 context 中執行）
 */
async function scrapeEvents(page: Page, isHistory: boolean): Promise<CableIncident[]> {
  return page.evaluate((historyMode: boolean) => {
    const events: Array<{
      date: string; title: string; status: string; cause: string;
      description: string; daysElapsed: number | null;
      estimatedRepairTime: string | null; resolvedTime: string | null;
    }> = [];
    const headings = document.querySelectorAll('h3');

    for (const h3 of headings) {
      const title = h3.textContent?.trim() ?? '';
      if (!title || title.includes('提醒')) continue;

      let card: Element | null = h3.parentElement;
      while (card && !card.querySelector('h3')) card = card.parentElement;
      if (!card) card = h3.parentElement;
      if (!card) continue;

      const cardText = card.textContent ?? '';
      const dateMatch = cardText.match(/(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{2}:\d{2})?)/);
      const date = dateMatch?.[1] ?? '';

      let status = '未知';
      if (cardText.includes('部分斷線')) status = '部分斷線';
      else if (cardText.includes('斷線')) status = '斷線';
      else if (cardText.includes('預定維護') || cardText.includes('計劃性維護')) status = '預定維護';

      let cause = '未知';
      if (cardText.includes('地震')) cause = '地震';
      else if (cardText.includes('維護')) cause = '維護';
      else if (cardText.includes('已排除')) cause = '已排除';

      const descEl = h3.nextElementSibling;
      const description = descEl?.textContent?.trim() ?? '';

      const daysMatch = cardText.match(/(\d+)\s*天/);
      const daysElapsed = daysMatch ? parseInt(daysMatch[1], 10) : null;

      const etrMatch = cardText.match(
        /預計維修時間\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/,
      );
      const estimatedRepairTime = etrMatch?.[1] ?? null;

      let resolvedTime: string | null = null;
      if (historyMode) {
        const resolvedMatch = cardText.match(
          /排除時間\s*(\d{4}\/\d{1,2}\/\d{1,2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/,
        );
        resolvedTime = resolvedMatch?.[1] ?? null;
      }

      events.push({ date, title, status, cause, description, daysElapsed, estimatedRepairTime, resolvedTime });
    }
    return events;
  }, isHistory);
}

async function scrape(): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'zh-TW',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log('[scraper] Navigating to', SOURCE_URL);
    await page.goto(SOURCE_URL, {
      waitUntil: 'networkidle',
      timeout: NAVIGATION_TIMEOUT,
    });
    await page.waitForTimeout(PAGE_LOAD_WAIT);
    await dismissDialog(page);

    // ── Step 1: 海纜路由資料（從 JS bundle chunks） ──
    console.log('[scraper] === Extracting cable route data ===');
    const cables = await scrapeCables(page);
    console.log(`[scraper] Total: ${cables.length} cables extracted`);

    // ── Step 2: 連線統計 ──
    console.log('[scraper] === Extracting connection stats ===');
    const stats = await page.evaluate(() => {
      const text = document.body.innerText;
      const statsMatch = text.match(/(\d+)\s*正常\s*(\d+)\s*受影響\s*(\d+)\s*總計/);
      const timestamp =
        text.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/)?.[0] ?? '';
      return {
        normal: statsMatch ? parseInt(statsMatch[1], 10) : 0,
        affected: statsMatch ? parseInt(statsMatch[2], 10) : 0,
        total: statsMatch ? parseInt(statsMatch[3], 10) : 0,
        timestamp,
      };
    });
    console.log(
      `[scraper] Stats: ${stats.normal} normal, ${stats.affected} affected, ${stats.total} total`,
    );

    // ── Step 3: 發生中事件 ──
    console.log('[scraper] === Extracting active events ===');
    const activeEvents = await scrapeEvents(page, false);
    console.log(`[scraper] Found ${activeEvents.length} active events`);

    // ── Step 4: 切換到歷史事件 ──
    console.log('[scraper] === Extracting historical events ===');
    const dropdown = page.locator('select, [role="combobox"]').first();
    await dropdown.selectOption({ label: '歷史事件' });
    await page.waitForTimeout(VIEW_SWITCH_WAIT);

    // 滾動以載入所有歷史事件
    const scrollArea = page.locator('[data-radix-scroll-area-viewport]');
    if (await scrollArea.isVisible()) {
      for (let i = 0; i < 10; i++) {
        await scrollArea.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await page.waitForTimeout(300);
      }
    }

    const historicalEvents = await scrapeEvents(page, true);
    console.log(`[scraper] Found ${historicalEvents.length} historical events`);

    return {
      scrapeTime: new Date().toISOString(),
      source: SOURCE_URL,
      stats,
      activeEvents,
      historicalEvents,
      cables,
    };
  } finally {
    await browser.close();
  }
}

// ─── Output ───────────────────────────────────────────────────────

function writeCables(cables: CableData[], cablesDir: string): void {
  fs.mkdirSync(cablesDir, { recursive: true });

  for (const cable of cables) {
    const filename = CABLE_ID_TO_FILENAME[cable.id] ?? cable.id;
    const filePath = path.join(cablesDir, `${filename}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cable, null, 2) + '\n', 'utf-8');
  }
  console.log(`[scraper] Written ${cables.length} cable files to ${cablesDir}`);
}

function writeEvents(result: ScrapeResult, eventsDir: string): void {
  fs.mkdirSync(eventsDir, { recursive: true });

  fs.writeFileSync(
    path.join(eventsDir, 'active.json'),
    JSON.stringify(
      { scrapeTime: result.scrapeTime, source: result.source, stats: result.stats, events: result.activeEvents },
      null, 2,
    ) + '\n',
    'utf-8',
  );

  fs.writeFileSync(
    path.join(eventsDir, 'history.json'),
    JSON.stringify(
      { scrapeTime: result.scrapeTime, source: result.source, events: result.historicalEvents },
      null, 2,
    ) + '\n',
    'utf-8',
  );

  fs.writeFileSync(
    path.join(eventsDir, 'stats.json'),
    JSON.stringify(
      { scrapeTime: result.scrapeTime, source: result.source, ...result.stats },
      null, 2,
    ) + '\n',
    'utf-8',
  );

  console.log(`[scraper] Written event files to ${eventsDir}`);
}

// ─── CLI Entry ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  const cablesDir = process.env.CABLES_DIR ?? DEFAULT_CABLES_DIR;
  const eventsDir = process.env.EVENTS_DIR ?? DEFAULT_EVENTS_DIR;

  console.log('[scraper] Starting SMC submarine cable scraper');
  console.log(`[scraper] Cables output: ${cablesDir}`);
  console.log(`[scraper] Events output: ${eventsDir}`);
  console.log(`[scraper] Dry run: ${isDryRun}`);

  const result = await scrape();

  if (isDryRun) {
    console.log('\n--- DRY RUN SUMMARY ---');
    console.log(`Cables: ${result.cables.length}`);
    result.cables.forEach((c) =>
      console.log(`  ${c.id}: ${c.name} (${c.segments.length} segs, paths: ${c.available_path.length})`),
    );
    console.log(`Active events: ${result.activeEvents.length}`);
    console.log(`Historical events: ${result.historicalEvents.length}`);
    console.log(`Stats: ${JSON.stringify(result.stats)}`);
  } else {
    writeCables(result.cables, cablesDir);
    writeEvents(result, eventsDir);
  }

  console.log('[scraper] Done!');
}

main().catch((err) => {
  console.error('[scraper] Fatal error:', err);
  process.exit(1);
});
