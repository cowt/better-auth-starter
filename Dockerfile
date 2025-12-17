FROM oven/bun:1-alpine

WORKDIR /app

# 复制包文件并安装依赖（生产模式）
COPY package.json bun.lockb ./
RUN bun install --production

# 复制所有代码
COPY . .

# 构建生产 binary（仓库的 build 脚本会输出 ./server）
RUN bun run build

# 暴露端口
EXPOSE 3000

# 生产启动命令：运行编译好的 binary
CMD ["./server"]