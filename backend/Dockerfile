FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
  && pnpm config set registry https://registry.npmmirror.com \
  && pnpm install

COPY . .

RUN pnpm prisma generate

EXPOSE 8000

CMD ["sh", "-c", "node scripts/waitForDb.js && pnpm prisma db push --accept-data-loss && pnpm prisma db seed && pnpm dev"]
