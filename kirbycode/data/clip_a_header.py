import os, sys

if len(sys.argv) != 3:
    print("Uso: python clip_a_header.py entrada.mjpeg prefijo")
    sys.exit(1)

src, pre = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
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
P = pre.upper()

os.makedirs("../src", exist_ok=True)
with open("../src/%s_data.h" % pre, "w") as f:
    f.write("#pragma once\n#include <stdint.h>\n")
    f.write("#define %s_FRAMES %d\n" % (P, n))
    f.write("const uint32_t %sOffsets[%s_FRAMES + 1] = {%s};\n" % (pre, P, ",".join(map(str, offs))))
    f.write("const uint8_t %sData[%d] = {\n" % (pre, len(data)))
    for k in range(0, len(data), 32):
        f.write(",".join(map(str, data[k:k+32])) + ",\n")
    f.write("};\n")
print("Fotogramas:", n)