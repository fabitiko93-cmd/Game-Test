/* Sample the author's FBX 6000 files without changing their rig or timing.
 * Build with ufbx v0.20.1: cc -O2 -I/path/to/ufbx sample-revolver-fbx.c
 * /path/to/ufbx/ufbx.c -lm -o /tmp/sample-revolver-fbx
 * Usage: sample-revolver-fbx source.fbx > source.json
 * ufbx is an offline build tool, not a runtime dependency. */
#include "ufbx.h"
#include <math.h>
#include <stdio.h>

static const char *names[]={"Pelvis","Spine1","Spine2","Spine3","R_Clavicle","R_Arm","R_Forearm","R_Hand","L_Clavicle","L_Arm","L_Forearm","L_Hand","Head"};
static void pose(const ufbx_scene *s) {
    printf("{");
    for(size_t i=0;i<sizeof(names)/sizeof(*names);i++) {
        ufbx_node *n=ufbx_find_node(s,names[i]);
        ufbx_transform t=ufbx_matrix_to_transform(&n->node_to_world);
        printf("%s\"%s\":{\"position\":[%.9g,%.9g,%.9g],\"quaternion\":[%.9g,%.9g,%.9g,%.9g]}",i?",":"",names[i],t.translation.x,t.translation.y,t.translation.z,t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w);
    }
    printf("}");
}
int main(int argc,char **argv) {
    if(argc!=2)return 2;
    ufbx_error error;
    ufbx_scene *s=ufbx_load_file(argv[1],NULL,&error);
    if(!s){fprintf(stderr,"FBX load failed: %s\n",error.description.data);return 1;}
    ufbx_anim_stack *a=s->anim_stacks.data[0];
    double duration=a->time_end-a->time_begin;
    int count=(int)ceil(duration*30.0);
    printf("{\"sourceClip\":\"%s\",\"duration\":%.9g,\"sampleRate\":30,\"rest\":",a->name.data,duration);
    pose(s);printf(",\"frames\":[");
    for(int i=0;i<=count;i++) {
        ufbx_scene *frame=ufbx_evaluate_scene(s,a->anim,a->time_begin+duration*i/count,NULL,&error);
        if(!frame)return 1;
        if(i)printf(",");pose(frame);ufbx_free_scene(frame);
    }
    printf("]}\n");ufbx_free_scene(s);return 0;
}
