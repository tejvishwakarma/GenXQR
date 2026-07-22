/*
  Warnings:

  - The values [MEMBER] on the enum `TeamRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TeamRole_new" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
ALTER TABLE "team_invites" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "team_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "TeamRole_new" USING ("role"::text::"TeamRole_new");
ALTER TABLE "team_invites" ALTER COLUMN "role" TYPE "TeamRole_new" USING ("role"::text::"TeamRole_new");
ALTER TYPE "TeamRole" RENAME TO "TeamRole_old";
ALTER TYPE "TeamRole_new" RENAME TO "TeamRole";
DROP TYPE "TeamRole_old";
ALTER TABLE "team_invites" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
COMMIT;

-- AlterTable
ALTER TABLE "team_invites" ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
