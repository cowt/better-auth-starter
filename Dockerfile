FROM oven/bun:1-alpine

WORKDIR /app

# 复制包文件和正确的 lockfile
COPY package.json bun.lock ./
RUN bun install --production

# 复制所有代码
COPY . .

# 生产构建（输出 ./server binary）
RUN bun run build

# 给 binary 加执行权限（防止 exit code 11）
RUN chmod +x ./server

EXPOSE 3000

# 启动编译好的 binary
CMD ["./server"]