// Test de host para comfort.h contra los casos compartidos con backend/tests/test_tuner.py:
//   g++ -std=c++17 -I firmware/classai_node firmware/classai_node/test/test_comfort.cpp -o /tmp/test_comfort && /tmp/test_comfort
#undef NDEBUG
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include <string>

#include "comfort.h"

int main() {
  ComfortParams sets[2] = {comfortDefaults(), comfortDefaults()};
  sets[1].tempMin = 21.6f;
  sets[1].tempMax = 26.6f;
  sets[1].noiseRelMax = 0.42f;
  sets[1].paramsVersion = 4;
  assert(sets[0].paramsVersion == 0);

  std::string path = __FILE__;
  path = path.substr(0, path.find_last_of('/') + 1) + "comfort_cases.txt";
  FILE* f = fopen(path.c_str(), "r");
  assert(f && "no se encontró comfort_cases.txt");

  char line[256], state[16];
  int n = 0, set, expected;
  float t, rh, lux, noise;
  while (fgets(line, sizeof line, f)) {
    if (line[0] == '#' || line[0] == '\n') continue;
    assert(sscanf(line, "%d %f %f %f %f %d %15s", &set, &t, &rh, &lux, &noise, &expected, state) == 7);
    int c = comfortIndex(sets[set], t, rh, lux, noise);
    const char* s = comfortState(sets[set], c);
    if (c != expected || strcmp(s, state) != 0) {
      fprintf(stderr, "FALLA: %s -> %d %s\n", line, c, s);
      return 1;
    }
    n++;
  }
  fclose(f);
  assert(n >= 15);
  printf("comfort.h OK (%d casos)\n", n);
  return 0;
}
