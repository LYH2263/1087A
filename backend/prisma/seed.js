const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const logger = require('../src/logger');

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('123456', 12);
  const userPassword = await bcrypt.hash('123456', 12);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@bookshop.local',
      phone: '13800000000',
      passwordHash: adminPassword,
      role: 'ADMIN'
    }
  });

  const demoUser = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      email: 'demo@bookshop.local',
      phone: '13900000000',
      passwordHash: userPassword,
      role: 'USER'
    }
  });

  const categories = await Promise.all([
    '文学',
    '科技',
    '经管',
    '少儿'
  ].map((name) => prisma.category.upsert({
    where: { name },
    update: {},
    create: { name }
  })));

  const categoryMap = new Map(categories.map((cat) => [cat.name, cat.id]));

  const books = [
    {
      title: '时间的秩序',
      author: '卡洛·罗韦利',
      isbn: '9787559615026',
      description: '从物理学的角度重新理解时间与现实的边界。',
      priceCents: 4800,
      stock: 120,
      coverUrl: '/covers/cover-1.svg',
      category: '科技'
    },
    {
      title: '解忧杂货店',
      author: '东野圭吾',
      isbn: '9787544270878',
      description: '穿越时空的来信，连接人心的温暖故事。',
      priceCents: 3800,
      stock: 80,
      coverUrl: '/covers/cover-2.svg',
      category: '文学'
    },
    {
      title: '原则',
      author: '瑞·达利欧',
      isbn: '9787508672065',
      description: '投资与人生的系统化方法论。',
      priceCents: 6800,
      stock: 60,
      coverUrl: '/covers/cover-3.svg',
      category: '经管'
    },
    {
      title: '小王子',
      author: '安托万·德·圣埃克苏佩里',
      isbn: '9787020042494',
      description: '献给所有仍然保有童心的大人。',
      priceCents: 2800,
      stock: 150,
      coverUrl: '/covers/cover-4.svg',
      category: '少儿'
    },
    {
      title: '纳瓦尔宝典',
      author: '埃里克·乔根森',
      isbn: '9787521720805',
      description: '财富与幸福的智慧合集。',
      priceCents: 5200,
      stock: 75,
      coverUrl: '/covers/cover-5.svg',
      category: '经管'
    },
    {
      title: '人类简史',
      author: '尤瓦尔·赫拉利',
      isbn: '9787508660758',
      description: '从认知革命到现代社会的宏大叙事。',
      priceCents: 5800,
      stock: 90,
      coverUrl: '/covers/cover-6.svg',
      category: '科技'
    },
    {
      title: '活着',
      author: '余华',
      isbn: '9787506365433',
      description: '在苦难中寻找生命的意义。',
      priceCents: 3200,
      stock: 110,
      coverUrl: '/covers/cover-7.svg',
      category: '文学'
    },
    {
      title: 'DK儿童百科全书',
      author: 'DK出版社',
      isbn: '9787115585189',
      description: '图文并茂的儿童知识宝库。',
      priceCents: 8800,
      stock: 45,
      coverUrl: '/covers/cover-8.svg',
      category: '少儿'
    }
  ];

  for (const book of books) {
    await prisma.book.upsert({
      where: { isbn: book.isbn },
      update: {
        title: book.title,
        author: book.author,
        description: book.description,
        priceCents: book.priceCents,
        stock: book.stock,
        coverUrl: book.coverUrl,
        categoryId: categoryMap.get(book.category)
      },
      create: {
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        description: book.description,
        priceCents: book.priceCents,
        stock: book.stock,
        coverUrl: book.coverUrl,
        categoryId: categoryMap.get(book.category)
      }
    });
  }

  await prisma.address.upsert({
    where: { id: `addr-${demoUser.id}` },
    update: {},
    create: {
      id: `addr-${demoUser.id}`,
      userId: demoUser.id,
      recipient: '示例用户',
      phone: '13900000000',
      line1: '虹桥路 188 号',
      city: '上海',
      state: '上海',
      postalCode: '200051',
      isDefault: true
    }
  });

  logger.info('Seed data initialized');
}

main()
  .catch((error) => {
    logger.error('Seed failed', { error: error.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
