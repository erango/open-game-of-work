#!/usr/bin/env bash
# Re-encode the music for shipping.
#
#   npm run audio:encode          # sources in art/_music_raw -> public/assets/music/*.m4a
#   FORCE=1 npm run audio:encode  # redo existing
#   BITRATE=96k npm run audio:encode
#
# Nine tracks of two to four minutes is 27 minutes of audio, and at the 128 kbps the generator
# emitted that is 24 MB — too much to put behind a Pages deploy for a board game. AAC at 64 kbps
# is 1.8 MB for a four-minute track and is fine for a bed that spends its life ducked to 10%
# under speech.
#
# AAC rather than Opus, which is smaller still (1.3 MB for the same track): Ogg-Opus only plays
# in Safari 17 and later, and a silent game on a two-year-old browser is a worse outcome than a
# few hundred kilobytes. AAC in MP4 plays everywhere.
#
# The .mp3 sources stay in art/_music_raw, which is gitignored, so re-encoding at a different
# rate never means regenerating.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="art/_music_raw"
DST="public/assets/music"
BITRATE="${BITRATE:-64k}"
FORCE="${FORCE:-0}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found. brew install ffmpeg"; exit 1; }
[ -d "$SRC" ] || { echo "No sources in $SRC — put the generated .mp3s there first."; exit 1; }

written=0; skipped=0; before=0; after=0

while IFS= read -r src; do
  rel="${src#"$SRC"/}"
  out="$DST/${rel%.mp3}.m4a"
  before=$((before + $(wc -c < "$src")))

  if [ -f "$out" ] && [ "$FORCE" != "1" ]; then
    skipped=$((skipped+1)); after=$((after + $(wc -c < "$out"))); continue
  fi

  mkdir -p "$(dirname "$out")"
  # -movflags +faststart puts the index at the front, so playback can begin before the whole
  # file has arrived — which is the difference between music starting now and starting later.
  ffmpeg -nostdin -v error -y -i "$src" \
    -c:a aac -b:a "$BITRATE" -ar 44100 -movflags +faststart "$out"
  sz=$(wc -c < "$out"); after=$((after + sz))
  printf 'ok   %-34s %5sk -> %5sk\n' "${rel%.mp3}" "$(( $(wc -c < "$src") / 1024 ))" "$(( sz / 1024 ))"
  written=$((written+1))
done < <(find "$SRC" -name '*.mp3' | sort)

echo
printf 'done: %s written, %s already done. %sMB -> %sMB\n' \
  "$written" "$skipped" "$((before / 1048576))" "$((after / 1048576))"
