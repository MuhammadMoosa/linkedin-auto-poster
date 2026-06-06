#!/bin/zsh
set -e
source ~/.nvm/nvm.sh
nvm use 20
cd "$(dirname "$0")/.."
export DEBUG_SCREENSHOT=true
npm run post:day -- 1
