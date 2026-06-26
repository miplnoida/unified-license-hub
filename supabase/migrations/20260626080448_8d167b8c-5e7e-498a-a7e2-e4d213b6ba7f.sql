UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"vidyarani@yopmail.com"'),
    updated_at = now()
WHERE user_id = '35da4b65-baa5-426c-be83-3991b03132f0'
  AND provider = 'email';