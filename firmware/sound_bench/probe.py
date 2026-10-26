#!/usr/bin/env python3
"""macOS: play repeatable sounds and log M-06 Serial, using only Python stdlib."""
import argparse
import array
import datetime
import json
import math
import os
from pathlib import Path
import random
import select
import statistics
import subprocess
import sys
import tempfile
import termios
import time
import tty
import wave

RATE = 22050


def waveform(kind, seconds, gain):
    rng = random.Random(6)
    samples = array.array("h")
    for i in range(int(RATE * seconds)):
        t = i / RATE
        if kind == "pulses":
            local = t % 2
            envelope = max(0, min(1, local / 0.02, (0.20 - local) / 0.02))
            value = math.sin(2 * math.pi * 1000 * t) * envelope
        else:
            envelope = max(0, min(1, t / 0.02, (seconds - t) / 0.02))
            value = rng.uniform(-1, 1) * envelope
        samples.append(round(32767 * gain * value))
    return samples


def read_row(line):
    try:
        row = json.loads(line)
        fields = ("uptime_ms", "min", "max", "peak_to_peak", "rail_samples", "samples")
        if not all(type(row[k]) is int for k in fields):
            return None
        if not (0 <= row["min"] <= row["max"] <= 4095):
            return None
        if row["peak_to_peak"] != row["max"] - row["min"]:
            return None
        if not 0 <= row["rail_samples"] <= row["samples"] or row["samples"] <= 0:
            return None
        return row
    except (ValueError, KeyError, TypeError):
        return None


def self_test():
    low, high = waveform("noise", 0.1, 0.08), waveform("noise", 0.1, 0.32)
    assert len(low) == len(high) == 2205
    rms = lambda xs: math.sqrt(sum(x * x for x in xs) / len(xs))
    assert 3.99 < rms(high) / rms(low) < 4.01
    pulses = waveform("pulses", 4, 0.20)
    assert max(map(abs, pulses)) > 6000
    assert all(x == 0 for x in pulses[RATE:2 * RATE])
    row = dict(uptime_ms=1, min=10, max=30, peak_to_peak=20, rail_samples=0, samples=100)
    assert read_row(json.dumps(row)) == row
    row["peak_to_peak"] = 99
    assert read_row(json.dumps(row)) is None
    assert read_row("startup message") is None
    print("PASS: repeatable waveforms, 4x digital amplitude, pulse gaps, Serial parsing.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", default="/dev/cu.usbserial-0001")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if sys.platform != "darwin":
        parser.error("This probe uses macOS afplay and POSIX Serial.")
    if not Path(args.port).exists():
        parser.error(f"Serial port not found: {args.port}")
    busy = subprocess.run(["/usr/sbin/lsof", "-t", args.port], capture_output=True, text=True)
    if busy.stdout.strip():
        parser.error("Serial port is in use; close the other monitor first.")
    log_dir = Path.home() / ".codex/hardware-logs/classai"
    log_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    log_path = log_dir / f"sound-probe-{stamp}.jsonl"
    print(f"Log privado: {log_path}", flush=True)
    print("Volumen del sistema intacto. No mover sensor ni hablar durante la prueba.", flush=True)
    phases = [("settle", 5, None), ("silence_0", 6, None), ("pulses", 6, "pulses")]
    for n in (1, 2):
        phases.extend([(f"silence_{n}", 6, None), (f"low_{n}", 6, "low"),
                       (f"high_{n}", 6, "high")])
    phases.append(("silence_end", 6, None))
    results = {}
    fd, player = None, None
    with tempfile.TemporaryDirectory(prefix="classai-sound-probe-") as tmp:
        sounds = {}
        for name, kind, gain in (("pulses", "pulses", 0.20), ("low", "noise", 0.08),
                                 ("high", "noise", 0.32)):
            path = Path(tmp) / f"{name}.wav"
            samples = waveform(kind, 6, gain)
            if sys.byteorder != "little":
                samples.byteswap()
            with wave.open(str(path), "wb") as wav:
                wav.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
                wav.writeframes(samples.tobytes())
            sounds[name] = path
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(log_fd, "w") as log:
            try:
                fd = os.open(args.port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
                tty.setraw(fd)
                attrs = termios.tcgetattr(fd)
                attrs[4] = attrs[5] = termios.B115200
                termios.tcsetattr(fd, termios.TCSANOW, attrs)
                buffer = bytearray()
                for name, seconds, sound in phases:
                    buffer.clear()
                    termios.tcflush(fd, termios.TCIFLUSH)
                    start = time.monotonic()
                    print(f"{name}: {seconds} s", flush=True)
                    log.write(json.dumps(dict(event="phase", phase=name, monotonic=start)) + "\n")
                    if sound:
                        player = subprocess.Popen(["/usr/bin/afplay", str(sounds[sound])])
                    rows = []
                    while time.monotonic() - start < seconds:
                        if not select.select([fd], [], [], 0.2)[0]:
                            continue
                        chunk = os.read(fd, 16384)
                        if not chunk:
                            raise RuntimeError("Serial disconnected")
                        buffer.extend(chunk)
                        while b"\n" in buffer:
                            line, _, remainder = buffer.partition(b"\n")
                            buffer = bytearray(remainder)
                            row = read_row(line)
                            if row is not None:
                                elapsed = time.monotonic() - start
                                # Exclude windows spanning a phase transition or playback startup.
                                kept = elapsed >= 1.5
                                log.write(json.dumps(dict(phase=name, elapsed=elapsed, kept=kept, adc=row)) + "\n")
                                if kept:
                                    rows.append(row)
                    if player:
                        player.wait(timeout=3)
                        if player.returncode:
                            raise RuntimeError(f"afplay failed: {player.returncode}")
                        player = None
                    results[name] = rows
                    log.flush()
            finally:
                if player and player.poll() is None:
                    player.terminate()
                    player.wait(timeout=3)
                if fd is not None:
                    os.close(fd)
    print("Resultados ADC crudos (sin dB; extremos no verifican tensión):")
    for name, rows in results.items():
        if rows:
            pp = [r["peak_to_peak"] for r in rows]
            print(f"{name}: n={len(rows)}, pp mediana={statistics.median(pp):.1f}, max={max(pp)}, "
                  f"extremos={sum(r['rail_samples'] for r in rows)}/{sum(r['samples'] for r in rows)}")
        else:
            print(f"{name}: SIN DATOS VÁLIDOS")
    if not results.get("silence_end"):
        raise RuntimeError("No valid final Serial windows; inspect connection/log.")


if __name__ == "__main__":
    main()
