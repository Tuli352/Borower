-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "type" TEXT NOT NULL DEFAULT 'EMAIL',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "joinDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rides" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL NOT NULL DEFAULT 5.0,
    "password" TEXT DEFAULT '',
    "otp" TEXT,
    "otpExpiry" DATETIME,
    "googleId" TEXT,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("createdAt", "email", "id", "joinDate", "name", "password", "phone", "rating", "rides", "status", "updatedAt") SELECT "createdAt", "email", "id", "joinDate", "name", "password", "phone", "rating", "rides", "status", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");
CREATE TABLE "new_Rider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "vehicle" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 5.0,
    "totalRides" INTEGER NOT NULL DEFAULT 0,
    "earnings" REAL NOT NULL DEFAULT 0.0,
    "joinDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" REAL,
    "longitude" REAL,
    "password" TEXT DEFAULT '',
    "otp" TEXT,
    "otpExpiry" DATETIME,
    "googleId" TEXT,
    "avatar" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Rider" ("createdAt", "earnings", "email", "id", "joinDate", "latitude", "longitude", "name", "password", "phone", "plateNumber", "rating", "status", "totalRides", "updatedAt", "vehicle") SELECT "createdAt", "earnings", "email", "id", "joinDate", "latitude", "longitude", "name", "password", "phone", "plateNumber", "rating", "status", "totalRides", "updatedAt", "vehicle" FROM "Rider";
DROP TABLE "Rider";
ALTER TABLE "new_Rider" RENAME TO "Rider";
CREATE UNIQUE INDEX "Rider_email_key" ON "Rider"("email");
CREATE UNIQUE INDEX "Rider_phone_key" ON "Rider"("phone");
CREATE UNIQUE INDEX "Rider_googleId_key" ON "Rider"("googleId");
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "totalVehicles" INTEGER NOT NULL DEFAULT 0,
    "activeVehicles" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0.0,
    "password" TEXT DEFAULT '',
    "otp" TEXT,
    "otpExpiry" DATETIME,
    "googleId" TEXT,
    "avatar" TEXT,
    "joinDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Vendor" ("activeVehicles", "companyName", "contactPerson", "createdAt", "email", "id", "joinDate", "password", "phone", "revenue", "status", "totalVehicles", "updatedAt") SELECT "activeVehicles", "companyName", "contactPerson", "createdAt", "email", "id", "joinDate", "password", "phone", "revenue", "status", "totalVehicles", "updatedAt" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE UNIQUE INDEX "Vendor_email_key" ON "Vendor"("email");
CREATE UNIQUE INDEX "Vendor_phone_key" ON "Vendor"("phone");
CREATE UNIQUE INDEX "Vendor_googleId_key" ON "Vendor"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
