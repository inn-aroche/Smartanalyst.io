-- 015_fix_vault_rpc_param_name.sql
--
-- Corrige une incohérence latente entre le code et la migration 013 :
--   - 013 a défini les RPC avec le paramètre `p_secret`
--   - mais apps/api/src/lib/vault.js appelle `.rpc('vault_*_secret', { secret: ... })`
--
-- PostgREST résout les fonctions par NOM d'argument : il cherchait
-- `vault_encrypt_secret(secret)` / `vault_decrypt_secret(secret)` et ne trouvait
-- que la variante `(p_secret)` => erreur
-- "Could not find the function public.vault_encrypt_secret(secret) in the schema cache".
-- Ce bug ne se manifestait pas tant que VAULT_ENABLED était false.
--
-- On recrée donc les fonctions avec le paramètre `secret` pour matcher le code.
--
-- Note importante (vault_decrypt_secret) : la vue `vault.decrypted_secrets` possède
-- une colonne `secret`. Avec un paramètre nommé `secret`, `WHERE id = secret::UUID`
-- devient ambigu ("column reference secret is ambiguous"). On lève l'ambiguïté avec
-- une variable locale `v_id` et un alias de table.
--
-- Contrat sécurité inchangé : SECURITY DEFINER, search_path vide, EXECUTE réservé à service_role.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

DROP FUNCTION IF EXISTS public.vault_encrypt_secret(TEXT);
DROP FUNCTION IF EXISTS public.vault_decrypt_secret(TEXT);

CREATE OR REPLACE FUNCTION public.vault_encrypt_secret(secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret_id UUID;
BEGIN
  IF secret IS NULL THEN
    RETURN NULL;
  END IF;
  secret_id := vault.create_secret(secret);
  RETURN secret_id::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_decrypt_secret(secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  plaintext TEXT;
BEGIN
  IF secret IS NULL OR secret = '' THEN
    RETURN NULL;
  END IF;
  v_id := secret::UUID;
  SELECT ds.decrypted_secret INTO plaintext
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_id;
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
