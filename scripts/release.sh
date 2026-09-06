#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Always rebuild the UI before Go embeds it, including local release builds.
pnpm build
mkdir -p dist
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do
  os=${target%/*}
  arch=${target#*/}
  name="cadence_${os}_${arch}"
  binary=cadence
  if [[ "$os" == windows ]]; then binary=cadence.exe; fi
  mkdir -p "$staging/$name"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags='-s -w' -o "$staging/$name/$binary" .
  if [[ "$os" == windows ]]; then
    (cd "$staging/$name" && zip -q "$name.zip" "$binary")
    mv "$staging/$name/$name.zip" dist/
  else
    tar -czf "dist/$name.tar.gz" -C "$staging/$name" "$binary"
  fi
done
(cd dist && sha256sum cadence_*.tar.gz cadence_*.zip > checksums.txt)
