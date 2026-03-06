@echo off
setlocal
set "PATH=C:\Users\Genial\Desktop\nodejs;%PATH%"
set "NODE_OPTIONS=--max-old-space-size=512"
cd /d "C:\Users\Genial\Desktop\transaction-auth-engine"
"C:\Users\Genial\Desktop\nodejs\npm.cmd" -w web run dev -- --host 127.0.0.1 --port 5173 --strictPort
