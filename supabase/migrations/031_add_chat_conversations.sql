-- 031_add_chat_conversations.sql
-- Persistance des conversations chat (brief V2 §3.2 — fix du bug "le chat
-- ne se souvient de rien"). Avant cette migration, chaque appel à
-- /api/v1/chat/ask repartait avec history = [un_seul_message], donc le LLM
-- ne connaissait jamais le contexte précédent. Le user demandait "et le
-- mois précédent ?" et SmartAnalyst répondait "je ne sais pas de quoi tu
-- parles". Bug fondamental.
--
-- Modèle :
--   - chat_conversations : 1 fil de discussion (titre + workspace + owner)
--   - chat_messages       : N messages dans le fil (user / assistant)
--
-- On ne persiste PAS les function_response intermédiaires de la boucle
-- de tool-calling : ils sont régénérés à chaque tour de question (Gemini
-- rappellera les bons tools selon la nouvelle question). Persister
-- uniquement les "tours visibles" = user.input + assistant.output.

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Titre dérivé du 1er message user (tronqué 60 chars). Modifiable par
  -- l'user plus tard (pas dans cette PR, mais le champ existe).
  title text NOT NULL DEFAULT 'Nouvelle conversation' CHECK (char_length(title) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_workspace
  ON public.chat_conversations(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
  ON public.chat_conversations(user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  -- 'user' = ce que le user a tapé. 'assistant' = la réponse Gemini.
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  -- Texte brut du message. Pour role='assistant' c'est la prose finale
  -- (avec les marqueurs [N] de citation préservés).
  content text NOT NULL CHECK (char_length(content) <= 50000),
  -- Sources/highlights pour les messages assistant (extrait au moment où
  -- on a généré la réponse — figés, on ne les régénère pas en relisant).
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Token usage pour ce tour, utile pour debug / audit / future
  -- compression d'historique.
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages(conversation_id, created_at ASC);

-- Touch helper : quand un message arrive dans une conversation, on bump
-- updated_at sur la conversation pour qu'elle remonte dans la liste.
CREATE OR REPLACE FUNCTION touch_chat_conversation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_messages_touch_conversation ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION touch_chat_conversation();

-- RLS : workspace_members peuvent lire/écrire leurs propres conversations.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_select ON public.chat_conversations;
CREATE POLICY chat_conversations_select ON public.chat_conversations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_conversations_insert ON public.chat_conversations;
CREATE POLICY chat_conversations_insert ON public.chat_conversations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_conversations_update ON public.chat_conversations;
CREATE POLICY chat_conversations_update ON public.chat_conversations
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_conversations_delete ON public.chat_conversations;
CREATE POLICY chat_conversations_delete ON public.chat_conversations
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM public.chat_conversations c
      JOIN public.workspace_members m ON m.workspace_id = c.workspace_id
      WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM public.chat_conversations c
      JOIN public.workspace_members m ON m.workspace_id = c.workspace_id
      WHERE m.user_id = auth.uid()
    )
  );
