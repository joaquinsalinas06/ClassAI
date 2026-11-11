#pragma once
#include <stdint.h>
namespace access_ui {
enum Expression { Sleeping, Awake, Waiting, Success, Rejected, Duplicate, Celebration, NoSession };
inline uint8_t brightness(unsigned adc){return adc>4095?3:adc/1024;}
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
 if(state==Success||state==Celebration){f.led=elapsed%350<180;if(elapsed<650)f.tone=elapsed<150?2500:elapsed<300?0:elapsed<450?3000:elapsed<550?0:3500;}
 if(state==Celebration&&elapsed%500<250){f.row[0]=0x81;f.row[7]=0x81;}
 if(state==Duplicate){f.led=elapsed<120;if(elapsed<100)f.tone=2500;}
 if(state==Rejected){f.led=elapsed%500<100;if(elapsed<300)f.tone=2500;}
 return f;
}
}
