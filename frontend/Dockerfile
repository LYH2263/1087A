FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
  && pnpm config set registry https://registry.npmmirror.com \
  && pnpm install

COPY . .

EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "3000"]
