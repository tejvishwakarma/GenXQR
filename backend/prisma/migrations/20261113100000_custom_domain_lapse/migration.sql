-- When the owner's plan stopped including custom domains. The domain is
-- released 30 days later (custom-domain.service releaseLapsedDomains).
ALTER TABLE "custom_domains" ADD COLUMN "lapsedSince" TIMESTAMP(3);
