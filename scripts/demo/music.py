# Writes a short, original, royalty-free backing track for the demo video (no samples, no
# downloads): warm pad chords, a plucked arpeggio, soft bass and light drums.
# Usage: python music.py OUT.wav SECONDS
import sys
import wave

import numpy as np
from scipy.signal import lfilter

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a, r, sus=1.0):
    """Attack-release envelope over n samples (a, r in seconds)."""
    e = np.full(n, sus, dtype=np.float64)
    na, nr = min(n, max(1, int(a * SR))), min(n, max(1, int(r * SR)))
    e[:na] = np.linspace(0, sus, na)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pad_note(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for det in (-0.12, 0.0, 0.11):  # a slight chorus
        ff = f * 2 ** (det / 12)
        out += np.sin(2 * np.pi * ff * t) + 0.35 * np.sin(4 * np.pi * ff * t) + 0.12 * np.sin(6 * np.pi * ff * t)
    return out / 3 * env(n, 0.6, 0.9, 0.9)


def bass_note(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * env(n, 0.01, 0.25)


def pluck(f, dur, bright=0.5):
    """Karplus-Strong plucked string."""
    n = int(dur * SR)
    p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * (bright * buf[i % p] + (1 - bright) * buf[(i + 1) % p])
    return out * env(n, 0.002, 0.25)


def kick(dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def hat(dur=0.06):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    x = np.diff(np.concatenate([[0], x]))  # crude high-pass
    return x * np.exp(-np.arange(n) / SR * 70)


def reverb(x, mix=0.25):
    """Small Schroeder reverb: four combs and two allpasses."""
    y = np.zeros_like(x)
    for d, g in ((1557, 0.80), (1617, 0.79), (1491, 0.78), (1422, 0.77)):
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -g
        y += lfilter([1], a, x)
    y /= 4
    for d, g in ((225, 0.5), (556, 0.5)):
        b, a = np.zeros(d + 1), np.zeros(d + 1)
        b[0], b[d] = -g, 1
        a[0], a[d] = 1, -g
        y = lfilter(b, a, y)
    return (1 - mix) * x + mix * y


def render(seconds):
    n = int(seconds * SR)
    pads, plucks, bass, drums = (np.zeros(n + SR * 3) for _ in range(4))
    # I - V - vi - IV in C, voiced warm: Cadd9, G/B, Am7, Fmaj7.
    chords = [[48, 55, 62, 64], [47, 55, 59, 62], [45, 52, 55, 60], [41, 48, 52, 57]]
    roots = [36, 35, 33, 29]
    arps = [[60, 64, 67, 72, 74, 72, 67, 64], [59, 62, 67, 71, 74, 71, 67, 62],
            [57, 60, 64, 69, 72, 69, 64, 60], [53, 57, 60, 65, 69, 65, 60, 57]]
    bars = int(np.ceil(seconds / BAR))
    for b in range(bars):
        start = int(b * BAR * SR)
        k = b % 4
        for m in chords[k]:
            s = pad_note(midi(m), BAR + 0.8)
            pads[start:start + len(s)] += s * 0.10
        if b >= 1:  # arpeggio enters after one bar
            for i, m in enumerate(arps[k]):
                s = pluck(midi(m), 0.9, bright=0.45)
                p = start + int(i * BEAT / 2 * SR)
                plucks[p:p + len(s)] += s * (0.16 if i % 2 == 0 else 0.11)
        if b >= 2:  # bass and drums after two bars
            for i in range(4):
                s = bass_note(midi(roots[k]), BEAT * 0.95)
                p = start + int(i * BEAT * SR)
                bass[p:p + len(s)] += s * 0.22
            for i in (0, 2):
                s = kick()
                p = start + int(i * BEAT * SR)
                drums[p:p + len(s)] += s * 0.35
            for i in range(8):
                if i % 2 == 1:
                    s = hat()
                    p = start + int(i * BEAT / 2 * SR)
                    drums[p:p + len(s)] += s * 0.05
    mix = reverb(pads + plucks, 0.3) + bass + drums
    mix = mix[:n]
    # Fades and a soft limiter.
    fi, fo = int(1.0 * SR), int(3.0 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)
    mix[-fo:] *= np.linspace(1, 0, fo)
    mix = np.tanh(mix * 1.4)
    return mix / np.max(np.abs(mix)) * 0.7


def main():
    out, seconds = sys.argv[1], float(sys.argv[2])
    x = render(seconds)
    stereo = np.stack([x, np.roll(x, 220) * 0.98], axis=1)  # tiny width
    data = (stereo * 32767).astype('<i2').tobytes()
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


if __name__ == '__main__':
    main()
