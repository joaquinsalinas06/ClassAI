import wave, struct

SEGUNDOS = 10
w = wave.open("audio.wav", "rb")
assert w.getnchannels() == 1 and w.getsampwidth() == 2
rate = w.getframerate()
n = min(w.getnframes(), rate * SEGUNDOS)
data = struct.unpack("<%dh" % n, w.readframes(n))

with open("../audio_data.h", "w") as f:
    f.write("#pragma once\n#include <stdint.h>\n")
    f.write("#define AUDIO_RATE %d\n" % rate)
    f.write("#define AUDIO_LEN %d\n" % n)
    f.write("const int16_t audioData[AUDIO_LEN] = {\n")
    for i in range(0, n, 16):
        f.write(",".join(map(str, data[i:i+16])) + ",\n")
    f.write("};\n")