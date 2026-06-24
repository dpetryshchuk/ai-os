# Terraform tells the CLI which version to use, and which providers to download.
# Providers are plugins that translate generic Terraform resource declarations
# into API calls against a specific service (Hetzner, Cloudflare, GitHub, etc.).
terraform {
  required_version = ">= 1.6"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
    porkbun = {
      source  = "kyswtn/porkbun"
      version = "~> 0.1"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.2"
    }
  }

  # Remote state is recommended in production (S3 / Terraform Cloud / etc.) so
  # the .tfstate file isn't trapped on one laptop and so concurrent runs lock.
  # For a one-person setup, local state is fine — just don't commit it.
  # backend "s3" { ... }
}

# Each provider block configures one plugin. Credentials usually come from env
# vars (HCLOUD_TOKEN, CLOUDFLARE_API_TOKEN, GITHUB_TOKEN) — never hardcode them.
provider "hcloud" {
  token = var.hcloud_token
}

provider "porkbun" {
  api_key        = var.porkbun_api_key
  secret_api_key = var.porkbun_secret_api_key
}

provider "github" {
  owner = var.github_owner
  token = var.github_token
}
