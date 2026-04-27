const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');
    await prisma.$connect();
    console.log('✓ Connected successfully!');

    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Query result:', result);

    await prisma.$disconnect();
    console.log('✓ Disconnected successfully!');
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
