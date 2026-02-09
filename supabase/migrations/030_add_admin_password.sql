-- Add admin_password_hash to accounts for influencer dashboard access
ALTER TABLE accounts
ADD COLUMN admin_password_hash TEXT;

-- Add comment
COMMENT ON COLUMN accounts.admin_password_hash IS 'Hashed password for influencer dashboard access (PBKDF2 with salt)';
