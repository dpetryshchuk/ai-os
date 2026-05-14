#!/bin/bash
set -e
cd /home/dima/jobsearch

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting scrapers"
node_modules/.bin/tsx tools/scrape-yc-deep.ts
node_modules/.bin/tsx tools/scrape-hn-jobs.ts
python3 tools/scrape-jobspy.py
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Done"
