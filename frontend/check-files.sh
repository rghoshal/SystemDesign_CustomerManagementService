#!/bin/bash
echo "=== Checking Frontend Files ==="

required_files=(
  "src/App.js"
  "src/index.js"
  "src/index.css"
  "tailwind.config.js"
  "postcss.config.js"
  "package.json"
)

for file in "${required_files[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file"
  else
    echo "✗ $file MISSING!"
  fi
done
echo -e "\n=== Checking Dependencies ==="
if [ -f "package.json" ]; then
  npm list lucide-react tailwindcss 2>/dev/null | grep -E "(lucide-react|tailwindcss)"
fi
