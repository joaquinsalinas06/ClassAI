#pragma once
#include <stdint.h>
namespace access_ui {
enum Expression { Sleeping, Awake, Waiting, Success, Rejected, Duplicate, Celebration, NoSession };
inline uint8_t brightness(unsigned adc){return adc>4095?3:adc/1024;}
struct Note { uint16_t hz, ms; };
// Jingles originales estilo 8-bit. hz=0 es silencio. Con buzzer activo suena el ritmo; con pasivo, las notas.
constexpr Note kSuccess[]={{1047,80},{0,25},{1319,80},{0,25},{1568,80},{0,25},{2093,240}};
constexpr Note kCelebration[]={{784,70},{0,20},{1047,70},{0,20},{1319,70},{0,20},{1568,70},{0,20},{1319,70},{0,20},{1568,90},{0,40},{2093,320}};
constexpr Note kDuplicate[]={{1568,60},{0,50},{1568,60}};
constexpr Note kRejected[]={{784,140},{0,40},{523,280}};
inline unsigned melody(const Note* n,unsigned count,uint32_t t){for(unsigned i=0;i<count;i++){if(t<n[i].ms)return n[i].hz;t-=n[i].ms;}return 0;}
struct Frame { uint8_t row[8]; bool led; unsigned tone; };
inline Frame frame(Expression state, uint32_t elapsed) {
 const uint8_t sleep[8]={0,0,0x66,0,0,0x18,0,0};
 const uint8_t eyes[8]={0,0x24,0x24,0,0x42,0x42,0x3c,0};
 const uint8_t blink[8]={0,0,0x66,0,0x42,0x42,0x3c,0};
 const uint8_t happy[8]={0,0x24,0x24,0,0x42,0x42,0x3c,0};
 const uint8_t fail[8]={0,0x24,0x24,0,0x3c,0x42,0x42,0};
 const uint8_t duplicate[8]={0,0x20,0x26,0,0x42,0x42,0x3c,0};
 const uint8_t noSession[8]={0x18,0x24,0x04,0x08,0x10,0,0x10,0};
 const uint8_t* src=state==NoSession?noSession:state==Duplicate?duplicate:state==Celebration?happy:state==Sleeping?sleep:state==Rejected?fail:state==Success?happy:state==Awake&&elapsed%4000<180?blink:eyes;
 Frame f{};for(unsigned i=0;i<8;i++)f.row[i]=src[i];
 if(state==Waiting){for(unsigned i=0;i<8;i++)f.row[i]=0;f.row[2+(elapsed/250)%4]=0x18;}
 if(state==Success){f.led=elapsed%300<150;f.tone=melody(kSuccess,sizeof(kSuccess)/sizeof(Note),elapsed);}
 if(state==Celebration){f.led=elapsed%300<150;f.tone=melody(kCelebration,sizeof(kCelebration)/sizeof(Note),elapsed);}
 if(state==Celebration&&elapsed%500<250){f.row[0]=0x81;f.row[7]=0x81;}
 if(state==Duplicate){f.led=elapsed<120;f.tone=melody(kDuplicate,sizeof(kDuplicate)/sizeof(Note),elapsed);}
 if(state==Rejected){f.led=elapsed%500<100;f.tone=melody(kRejected,sizeof(kRejected)/sizeof(Note),elapsed);}
 return f;
}
inline Frame rotated180(const Frame& source) {
 Frame result=source;
 for(unsigned y=0;y<8;++y){uint8_t x=source.row[7-y], r=0;for(unsigned b=0;b<8;++b){r=uint8_t((r<<1)|(x&1));x>>=1;}result.row[y]=r;}
 return result;
}
}
