Remove-Item -Recurse -Force .\dist, .\release -ErrorAction SilentlyContinue
npm run electron:build
pause