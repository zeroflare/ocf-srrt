# SRRT - DNS Analyzer (ocf-srrt)

這是一個專為資安分析設計的 **即時 DNS 流量監控系統 (Real-time DNS Traffic Analyzer)**。
採用 Monorepo 架構，結合底層封包擷取與現代化前端視覺化技術，旨在提供隱私優先、無狀態的網路可觀測性。

---

## 技術棧 (Tech Stack)

### Backend (Golang)
- **核心**: Go 1.24+, `gopacket` (libpcap), `miekg/dns`.
- **通訊**: `gorilla/websocket` 實現即時資料推送.
- **豐富化**: `geoip2-golang` (MaxMind) 進行地理位置與 ASN 標記.
- **架構**: In-Memory Ring Buffer, 無資料庫設計 (RAM Only).

### Frontend (React Ecosystem)
- **核心**: React 19, TypeScript, Vite.
- **樣式**: Tailwind CSS v4.
- **狀態**: Zustand (Global State), TanStack Table (Data Grid).
- **視覺化**: Recharts, React Simple Maps (Cyber Map).
- **多國語言**: i18next (支援中/英切換).

### Deployment
- **容器化**: Docker, Docker Compose.
- **網絡模式**: 支援 `host` 與 `bridge` 模式 (優化 UDP 效能).

---

## 目錄結構

```bash
.
├── backend/            # Go 模組：負責 DNS 監聽、GeoIP 查詢及 WebSocket 廣播
│   ├── cmd/            # 程式進入點 (main.go)
│   ├── internal/       # 內部核心邏輯 (DNS, Buffer, GeoIP, Recognition)
│   └── data/           # 靜態資源 (MMDB 與 apps.json)
├── frontend/           # React 應用：負責顯示即時 DNS 紀錄及統計面板
│   ├── src/            # 前端原始碼
│   └── public/locales  # i18n 翻譯檔
├── terraform/          # IaC 設定檔 (GCP/AWS 部署參考)
└── docker-compose.yml  # 服務編排配置
```

---

## 快速啟動 (Quick Start)

### 1. 準備環境與資料
本專案依賴 MaxMind GeoLite2 資料庫，請自行下載以下檔案並放置於 `backend/data/` 目錄：
- `GeoLite2-City.mmdb`
- `GeoLite2-ASN.mmdb`

### 2. 使用 Docker Compose 啟動
```bash
# 建置並啟動服務
docker-compose up --build
```
- **Frontend**: [http://localhost:80](http://localhost:80)
- **Backend API**: [http://localhost:8080](http://localhost:8080)

### 3. 驗證與測試流量
在 macOS 或 Docker 環境下，需手動發送 DNS 查詢至容器以查看效果：
```bash
# 指定向本機 Port 53 查詢
dig @localhost -p 53 google.com
```

---

## 系統特性 (SRRT 規格)

### 核心功能
- **隱私優先**: 數據純 In-Memory，重啟服務即銷毀，不留痕跡。
- **高效能 UDP**: 基於 `miekg/dns` 的非同步處理邏輯。
- **記憶體管理**:
    - **Ring Buffer**: 每個 Session (來源 IP) 限制 5000 筆紀錄，防止 OOM。
    - **TTL 清理**: 背景 GC 每分鐘執行，自動釋放超過 10 分鐘未活躍的 Session。
    - **Circuit Breaker**: 全域最大 2000 個併發 Session 保護。

### 智慧分析
- **ASN Enrichment**: 自動識別 ISP 資訊 (如 Google, CHT, Akamai)。
- **App Recognition**: 根據 `apps.json` 的正則表達式自動歸類流量來源。
- **跨境流量標記**: 根據 `LOCAL_COUNTRY` (預設 `TW`) 自動判斷並標記跨境連線。

### 現代化介面
- **Cyber Map**: 視覺化台灣連出至全球的動態路徑。
- **Throttling**: 前端實作節流機制，確保高頻查詢下 UI 依然流暢。
- **多國語言**: 支援繁體中文與英文即時切換。
- **數據導出**: 支援將當前緩衝區紀錄匯出為 CSV。

---

## 開發者指南

### 1. 使用 Docker Compose (推薦)
這是最快且最一致的開發環境，會自動處理網路與依賴。
```bash
# 啟動所有服務 (包含自動編譯)
docker-compose up --build

# 若只需重啟前端 (加速開發)
docker-compose up -d frontend
```

### 2. 本地原生開發 (Native Development)
若需要進行深度偵錯，可分別在後端與前端執行：

#### Backend (Go)
```bash
cd backend
go mod tidy
# 執行 (需要 sudo 權限以監聽 Port 53)
# 可透過 NETWORK_INTERFACE 環境變數指定網卡 (macOS 通常為 en0)
sudo NETWORK_INTERFACE=en0 go run cmd/main.go
```

#### Frontend (React)
```bash
cd frontend
pnpm install
pnpm dev
```

---

## ⚖️ 授權 (License)
MIT License. GeoIP data provided by [MaxMind](https://www.maxmind.com).