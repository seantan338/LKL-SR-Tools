FROM python:3.11-slim

WORKDIR /app

# 安装必要的系统库 (供 PDF 解析与基础工具运行)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建必要的持久化目录
RUN mkdir -p uploads chroma_data

EXPOSE 8000

# 生产环境使用 uvicorn 启动：优先使用平台注入的 $PORT（如 Railway），本地 / docker-compose 默认 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
