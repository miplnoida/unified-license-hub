DO $$
BEGIN
  EXECUTE 'UPDATE auth.users SET email = $1, updated_at = now() WHERE id = $2'
    USING 'vidyarani@yopmail.com', '35da4b65-baa5-426c-be83-3991b03132f0'::uuid;
END $$;