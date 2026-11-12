#include "../node_policy.h"
#include "../access_animation.h"
#include <cassert>
#include <cstring>
int main(){
 using namespace multinode;
 auto noSession=access_ui::frame(access_ui::NoSession,0);
 auto pending=access_ui::frame(access_ui::Waiting,0);auto ok=access_ui::frame(access_ui::Success,0);auto bad=access_ui::frame(access_ui::Rejected,0);
 assert(!pending.led && ok.led && bad.led);
 assert(access_ui::brightness(0)==0 && access_ui::brightness(1024)==1 && access_ui::brightness(4095)==3);
 assert(ok.tone==2500 && access_ui::frame(access_ui::Success,200).tone==0);
 assert(access_ui::frame(access_ui::Success,2000).tone==0);
 assert(memcmp(ok.row,bad.row,8)!=0);
 assert(memcmp(noSession.row,bad.row,8)!=0);
 auto celebrate=access_ui::frame(access_ui::Celebration,0);
 auto duplicate=access_ui::frame(access_ui::Duplicate,0);
 assert(celebrate.row[0]==0x81 && access_ui::frame(access_ui::Celebration,300).row[0]==0);
 assert(memcmp(duplicate.row,ok.row,8)!=0 && duplicate.led);
 assert(access_ui::frame(access_ui::Duplicate,500).tone==0);
 assert(unique(accessPins)&&unique(environmentPins)&&unique(assistantPins));
 assert(!fanDesired(true,NAN,20,24));
 assert(!fanDesired(true,28,-1,24));
 assert(fanDesired(false,28,50,24));
 assert(!fanDesired(true,22,50,24));
 assert(fanDesired(true,24,70,24));
 assert(!fanDesired(true,28,75,24,75,50));
 assert(elapsed(10,0xfffffff0u,25));
 assert(!elapsed(10,0xfffffff0u,27));
 assert(activeFanOverride(1,true,300099,100)==1);
 assert(activeFanOverride(1,true,300100,100)==-1);
 assert(activeFanOverride(0,false,101,100)==-1);
 Reactions reactions;
 reactions.sample(10000,31,.8,30,.5);
 assert(reactions.visible(10000,true)==Reactions::Heat);
 reactions.attendance(10500);
 assert(reactions.visible(11000,true)==Reactions::Attendance);
 reactions.sample(15000,29.5,.8,30,.5);
 assert(reactions.visible(15000,true)==Reactions::Heat);
 reactions.sample(20000,28,.8,30,.5);
 assert(reactions.visible(20000,true)==Reactions::Noise);
 reactions.setSpeaking(true,20500);
 reactions.sample(21000,28,.8,30,.5);
 assert(reactions.visible(21000,true)==Reactions::Idle);
 assert(reactions.visible(21000,false)==Reactions::Idle);
 reactions.setSpeaking(false,22000);
 reactions.sample(27000,31,.1,30,.5);
 assert(reactions.visible(42000,true)==Reactions::Idle);
 const char* fixture="123456789";
 assert(crc32(reinterpret_cast<const uint8_t*>(fixture),strlen(fixture))==0xcbf43926u);
}
