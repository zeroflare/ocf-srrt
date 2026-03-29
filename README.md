# SRRT - DNS Analyzer (ocf-srrt)

專為資安分析設計的 **即時 DNS 流量監控系統 (Real-time DNS Traffic Analyzer)**。
採用 Monorepo 架構，結合 DNS Proxy 攔截與現代化前端視覺化技術，提供隱私優先、無狀態的網路可觀測性。

---

## 技術棧 (Tech Stack)

### Backend (Golang)
- **核心**: Go 1.24+, `miekg/dns`（DNS Proxy 模式，監聽 UDP/TCP :53）
- **通訊**: `gorilla/websocket` 即時資料推送（支援跨裝置 Subscribe 切換監控目標）
- **富化**: `geoip2-golang` (MaxMind) 地理位置（Country/City/Subdivision/Coords）與 ASN/ISP 標記
- **識別引擎**: 三層識別邏輯（Exact Match → Regex → Heuristic）
- **路徑追蹤**: MTR (`mtr --report --json`) 整合三階段地理修正（延遲啟發式 → rDNS PoP → ccTLD）
- **架構**: In-Memory Ring Buffer，無資料庫設計（RAM Only）
- **開發**: `Air` (Hot Reload)

### Frontend (React Ecosystem)
- **核心**: React 19, TypeScript 5.9+, Vite 7
- **樣式**: Tailwind CSS v4, Lucide Icons
- **狀態**: Zustand 5（3 個 Store：DNS、Traceroute、Cable）
- **視覺化**: MapLibre GL 5（CyberMap + TraceMap），Recharts 3（流量圖表），TanStack Table 8（資料表格）
- **多國語言**: i18next（中/英切換）
- **導覽**: react-joyride 引導式導覽

