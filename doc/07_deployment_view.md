# 07. Deployment View

## Docker Environment
- **Development**: 使用 `docker-compose.dev.yml`，支援 Hot Reload。
- **Production**: 使用 `docker-compose.prod.yml`，包含 Nginx 反向代理並啟用 host 網路。

## Infrastructure
- 可部署於 GCP, AWS 等雲端平台。
- 需要開啟 UDP 53 與 TCP 80 埠。
