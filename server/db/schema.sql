CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  nome_time TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  round_number INTEGER,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  cartola_id INTEGER UNIQUE,
  nickname TEXT,
  name TEXT,
  photo_url TEXT
);

CREATE TABLE IF NOT EXISTS player_round_data (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  round_id INTEGER REFERENCES rounds(id),
  position_id INTEGER,
  club_id INTEGER,
  price REAL,
  average_score REAL,
  status_id INTEGER,
  UNIQUE(player_id, round_id)
);

CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY,
  name TEXT,
  abbreviation TEXT,
  shield_url TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  round_id INTEGER REFERENCES rounds(id),
  home_club_id INTEGER,
  away_club_id INTEGER,
  match_date TEXT,
  valid INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS player_scouts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  round_number INTEGER NOT NULL,
  scout_data TEXT NOT NULL DEFAULT '{}',
  pontuacao REAL NOT NULL DEFAULT 0,
  UNIQUE(player_id, round_number)
);

CREATE TABLE IF NOT EXISTS draft_eligible_override (
  cartola_id INTEGER PRIMARY KEY,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS draft_participants (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES draft_sessions(id),
  name TEXT,
  formation TEXT,
  pick_order INTEGER
);

CREATE TABLE IF NOT EXISTS draft_picks (
  id SERIAL PRIMARY KEY,
  session_id TEXT,
  participant_id TEXT,
  cartola_id INTEGER,
  overall_pick INTEGER,
  picked_at TEXT
);
