#!/usr/bin/env sh
# Builds the CrazyGames upload: index.html at the zip root plus css/ and js/.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/urban-scrap-crazygames.zip
python3 - <<'EOF'
import zipfile, os
with zipfile.ZipFile('dist/urban-scrap-crazygames.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('index.html')
    for d in ('css', 'js'):
        for f in sorted(os.listdir(d)):
            z.write(os.path.join(d, f))
print('dist/urban-scrap-crazygames.zip', os.path.getsize('dist/urban-scrap-crazygames.zip'), 'bytes')
EOF
