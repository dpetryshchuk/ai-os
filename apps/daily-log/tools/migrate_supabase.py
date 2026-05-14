import urllib.request, json, subprocess, sys

KEY = sys.argv[1]
URL = "https://wvhjxtuprtxjadqlakqq.supabase.co"

DB = open("/home/dima/daily-log/.env").read()
DB = [l.split("=",1)[1].strip() for l in DB.splitlines() if l.startswith("DATABASE_URL")][0]

def sb_get(table, cols):
    req = urllib.request.Request(
        URL + "/rest/v1/" + table + "?select=" + cols + "&order=date.asc&limit=2000",
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

entries = sb_get("entries", "date,did_today,doing_tomorrow")
habits  = sb_get("habits",  "date,upwork_apps,email_sent,creatine")
print(f"Fetched {len(entries)} entries, {len(habits)} habits")

sqls = []

# Ensure all three habit types exist
sqls.append(
    "INSERT INTO habit_types(name,kind) VALUES "
    "('upwork_apps','number'),('email_sent','boolean'),('creatine','boolean') "
    "ON CONFLICT(name) DO NOTHING;"
)

# Upsert entries
for e in entries:
    d = (e.get("did_today") or "").replace("'", "''")
    t = (e.get("doing_tomorrow") or "").replace("'", "''")
    sqls.append(
        f"INSERT INTO entries(date,did_today,doing_tomorrow) "
        f"VALUES('{e['date']}','{d}','{t}') "
        "ON CONFLICT(date) DO UPDATE SET "
        "did_today=EXCLUDED.did_today, doing_tomorrow=EXCLUDED.doing_tomorrow, updated_at=now();"
    )

# Upsert habit logs
for h in habits:
    date = h["date"]
    for name, val in [
        ("upwork_apps", h.get("upwork_apps")),
        ("email_sent",  h.get("email_sent")),
        ("creatine",    h.get("creatine")),
    ]:
        if val is None:
            continue
        v = str(val).lower() if isinstance(val, bool) else str(val)
        sqls.append(
            f"INSERT INTO habit_logs(habit_type_id,date,value) "
            f"VALUES((SELECT id FROM habit_types WHERE name='{name}'),'{date}','{v}') "
            "ON CONFLICT(habit_type_id,date) DO UPDATE SET value=EXCLUDED.value;"
        )

sql = "\n".join(sqls)
r = subprocess.run(["psql", DB, "-c", sql], capture_output=True, text=True)
if r.stdout: print(r.stdout)
if r.stderr: print("PSQL ERR:", r.stderr, file=sys.stderr)

# Verify
r2 = subprocess.run(
    ["psql", DB, "-c",
     "SELECT COUNT(*) FROM entries; "
     "SELECT COUNT(*) FROM habit_logs; "
     "SELECT id,name,kind FROM habit_types ORDER BY id;"],
    capture_output=True, text=True
)
print(r2.stdout)
