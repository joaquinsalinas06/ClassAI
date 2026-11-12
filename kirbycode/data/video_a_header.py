import os

data = open("video.mjpeg", "rb").read()
starts = []
i = 0
while True:
    i = data.find(b"\xff\xd8", i)
    if i < 0:
        break
    starts.append(i)
    i += 2
offs = starts + [len(data)]
n = len(starts)

os.makedirs("../src", exist_ok=True)
with open("../src/video_data.h", "w") as f:
    f.write("#pragma once\n#include <stdint.h>\n")
    f.write("#define VIDEO_FRAMES %d\n" % n)
    f.write("const uint32_t videoOffsets[VIDEO_FRAMES + 1] = {%s};\n" % ",".join(map(str, offs)))
    f.write("const uint8_t videoData[%d] = {\n" % len(data))
    for k in range(0, len(data), 32):
        f.write(",".join(map(str, data[k:k+32])) + ",\n")
    f.write("};\n")
print("Fotogramas:", n)