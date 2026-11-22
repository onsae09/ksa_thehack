#!/usr/bin/env bash
# 개인 서버(onsae.org)에 다시 배포: 소스 동기화 → 서버에서 설치·빌드 → 서비스 재시작
# .env는 서버에 이미 있으므로 덮어쓰지 않는다. 키를 바꿨을 때만: scp web/.env ubuntu@146.56.97.2:~/labfit/.env
set -euo pipefail
HOST=ubuntu@146.56.97.2
cd "$(dirname "$0")/../web"
rsync -az --delete --exclude node_modules --exclude .next --exclude '.env*' --exclude .cache ./ "$HOST:~/labfit/"
ssh "$HOST" 'set -e; export PATH=$HOME/.nvm/versions/node/v24.22.1/bin:$PATH; cd ~/labfit
  npx -y pnpm@11.2.2 install --frozen-lockfile >/dev/null
  npx -y pnpm@11.2.2 build | tail -3
  sudo systemctl restart labfit; sleep 3; systemctl is-active labfit
  curl -s -o /dev/null -w "local %{http_code}\n" http://127.0.0.1:3100/'
