# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:24-alpine AS builder

WORKDIR /app

# 啟用 pnpm (Corepack)
RUN corepack enable && corepack prepare pnpm@latest --activate

# 複製 package.json 和 pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 使用 frozen-lockfile 安裝
# 保證安裝的版本與 pnpm-lock.yaml 完全鎖死，不會偷升級
RUN pnpm install --frozen-lockfile

# 複製程式碼 (包含 .env, tsconfig 等)
COPY . .

# 建置 (產出 dist 資料夾)
RUN pnpm run build

# ==========================================
# Stage 2: Serve
# ==========================================
FROM nginx:stable-alpine

# 移除 Nginx 預設頁面
RUN rm -rf /usr/share/nginx/html/*

# 複製編譯好的靜態檔案
COPY --from=builder /app/dist /usr/share/nginx/html

# 複製自訂的 Nginx 設定 (解決 SPA 路由問題)
# 請在 Dockerfile 同層目錄建立 nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 啟動 Nginx
CMD ["nginx", "-g", "daemon off;"]
