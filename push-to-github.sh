#!/bin/sh
# Push FloodTwin Q1 Demo lên repo private manhhodinh/twin-demo
# Chạy:  sh push-to-github.sh   (cần `gh auth login` sẵn; nếu chưa có gh: brew install gh)
set -e
cd "$(dirname "$0")"

git init -b main 2>/dev/null || true
git add -A
git commit -m "FloodTwin Q1 demo v84 — real-map flood digital twin (3D/2D, SWE + MPC, live tiles z20, OSM roads/buildings/alleys)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" || echo "(không có thay đổi mới để commit)"

if command -v gh >/dev/null 2>&1; then
  # tạo repo private + push (nếu repo đã tồn tại thì chỉ set remote + push)
  gh repo create manhhodinh/twin-demo --private --source . --remote origin --push 2>/dev/null || {
    git remote add origin "https://github.com/manhhodinh/twin-demo.git" 2>/dev/null || true
    git push -u origin main
  }
else
  git remote add origin "git@github.com:manhhodinh/twin-demo.git" 2>/dev/null || true
  git push -u origin main
fi
echo "✓ Đã push lên https://github.com/manhhodinh/twin-demo (private)"
