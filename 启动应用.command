#!/usr/bin/env bash
# macOS / Linux 双击启动（macOS 需先 chmod +x 启动应用.command）
cd "$(dirname "$0")" || exit 1

echo ""
echo "  单词勇者 WordQuest"
echo "  ----------------------------------------"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  没有找到 Node.js。"
  echo ""
  echo "  请先安装 Node.js 18 或更高版本：https://nodejs.org"
  echo "  安装后重新运行本脚本。"
  echo ""
  read -r -p "按回车关闭..." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  首次运行，正在安装依赖（约 1 分钟）..."
  npm install --no-audit --no-fund || { echo "  依赖安装失败。"; read -r -p "按回车关闭..." _; exit 1; }
fi

if [ ! -f dist/index.html ]; then
  echo "  正在构建应用..."
  npm run build || { echo "  构建失败。"; read -r -p "按回车关闭..." _; exit 1; }
fi

echo "  启动中，浏览器会自动打开..."
node scripts/serve.mjs

read -r -p "按回车关闭..." _
