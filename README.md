# SRRT - DNS Analyzer (ocf-srrt)

這是一個專為資安分析設計的 **即時 DNS 流量監控系統 (Real-time DNS Traffic Analyzer)**。
採用 Monorepo 架構，結合底層封包擷取 (Packet Sniffing) 與現代化前端視覺化技術，旨在提供隱私優先、無狀態的網路可觀測性。

---

## 🛠 技術棧 (Tech Stack)

### Backend (Golang)
- **核心**: Go 1.23+, `gopacket` (libpcap), `miekg/dns`.
- **開發體驗**: `Air` (Live Reload) 實現程式碼熱重載.
- **通訊**: `gorilla/websocket` 實現即時資料推送.
- **豐富化**: `geoip2-golang` (MaxMind) 進行地理位置與 ASN 標記.
- **識別引擎**: 三層識別邏輯 (Exact Match -> Regex -> Heuristic Guessing).
- **架構**: In-Memory Ring Buffer, 無資料庫設計 (RAM Only).

### Frontend (React Ecosystem)
- **核心**: React 19, TypeScript, Vite (HMR Enabled).
- **樣式**: Tailwind CSS v4, Lucide Icons.
- **狀態**: Zustand (Global Store), TanStack Table (Data Grid).
- **視覺化**: React Simple Maps (Mercator Projection + Pulse Animation).
- **多國語言**: i18next (支援中/英切換).

### Deployment
- **容器化**: Docker, Docker Compose (Multi-stage build).
- **架構分離**: 獨立的開發 (`dev.yml`) 與生產 (`prod.yml`) 配置.
- **網絡模式**: 支援 `host` 模式 (穿透 Docker NAT 獲取真實 Client IP).

---

## 📂 目錄結構

```bash
.
├── backend/            # Go 核心服務
│   ├── cmd/            # 程式進入點 (main.go)
│   ├── internal/       # 核心邏輯 (DNS Sniffer, Buffer, GeoIP, Recognition)
│   ├── data/           # 靜態資源 (MMDB 與 apps.json)
│   └── .air.toml       # Hot Reload 設定檔
├── frontend/           # React 前端應用
│   ├── src/            # 原始碼 (Components, Stores, Types)
│   └── nginx.conf      # 生產環境 Nginx 設定 (Reverse Proxy)
├── docker-compose.dev.yml   # [開發用] Hot Reload, Source Mount
├── docker-compose.prod.yml  # [生產用] Binary + Nginx, Host Network
└── README.md


## 🚀 快速啟動 (Quick Start)

### 1. 準備資料庫
本專案依賴 MaxMind GeoLite2 資料庫，請自行下載以下檔案並放置於 `backend/data/` 目錄：
- `GeoLite2-City.mmdb`
- `GeoLite2-ASN.mmdb`

---

### 2. 選擇運行模式

#### 🛠 模式 A：開發環境 (Development)
支援 Hot Reload。修改 Go 或 React 程式碼後，瀏覽器與後端會自動更新，無需重啟容器。

```bash
# 啟動開發環境 (掛載原始碼)
docker-compose -f docker-compose.dev.yml up --build
```
- **Frontend**: http://localhost (Vite Dev Server)
- **Backend**: http://localhost:8080 (Air Runner)

#### 🏭 模式 B：生產環境 (Production)
最佳化效能與安全性。使用編譯後的 Go Binary 與 Nginx 靜態服務，並啟用 host 網路模式以獲取真實來源 IP。

```bash
# 啟動生產環境 (Host Mode)
docker-compose -f docker-compose.prod.yml up -d --build
```
- **Dashboard**: http://<YOUR_VM_IP>

---

## ☁️ 雲端部署指南 (GCP/AWS)
由於生產環境需要監聽 UDP 53 並獲取真實 Client IP，建議使用以下標準流程：

### 1. 基礎設施準備
- **VM 規格**: 建議 e2-medium (2 vCPU, 4GB RAM) 以上。
- **防火牆規則 (Firewall)**: 必須開啟 `UDP:53`, `TCP:53`, `TCP:80`。
- **網路標記**: 確保 VM 套用上述防火牆規則。

### 2. 打包與上傳 (No-Git Strategy)
在本機將專案打包 (排除 node_modules) 並上傳至 VM，確保本地測試過的 mmdb 資料庫一同上線。

```bash
# 1. 本機打包
tar -czf deploy.tar.gz --exclude='node_modules' --exclude='.git' --exclude='frontend/dist' .

# 2. 上傳至 VM (GCP 範例)
gcloud compute scp deploy.tar.gz <VM_NAME>:~

# 3. VM 內解壓與啟動
ssh <VM_NAME>
mkdir srrt && tar -xzf deploy.tar.gz -C srrt/
cd srrt
sudo docker compose -f docker-compose.prod.yml up -d --build
```

### 3. DNS 測試
在任意機器上測試 DNS 解析是否通暢：

```bash
# 測試 GCP VM 的 Public IP
dig @<GCP_PUBLIC_IP> google.com
```

---

## ✨ 系統特性 (SRRT 規格)

### 🛡 核心與隱私
- **隱私優先**: 數據純 In-Memory (Ring Buffer)，服務重啟即銷毀。
- **真實 IP 還原**: 生產環境採用 Docker host 模式，繞過 NAT 直接讀取 Layer 3 IP Header。
- **智慧緩衝管理**:
    - 單一 IP 限制 5000 筆紀錄 (防止 OOM)。
    - 背景 GC 每分鐘自動清理閒置 10 分鐘的 Session。

### 🧠 智慧分析
- **三層識別引擎**:
    1. **Exact Match**: 精準比對 `apps.json` 規則。
    2. **Regex Pattern**: 支援 `*.google.com` 等萬用字元。
    3. **Heuristic Guessing**: 自動提取未知網域的 SLD (e.g., `api.notion.so` -> `Notion`)，大幅減少 "Unknown"。
- **ASN & GeoIP**: 自動標記 ISP (Google, Akamai, CHT) 與國家/城市。

### 📊 視覺化戰情室
- **Cyber Map**:
    - 採用 Mercator 投影，呈現真實航線感。
    - 擴充全球座標庫 (G7/BRICS/Asia)，解決地圖連線遺失問題。
    - 實作 SVG Pulse 動畫，即時呈現威脅擴散效果。
- **Live Table**: 支援 Source IP 追蹤、DNS 類型 (A/AAAA) 顯示與 CSV 匯出。

---

## ⚖️ 授權 (License)
MIT License. GeoIP data provided by MaxMind. Icons provided by Lucide.