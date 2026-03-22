"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
const BCRYPT_ROUNDS = 12;
async function main() {
    console.log('🌱 Starting seed...');
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    const firstName = process.env.SUPER_ADMIN_FIRST_NAME;
    const lastName = process.env.SUPER_ADMIN_LAST_NAME;
    if (!email || !password || !firstName || !lastName) {
        console.error('❌ Missing required environment variables:\n' +
            '   SUPER_ADMIN_EMAIL\n' +
            '   SUPER_ADMIN_PASSWORD\n' +
            '   SUPER_ADMIN_FIRST_NAME\n' +
            '   SUPER_ADMIN_LAST_NAME\n\n' +
            'Add them to your .env file before running the seed.');
        process.exit(1);
    }
    const existingSuperAdmin = await prisma.admin.findFirst({
        where: { role: client_1.AdminRole.SUPER_ADMIN },
    });
    if (existingSuperAdmin) {
        console.log(`✅ SUPER_ADMIN already exists (${existingSuperAdmin.email}) — skipping seed.`);
        return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#])[A-Za-z\d@$!%*?&^#]{8,}/;
    if (!passwordRegex.test(password)) {
        console.error('❌ SUPER_ADMIN_PASSWORD does not meet requirements:\n' +
            '   - Minimum 8 characters\n' +
            '   - At least one uppercase letter\n' +
            '   - At least one lowercase letter\n' +
            '   - At least one number\n' +
            '   - At least one special character (@$!%*?&^#)');
        process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const superAdmin = await prisma.admin.create({
        data: {
            firstName,
            lastName,
            email: email.toLowerCase().trim(),
            passwordHash,
            role: client_1.AdminRole.SUPER_ADMIN,
            isVerified: true,
            isActive: true,
            createdById: null,
        },
    });
    console.log(`✅ SUPER_ADMIN created successfully:\n` +
        `   ID:    ${superAdmin.id}\n` +
        `   Name:  ${superAdmin.firstName} ${superAdmin.lastName}\n` +
        `   Email: ${superAdmin.email}\n` +
        `   Role:  ${superAdmin.role}\n\n` +
        `⚠️  Remove SUPER_ADMIN_PASSWORD from your .env after seeding in production.`);
}
main()
    .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map