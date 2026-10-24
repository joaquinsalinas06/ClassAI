"""Exercise actual NFC_ONLY command functions; inspect both preprocessed GPIO profiles."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SKETCH = ROOT / "firmware/classai_node/classai_node.ino"
compiler = os.getenv("CXX", "g++")
source = SKETCH.read_text()
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp)
    for name in ("WiFi.h", "PubSubClient.h", "Wire.h", "Preferences.h", "ArduinoJson.h", "Adafruit_MLX90614.h", "secrets.h"):
        (out / name).write_text("")
    (out / SKETCH.name).write_text(source)
    for mode in (0, 1):
        text = subprocess.check_output([compiler, "-E", "-P", "-x", "c++", f"-DNFC_ONLY={mode}", "-I", tmp,
                                        "-I", str(SKETCH.parent), str(out / SKETCH.name)], text=True)
        for call in ("digitalWrite(", "digitalRead(", "pinMode(", "Wire.begin("):
            assert (call not in text) if mode else (call in text), (mode, call)
        assert 'Serial.println(eventQueue[eventHead])' not in text
    functions = source[source.index("void labStatus()"):source.index("// RED (sin bucles")]
    functions = functions[:functions.rindex("#endif")]
    stub = r'''
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
struct SerialStub {
  std::string input, output;
  int available() { return input.size(); }
  char read() { char c=input.front(); input.erase(0,1); return c; }
  void println(const char* s) { output+=s; output+='\n'; }
  template<typename... A> void printf(const char* f, A... a) { char s[256]; snprintf(s,sizeof(s),f,a...); output+=s; }
} Serial;
constexpr int WL_CONNECTED=3;
struct { int status() {return WL_CONNECTED;} } WiFi;
struct { bool online=false; bool connected() {return online;} } mqttClient;
bool nfcOk=true, sessionActive=false;
char deviceId[40]="esp32-nfc-lab-010203040506", sessionId[64]="";
unsigned long bootCount=4, sessionSequence=0;
int eventCount=0;
std::vector<std::string> events;
void queueEvent(const char* e, const void*) { events.push_back(e); eventCount++; }
'''
    test = r'''
int main() {
  labCommand("start"); assert(!sessionActive && events.empty());
  mqttClient.online=true; nfcOk=false;
  labCommand("start"); assert(!sessionActive && events.empty());
  nfcOk=true; labCommand("start"); assert(sessionActive && events.size()==1);
  std::string first=sessionId;
  labCommand("start"); assert(events.size()==1 && first==sessionId);
  labCommand("status"); assert(events.size()==1);
  mqttClient.online=false; labCommand("stop"); assert(!sessionActive && events.size()==2);
  assert(events[0]=="SESSION_STARTED" && events[1]=="SESSION_ENDED");
  labCommand("stop"); assert(events.size()==2);
  mqttClient.online=true; Serial.input="start\r\n"; readLabSerial();
  assert(sessionActive && events.size()==3 && first!=sessionId);
  Serial.input=std::string(70,'x')+"\nstatus\n";
  while(Serial.available()) readLabSerial();
  assert(Serial.output.find("Comando demasiado largo")!=std::string::npos);
  assert(Serial.output.find(std::string(24,'x'))==std::string::npos);
  assert(events.size()==3);
  labCommand("stop"); assert(!sessionActive && events.size()==4);
  puts("PASS: actual NFC_ONLY command parser/start/stop/status, overflow, offline gate and profile GPIO guards");
}
'''
    cpp = out / "commands.cpp"
    cpp.write_text(stub + functions + test)
    exe = out / "commands"
    subprocess.run([compiler, "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
# Contract parity across actual C++ and Kotlin, no real credentials.
import re
cpp = (SKETCH.parent / "nfc_protocol.h").read_text()
kotlin = (ROOT / "mobile/android/app/src/main/java/com/classai/mobile/ApduHandler.kt").read_text()
xml = (ROOT / "mobile/android/app/src/main/res/xml/apduservice.xml").read_text()
def command(name):
    body = re.search(rf'{name}\[\]\s*=\s*\{{(.*?)\}}', cpp, re.S).group(1)
    return bytes(int(x,16) for x in re.findall(r'0x([0-9A-Fa-f]+)',body))
select = command("SELECT_APDU")
aid = re.search(r'val AID = "([0-9A-F]+)"',kotlin).group(1)
assert select[5:-1].hex().upper()==aid and aid in xml
get = re.search(r'val GET_CREDENTIAL = "([0-9A-F]+)"',kotlin).group(1)
assert command("GET_CREDENTIAL_APDU").hex().upper()==get
print("PASS: actual Kotlin/XML/C++ AID and GET_CREDENTIAL parity")
