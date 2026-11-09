-- Prevent future tables created by postgres in public from receiving
-- broad default privileges for unauthenticated and authenticated clients.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
