#pragma once
#include <stdint.h>
#include <math.h>
namespace multinode {
enum Role { Access=1, Environment=2, Assistant=3 };
constexpr int accessPins[]={18,19,23,5,13,14,27,32,25,17,35};
constexpr int environmentPins[]={4,34,35,27,26,18,19,23};
constexpr int assistantPins[]={14,23,5,27,26,33,25,22,21,18,19,34,35};
template<unsigned N> constexpr bool unique(const int (&pins)[N]) {
 for(unsigned i=0;i<N;++i)for(unsigned j=i+1;j<N;++j)if(pins[i]==pins[j])return false;
 return true;
}
static_assert(unique(accessPins)&&unique(environmentPins)&&unique(assistantPins),"GPIO conflict");
inline bool fanDesired(bool current,float temperature,int comfort,float maximum,int ok=80,int regular=60) {
 if(!isfinite(temperature)||comfort<0)return false;
 if(comfort<regular&&temperature>maximum)return true;
 if(comfort>=ok||temperature<=maximum-1)return false;
 return current;
}
inline bool elapsed(uint32_t now,uint32_t before,uint32_t duration){return uint32_t(now-before)>=duration;}
inline uint32_t crc32(const uint8_t* data,unsigned length) {
 uint32_t crc=0xffffffffu;
 for(unsigned i=0;i<length;++i){crc^=data[i];for(unsigned bit=0;bit<8;++bit)crc=(crc>>1)^(0xedb88320u&uint32_t(-int32_t(crc&1)));}
 return ~crc;
}
}
