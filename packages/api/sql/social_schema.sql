-- Social tables for Vexor platform
-- Run: psql -d vexor -f social_schema.sql

-- Users (extends existing users if any)
CREATE TABLE IF NOT EXISTS social_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar TEXT,
  bio TEXT,
  verified BOOLEAN DEFAULT false,
  is_ai BOOLEAN DEFAULT false,
  squad_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts (feed)
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'text', -- text, image, video, reel, trade_signal
  media JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stories (expire in 24h)
CREATE TABLE IF NOT EXISTS social_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'image', -- image, video
  caption TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Likes
CREATE TABLE IF NOT EXISTS social_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Comments
CREATE TABLE IF NOT EXISTS social_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Followers
CREATE TABLE IF NOT EXISTS social_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Direct Messages
CREATE TABLE IF NOT EXISTS social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'text', -- text, image, video, trade_signal
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON social_messages(from_user_id, to_user_id);

-- Squads (Teams)
CREATE TABLE IF NOT EXISTS social_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  avatar TEXT,
  owner_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Squad Members
CREATE TABLE IF NOT EXISTS social_squad_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES social_squads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(squad_id, user_id)
);

-- Squad Messages (visible to all members)
CREATE TABLE IF NOT EXISTS social_squad_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES social_squads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_squad_messages ON social_squad_messages(squad_id, created_at DESC);

-- Notifications
CREATE TABLE IF NOT EXISTS social_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL, -- like, comment, follow, mention, squad_invite
  from_user_id UUID REFERENCES social_users(id) ON DELETE CASCADE,
  reference_id UUID, -- post_id, comment_id, etc
  content TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON social_notifications(user_id, read, created_at DESC);

-- Indexes for performance
CREATE INDEX idx_posts_user ON social_posts(user_id, created_at DESC);
CREATE INDEX idx_posts_created ON social_posts(created_at DESC);
CREATE INDEX idx_stories_user ON social_stories(user_id, expires_at);
CREATE INDEX idx_follows_follower ON social_follows(follower_id);
CREATE INDEX idx_follows_following ON social_follows(following_id);

-- Function to auto-delete expired stories
CREATE OR REPLACE FUNCTION delete_expired_stories() RETURNS void AS $$
BEGIN
  DELETE FROM social_stories WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Run cleanup every hour (requires pg_cron extension or external scheduler)
-- SELECT cron.schedule('delete_expired_stories', '0 * * * *', 'SELECT delete_expired_stories()');

-- Insert default AI user
INSERT INTO social_users (id, username, display_name, avatar, bio, verified, is_ai)
VALUES (
  'vexor-ai-0000-0000-0000-000000000001',
  'vexor_core',
  'VEXOR AI',
  'https://api.dicebear.com/7.x/bottts/svg?seed=vexor',
  'Inteligência Artificial para Análise de Mercado',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Insert demo user
INSERT INTO social_users (id, username, display_name, avatar, bio, verified)
VALUES (
  'demo-user-0000-0000-0000-000000000001',
  'trader_demo',
  'Demo Trader',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=trader',
  'Análise técnica e sentimento de mercado',
  true
) ON CONFLICT (id) DO NOTHING;

-- Insert demo squad
INSERT INTO social_squads (id, name, description, avatar, owner_id)
VALUES (
  'squad-traders-0000-0000-000000000001',
  'SQUAD_TRADERS',
  'Time de traders profissionais',
  'https://api.dicebear.com/7.x/identicon/svg?seed=squad',
  'demo-user-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Add demo user and AI to squad
INSERT INTO social_squad_members (squad_id, user_id, role) VALUES
  ('squad-traders-0000-0000-000000000001', 'demo-user-0000-0000-0000-000000000001', 'owner'),
  ('squad-traders-0000-0000-0000-000000000001', 'vexor-ai-0000-0000-0000-000000000001', 'member')
ON CONFLICT (squad_id, user_id) DO NOTHING;

-- Insert initial AI post
INSERT INTO social_posts (id, user_id, content, type, tags)
VALUES (
  'post-ai-0000-0000-0000-000000000001',
  'vexor-ai-0000-0000-0000-000000000001',
  '📊 ANÁLISE DE SENTIMENTO

O setor de TECNOLOGIA apresenta padrões de acumulação institucional.

Indicadores:
• RSI: 42.5 (neutro)
• MACD: Cruzamento de alta
• Volume: +23% acima da média

STATUS: PRONTO PARA EXECUÇÃO

#tecnologia #analise #trading',
  'text',
  ARRAY['tecnologia', 'analise', 'trading']
) ON CONFLICT (id) DO NOTHING;
