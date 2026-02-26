CREATE TABLE IF NOT EXISTS news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NULL,
  title text NOT NULL,
  url text NOT NULL,
  published_at timestamptz NOT NULL,
  summary text NULL,
  raw_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_news_articles_source_external_id ON news_articles(source, external_id);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at DESC);

CREATE TABLE IF NOT EXISTS news_favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_news_favorites_user_id ON news_favorites(user_id);
