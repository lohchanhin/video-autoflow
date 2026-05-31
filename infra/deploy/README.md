# VPS Git Deployment

目标部署方式：DigitalOcean Droplet + Git + Docker Compose。

服务器不再用手动复制文件作为主流程。生产代码应从 Git 仓库拉取，`.env`、上传文件、MongoDB 数据卷只保留在服务器本机。

## First-Time Setup On Droplet

```bash
apt update
apt install -y git curl ca-certificates docker.io docker-compose-plugin
systemctl enable --now docker

mkdir -p /opt
git clone <repo-url> /opt/ai-content-factory
cd /opt/ai-content-factory
cp .env.example .env
nano .env
```

`.env` 必须在服务器上手动配置，不提交到 Git。

## Deploy Latest Code

```bash
cd /opt/ai-content-factory
APP_DIR=/opt/ai-content-factory BRANCH=main bash infra/deploy/git-pull-deploy.sh
```

脚本会执行：

- `git fetch / pull --ff-only`
- `pnpm install`
- `pnpm type-check`
- `pnpm lint`
- workspace build
- `docker compose -f docker-compose.prod.yml up -d`

如果 Droplet 宿主机没有安装 Node/Corepack，脚本会自动用 `node:22-bookworm-slim` Docker 容器执行 pnpm install/build/check。

## Ports

- API: `http://<droplet-ip>:4000`
- Admin Web: `http://<droplet-ip>:5173`

正式公开前需要再加 Nginx / Caddy、HTTPS、备份、日志轮转和防火墙规则。

## Server Git Rules

- 服务器只做 `pull` 和部署，不在服务器上直接改业务代码。
- 服务器 `.env` 不提交。
- `uploads/` 不提交；以后接 GCS/MinIO 后再迁移产物存储。
- 如果 `git pull --ff-only` 失败，说明服务器有本地改动或远端历史变更，需要先人工检查，不能强制覆盖。
