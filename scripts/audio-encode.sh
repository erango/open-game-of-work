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
# Every track is normalised to the same integrated loudness. Generated tracks arrive anywhere
# between -15 and -25 LUFS, which meant the music got audibly louder or quieter when the theme
# changed — a 9 dB spread across the set as it stood.
#
# EBU R128 loudness is the right measure here, unlike for the 2-second effects in sfx-post.sh:
# these are three to seven minutes long, which is exactly what the standard is defined for.
LUFS="${LUFS:--20}"
PEAK="${PEAK:--1.5}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found. brew install ffmpeg"; exit 1; }
[ -d "$SRC" ] || { echo "No sources in $SRC — put the generated tracks there first."; exit 1; }

written=0; skipped=0; before=0; after=0

while IFS= read -r src; do
  rel="${src#"$SRC"/}"
  # Sources arrive in whatever the generator emitted — mp3, m4a, wav — so the extension is
  # stripped rather than assumed.
  out="$DST/${rel%.*}.m4a"
  before=$((before + $(wc -c < "$src")))

  if [ -f "$out" ] && [ "$FORCE" != "1" ]; then
    skipped=$((skipped+1)); after=$((after + $(wc -c < "$out"))); continue
  fi

  mkdir -p "$(dirname "$out")"

  # Pass 1: measure. Single-pass loudnorm only approximates the target; feeding the measured
  # values back in is what actually lands on it.
  measured=$(ffmpeg -nostdin -hide_banner -v info -i "$src" \
    -af "loudnorm=I=${LUFS}:TP=${PEAK}:LRA=11:print_format=json" -f null - 2>&1 \
    | awk '/^\{/,/^\}/' | tr -d ' \n')
  get() { printf '%s' "$measured" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
  norm="loudnorm=I=${LUFS}:TP=${PEAK}:LRA=11"
  if [ -n "$(get input_i)" ]; then
    norm="$norm:measured_I=$(get input_i):measured_TP=$(get input_tp)"
    norm="$norm:measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):linear=true"
  fi

  # Pass 2: encode. -movflags +faststart puts the index at the front, so playback can begin
  # before the whole file has arrived — the difference between music starting now and later.
  ffmpeg -nostdin -v error -y -i "$src" -af "$norm" \
    -c:a aac -b:a "$BITRATE" -ar 44100 -movflags +faststart "$out"
  sz=$(wc -c < "$out"); after=$((after + sz))
  printf 'ok   %-34s %5sk -> %5sk\n' "${rel%.*}" "$(( $(wc -c < "$src") / 1024 ))" "$(( sz / 1024 ))"
  written=$((written+1))
done < <(find "$SRC" -type f \( -name '*.mp3' -o -name '*.m4a' -o -name '*.wav' -o -name '*.flac' -o -name '*.ogg' \) | sort)

echo
printf 'done: %s written, %s already done. %sMB -> %sMB\n' \
  "$written" "$skipped" "$((before / 1048576))" "$((after / 1048576))"
