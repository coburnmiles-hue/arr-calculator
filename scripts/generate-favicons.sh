#!/usr/bin/env bash
set -euo pipefail

SOURCE_IMAGE="${1:-logo-source.png}"
OUTPUT_DIR="public"

if [[ ! -f "$SOURCE_IMAGE" ]]; then
  echo "Source image not found: $SOURCE_IMAGE"
  echo "Usage: ./scripts/generate-favicons.sh <path-to-source-image>"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

SOURCE_W="$(sips -g pixelWidth "$SOURCE_IMAGE" | awk '/pixelWidth/{print $2}')"
SOURCE_H="$(sips -g pixelHeight "$SOURCE_IMAGE" | awk '/pixelHeight/{print $2}')"

WORKING_IMAGE="$SOURCE_IMAGE"
TEMP_FILE=""

if [[ "$SOURCE_W" != "$SOURCE_H" ]]; then
  CROP_SIZE="$SOURCE_W"
  if (( SOURCE_H < SOURCE_W )); then
    CROP_SIZE="$SOURCE_H"
  fi

  TEMP_FILE="$(mktemp /tmp/favicon-source-XXXXXX.png)"
  cp "$SOURCE_IMAGE" "$TEMP_FILE"
  sips -c "$CROP_SIZE" "$CROP_SIZE" "$TEMP_FILE" >/dev/null
  WORKING_IMAGE="$TEMP_FILE"
fi

sips -s format png -z 32 32 "$WORKING_IMAGE" --out "$OUTPUT_DIR/favicon-v1-32x32.png" >/dev/null
sips -s format png -z 180 180 "$WORKING_IMAGE" --out "$OUTPUT_DIR/apple-touch-icon-v1-180x180.png" >/dev/null
sips -s format png -z 512 512 "$WORKING_IMAGE" --out "$OUTPUT_DIR/icon-v1-512x512.png" >/dev/null

if [[ -n "$TEMP_FILE" && -f "$TEMP_FILE" ]]; then
  rm -f "$TEMP_FILE"
fi

echo "Generated:"
echo "- $OUTPUT_DIR/favicon-v1-32x32.png"
echo "- $OUTPUT_DIR/apple-touch-icon-v1-180x180.png"
echo "- $OUTPUT_DIR/icon-v1-512x512.png"