### Deployment
- **容器化**: Docker, Docker Compose（Multi-stage build）
- **環境分離**: 獨立的開發 (`dev.yml`) 與生產 (`prod.yml`) 配置
- **網路模式**: 生產環境使用 Docker `host` 模式以獲取真實 Client IP
- **反向代理**: Nginx + HTTPS (Let's Encrypt)

---

## 目錄結構

```
.
├── backend/                # Go 核心服務
│   ├── cmd/                # 程式進入點 (main.go)
│   ├── internal/           # 核心邏輯
│   │   ├── api/            # HTTP 路由、WebSocket Hub、Traceroute Handler
│   │   ├── auth/           # Token Store (UUID ↔ IP)
│   │   ├── buffer/         # Per-IP Ring Buffer
│   │   ├── dns/            # DNS Proxy (miekg/dns)、Enrichment Pipeline
│   │   ├── geoip/          # MaxMind MMDB 查詢 (Country/City/ASN)
│   │   ├── osfingerprint/  # OS 指紋辨識
│   │   ├── ratelimit/      # Rate Limiter + Semaphore
│   │   ├── recognition/    # 三層應用識別引擎
│   │   ├── traceroute/     # MTR 執行、GeoIP 修正、快取
│   │   └── types/          # 共用 struct 定義
│   ├── data/               # 靜態資源 (MMDB + app.json)
│   └── .air.toml           # Hot Reload 設定
├── frontend/               # React 前端應用
│   ├── src/
│   │   ├── components/     # UI 元件 (CyberMap, LiveTable, HopTable, TraceMap...)
│   │   ├── stores/         # Zustand stores
│   │   ├── hooks/          # Custom hooks (WebSocket, Mock, SharedReport, Tour)
│   │   └── utils/          # 工具函式 (geo, cloudProvider, appInfo...)
│   └── nginx.conf          # 生產環境 Nginx 設定
├── doc/                    # arc42 架構文件
├── docker-compose.dev.yml  # 開發環境
├── docker-compose.prod.yml # 生產環境
└── README.md
```

---

## 快速啟動 (Quick Start)

### 1. 準備資料庫
本專案依賴 MaxMind GeoLite2 資料庫，請自行下載以下檔案並放置於 `backend/data/` 目錄：
- `GeoLite2-City.mmdb`
- `GeoLite2-ASN.mmdb`

### 2. 選擇運行模式

#### 開發環境 (Development)
支援 Hot Reload。修改 Go 或 React 程式碼後自動更新，無需重啟容器。

```bash
docker compose -f docker-compose.dev.yml up --build
```
- **Frontend**: http://localhost (Vite Dev Server via port 80)
- **Backend**: http://localhost:8080 (Air Runner)
- **DNS**: `localhost:1053` (UDP/TCP)

#### 生產環境 (Production)
使用編譯後的 Go Binary 與 Nginx 靜態服務，啟用 host 網路模式。

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- **Dashboard**: https://your-domain (Nginx + Let's Encrypt)

---

## 雲端部署指南 (GCP/AWS)

### 1. 基礎設施準備
- **VM 規格**: 建議 e2-medium (2 vCPU, 4GB RAM) 以上
- **防火牆規則**: 開啟 `UDP:53`, `TCP:53`, `TCP:80`, `TCP:443`

### 2. 打包與上傳

```bash
# 本機打包
tar -czf deploy.tar.gz --exclude='node_modules' --exclude='.git' --exclude='frontend/dist' .

# 上傳至 VM (GCP 範例)
gcloud compute scp deploy.tar.gz <VM_NAME>:~

# VM 內解壓與啟動
ssh <VM_NAME>
mkdir srrt && tar -xzf deploy.tar.gz -C srrt/
cd srrt
sudo docker compose -f docker-compose.prod.yml up -d --build
```

### 3. DNS 測試

```bash
dig @<PUBLIC_IP> google.com
```

---

## 系統特性

### 核心與隱私
- **隱私優先**: 數據純 In-Memory（Ring Buffer），服務重啟即銷毀
- **真實 IP 還原**: 生產環境 Docker host 模式，直接讀取 Layer 3 IP Header
- **跨裝置監控**: 支援從電腦 Dashboard 監控手機等其他裝置的 DNS 流量（透過 WebSocket Subscribe 動態切換目標 IP，解決 Dual-stack 網路下 IPv4/IPv6 位址不匹配問題）
- **智慧緩衝管理**: 單一 IP 限制 5000 筆紀錄，背景 GC 每分鐘清理閒置 10 分鐘的 Session
- **三層快取**: DNS 回應（30s）、Probe 結果（10min）、Traceroute 結果（5min）

### 智慧分析
- **三層識別引擎**: Exact Match → Regex Pattern → Heuristic Guessing
- **GeoIP 城市級精度**: 透過 MaxMind City DB 取得 Country、City、Subdivision、ASN/ISP
- **OS 指紋辨識**: 根據 DNS 查詢模式識別 Android/iOS/Windows
- **境外流量偵測**: GeoIP 國家比對 + ICMP Ping 延遲驗證

### 視覺化戰情室
- **CyberMap**: MapLibre GL 海纜地圖，台灣可用路徑高亮，整合 DNS 查詢點與 Traceroute 路徑視覺化，節點 Hover 顯示 IP/城市/ISP/延遲
- **LiveTable**: 即時 DNS 查詢列表，Cloud Provider badge，Country · City 顯示，點擊觸發 MTR 追蹤（IPv6 自動改用 Domain）
- **MTR 路徑追蹤**:
  - 支援 TCP/ICMP 模式切換
  - **TraceMap**: 延遲漸變色路徑，同座標跳點自動散開（fan-out），流向動畫
  - **HopTable**: Loss%/Avg/Best/Worst/StDev 統計，Country · City 顯示
  - 三階段地理修正（延遲啟發式 → rDNS PoP → ccTLD）
  - 支援 URL 壓縮分享

### 報告與分享
- **ReportModal**: 分析報告產生，統計國內外流量佔比
- **URL 壓縮分享**: pako deflate → Base64 編碼，無需後端儲存

---

## 環境變數

### Backend
| 變數 | 說明 | 預設值 |
|------|------|--------|
| `LOCAL_COUNTRY` | 本地國碼（境外流量偵測） | — |
| `NETWORK_INTERFACE` | 網路介面 | `eth0` |
| `ASN_DB_PATH` | ASN MMDB 路徑 | `data/GeoLite2-ASN.mmdb` |
| `GEOIP_DB_PATH` | GeoIP MMDB 路徑 | `data/GeoLite2-City.mmdb` |
| `RULES_PATH` | 應用識別規則路徑 | `data/app.json` |
| `DNS_UPSTREAMS` | 上游 DNS（逗號分隔） | `1.1.1.1:53,8.8.8.8:53,...` |
| `TRUSTED_PROXIES` | 信任的代理 IP | — |
| `ALLOWED_ORIGINS` | WebSocket 允許來源 | — |

### Frontend
| 變數 | 說明 | 預設值 |
|------|------|--------|
| `VITE_USE_MOCK` | 啟用 Mock 資料 | `false` |

---

## API 端點

| Endpoint | Method | Auth | 用途 |
|----------|--------|------|------|
| `/ws` | WebSocket | Token | 即時 DNS 記錄串流（支援 `subscribe` 訊息切換監控 IP） |
| `/api/token` | GET | None | 取得 session token |
| `/api/traceroute` | GET | Token | 執行 MTR 路徑追蹤 |
| `/health` | GET | None | 健康檢查 |

---

## 架構文件

完整的 arc42 架構文件位於 [`doc/`](doc/) 目錄。

---

## 授權 (License)

MIT License. GeoIP data provided by MaxMind. Icons provided by Lucide.
