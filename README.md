# Bookshop Pro 智慧书店一体化平台

## 项目介绍
Bookshop Pro 是一个前后端分离的在线书店系统，覆盖了从用户浏览下单、支付模拟、订单流转到管理员运营管理的完整业务闭环。

项目采用 `Frontend + Backend + PostgreSQL` 架构，支持基于 Docker Compose 的一键启动，适合课程实训、业务原型验证和中小型项目二次开发。

## 项目功能

### 1. 用户端功能
- 用户注册、登录、退出登录、Token 刷新
- 忘记密码与重置密码
- 书籍查询（书名/作者/ISBN/分类/价格区间/排序）
- 查询条件状态保留（切换页面后返回可继续查询）
- 购物车管理（加购、改数量、删除、清空）
- 地址管理（新增、编辑、删除、设默认地址）
- 订单流程（生成待支付订单、模拟支付、取消订单、确认收货、订单评价）

### 2. 管理端功能
- 书籍管理（新增、编辑、上架/下架、封面上传）
- 分类管理（新增、删除）
- 订单管理（接单、发货、退款）
- 订单统计与报表导出（CSV）

### 3. 后端能力
- 基于 Express 的 REST API
- 基于 Prisma 的数据库访问
- Zod 参数校验与统一错误返回
- JWT 鉴权（Access Token + Refresh Token）
- 默认演示数据自动初始化（管理员/用户/分类/书籍）

## 技术栈

### 前端
- Vite
- Tailwind CSS
- Zod

### 后端
- Node.js
- Express
- Prisma
- Zod

### 数据库
- PostgreSQL 15

### 容器化
- Docker
- Docker Compose

## 项目目录结构

```text
.
├── backend/                  # 后端服务
│   ├── prisma/               # Prisma Schema 与种子数据
│   ├── scripts/              # 辅助脚本（如等待数据库）
│   ├── src/
│   │   ├── routes/           # API 路由（auth/books/cart/orders/admin...）
│   │   ├── middleware/       # 中间件
│   │   ├── utils/            # 工具函数
│   │   └── server.js         # 后端入口
│   └── Dockerfile
├── frontend/                 # 前端应用
│   ├── public/               # 静态资源
│   ├── src/
│   │   ├── handlers/         # 事件处理层
│   │   ├── validation/       # 表单校验规则
│   │   ├── views/            # 视图渲染层
│   │   ├── api.js            # API 请求封装
│   │   ├── state.js          # 全局状态
│   │   └── main.js           # 前端装配入口
│   ├── nginx/                # Nginx 配置
│   └── Dockerfile
├── docker-compose.yml        # 一键编排（前端/后端/数据库）
└── README.md
```

## 项目部署

### 方式一：Docker Compose 一键部署（推荐）

#### 1. 环境要求
- 已安装 Docker Desktop（或 Docker Engine + Compose）

#### 2. 启动项目
在项目根目录执行：

```bash
docker compose up --build
```

首次启动会自动完成：
- 依赖安装
- Prisma 生成
- 数据库连接等待
- 数据库结构同步（`prisma db push`）
- 种子数据初始化（`prisma db seed`）

#### 3. 访问地址
- 前端：`http://localhost:3000`
- 后端 API：`http://localhost:8000`
- 后端文档：`http://localhost:8000/docs`
- PostgreSQL：`localhost:5432`

#### 4. 停止服务
```bash
docker compose down
```

如需连同数据卷一起清理：
```bash
docker compose down -v
```

---

### 方式二：本地开发部署（不使用 Docker）

#### 1. 环境要求
- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

#### 2. 初始化数据库
在 PostgreSQL 中创建数据库，并准备连接串。

推荐环境变量（`backend/.env`）：

```env
PORT=8000
DATABASE_URL=postgresql://bookuser:bookpass@localhost:5432/bookshop?schema=public
JWT_SECRET=super-secret-access
JWT_REFRESH_SECRET=super-secret-refresh
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

#### 3. 启动后端
```bash
cd backend
pnpm install
pnpm prisma generate
pnpm prisma db push --accept-data-loss
pnpm prisma db seed
pnpm dev
```

#### 4. 启动前端
新开一个终端：

```bash
cd frontend
pnpm install
pnpm dev --host 0.0.0.0 --port 3000
```

## 默认测试账号
- 管理员：`admin / 123456`
- 普通用户：`demo / 123456`

## 常用命令

### 前端
```bash
cd frontend
pnpm dev
pnpm build
pnpm preview
```

### 后端
```bash
cd backend
pnpm dev
pnpm prisma generate
pnpm prisma db push --accept-data-loss
pnpm prisma db seed
```

## 注意事项
- 当前编排默认面向开发环境（支持热更新）。
- `prisma db push --accept-data-loss` 适合开发阶段，不建议直接用于生产环境迁移。
- 若需要生产部署，建议增加独立的 `prisma migrate deploy` 流程、反向代理与 HTTPS 配置。
