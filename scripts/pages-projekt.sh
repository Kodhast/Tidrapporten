#!/usr/bin/env bash
# Creates the Pages project the first time (issue 12). The production branch is "produktion",
# which only release.yml publishes to; main and the PRs are preview branches.
# Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and WRANGLER (an exact wrangler version).
set -euo pipefail
status=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/tidrapporten")
case "$status" in
  200) echo "Pages-projektet tidrapporten finns." ;;
  404) npx --yes "$WRANGLER" pages project create tidrapporten --production-branch produktion ;;
  *)
    echo "::error::Cloudflare svarade $status. Kolla CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit)."
    exit 1
    ;;
esac
