import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Seed Services
    const services = [
        { name: 'HydraFacial', duration: 60, price: 150.0 },
        { name: 'Botox Injection', duration: 30, price: 300.0 },
        { name: 'Deep Tissue Massage', duration: 90, price: 120.0 },
        { name: 'Chemical Peel', duration: 45, price: 100.0 },
        { name: 'Laser Hair Removal', duration: 60, price: 200.0 },
    ];

    for (const service of services) {
        await prisma.service.create({
            data: service,
        });
    }

    // Seed Staff
    const staffMembers = [
        { name: 'Dr. Emily Stone', role: 'Dermatologist' },
        { name: 'Sarah Jenkins', role: 'Esthetician' },
    ];

    for (const staff of staffMembers) {
        await prisma.staff.create({
            data: staff,
        });
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
