# Variables are the inputs to a Terraform module. Anything that varies between
# environments (prod vs staging) or that's a secret lives here, not hardcoded.
# Set values in terraform.tfvars (gitignored) or via TF_VAR_<name> env vars.

variable "hcloud_token" {
  description = "Hetzner Cloud API token (create in Hetzner Console → Security → API tokens)."
  type        = string
  sensitive   = true # marks the value so it's never printed in plan/apply output
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS:Edit scope on the relevant zones."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub user or org that owns the ai-os repo."
  type        = string
  default     = "dpetryshchuk"
}

variable "github_token" {
  description = "GitHub PAT with repo + admin:public_key scopes (for setting Actions secrets)."
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "Repository name (not full slug)."
  type        = string
  default     = "ai-os"
}

variable "ssh_public_key" {
  description = "Your SSH public key — registered on Hetzner and authorized for the dima user."
  type        = string
}

# Operator SSH key Terraform will store the private half of, to push it as a
# GitHub Actions secret. In practice you'd generate this once and feed it in.
variable "vps_deploy_ssh_private_key" {
  description = "Private SSH key used by GitHub Actions to deploy to the VPS."
  type        = string
  sensitive   = true
}

variable "server_location" {
  description = "Hetzner datacenter (nbg1 = Nuremberg, hel1 = Helsinki, ash = Ashburn, hil = Hillsboro)."
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server size. cx22 = 2 vCPU / 4GB RAM, the smallest current shared-CPU box."
  type        = string
  default     = "cx22"
}

# Domain / DNS configuration. The map shape lets us declare many records concisely.
variable "primary_domain" {
  description = "Top-level domain for the home app."
  type        = string
  default     = "dmytropetryshchuk.com"
}

# Each entry becomes an A record: <subdomain>.<primary_domain> → server IP.
variable "primary_subdomains" {
  description = "Subdomains hosted off primary_domain → all point to the same VPS."
  type        = list(string)
  default     = ["home", "jobsearch", "write", "log", "look"]
}

variable "secondary_domain" {
  description = "Second zone we also serve from this VPS (onekeyflow)."
  type        = string
  default     = "onekeyflow.com"
}

variable "secondary_subdomains" {
  description = "Subdomains on secondary_domain."
  type        = list(string)
  default     = ["os"]
}
