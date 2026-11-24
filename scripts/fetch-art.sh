#!/usr/bin/env bash
# Pull CC0 art from Poly Haven into public/art: ground/bark/leaf albedo + normal maps and a sky HDRI.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/art
mkdir -p "$OUT"

tex_map() {
  case "$1" in
    Diffuse) echo diff ;;
    nor_gl) echo nor_gl ;;
    Rough) echo rough ;;
  esac
}

get() {
  local id=$1 map=$2 res=${3:-1k}
  local suffix
  suffix=$(tex_map "$map")
  local url="https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${id}/${id}_${suffix}_${res}.jpg"
  local dest="${OUT}/${id}_${suffix}.jpg"
  if [ -f "$dest" ]; then echo "have $dest"; return; fi
  curl -sfL -A "Mozilla/5.0" "$url" -o "$dest" && echo "got $dest $(stat -c%s "$dest")" || echo "MISS $url"
}

for id in forrest_ground_01 aerial_grass_rock aerial_sand snow_02 rocks_ground_04 bark_brown_01 forest_leaves_02; do
  get "$id" Diffuse
  get "$id" nor_gl
done

HDR=public/art/sky.hdr
if [ ! -f "$HDR" ]; then
  curl -sfL -A "Mozilla/5.0" "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/autumn_field_puresky_2k.hdr" -o "$HDR" && echo "got hdr $(stat -c%s "$HDR")" || echo "MISS hdr"
fi

ls -la "$OUT" | tail -20
