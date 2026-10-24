import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('pn532_patch', Path(__file__).with_name('prepare-pn532.py'))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class Pn532PatchTest(unittest.TestCase):
    def test_keeps_same_target_before_uid_is_returned_and_is_idempotent(self):
        source = ('// upstream\nbool Adafruit_PN532::readDetectedPassiveTargetID(uint8_t *uid) {\n'
                  '  if (pn532_packetbuffer[7] != 1) return 0;\n'
                  '  uint16_t sens_res = pn532_packetbuffer[9];\n  return 1;\n}')
        result = patch.patched_source(source)
        self.assertLess(result.index('if (pn532_packetbuffer[7]'), result.index('_inListedTag ='))
        self.assertLess(result.index('_inListedTag ='), result.index('uint16_t sens_res'))
        self.assertIn('_inListedTag = pn532_packetbuffer[8]', result)
        self.assertEqual(result, patch.patched_source(result))

    def test_unknown_source_is_rejected(self):
        with self.assertRaises(ValueError):
            patch.patched_source('different upstream implementation')

    def test_anchor_in_another_function_is_not_patched(self):
        with self.assertRaises(ValueError):
            patch.patched_source('bool Adafruit_PN532::readDetectedPassiveTargetID() {\n}\n'
                                 '  uint16_t sens_res = pn532_packetbuffer[9];')

    def test_reader_does_not_activate_the_target_twice(self):
        reader = Path(__file__).resolve().parents[2] / 'firmware/classai_node/nfc_reader.cpp'
        self.assertNotIn('nfc.inListPassiveTarget()', reader.read_text())


class DiagnosticPatchTest(unittest.TestCase):
    def test_each_failure_gets_a_label_without_payload_dump(self):
        source = 'bool Adafruit_PN532::inDataExchange() {\n' + '  return false;\n' * 7 + '}\n'
        result = patch.diagnostic_source(source)
        self.assertEqual(result.count('[NFC transport]'), 8)
        self.assertEqual(result.count('return false;'), 7)
        self.assertNotIn('PrintHex', result)
        self.assertEqual(result, patch.diagnostic_source(result))

    def test_upstream_changes_fail_closed(self):
        with self.assertRaises(ValueError):
            patch.diagnostic_source('bool Adafruit_PN532::inDataExchange() {\nreturn false;\n}')
