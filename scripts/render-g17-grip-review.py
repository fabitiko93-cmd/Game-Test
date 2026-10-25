"""Six inspection views of the original posed hands, with a separate ID view."""
import argparse,importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('hand_renderer',Path(__file__).with_name('render-g17-firing-hand.py'))
hand=importlib.util.module_from_spec(spec);spec.loader.exec_module(hand)

VIEWS=[
    ('A · AUSSENSEITE',[-5,.4,.4],False),
    ('B · DAUMENSEITE',[5,.4,.4],False),
    ('C · SCHRÄG VORN',[-4,1,3],False),
    ('D · SCHRÄG HINTEN',[3,1,-3],False),
    ('E · VON OBEN',[-.4,5,1.1],False),
    ('F · HANDZUORDNUNG',[-4,1,3],True),
]

def assemble(source,output):
    data=json.loads(Path(source).read_text());scene=hand.firing_scene(data,'RL')
    sheet=Image.new('RGB',(2400,3250),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    fonts='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(fonts,52);label=ImageFont.truetype(fonts,30);small=ImageFont.truetype(fonts,28)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,27),'G17 · BEIDE HÄNDE · VORSCHAU 05',font=title,fill='white')
    draw.text((37,103),'Freigegebene rechte Waffenhand unverändert · linke Stützhand als Entwurf',font=small,fill='#bdcbd4')
    for i,(caption,eye,identify) in enumerate(VIEWS):
        x=(i%2)*1200;y=180+(i//2)*990
        draw.text((x+22,y+8),caption,font=label,fill='#233846')
        im=hand.renderer.render(scene,detail=True,width=1200,height=920,extent=.32,eye_direction=eye,target_point=[0,-.045,0],identify=identify)
        sheet.paste(im,(x,y+46))
    draw.rectangle((35,3177,63,3205),fill='#2f77d0');draw.text((76,3174),'Rechts: freigegebene Waffenhand',font=small,fill='#233846')
    draw.rectangle((760,3177,788,3205),fill='#fa892c');draw.text((801,3174),'Links: neue Stützhand',font=small,fill='#233846')
    draw.text((35,3217),'Statische Handreferenz zur Freigabe. Noch nicht im Spiel übernommen.',font=small,fill='#405568')
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output);return output

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();print(assemble(a.source,a.output))
