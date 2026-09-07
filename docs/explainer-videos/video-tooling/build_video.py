#!/usr/bin/env python3
"""Assemble a silent MP4 slideshow from scene images at given per-scene durations.

Uses the ffmpeg binary bundled with imageio-ffmpeg (installed in the venv).
No audio is muxed because Khmer TTS is unavailable in this sandbox; the
Khmer narration is delivered as a sidecar .srt file instead.
"""
import argparse
import os
import subprocess
import sys
import imageio_ffmpeg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--images", required=True, nargs="+")
    ap.add_argument("--durations", required=True, nargs="+", type=float)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--fps", type=int, default=25)
    args = ap.parse_args()

    if len(args.images) != len(args.durations):
        sys.exit("images and durations must match in count")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    clips = []
    for i, (img, dur) in enumerate(zip(args.images, args.durations)):
        clip = f"/tmp/clip_{i}.mp4"
        vf = (
            f"scale={args.width}:{args.height}:"
            "force_original_aspect_ratio=decrease,"
            f"pad={args.width}:{args.height}:(ow-iw)/2:(oh-ih)/2:color=white"
        )
        cmd = [
            ffmpeg, "-y", "-loop", "1", "-i", img, "-t", str(dur),
            "-r", str(args.fps), "-vf", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast", "-crf", "23", clip,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        clips.append(clip)

    listfile = "/tmp/cliplist.txt"
    with open(listfile, "w") as f:
        for c in clips:
            f.write(f"file '{c}'\n")

    cmd = [
        ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", listfile,
        "-c", "copy", args.out,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    size = os.path.getsize(args.out)
    print(f"WROTE {args.out} ({size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
