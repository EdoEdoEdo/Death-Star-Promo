"""Planet explosion, synthesized offline (numpy/scipy) and written as a WAV.

Layers: blast transient, roar (noise behind a lowpass that closes over
time), body 60-400 Hz (audible on phone speakers), sub thump with
harmonics, rolling rumble, echo booms, debris crackle. Then saturation,
synthetic stereo reverb, limiter.

    python3 -I make_explosion.py out.wav
"""
import sys
import numpy as np
import scipy.signal as ss
import scipy.io.wavfile as wav

SR = 44100
T = 7.0
N = int(SR * T)
t = np.arange(N) / SR
rng = np.random.default_rng(1977)


def white():
    return rng.standard_normal(N)


def pink(x):
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    y = ss.lfilter(b, a, x)
    return y / (np.std(y) + 1e-9)


def brown(x):
    y = ss.lfilter([1.0], [1.0, -0.997], x)
    y = ss.sosfilt(ss.butter(2, 18, 'highpass', fs=SR, output='sos'), y)
    return y / (np.std(y) + 1e-9)


def bp(x, lo, hi, order=2):
    return ss.sosfilt(ss.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)


def lp(x, fc, order=2):
    return ss.sosfilt(ss.butter(order, fc, 'lowpass', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return ss.sosfilt(ss.butter(order, fc, 'highpass', fs=SR, output='sos'), x)


def svf_lowpass(x, fc, q=0.75):
    """Time-varying lowpass (TPT state variable filter); fc is an array."""
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    y = np.empty_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + a2[i] * v3
        v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[i] = v2
    return y


def attack(tau):
    return 1 - np.exp(-t / tau)


def smooth_rand(rate_hz, lo, hi):
    """Slow random modulation (rolling rumble)."""
    m = lp(white(), rate_hz, 2)
    m = (m - m.min()) / (m.max() - m.min() + 1e-9)
    return lo + (hi - lo) * m


def channel(seed_mix):
    """One stereo channel: shared noise plus independent noise, so the
    sound is wide but still punchy in the centre."""
    W = white() * (1 - seed_mix) + SHARED * seed_mix
    Wn = W / np.std(W)

    # 1. blast: very short broadband bang (first 0.25 s)
    blast = Wn * attack(0.0012) * (np.exp(-t / 0.035) + 0.45 * np.exp(-t / 0.12))
    blast = lp(hp(blast, 120), 13000)

    # 2. roar: lowpass closing from ~9 kHz to ~250 Hz
    fc = 230 + 8500 * np.exp(-t / 0.22) + 1400 * np.exp(-t / 1.1)
    roar_src = 0.7 * pink(Wn) + 0.3 * Wn
    roar = svf_lowpass(roar_src, fc, 0.8)
    # swell: the roar peaks ~0.15 s after the bang, then decays slowly
    swell = 1 + 0.6 * np.exp(-((t - 0.15) / 0.12) ** 2)
    roar *= attack(0.006) * swell * (0.8 * np.exp(-t / 0.7) + 0.35 * np.exp(-t / 2.0))

    # 3. body 60-400 Hz: the "boato" phone speakers can reproduce
    B = brown(Wn)
    body = bp(B, 55, 420, 2)
    body /= np.std(body) + 1e-9
    body *= attack(0.01) * (0.9 * np.exp(-t / 1.1) + 0.45 * np.exp(-t / 2.8))

    # 4. rolling rumble: dark, slowly modulated
    rum = lp(B, 210, 4)
    rum /= np.std(rum) + 1e-9
    rum *= attack(0.25) * np.exp(-t / 2.4) * smooth_rand(4.0, 0.3, 1.0)

    # 5. crackle: debris, density falling over time
    crack = np.zeros(N)
    rate = 140 * np.exp(-t / 0.6) + 8 * np.exp(-t / 1.4)
    events = rng.random(N) < rate / SR
    for i in np.flatnonzero(events):
        L = int(SR * rng.uniform(0.003, 0.022))
        if i + L >= N:
            continue
        g = rng.lognormal(-0.6, 0.6) * (0.4 + 0.6 * np.exp(-t[i] / 1.2))
        env = np.exp(-np.arange(L) / (L * 0.28))
        crack[i:i + L] += rng.standard_normal(L) * env * g
    crack = bp(crack, 1300, 7500, 2)

    return blast, roar, body, rum, crack


SHARED = white()
SUB_PHASE = 2 * np.pi * np.cumsum(30 + 115 * np.exp(-t / 0.11)) / SR
sub = np.sin(SUB_PHASE) * attack(0.003) * (np.exp(-t / 0.55) + 0.25 * np.exp(-t / 1.6))
# harmonics: tanh shapes the sine so the thump is heard on small speakers too
sub = np.tanh(2.2 * sub) / np.tanh(2.2)

out = []
for mix in (0.55, 0.55):
    blast, roar, body, rum, crack = channel(mix)
    dry = (
        1.00 * blast / (np.abs(blast).max() + 1e-9)
        + 0.95 * roar / (np.std(roar[: SR]) + 1e-9) * 0.28
        + 0.85 * body * 0.50
        + 1.00 * sub
        + 0.55 * rum * 0.45
        + 0.32 * crack / (np.std(crack[: SR]) + 1e-9) * 0.25
    )
    # echo booms (delayed, darker copies of the bang)
    for d, g, f in ((0.32, 0.45, 2500), (0.78, 0.3, 1500), (1.45, 0.18, 900)):
        k = int(d * SR)
        e = lp(dry[: N - k], f, 2) * g
        dry[k:] += e
    # saturation: density and loudness (the old synth was too "polite")
    dry = np.tanh(3.0 * dry / (np.abs(dry).max() + 1e-9)) / np.tanh(3.0)
    out.append(dry)

# synthetic stereo reverb, 3.2 s, darker as it decays
RT = 3.2
Lr = int(RT * SR)
tr = np.arange(Lr) / SR
irs = []
for _ in range(2):
    n = rng.standard_normal(Lr) * np.exp(-6.9 * tr / RT)
    dark = lp(n, 1800, 2)
    mixk = np.exp(-tr / 0.35)
    ir = n * mixk + dark * (1 - mixk)
    ir[: int(0.012 * SR)] = 0
    irs.append(ir / np.sqrt(np.sum(ir ** 2)))
wet = [ss.fftconvolve(out[c], irs[c])[:N] for c in range(2)]
mixed = np.stack([out[c] + 0.42 * wet[c] for c in range(2)], axis=1)

# master: highpass, limiter, fade-out
mixed = hp(mixed.T, 24, 2).T
mixed /= np.abs(mixed).max() + 1e-9
mixed = np.tanh(2.2 * mixed) / np.tanh(2.2)
fade = np.ones(N)
fl = int(1.2 * SR)
fade[-fl:] = np.linspace(1, 0, fl) ** 2
mixed *= fade[:, None]
mixed *= 0.93 / (np.abs(mixed).max() + 1e-9)

wav.write(sys.argv[1], SR, (mixed * 32767).astype(np.int16))
win = int(SR * 0.4)
mono = mixed.mean(axis=1)
r = [np.sqrt(np.mean(mono[i:i + win] ** 2)) for i in range(0, N - win, win)]
print('rms per 400ms:', ' '.join('%.2f' % v for v in r))
