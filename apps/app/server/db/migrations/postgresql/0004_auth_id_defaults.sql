-- Better Auth's UUID mode delegates ID generation to Postgres. The initial
-- migration created these keys without the defaults in the generated schema.
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
