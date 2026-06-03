# SMC Submarine Cable Scraper

從 [台灣海纜動態地圖](https://smc.peering.tw/) 定時抓取海纜事件與連線統計資料。

---

## 目錄結構

```
scraper/
├── smc-scraper.ts       # 爬蟲主程式（Playwright + TypeScript）
├── package.json
├── tsconfig.json
├── Dockerfile           # 容器化執行環境
└── README.md

frontend/src/data/
├── cables/              # 靜態海纜路由資料（地理座標，手動維護）
│   ├── apg.json
│   ├── apcn2.json
│   └── ...
└── events/              # 爬蟲輸出（動態事件資料，自動更新）
    ├── active.json      # 發生中事件 + 連線統計
    ├── history.json     # 歷史事件
    └── stats.json       # 連線統計快照
```

---

## 輸出格式

### active.json

```json
{
  "scrapeTime": "2026-04-04T08:00:00.000Z",
  "source": "https://smc.peering.tw/",
  "stats": {
    "normal": 9,
    "affected": 8,
    "total": 17,
    "timestamp": "2026/04/04 00:10:44"
  },
  "events": [
    {
      "date": "2026/3/30",
      "title": "台馬三號芯線受損",
      "status": "部分斷線",
      "cause": "未知",
      "description": "From 中華電信公告...",
      "daysElapsed": 6,
      "estimatedRepairTime": null,
      "resolvedTime": null
    }
  ]
}
```

### history.json

```json
{
  "scrapeTime": "2026-04-04T08:00:00.000Z",
  "source": "https://smc.peering.tw/",
  "events": [
    {
      "date": "2026/3/14 10:15",
      "title": "C2C 香港方向斷線",
      "status": "斷線",
      "cause": "已排除",
      "description": "...",
      "daysElapsed": 1,
      "estimatedRepairTime": null,
      "resolvedTime": "2026/3/14 18:43"
    }
  ]
}
```

---

## 本地端測試

### 方法 A：直接執行（推薦開發用）

```bash
cd scraper

# 1. 安裝依賴
pnpm install

# 2. 安裝 Playwright 瀏覽器
npx playwright install chromium

# 3. Dry run — 只印出結果，不寫檔
pnpm run scrape:dry

# 4. 正式執行 — 寫入 frontend/src/data/events/
pnpm run scrape

# 5. 自訂輸出路徑
OUTPUT_DIR=./test-output pnpm run scrape
```

### 方法 B：Docker 執行

```bash
# 從專案根目錄
docker compose -f docker-compose.prod.yml --profile scraper run --rm scraper

# 或者獨立 build + run
cd scraper
docker build -t smc-scraper .
docker run --rm -v $(pwd)/../frontend/src/data/events:/output smc-scraper
```

### 方法 C：開發模式搭配 watch

```bash
cd scraper

# 每次存檔自動重新執行（開發調試用）
npx tsx watch smc-scraper.ts --dry-run
```

### 驗證測試

執行後檢查輸出：

```bash
# 確認檔案產生
ls -la frontend/src/data/events/

# 檢查 JSON 格式正確
cat frontend/src/data/events/active.json | python3 -m json.tool
cat frontend/src/data/events/history.json | python3 -m json.tool

# 確認事件數量合理
cat frontend/src/data/events/active.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Active events: {len(data[\"events\"])}')
print(f'Stats: {data[\"stats\"]}')
"
```

---

## GCE 部署指南

### 前置條件

- GCE VM 已部署 SRTT 主服務（docker-compose.prod.yml）
- VM 規格建議 e2-medium 以上（Playwright 需要約 512MB RAM）
- Docker + Docker Compose 已安裝

### Step 1：上傳 scraper 到 VM

```bash
# 從本機打包（含 scraper 目錄）
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='frontend/dist' \
  .

# 上傳到 GCE
gcloud compute scp deploy.tar.gz <VM_NAME>:~ --zone=<ZONE>

# SSH 進入 VM
gcloud compute ssh <VM_NAME> --zone=<ZONE>

# 解壓（假設 SRTT 已部署在 ~/srtt）
cd ~/srtt
tar -xzf ~/deploy.tar.gz
```

### Step 2：Build scraper image

```bash
cd ~/srtt

# 只 build scraper service
docker compose -f docker-compose.prod.yml --profile scraper build scraper
```

### Step 3：手動執行一次確認

```bash
# 先手動跑一次確認能正常抓取
docker compose -f docker-compose.prod.yml --profile scraper run --rm scraper

# 檢查輸出
ls -la frontend/src/data/events/
cat frontend/src/data/events/stats.json
```

### Step 4：設定 Cron 定時執行

```bash
# 編輯 crontab
crontab -e

# 加入以下排程（每天 UTC 00:00 = 台北 08:00）
0 0 * * * cd /home/<USER>/srtt && docker compose -f docker-compose.prod.yml --profile scraper run --rm scraper >> /var/log/smc-scraper.log 2>&1
```

### Step 5：設定 Systemd Timer（替代方案，更可靠）

建立 service 檔案：

```bash
sudo tee /etc/systemd/system/smc-scraper.service << 'EOF'
[Unit]
Description=SMC Submarine Cable Scraper
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=<YOUR_USER>
WorkingDirectory=/home/<YOUR_USER>/srtt
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --profile scraper run --rm scraper
StandardOutput=journal
StandardError=journal
TimeoutStartSec=300
EOF
```

建立 timer 檔案：

```bash
sudo tee /etc/systemd/system/smc-scraper.timer << 'EOF'
[Unit]
Description=Run SMC scraper daily at 08:00 Taipei time

[Timer]
OnCalendar=*-*-* 08:00:00
# Taipei = UTC+8, 所以 OnCalendar 需要搭配 timezone
# 或使用 Persistent=true 確保錯過的排程會補執行
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
```

啟用 timer：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now smc-scraper.timer

# 確認 timer 狀態
systemctl list-timers | grep smc

# 手動觸發一次測試
sudo systemctl start smc-scraper.service

# 查看執行日誌
journalctl -u smc-scraper.service -f
```

### Step 6：（選用）抓取後自動 rebuild frontend

如果希望事件資料更新後自動反映到前端：

```bash
sudo tee /etc/systemd/system/smc-scraper-rebuild.service << 'EOF'
[Unit]
Description=Rebuild SRTT frontend after scraper update
After=smc-scraper.service
BindsTo=smc-scraper.service

[Service]
Type=oneshot
User=<YOUR_USER>
WorkingDirectory=/home/<YOUR_USER>/srtt
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d --build frontend
StandardOutput=journal
StandardError=journal
TimeoutStartSec=600
EOF
```

然後在 `smc-scraper.service` 的 `[Unit]` 區段加上：

```ini
[Unit]
...
Wants=smc-scraper-rebuild.service
```

---

## Troubleshooting

### Playwright 在 GCE 上無法啟動

```bash
# 確認使用 Playwright 官方 Docker image（已包含所有瀏覽器依賴）
# 如果不用 Docker，需要安裝系統依賴：
npx playwright install-deps chromium
```

### 抓取結果為空

1. 網站可能改版，檢查 DOM 選擇器是否仍有效
2. 用 `--dry-run` 看原始輸出
3. 加上 `headless: false` 在 `smc-scraper.ts` 中以 GUI 模式除錯

### Docker 記憶體不足

Playwright + Chromium 至少需要 512MB RAM。調整 `mem_limit` 至 2g 以上。

---

## 資料來源說明

- 資料來源：[台灣海纜動態地圖](https://smc.peering.tw/)
- 該網站聲明：「資料僅供參考，需以各海纜官方為主」
- 爬蟲遵守合理使用原則，每日僅抓取一次
