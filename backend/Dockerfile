# ==========================================
# Stage 1: Builder (編譯階段)
# ==========================================
FROM golang:1.25-alpine AS builder

# 安裝編譯所需的系統依賴
RUN apk add --no-cache git

WORKDIR /app

# 利用 Docker Layer Caching
# 先複製 go.mod 和 go.sum，這樣只有依賴變更時才需要重新下載
COPY go.mod go.sum* ./
RUN go mod download

# 複製其餘程式碼
COPY . .

# 編譯設定
# -ldflags="-s -w": 移除除錯訊息 (Symbol Table)，大幅縮小二進位檔案體積
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o dns-analyzer ./cmd/main.go

# ==========================================
# Stage 2: Runner (執行階段)
# ==========================================
FROM alpine:latest

# 安裝執行期依賴
# tzdata: 設定時區 (Log 時間才會正確)
# ca-certificates: 支援 HTTPS 請求
# mtr: MTR 路徑追蹤工具
RUN apk --no-cache add ca-certificates tzdata mtr

# 設定時區為台北 (方便除錯 Log)
ENV TZ=Asia/Taipei

WORKDIR /home/dns-proxy

# 建立資料夾並設定權限
RUN mkdir -p data

# 從 builder 複製編譯好的程式
COPY --from=builder /app/dns-analyzer .

# 複製靜態資源 (app.json, GeoIP DB 等)
COPY --from=builder /app/data ./data

# 53: DNS 服務
# 8080: WebSocket 儀表板
EXPOSE 53/tcp
EXPOSE 53/udp
EXPOSE 8080/tcp

# 使用環境變數控制監聯介面 (預設 Docker 內是 eth0)
ENV NETWORK_INTERFACE=eth0

# 啟動
CMD ["./dns-analyzer"]
