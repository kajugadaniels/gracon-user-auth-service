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
const config_1 = require("@nestjs/config");
const database_1 = require("@gracon/database");
const bcrypt = __importStar(require("bcrypt"));
const encryption_service_1 = require("../src/common/crypto/encryption.service");
const fake_verified_users_1 = require("../src/common/seeding/fake-verified-users");
const USER_COUNT = 100;
const BCRYPT_ROUNDS = 12;
const TRANSACTION_MAX_WAIT_MS = 20_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const REQUIRED_SEED_FLAG = 'ALLOW_FAKE_VERIFIED_USERS_SEED';
const PRODUCTION_SEED_FLAG = 'ALLOW_PRODUCTION_FAKE_VERIFIED_USERS_SEED';
function enforceSeedSafetyGate() {
    const isAllowed = process.env[REQUIRED_SEED_FLAG] === 'true';
    const isProduction = process.env.APP_ENV === 'production';
    const isProductionAllowed = process.env[PRODUCTION_SEED_FLAG] === 'true';
    if (!isAllowed) {
        console.error(`Refusing to seed fake users. Set ${REQUIRED_SEED_FLAG}=true to run this development/test seed.`);
        process.exit(1);
    }
    if (isProduction && !isProductionAllowed) {
        console.error(`Refusing to seed fake users in production. Set ${PRODUCTION_SEED_FLAG}=true only for an approved controlled test environment.`);
        process.exit(1);
    }
}
async function createVerifiedUser(tx, user, passwordHash, encryption, verifiedAt) {
    await tx.user.create({
        data: {
            email: user.email,
            phoneNumber: user.phoneNumber,
            passwordHash,
            isVerified: true,
            isActive: true,
            isIdVerified: true,
            idVerifiedAt: verifiedAt,
            citizenIdentity: {
                create: {
                    identityType: database_1.IdentityType.NID,
                    nidEncrypted: encryption.encrypt(user.nid),
                    nidHash: encryption.hash(user.nid),
                    finEncrypted: null,
                    finHash: null,
                    surName: user.surName,
                    postNames: user.postNames,
                    sex: user.sex,
                    dateOfBirth: user.dateOfBirth,
                    countryOfBirth: 'Rwanda',
                },
            },
            platformId: {
                create: {
                    pidEncrypted: encryption.encrypt(user.pid),
                    pidHash: encryption.hash(user.pid),
                },
            },
        },
    });
}
async function loadExistingContactSets(prisma) {
    const existingUsers = await prisma.user.findMany({
        select: { email: true, phoneNumber: true },
    });
    return {
        emails: new Set(existingUsers.map((user) => user.email)),
        phones: new Set(existingUsers
            .map((user) => user.phoneNumber)
            .filter((phoneNumber) => Boolean(phoneNumber))),
    };
}
async function seedVerifiedUsers() {
    enforceSeedSafetyGate();
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is not set.');
        process.exit(1);
    }
    const prisma = (0, database_1.createPrismaClient)();
    const encryption = new encryption_service_1.EncryptionService(new config_1.ConfigService());
    try {
        const passwordHash = await bcrypt.hash(fake_verified_users_1.FAKE_VERIFIED_USER_PASSWORD, BCRYPT_ROUNDS);
        const existingContacts = await loadExistingContactSets(prisma);
        const users = (0, fake_verified_users_1.generateFakeVerifiedUsers)(USER_COUNT, existingContacts.emails, existingContacts.phones);
        const now = new Date();
        let created = 0;
        let skipped = 0;
        await prisma.$transaction(async (tx) => {
            for (const user of users) {
                const existingIdentity = await tx.citizenIdentity.findFirst({
                    where: { nidHash: encryption.hash(user.nid) },
                    select: { id: true },
                });
                if (existingIdentity) {
                    skipped += 1;
                    continue;
                }
                await createVerifiedUser(tx, user, passwordHash, encryption, now);
                created += 1;
            }
        }, {
            maxWait: TRANSACTION_MAX_WAIT_MS,
            timeout: TRANSACTION_TIMEOUT_MS,
        });
        return { created, skipped };
    }
    finally {
        await prisma.$disconnect();
    }
}
seedVerifiedUsers()
    .then((result) => {
    console.log(`Created ${result.created} fake verified users. Skipped ${result.skipped} existing users. Shared password: ${fake_verified_users_1.FAKE_VERIFIED_USER_PASSWORD}`);
})
    .catch((error) => {
    console.error('Fake verified user seed failed:', error);
    process.exit(1);
});
//# sourceMappingURL=seed-verified-users.js.map