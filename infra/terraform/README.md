# Infrastructure as Code — AI OS

This directory contains a Terraform configuration that provisions a complete AI OS
instance: a Hetzner VPS, firewall, DNS records, and GitHub Actions secrets.

Use it to spin up a fresh instance for yourself or for a client.

---

## What Terraform is

Terraform is a tool that turns infrastructure into code. Instead of clicking through
cloud provider UIs, you write `.tf` files that describe what you want:
*"I want a 2-vCPU server in Nuremberg with these ports open, pointing to this domain."*

Terraform figures out the order, creates what's missing, and tracks everything in a
**state file** (`terraform.tfstate`). Next time you run it, it only changes what's
different. Delete a resource from the `.tf` file and `terraform apply` will destroy it.

**Key concept: resources.** Every `resource "TYPE" "NAME" { ... }` block maps to one
real-world object. `hcloud_server.vps` = the VPS. `porkbun_dns_record.primary_app` = an
A record. Rename the block and Terraform thinks you want to delete the old one and make
a new one.

**Key concept: providers.** Terraform itself is just a runner. The `providers.tf` file
declares which plugins it needs (`hashicorp/hcloud` talks to Hetzner, `porkbun-engineering/porkbun`
talks to Porkbun, `integrations/github` talks to GitHub). Terraform downloads them on `init`.

---

## What this config provisions

| Resource | What it is |
|---|---|
| `hcloud_ssh_key.operator` | SSH key registered with Hetzner so you can log in |
| `hcloud_firewall.public` | Firewall: allows TCP 22, 80, 443 inbound |
| `hcloud_server.vps` | CX22 Ubuntu VPS, bootstrapped via cloud-init |
| `porkbun_dns_record.primary_app` | A records for each subdomain on the primary domain |
| `porkbun_dns_record.secondary_app` | A records on the secondary domain |
| `github_actions_secret.vps_*` | GitHub secrets so CI/CD can SSH in to deploy |

The VPS runs `cloud-init.yaml` on first boot, which installs Docker + Caddy,
clones the repo, and starts the services.

---

## Spinning up a new AI OS for a client

### Step 1 — Prerequisites

```bash
# Install Terraform
brew install terraform

# Install Terraform providers (reads providers.tf)
cd infra/terraform
terraform init
```

You need API tokens for:
- **Hetzner**: Console → Security → API tokens → Create token (Read + Write)
- **Porkbun**: Dashboard → API Access (must enable per-domain)
- **GitHub**: Settings → Developer settings → PAT → scopes: `repo` + `admin:public_key`

### Step 2 — Create `terraform.tfvars`

Copy the example and fill in values (this file is gitignored):

```bash
cp terraform.tfvars.example terraform.tfvars
```

```hcl
# terraform.tfvars — never commit this

hcloud_token              = "hcloud-token-from-console"
porkbun_api_key           = "pk1_..."
porkbun_secret_api_key    = "sk1_..."
github_token              = "ghp_..."

ssh_public_key            = "ssh-ed25519 AAAA... you@machine"
vps_deploy_ssh_private_key = <<-EOK
  -----BEGIN OPENSSH PRIVATE KEY-----
  ...deploy keypair private half...
  -----END OPENSSH PRIVATE KEY-----
EOK

# Customize for the client
primary_domain     = "client.com"
primary_subdomains = ["app", "api"]
secondary_domain   = ""           # leave empty if single-domain
server_location    = "ash"        # ash = Ashburn (US East), nbg1 = Nuremberg (EU)
server_type        = "cx22"       # cx22 = $4/mo, cx32 = $8/mo (4 vCPU/8GB)
github_repo        = "aios-client-name"
```

### Step 3 — Plan and apply

```bash
# See what Terraform will create (no changes yet)
terraform plan

# Create everything
terraform apply
```

Terraform prints a summary then asks `yes`. It creates the VPS, waits for DNS
to propagate (TTL 300s), then sets the GitHub secrets.

### Step 4 — Wait for cloud-init

After `apply`, SSH into the new server:

```bash
terraform output vps_ssh   # prints the SSH command
```

Watch cloud-init progress:

```bash
tail -f /var/log/cloud-init-output.log
```

When it finishes, Docker, Caddy, and the AI OS containers will be running.

### Step 5 — Configure the new instance

1. Set secrets in the new repo's `.env`:
   ```bash
   ssh dima@<new-ip>
   cp /home/dima/ai-os/.env.example /home/dima/ai-os/.env
   nano /home/dima/ai-os/.env
   ```

2. Run database migrations:
   ```bash
   docker compose exec aios alembic -c migrations/jobsearch.ini upgrade head
   docker compose exec aios alembic -c migrations/daily_log.ini upgrade head
   ```

3. Set the Caddy basicauth password:
   ```bash
   caddy hash-password --plaintext "choose-a-password"
   # paste the hash into caddy/auth_credentials
   sudo systemctl reload caddy
   ```

---

## Adopting an existing VPS (the current situation)

If the VPS already exists, **do not run `terraform apply` cold** — it would try
to create a second server. Import each resource first:

```bash
terraform import hcloud_server.vps 12345678   # Hetzner server ID
terraform import hcloud_ssh_key.operator 87654321
terraform import hcloud_firewall.public 11111111
```

Find IDs in the Hetzner console. After import, `terraform plan` should show
no changes (drift).

---

## Tearing down

The `lifecycle { prevent_destroy = true }` block on the VPS will refuse a destroy:

```bash
# To override: temporarily remove the lifecycle block, then:
terraform destroy
```

This deletes the server, firewall, SSH key, and DNS records. The GitHub secrets
remain (GitHub API doesn't delete them on resource destruction by default).

---

## Cost

| What | Monthly |
|---|---|
| Hetzner CX22 (2 vCPU, 4GB) | ~$4.50 |
| Porkbun domain (if new) | ~$1.00 |
| OpenAI embeddings (~50k tokens/day) | ~$0.03 |
| DeepSeek LLM (~200k tokens/day) | ~$0.05 |
| **Total** | **~$6/mo** |

For a client deployment, budget $10–15/mo including domain and any email forwarding.
