"""Render the original firing-hand skin and G17, with other body parts omitted."""
import argparse,importlib.util,json,re
from copy import deepcopy
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('pose_renderer',Path(__file__).with_name('render-pose-preview.py'))
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)

def firing_scene(data):
    result=deepcopy(data);x,y,z,w=data['weaponQuaternion']
    r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    origin=np.asarray(data['weaponOrigin']);result['joints']={k:((np.asarray(v)-origin)@r).tolist() for k,v in data['joints'].items()}
    result['meshes']=[]
    for mesh in data['meshes']:
        m=deepcopy(mesh);p=(np.asarray(m['positions'])-origin)@r;m['positions']=p.tolist()
        if m.get('normals'):m['normals']=(np.asarray(m['normals'])@r).tolist()
        if any(m.get('boneNames',[])):
            allowed=np.array([bool(re.match(r'^(Wrist|LowerArm|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])R$',n or '')) for n in m['boneNames']])
            faces=np.asarray(m['faces']);keep=allowed[faces].all(1)&(p[faces][...,2].max(1)>-.26)
            for key in ['faces','colors','faceSides']:m[key]=[v for v,k in zip(m[key],keep) if k]
        result['meshes'].append(m)
    return result

VIEWS=[('A · AUSSENSEITE',[-5,.35,.3]),('B · INNENSEITE MIT DAUMEN',[5,.35,.3]),('C · SCHRÄG VORN',[-4,.9,3]),('D · VON OBEN',[-.4,5,1.1])]

def render_views(data,folder,prefix='right',width=1200,height=950):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True);scene=firing_scene(data);images=[]
    for i,(label,eye)in enumerate(VIEWS):
        path=folder/f'{prefix}-{i+1}.png'
        im=renderer.render(scene,detail=True,width=width,height=height,extent=.28,eye_direction=eye,target_point=[-.015,-.030,-.012],filename=path)
        images.append(im)
    return images

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--output',type=Path);args=parser.parse_args()
    source=args.source;data=json.loads(source.read_text());folder=source.parent
    images=render_views(data,folder)
    sheet=Image.new('RGB',(2400,2220),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    font=ImageFont.truetype(font_path,30);title=ImageFont.truetype(font_path,52);small=ImageFont.truetype(font_path,28)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,26),'G17 · RECHTE WAFFENHAND · VORSCHAU 04',font=title,fill='white')
    draw.text((37,103),'Originalmodell · männliche Figur · vier Ansichten derselben Pose',font=small,fill='#bdcbd4')
    for i,im in enumerate(images):
        x=(i%2)*1200;y=180+(i//2)*990;draw.text((x+20,y+8),VIEWS[i][0],font=font,fill='#233846');sheet.paste(im,(x,y+40))
    draw.text((35,2170),'Statische Prüfansicht der Waffenhand. Noch nicht im Spiel übernommen.',font=small,fill='#405568')
    path=args.output or folder/'right-study.png';path.parent.mkdir(parents=True,exist_ok=True);sheet.save(path);print(path)
