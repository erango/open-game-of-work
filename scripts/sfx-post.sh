#!/usr/bin/env bash
# Turn raw generator output into finished cues: trim, fade, normalise.
#
#   npm run sfx:post            # everything with a raw file and no output
#   npm run sfx:post -- win     # filter by substring of <theme>/<cue>
#   FORCE=1 npm run sfx:post    # redo existing
#   PEAK_DB=-9 npm run sfx:post # louder set
#
# This step is where "professional" actually happens, and it is the one people skip. Three things
# it fixes, in the order they matter:
#
#   1. Leading silence. A generator commonly returns 100-300ms of nothing before the sound. On a
#      cue that fires the moment you click, that reads as lag.
#   2. Level. Every cue lands at the same peak, so none is startling and none is inaudible under
#      the music. -12 dBFS, well above the -20 LUFS music bed.
#   3. The tail. A 5s request often returns 2s of room decay after the event. Trailing silence is
#      cut and a 50ms fade applied, so nothing clicks off.
#
# Peak normalisation, deliberately, rather than loudnorm: EBU R128 integrated loudness is not
# meaningful on a 2-second one-shot, and loudnorm's true-peak parameter cannot go below -9 dB.
set -euo pipefail

cd "$(dirname "$0")/.."
FORCE="${FORCE:-0}"
PEAK_DB="${PEAK_DB:--12}"
FILTER=("$@")

command -v ffmpeg >/dev/null || { echo "ffmpeg not found. brew install ffmpeg"; exit 1; }
node scripts/sfx-manifest.mjs >/dev/null

written=0; skipped=0; missing=0; failed=0
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

while IFS=$'\t' read -r id raw out; do
  if [ ${#FILTER[@]} -gt 0 ]; then
    match=0
    for f in "${FILTER[@]}"; do [[ "$id" == *"$f"* ]] && match=1; done
    [ $match -eq 1 ] || continue
  fi
  if [ ! -f "$raw" ]; then missing=$((missing+1)); continue; fi
  if [ -f "$out" ] && [ "$FORCE" != "1" ]; then skipped=$((skipped+1)); continue; fi

  mkdir -p "$(dirname "$out")"
  trimmed="$tmpdir/trimmed.wav"

  # Pass 1: trim both ends. silenceremove only works forwards, so the tail is done by reversing,
  # trimming the (now leading) silence, and reversing back — the standard idiom.
  if ! ffmpeg -nostdin -v error -y -i "$raw" -af "\
silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak,\
areverse,\
silenceremove=start_periods=1:start_duration=0.05:start_threshold=-50dB:detection=peak,\
areverse" -ar 44100 -ac 1 "$trimmed" 2>/dev/null; then
    echo "FAIL $id (trim)"; failed=$((failed+1)); continue
  fi

  # Pass 2: measure the peak that survived the trim, and the length, for the gain and the fade.
  # volumedetect reports at info level, so -v error would hide the very line being parsed.
  peak=$(ffmpeg -nostdin -hide_banner -nostats -v info -i "$trimmed" -af volumedetect -f null - 2>&1 \
    | awk -F': ' '/max_volume/ {print $2+0}')
  [ -n "$peak" ] || { echo "FAIL $id (no peak measured)"; failed=$((failed+1)); continue; }
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$trimmed")
  gain=$(awk "BEGIN{printf \"%.2f\", ${PEAK_DB} - (${peak})}")
  fade_at=$(awk "BEGIN{d=${dur}-0.05; printf \"%.3f\", (d>0?d:0)}")

  # Pass 3: gain to the target peak, fade the last 50ms, encode.
  if ffmpeg -nostdin -v error -y -i "$trimmed" \
    -af "volume=${gain}dB,afade=t=out:st=${fade_at}:d=0.05" \
    -ar 44100 -ac 1 -codec:a libmp3lame -q:a 4 "$out" 2>/dev/null; then
    printf 'ok   %-32s %5.2fs  peak %6s -> %s dB\n' "$id" "$dur" "$peak" "$PEAK_DB"
    written=$((written+1))
  else
    echo "FAIL $id (encode)"; failed=$((failed+1))
  fi
done < <(node --input-type=module -e '
  const { jobs } = await import("./scripts/sfx-manifest.mjs");
  for (const j of jobs) console.log([j.id, j.raw, j.out].join("\t"));
')

echo
echo "done: $written written, $skipped already done, $missing awaiting generation, $failed failed."
