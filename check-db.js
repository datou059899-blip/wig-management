const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log('Checking database connection...');
    
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);
    
    const productCount = await prisma.product.count();
    console.log('Product count:', productCount);
    
    const influencerCount = await prisma.influencer.count();
    console.log('Influencer count:', influencerCount);
    
    const taskCount = await prisma.workTask.count();
    console.log('WorkTask count:', taskCount);
    
    const shipmentCount = await prisma.shipment.count();
    console.log('Shipment count:', shipmentCount);
    
    // Check if products exist
    if (productCount > 0) {
      const firstProduct = await prisma.product.findFirst();
      console.log('\nFirst product:', firstProduct?.name);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
