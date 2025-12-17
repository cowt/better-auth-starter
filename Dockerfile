FROM oven/bun:1-alpine

WORKDIR /app

# 复制包文件并安装依赖
COPY package.json bun.lockb ./
RUN bun install --production

# 复制所有代码
COPY . .

# 生产构建（仓库的 build 脚本会编译成 binary）
RUN bun run build

# 暴露端口
EXPOSE 3000

# 启动命令（build 后自动运行编译好的 server）
CMD ["bun", "run", "start"]  # 如果 build 脚本已包含运行，用这个；或者直接 bun ./dist/index.js 根据实际