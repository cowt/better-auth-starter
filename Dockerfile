FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY . .

RUN bun run build

EXPOSE 3000

CMD ["./server"]