import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const users = await prisma.user.findMany({include:{role:true}});
  console.log('User list:');
  for(const u of users){
    console.log(`${u.email}\tRole:${u.role?.name}\tBranch:${u.branchId}\tDept:${u.departmentId}`);
  }
}
main().catch(e=>{console.error(e)}).finally(()=>prisma.$disconnect());
