"""Rasterize the actual posed model triangles with per-pixel depth testing."""
import json,sys,os
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

OUT=Path(os.environ.get('SPERRKREIS_POSE_OUTPUT',Path(__file__).resolve().parent.parent/'previews/rendered-g17'))
def unit(v):
    v=np.asarray(v,dtype=float);return v/max(np.linalg.norm(v),1e-10)

def render(data,view='reference',detail=False,width=1100,height=950,filename=None,identify=False,hide_side=None,extent=None):
    j={k:np.array(v) for k,v in data['joints'].items()}
    target=(j['Middle2L']+j['Middle2R'])/2 if detail else (j['Head']+j['WristL']+j['WristR']+j['UpperArmL']+j['UpperArmR'])/5
    dirs={'reference':[-4,.6,2.0],'support':[4,.65,2.0],'side':[-5,.2,.1],'top':[-1,4,1.5],'front':[.1,.2,5]}
    eye=unit(dirs[view]);right=unit(np.cross([0,1,0],eye));up=unit(np.cross(eye,right))
    scale=(height/(extent or (.37 if detail else .91)))
    # Keep the hand/gun centre low enough for the complete slide in closeups.
    if detail: target=target+np.array([0,.015,.030])
    zbuf=np.full((height,width),-np.inf,dtype=np.float32)
    yy=np.linspace(0,1,height)[:,None,None]
    rgb=np.broadcast_to(np.array([.92,.935,.95])[None,None,:]*(1-.045*yy),(height,width,3)).copy()
    light=unit(eye*.65+np.array([-1,2,.8]));fill=unit(-eye+np.array([1,.4,.8]))
    for mesh in data['meshes']:
        p=np.asarray(mesh['positions']);delta=p-target
        screen=np.column_stack((width/2+delta@right*scale,height/2-delta@up*scale,delta@eye))
        for fi,(face,colors) in enumerate(zip(mesh['faces'],mesh['colors'])):
            sides=[mesh.get('sides',[None]*len(p))[i] for i in face]
            if hide_side and sides.count(hide_side)>=2:continue
            if identify:colors=[([.025,.20,.72] if s=='R' else [.95,.25,.025] if s=='L' else c) for s,c in zip(sides,colors)]
            t=screen[face];xyz=p[face]
            normal=unit(np.cross(xyz[1]-xyz[0],xyz[2]-xyz[0]));side=mesh.get('faceSides',[2]*len(mesh['faces']))[fi]
            if (side==0 and normal@eye<0) or (side==1 and normal@eye>0):continue
            normal=normal if normal@eye>=0 else -normal
            shade=.42+.49*max(0,normal@light)+.15*max(0,normal@fill)
            x0=max(0,int(np.floor(t[:,0].min())));x1=min(width-1,int(np.ceil(t[:,0].max())))
            y0=max(0,int(np.floor(t[:,1].min())));y1=min(height-1,int(np.ceil(t[:,1].max())))
            if x0>x1 or y0>y1:continue
            (ax,ay),(bx,by),(cx,cy)=t[:,:2];den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
            if abs(den)<1e-9:continue
            xs=np.arange(x0,x1+1)[None,:]+.5;ys=np.arange(y0,y1+1)[:,None]+.5
            a=((by-cy)*(xs-cx)+(cx-bx)*(ys-cy))/den
            b=((cy-ay)*(xs-cx)+(ax-cx)*(ys-cy))/den;c=1-a-b
            depth=a*t[0,2]+b*t[1,2]+c*t[2,2]
            region=zbuf[y0:y1+1,x0:x1+1];mask=(a>=-1e-7)&(b>=-1e-7)&(c>=-1e-7)&(depth>region)
            if not mask.any():continue
            color=np.asarray(colors);linear=(a[:,:,None]*color[0]+b[:,:,None]*color[1]+c[:,:,None]*color[2])*shade
            srgb=np.where(linear<=.0031308,12.92*linear,1.055*np.maximum(linear,0)**(1/2.4)-.055)
            rgb[y0:y1+1,x0:x1+1][mask]=srgb[mask];region[mask]=depth[mask]
    im=Image.fromarray((np.clip(rgb,0,1)*255).astype('uint8'))
    if filename:im.save(filename)
    return im

if __name__=='__main__':
    for file in sys.argv[1:]:
        d=json.loads(Path(file).read_text())
        for view in ['reference','support','side']:
            for detail in [False,True]:
                name=OUT/f"{d['sex']}-{d['variant']}-{view}{'-hands' if detail else ''}.png"
                render(d,view,detail,filename=name)
        print(f"Rendered {d['sex']} {d['variant']}")
