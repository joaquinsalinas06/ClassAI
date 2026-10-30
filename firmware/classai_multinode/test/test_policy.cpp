#include "../node_policy.h"
#include <cassert>
#include <cstring>
int main(){
 using namespace multinode;
 assert(unique(accessPins)&&unique(environmentPins)&&unique(assistantPins));
 assert(!fanDesired(true,NAN,20,24));
 assert(!fanDesired(true,28,-1,24));
 assert(fanDesired(false,28,50,24));
 assert(!fanDesired(true,22,50,24));
 assert(fanDesired(true,24,70,24));
 assert(!fanDesired(true,28,75,24,75,50));
 assert(elapsed(10,0xfffffff0u,25));
 assert(!elapsed(10,0xfffffff0u,27));
 const char* fixture="123456789";
 assert(crc32(reinterpret_cast<const uint8_t*>(fixture),strlen(fixture))==0xcbf43926u);
}
