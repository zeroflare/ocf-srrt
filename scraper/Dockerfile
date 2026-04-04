# ==========================================
# SMC Scraper — Playwright + Node.js
# ==========================================
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# 禁止 corepack 自動將 packageManager 寫入 package.json
# （容器以 read_only 模式執行，寫入會報 EROFS）
ENV COREPACK_ENABLE_AUTO_PIN=0

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 複製依賴描述
COPY package.json pnpm-lock.yaml* ./

# 安裝依賴（Playwright browsers 已包含在 base image 中）
RUN pnpm install --frozen-lockfile

# 複製腳本
COPY . .

# 預設輸出到 /output（volume mount 點）
ENV OUTPUT_DIR=/output

CMD ["pnpm", "run", "scrape"]
