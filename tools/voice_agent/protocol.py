"""CA/v1 binary frames; signed PCM16, little endian. No serial text in audio mode."""
import struct
import zlib

HEADER = struct.Struct('<2sBBHI')
MAX_PAYLOAD = 1280


def encode(kind, sequence, payload=b''):
    if not 0 <= kind <= 6 or len(payload) > MAX_PAYLOAD:
        raise ValueError('invalid frame')
    header = HEADER.pack(b'CA', 1, kind, len(payload), sequence)
    return header + payload + struct.pack('<I', zlib.crc32(header[2:] + payload))


class Decoder:
    def __init__(self):
        self.buffer = bytearray()
        self.errors = 0

    def feed(self, data):
        self.buffer.extend(data)
        frames = []
        while len(self.buffer) >= 14:
            magic, version, kind, size, sequence = HEADER.unpack_from(self.buffer)
            if magic != b'CA' or version != 1 or size > MAX_PAYLOAD or kind > 6:
                del self.buffer[0]
                self.errors += 1
                continue
            length = size + 14
            if len(self.buffer) < length:
                break
            if zlib.crc32(self.buffer[2:10+size]) != struct.unpack_from('<I', self.buffer, 10+size)[0]:
                del self.buffer[0]
                self.errors += 1
                continue
            frames.append((kind, sequence, bytes(self.buffer[10:10+size])))
            del self.buffer[:length]
        return frames
