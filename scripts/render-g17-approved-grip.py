"""Same-camera hand and shoulder comparisons, rendered from original skinned triangles."""
import argparse,importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('hand',Path(__file__).with_name('render-g17-firing-hand.py'))
hand=importlib.util.module_from_spec(spec);spec.loader.exec_module(hand)


def render(original_path,reference_path,candidate_path,output):
    old,ref,new=[json.loads(Path(p).read_text()) for p in [original_path,reference_path,candidate_path]]
    sheet=Image.new('RGB',(2400,3100),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(font,46);label=ImageFont.truetype(font,27);small=ImageFont.truetype(font,25)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,27),'G17 · FREIGEGEBENER GRIFF · VORSCHAU 09',font=title,fill='white')
    draw.text((37,103),'Fingerstellung aus Vorschau 04 · Schulter und Oberarm in Originalstellung',font=small,fill='#bdcbd4')
    side={'eye_direction':[-5,.35,.3],'target_point':[-.015,-.030,-.012],'extent':.28}
    rear={'eye_direction':[-4,.5,-3],'target_point':[-.015,1.4,.25],'extent':.88}
    front={'eye_direction':[-2,.5,5],'target_point':[-.015,1.4,.22],'extent':.78}
    panels=[('A · WAFFENHAND 04 – FREIGEGEBEN',hand.firing_scene(ref,'R'),side),
            ('B · WAFFENHAND 09 – GLEICHE KAMERA',hand.firing_scene(new,'R'),side),
            ('C · URSPRÜNGLICHE SCHULTER',old,rear),('D · SCHULTER MIT ÜBERNOMMENEM GRIFF',new,rear),
            ('E · NEUE GESAMTHALTUNG',new,front),
            ('F · NEUER GRIFF MIT STÜTZHAND',hand.firing_scene(new,'RL'),{'eye_direction':[-4,1,3],'target_point':[-.015,-.030,-.012],'extent':.28})]
    for i,(caption,scene,camera) in enumerate(panels):
        x=(i%2)*1200;y=180+(i//2)*930;draw.text((x+22,y+8),caption,font=label,fill='#233846')
        im=hand.renderer.render(scene,width=1200,height=860,**camera);sheet.paste(im,(x,y+46))
    draw.text((35,3005),'Körper ca. 17° schräg zur Waffenrichtung · Handgelenk rechts 24° · Schulter ohne Abweichung',font=small,fill='#405568')
    draw.text((35,3048),'Statische Vorschau am Originalmodell. Noch nicht im Spiel übernommen.',font=small,fill='#405568')
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output);return output


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('original',type=Path);p.add_argument('reference',type=Path);p.add_argument('candidate',type=Path)
    p.add_argument('--output',required=True,type=Path);a=p.parse_args();print(render(a.original,a.reference,a.candidate,a.output))
