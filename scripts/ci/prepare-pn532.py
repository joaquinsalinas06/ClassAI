"""Stage pinned PN532 for HCE without modifying the installed library.
Retained Tg: https://github.com/adafruit/Adafruit-PN532/pull/66
SPI timing precedent: https://github.com/adafruit/Adafruit-PN532/issues/117
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys


def patched_source(source):
    start = source.index('bool Adafruit_PN532::readDetectedPassiveTargetID(')
    anchor = '  uint16_t sens_res = pn532_packetbuffer[9];'
    end = source.index("\n}", start)
    position = start + source[start:end].index(anchor)
    insertion = '  _inListedTag = pn532_packetbuffer[8]; // ClassAI: use this same activation for APDU\n'
    if insertion in source[start:position]:
        return source
    return source[:position] + insertion + source[position:]


def diagnostic_source(source):
    start = source.index('bool Adafruit_PN532::inDataExchange(')
    end = source.index("\n}", start) + 2
    body = source[start:end]
    if '[NFC transport]' in body:
        return source
    parts = body.split('return false;')
    if len(parts) != 8:
        raise ValueError('Unexpected exchange implementation; review diagnostics')
    labels = ('length', 'ACK/response timeout', 'ready timeout', 'frame length checksum',
              'PN532 status', 'unexpected response command', 'frame preamble')
    result = ''
    for i, part in enumerate(parts[:-1]):
        result += part + f'PN532DEBUGPRINT.println(F("[NFC transport] {labels[i]}")); '
        if i == 4:
            result += 'PN532DEBUGPRINT.print(F("[NFC transport] status=")); PN532DEBUGPRINT.println(pn532_packetbuffer[7] & 0x3f, HEX); '
        result += 'return false;'
    result += parts[-1]
    return source[:start] + result + source[end:]


def prepare(destination):
    libraries = json.loads(subprocess.check_output(['arduino-cli', 'lib', 'list', '--json'], text=True))
    library = next(item['library'] for item in libraries['installed_libraries']
                   if item['library']['name'] == 'Adafruit PN532')
    if library['version'] != '1.3.4':
        raise ValueError('Expected Adafruit PN532 1.3.4; review patch before changing version')
    source = Path(library['install_dir'])
    # Never modify the installed library or overwrite an existing staged copy.
    body = diagnostic_source(patched_source((source / 'Adafruit_PN532.cpp').read_text()))
    spi = 'new Adafruit_SPIDevice(ss, 1000000, SPI_BITORDER_LSBFIRST,'
    if body.count(spi) != 1:
        raise ValueError('Unexpected hardware SPI constructor')
    body = body.replace(spi, spi.replace('1000000', '300000'))
    shutil.copytree(source, destination)
    (destination / 'Adafruit_PN532.cpp').write_text(body)
    with (destination / 'Adafruit_PN532.h').open('a') as header:
        header.write('\n#define CLASSAI_PN532_RETAINS_TARGET 1\n')
    print('PN532 1.3.4 staged with retained target; installed library preserved.')


if __name__ == '__main__':
    prepare(Path(sys.argv[1]))
