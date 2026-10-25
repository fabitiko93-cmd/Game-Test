from pathlib import Path
import os,json,importlib.util
from PIL import Image,ImageDraw,ImageFont

root=Path(__file__).resolve().parent.parent
p=Path(os.environ.get('SPERRKREIS_POSE_OUTPUT',root/'previews/rendered-g17'))
spec=importlib.util.spec_from_file_location('pose_renderer',root/'scripts/render-pose-preview.py');renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
data=json.loads((p/'male-candidate-fit-mesh.json').read_text())
for name,view,hidden in [('both','reference',None),('right','reference','L'),('other','support',None)]:
    renderer.render(data,view,True,width=1400,height=1050,extent=.30,hide_side=hidden,filename=p/f'grip03-{name}.png')

font='DejaVuSans.ttf';title=ImageFont.truetype(font,39);label=ImageFont.truetype(font,29);small=ImageFont.truetype(font,23)
board=Image.new('RGB',(1800,1690),'#f5f7f8');d=ImageDraw.Draw(board)
d.rectangle((0,0,1800,125),fill='#17242d');d.text((32,18),'G17 · GRIFFKORREKTUR · VORSCHAU 03',font=title,fill='white')
d.text((34,76),'Männliches Modell · statischer Griffentwurf · Spielversion unverändert',font=small,fill='#d0dee6')
reference=os.environ.get('SPERRKREIS_REFERENCE_IMAGE')
panels=[('DEINE REFERENZ · HANDDETAIL',None),('KORRIGIERTER ENTWURF · BEIDE HÄNDE',p/'grip03-both.png'),('WAFFENHAND ALLEIN · GLEICHE KAMERA',p/'grip03-right.png'),('BEIDE HÄNDE · GEGENANSICHT',p/'grip03-other.png')]
for i,(name,file) in enumerate(panels):
    x=(i%2)*900;y=145+(i//2)*740;d.text((x+24,y+8),name,font=label,fill='#253846')
    if file:im=Image.open(file).convert('RGB')
    elif reference:
        im=Image.open(reference).convert('RGB');w,h=im.size;im=im.crop((int(w*.41),int(h*.34),int(w*.96),int(h*.93)))
    else:
        d.text((x+35,y+120),'Referenzbild: SPERRKREIS_REFERENCE_IMAGE setzen',font=small,fill='#526371');continue
    im.thumbnail((870,650),Image.Resampling.LANCZOS);board.paste(im,(x+(900-im.width)//2,y+60+(650-im.height)//2))
d.text((32,1640),'Referenz und drei Ansichten derselben Modellpose. Noch nicht im Spiel übernommen.',font=small,fill='#3e5362')
file=p/'Sperrkreis_G17_Griffkorrektur_Vorschau_03.png';board.save(file,optimize=True);print(str(file))
