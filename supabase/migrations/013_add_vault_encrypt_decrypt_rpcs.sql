-- 013_add_vault_encrypt_decrypt_rpcs.sql
--
-- Crée les fonctions RPC publiques que apps/api/src/lib/vault.js appelle :
--   - public.vault_encrypt_secret(plaintext) → text (UUID, référence)
--   - public.vault_decrypt_secret(uuid)      → text (plaintext)
--
-- Le contrat exposé reste symétrique (text in, text out) pour ne pas changer
-- la signature côté JS. Sous le capot on délègue à Supabase Vault qui stocke
-- le ciphertext dans `vault.secrets` avec une key encryption key gérée par
-- Supabase.
--
-- Sécurité :
--   - SECURITY DEFINER : exécution sous le rôle propriétaire (postgres)
--   - EXECUTE révoqué pour anon / authenticated, accordé uniquement à service_role
--   - Conséquence : seul le backend (qui détient la service_role key) peut
--     chiffrer/déchiffrer. Le frontend n'a aucun accès, même s'il connaît un UUID.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- DROP avant CREATE car CREATE OR REPLACE FUNCTION ne permet pas de
-- changer le nom d'un paramètre. Sans le DROP, ré-exécuter la migration
-- échouerait avec "cannot change name of input parameter".
DROP FUNCTION IF EXISTS public.vault_encrypt_secret(TEXT);
DROP FUNCTION IF EXISTS public.vault_decrypt_secret(TEXT);

CREATE OR REPLACE FUNCTION public.vault_encrypt_secret(p_secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret_id UUID;
BEGIN
  IF p_secret IS NULL THEN
    RETURN NULL;
  END IF;
  secret_id := vault.create_secret(p_secret);
  RETURN secret_id::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_decrypt_secret(p_secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  plaintext TEXT;
BEGIN
  IF p_secret IS NULL OR p_secret = '' THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO plaintext
  FROM vault.decrypted_secrets
  WHERE id = p_secret::UUID;
  RETURN plaintext;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_encrypt_secret(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_encrypt_secret(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vault_encrypt_secret(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_encrypt_secret(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.vault_decrypt_secret(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_decrypt_secret(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vault_decrypt_secret(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_decrypt_secret(TEXT) TO service_role;
