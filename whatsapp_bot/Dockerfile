FROM node:20-slim

WORKDIR /app

# 安装必要的字体与依赖 (供 QR 码和轻量无头环境稳定运行)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖定义并安装
COPY package*.json ./
RUN npm install --omit=dev

# 复制业务源码
COPY . .

# 创建持久化认证文件夹
RUN mkdir -p .wwebjs_auth

EXPOSE 8002

ENV PORT=8002
ENV HOST=0.0.0.0

CMD ["node", "bot.js"]
