# VPS Guide — dmytropetryshchuk.com

Everything needed to operate and extend the server.

---

## Server

| | |
|---|---|
| **Provider** | Hetzner CX22 (~$5/mo) |
| **IP** | `46.225.78.10` |
| **OS** | Ubuntu 22.04 |
| **SSH user** | `dima` |
| **SSH** | `ssh dima@46.225.78.10` |
| **Domain registrar** | Porkbun |
| **Root domain** | `dmytropetryshchuk.com` |
| **Specs** | 2 vCPU, 4GB RAM |

---

## Installed software

- **Node.js** — app runtime (`node`, `npm`)
- **Caddy** — reverse proxy + automatic HTTPS (`/etc/caddy/Caddyfile`)
- **systemd** — process management (`/etc/systemd/system/`)
- **Postgres 16** — database server (used by jobsearch and daily-log)

---

## Running apps

| App | Port | Domain | Service | VPS path | GitHub |
|---|---|---|---|---|---|
| jobsearch CRM | 4111 | `jobsearch.dmytropetryshchuk.com` | `jobsearch` | `/home/dima/jobsearch` | `dpetryshchuk/jobsearch-vps` |
| writing app | 4112 | `write.dmytropetryshchuk.com` | `writing` | `/home/dima/writing-app` | `dpetryshchuk/writing-app-vps` |
| daily log | 4113 | `log.dmytropetryshchuk.com` | `daily-log` | `/home/dima/daily-log` | `dpetryshchuk/daily-log-vps` |

**Next available port:** 4114

---

## Full Caddyfile (`/etc/caddy/Caddyfile`)

```caddy
jobsearch.dmytropetryshchuk.com {
  basic_auth {
    dima <bcrypt-hash>
  }
  handle /api/* {
    reverse_proxy localhost:4111
  }
  handle {
    root * /home/dima/jobsearch/public
    file_server
  }
}

write.dmytropetryshchuk.com {
  basic_auth {
    dima <bcrypt-hash>
  }
  reverse_proxy localhost:4112
}

log.dmytropetryshchuk.com {
  basic_auth {
    dima <bcrypt-hash>
  }
  reverse_proxy localhost:4113
}
```

---

## Common commands

```bash
# SSH in
ssh dima@46.225.78.10

# Tail logs for a service
journalctl -u <service-name> -f

# Restart a service
sudo systemctl restart <service-name>

# Reload Caddy after config changes
sudo systemctl reload caddy

# Check Caddy config syntax
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# View all running services
systemctl list-units --type=service --state=running
```

---

## Adding a new app — checklist

### 1. Clone the repo on the VPS

```bash
ssh dima@46.225.78.10
cd /home/dima
git clone https://github.com/dpetryshchuk/<repo-name>.git <app-name>
cd <app-name>
npm install
```

Create `.env`:
```bash
nano .env
# PORT=4114
# DATABASE_URL=...  (if needed)
```

### 2. Build

```bash
npm run build   # tsc + frontend build
```

### 3. Create the systemd service

```bash
sudo nano /etc/systemd/system/<app-name>.service
```

```ini
[Unit]
Description=<App Display Name>
After=network.target

[Service]
Type=simple
User=dima
WorkingDirectory=/home/dima/<app-name>
EnvironmentFile=/home/dima/<app-name>/.env
ExecStart=/usr/bin/node /home/dima/<app-name>/dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable <app-name>
sudo systemctl start <app-name>
sudo systemctl status <app-name>
```

### 4. Add a Caddy vhost

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddy
<subdomain>.dmytropetryshchuk.com {
  basic_auth {
    dima <bcrypt-hash>
  }
  reverse_proxy localhost:<port>
}
```

Generate the bcrypt hash (write it with `nano` — never embed in a shell heredoc, `$` gets expanded):
```bash
caddy hash-password --plaintext yourpassword
```

Validate and reload:
```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### 5. Add DNS record on Porkbun

1. porkbun.com → DNS → `dmytropetryshchuk.com`
2. Add **A record**: Host = `<subdomain>`, Answer = `46.225.78.10`, TTL = 600
3. Wait ~2 minutes — Caddy fetches the TLS cert automatically once DNS resolves

### 6. Set up GitHub Actions auto-deploy

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /home/dima/<app-name>
            git fetch origin master
            git reset --hard origin/master
            npm install
            npm run build
            sudo systemctl restart <app-name>
```

Add secrets in GitHub → repo → Settings → Secrets → Actions:

| Secret | Value |
|---|---|
| `VPS_HOST` | `46.225.78.10` |
| `VPS_USER` | `dima` |
| `VPS_SSH_KEY` | Private key (generate a dedicated keypair — see below) |

### 7. Generate SSH keypairs

Two keys are needed per app:

**GitHub → VPS** (allows Actions to SSH in):
```bash
# On local machine or VPS:
ssh-keygen -t ed25519 -C "github-actions-<app-name>" -f ~/.ssh/<app-name>_deploy -N ""
cat ~/.ssh/<app-name>_deploy.pub >> ~/.ssh/authorized_keys   # on VPS
cat ~/.ssh/<app-name>_deploy   # copy this as VPS_SSH_KEY secret
```

Set secrets via CLI:
```bash
gh secret set VPS_HOST --repo dpetryshchuk/<repo> --body "46.225.78.10"
gh secret set VPS_USER --repo dpetryshchuk/<repo> --body "dima"
gh secret set VPS_SSH_KEY --repo dpetryshchuk/<repo> < ~/.ssh/<app-name>_deploy
```

**VPS → GitHub** (allows the VPS to `git fetch` from private repos):
```bash
# On VPS:
ssh-keygen -t ed25519 -C "vps-<app-name>-github" -f ~/.ssh/id_<app-name>_github -N ""
cat ~/.ssh/id_<app-name>_github.pub   # add as Deploy Key in GitHub repo Settings
```

`~/.ssh/config` on VPS:
```
Host github-<app-name>
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_<app-name>_github
  IdentitiesOnly yes
```

```bash
git remote set-url origin git@github-<app-name>:dpetryshchuk/<repo>.git
```

---

## Port allocation log

| Port | App |
|---|---|
| 4111 | jobsearch |
| 4112 | writing-app |
| 4113 | daily-log |
| 4114 | next available |

---

## Gotchas

**`git pull` fails after `npm install` modifies `package-lock.json`.**
Use `git fetch origin master && git reset --hard origin/master` in deploy scripts instead of `git pull`.

**Bcrypt hashes with `$` get mangled in shell scripts.**
`$2a$14$...` contains `$2`, `$14` which bash expands as variables. Always write the Caddyfile with `nano`. Validate before every reload.

**Failed Caddy reload → stuck in timeout loop.**
If `systemctl reload caddy` errors, Caddy enters a reload-timeout loop. Fix the config and use `systemctl restart caddy` (full restart) to break out.

**`basicauth` vs `basic_auth`.**
`basicauth` (no underscore) is deprecated in newer Caddy — use `basic_auth`. Both work but the old form prints a warning on every reload.

**`__dirname` in compiled TypeScript points to `dist/`.**
Static files at `public/` must be referenced as `path.join(__dirname, '..', 'public')`, not `path.join(__dirname, 'public')`.

**Two SSH keys per app.**
One key pair for GitHub Actions → VPS. A separate key pair for VPS → GitHub (to fetch from private repos). Don't reuse the same key for both directions.

---

## Node.js version check

```bash
node --version   # should be v18+
npm --version
```

Upgrade if needed:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
