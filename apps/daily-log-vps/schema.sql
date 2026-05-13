CREATE TABLE IF NOT EXISTS entries (
  date date PRIMARY KEY,
  did_today text,
  doing_tomorrow text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habit_types (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('boolean', 'number')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habit_logs (
  habit_type_id integer REFERENCES habit_types(id) ON DELETE CASCADE,
  date date NOT NULL,
  value jsonb NOT NULL,
  PRIMARY KEY (habit_type_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs (date);

INSERT INTO habit_types (name, kind) VALUES ('creatine', 'boolean')
  ON CONFLICT (name) DO NOTHING;
