-- 025_add_files_library.sql
-- Brief V2 §3.7B — Librairie de fichiers : upload de CSV/Excel/PDF/images
-- réutilisables dans le chat (matière première de l'agent, pas des KPI
-- structurés).
--
-- Stockage physique : bucket Supabase Storage privé `workspace-files`.
-- Table `files` = métadonnées + pointeur vers le storage path.

-- 1. Bucket de storage privé (les buckets Supabase sont des rows de
-- storage.buckets). Idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-files',
  'workspace-files',
  false,
  26214400, -- 25 Mo
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Table métadonnées.
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  -- uploaded → analyzed (si on en extrait du texte/résumé plus tard)
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'analyzed', 'error')),
  -- Métadonnées d'analyse (résumé, lignes, colonnes…) à terme.
  analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_workspace_created
  ON public.files (workspace_id, created_at DESC);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "files_select" ON public.files;
CREATE POLICY "files_select" ON public.files
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
-- Écriture via service_role (le backend gère l'upload + métadonnées).
