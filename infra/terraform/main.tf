# =============================================================================
# AI OS — infrastructure as code
#
# This file declares (in Terraform terms) the real-world resources that
# currently power home.dmytropetryshchuk.com:
#
#   1. A Hetzner CX22 server  (the VPS at 46.225.78.10)
#   2. A firewall              (open 22, 80, 443)
#   3. SSH key registration    (so we can log in as `dima`)
#   4. Cloudflare DNS records  (A records for every app subdomain)
#   5. GitHub Actions secrets  (so the deploy workflow can SSH in)
#
# What Terraform does NOT manage here:
#   - the contents of the running containers (those are GHCR images built
#     by GitHub Actions on every push)
#   - the Caddyfile and docker-compose.yml files (those live in the repo
#     and are rsync'd via `git pull` from inside the deploy job)
#   - the Postgres data inside the postgres_data volume
#
# Note: this file describes the CURRENT setup. To adopt it against an
# already-running VPS you'd `terraform import` each resource one by one
# rather than `terraform apply` (which would try to create a second server).
# =============================================================================


# ---------- 1. SSH key ---------------------------------------------------------
# A resource block: TYPE "NAME" { ARGUMENTS }
# Terraform tracks this object in state under hcloud_ssh_key.operator. If you
# rename the resource, Terraform thinks you want to delete the old one and
# make a new one — names are identity inside the state file.
resource "hcloud_ssh_key" "operator" {
  name       = "dima-operator"
  public_key = var.ssh_public_key
}


# ---------- 2. Firewall --------------------------------------------------------
# Hetzner firewalls are stateful and attached to a server. We open only what
# Caddy and SSH need. Postgres / Redis stay inside the docker network and are
# never exposed to the host's public NIC.
resource "hcloud_firewall" "public" {
  name = "ai-os-public"

  # Repeated nested blocks. Each `rule` is one ingress rule.
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}


# ---------- 3. The VPS itself --------------------------------------------------
# `cloud-init` is a standard Linux mechanism for first-boot configuration.
# Hetzner injects whatever we pass to `user_data` and runs it before login.
# We use it to install Docker + Caddy + clone the repo so the box is ready
# without any manual SSH.
resource "hcloud_server" "vps" {
  name        = "ai-os-prod"
  server_type = var.server_type
  image       = "ubuntu-24.04"
  location    = var.server_location

  ssh_keys     = [hcloud_ssh_key.operator.id]
  firewall_ids = [hcloud_firewall.public.id]

  # templatefile() reads a file and substitutes ${var} placeholders.
  # The result is YAML that cloud-init understands.
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    github_repo = "${var.github_owner}/${var.github_repo}"
  })

  # `lifecycle` blocks tune Terraform's behavior around create/update/destroy.
  # `prevent_destroy = true` makes `terraform destroy` refuse to nuke the VPS
  # by accident. You'd have to remove this block first to wipe it.
  lifecycle {
    prevent_destroy = true
  }
}


# ---------- 4. DNS records (Cloudflare) ---------------------------------------
# `data` blocks READ existing things (vs `resource` which manages them).
# We look up the zone IDs by name so we don't hardcode them.
data "cloudflare_zone" "primary" {
  name = var.primary_domain # dmytropetryshchuk.com
}

data "cloudflare_zone" "secondary" {
  name = var.secondary_domain # onekeyflow.com
}

# `for_each` turns a list into N resources of the same shape. Each entry in
# var.primary_subdomains creates one A record. This is how you avoid copy-
# pasting "resource ... home ... resource ... jobsearch ...".
resource "cloudflare_record" "primary_app" {
  for_each = toset(var.primary_subdomains)

  zone_id = data.cloudflare_zone.primary.id
  name    = each.key                       # "home", "jobsearch", ...
  content = hcloud_server.vps.ipv4_address # implicit dependency: TF will wait for the server first
  type    = "A"
  proxied = false # Caddy handles TLS itself, so we want a plain DNS record (no Cloudflare proxy)
  ttl     = 300
}

resource "cloudflare_record" "secondary_app" {
  for_each = toset(var.secondary_subdomains)

  zone_id = data.cloudflare_zone.secondary.id
  name    = each.key
  content = hcloud_server.vps.ipv4_address
  type    = "A"
  proxied = false
  ttl     = 300
}


# ---------- 5. GitHub Actions secrets -----------------------------------------
# The deploy workflow needs VPS_HOST / VPS_USER / VPS_SSH_KEY to SSH in.
# Managing them via Terraform means: rotate the key in tfvars, `apply`,
# the workflow keeps working without any manual setting in GitHub UI.
resource "github_actions_secret" "vps_host" {
  repository      = var.github_repo
  secret_name     = "VPS_HOST"
  plaintext_value = hcloud_server.vps.ipv4_address
}

resource "github_actions_secret" "vps_user" {
  repository      = var.github_repo
  secret_name     = "VPS_USER"
  plaintext_value = "dima"
}

resource "github_actions_secret" "vps_ssh_key" {
  repository      = var.github_repo
  secret_name     = "VPS_SSH_KEY"
  plaintext_value = var.vps_deploy_ssh_private_key
}


# ---------- Outputs ------------------------------------------------------------
# After apply, Terraform prints these. Useful for piping into other tools or
# just so you can see what was created.
output "vps_ip" {
  description = "Public IPv4 of the VPS."
  value       = hcloud_server.vps.ipv4_address
}

output "vps_ssh" {
  description = "Convenience SSH command."
  value       = "ssh dima@${hcloud_server.vps.ipv4_address}"
}

output "primary_urls" {
  description = "All HTTPS URLs that resolve to this VPS via the primary domain."
  value       = [for s in var.primary_subdomains : "https://${s}.${var.primary_domain}"]
}
