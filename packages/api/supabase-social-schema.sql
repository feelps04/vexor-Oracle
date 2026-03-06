-- Social tables for Vexor platform - Supabase compatible
-- Run this in Supabase SQL Editor or via psql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (links to Supabase auth.users via id)
CREATE TABLE IF NOT EXISTS social_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
  type VARCHAR(20) DEFAULT 'text',
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
  type VARCHAR(20) DEFAULT 'image',
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
  type VARCHAR(20) DEFAULT 'text',
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
  role VARCHAR(20) DEFAULT 'member',
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
CREATE INDEX IF NOT EXISTS idx_squad_messages ON social_squad_messages(squad_id, created_at DESC);

-- Notifications
CREATE TABLE IF NOT EXISTS social_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES social_users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  from_user_id UUID REFERENCES social_users(id) ON DELETE CASCADE,
  reference_id UUID,
  content TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON social_notifications(user_id, read, created_at DESC);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_user ON social_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user ON social_stories(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON social_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON social_follows(following_id);

-- RLS Policies for Supabase
ALTER TABLE social_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_squad_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_notifications ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public profiles are viewable by everyone" ON social_users FOR SELECT USING (true);
CREATE POLICY "Public posts are viewable by everyone" ON social_posts FOR SELECT USING (true);
CREATE POLICY "Public stories are viewable by everyone" ON social_stories FOR SELECT USING (expires_at > NOW());
CREATE POLICY "Public likes are viewable by everyone" ON social_likes FOR SELECT USING (true);
CREATE POLICY "Public comments are viewable by everyone" ON social_comments FOR SELECT USING (true);
CREATE POLICY "Public follows are viewable by everyone" ON social_follows FOR SELECT USING (true);
CREATE POLICY "Public squads are viewable by everyone" ON social_squads FOR SELECT USING (true);
CREATE POLICY "Squad messages viewable by members" ON social_squad_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM social_squad_members WHERE squad_id = social_squad_messages.squad_id AND user_id = auth.uid())
);

-- User policies (authenticated users can insert their own data)
CREATE POLICY "Users can insert their own profile" ON social_users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON social_users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own posts" ON social_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON social_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON social_posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stories" ON social_stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own stories" ON social_stories FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can like posts" ON social_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike posts" ON social_likes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can comment" ON social_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON social_comments FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can follow" ON social_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON social_follows FOR DELETE USING (auth.uid() = follower_id);

-- Messages policies
CREATE POLICY "Users can see their messages" ON social_messages FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can send messages" ON social_messages FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users can update received messages" ON social_messages FOR UPDATE USING (auth.uid() = to_user_id);

-- Squad policies
CREATE POLICY "Users can create squads" ON social_squads FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own squads" ON social_squads FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can join squads" ON social_squad_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Members can send squad messages" ON social_squad_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM social_squad_members WHERE squad_id = social_squad_messages.squad_id AND user_id = auth.uid())
);

-- Notifications policies
CREATE POLICY "Users can see own notifications" ON social_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON social_notifications FOR UPDATE USING (auth.uid() = user_id);

-- Function to auto-delete expired stories
CREATE OR REPLACE FUNCTION delete_expired_stories() RETURNS void AS $$
BEGIN
  DELETE FROM social_stories WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_social_users_updated_at BEFORE UPDATE ON social_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_social_posts_updated_at BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default AI user (using a fixed UUID)
INSERT INTO social_users (id, username, display_name, avatar, bio, verified, is_ai)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'vexor_core',
  'VEXOR AI',
  'https://api.dicebear.com/7.x/bottts/svg?seed=vexor',
  'Inteligência Artificial para Análise de Mercado',
  true,
  true
) ON CONFLICT (id) DO NOTHING;

-- Insert initial AI post
INSERT INTO social_posts (id, user_id, content, type, tags)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
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
