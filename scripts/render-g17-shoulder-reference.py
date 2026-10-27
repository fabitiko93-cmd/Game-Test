"""Matched-camera review-09/review-10 shoulder renders and approved hand check."""
import argparse
import importlib.util
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('hand',Path(__file__).with_name('render-g17-firing-hand.py'))
hand=importlib.util.module_from_spec(spec);spec.loader.exec_module(hand)


def render(before,approved,after,output):
    old,ref,new=[json.loads(Path(p).read_text()) for p in [before,approved,after]]
    sheet=Image.new('RGB',(2400,3100),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(font,46);label=ImageFont.truetype(font,27);small=ImageFont.truetype(font,25)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,27),'G17 · SCHULTERKORREKTUR · VORSCHAU 10',font=title,fill='white')
    draw.text((37,103),'Schulter nach Bildreferenz ausgerichtet · freigegebene Fingerpose 04 erhalten',font=small,fill='#bdcbd4')
    rear={'eye_direction':[-4,.5,-3],'target_point':[-.015,1.4,.25],'extent':.88}
    front={'eye_direction':[-2,.5,5],'target_point':[-.015,1.4,.22],'extent':.80}
    side={'eye_direction':[-5,.35,.3],'target_point':[-.015,-.030,-.012],'extent':.28}
    panels=[('A · VORHER 09 – SCHRÄG HINTEN',old,rear),('B · NACHHER 10 – GLEICHE KAMERA',new,rear),
            ('C · VORHER 09 – SCHRÄG VORN',old,front),('D · NACHHER 10 – GLEICHE KAMERA',new,front),
            ('E · FREIGEGEBENE WAFFENHAND 04',hand.firing_scene(ref,'R'),side),
            ('F · WAFFENHAND 10 – GLEICHE KAMERA',hand.firing_scene(new,'R'),side)]
    for i,(caption,scene,camera)in enumerate(panels):
        x=(i%2)*1200;y=180+(i//2)*930
        draw.text((x+22,y+8),caption,font=label,fill='#233846')
        sheet.paste(hand.renderer.render(scene,width=1200,height=860,**camera),(x,y+46))
    draw.text((35,3005),'Originalmodell · Schulter und Oberarm neu ausgerichtet · Fingerstellung und Griffkontakt geprüft',font=small,fill='#405568')
    draw.text((35,3048),'Statische 3D-Vorschau. Noch nicht ins Spiel übernommen.',font=small,fill='#405568')
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output);print(output)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('before');p.add_argument('approved');p.add_argument('after');p.add_argument('--output',required=True)
    a=p.parse_args();render(a.before,a.approved,a.after,a.output)
