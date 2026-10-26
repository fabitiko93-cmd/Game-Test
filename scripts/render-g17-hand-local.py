"""Original firing arm versus the hand-local grip, with identical body cameras."""
import argparse,importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('hand',Path(__file__).with_name('render-g17-firing-hand.py'))
hand=importlib.util.module_from_spec(spec);spec.loader.exec_module(hand)

def render(original_path,candidate_path,output):
    old=json.loads(Path(original_path).read_text());new=json.loads(Path(candidate_path).read_text())
    sheet=Image.new('RGB',(2400,3020),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(font,47);label=ImageFont.truetype(font,29);small=ImageFont.truetype(font,26)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,27),'G17 · ORIGINALER WAFFENARM · VORSCHAU 08',font=title,fill='white')
    draw.text((37,103),'Rechte Schulter und Armstellung erhalten · Finger und Waffenanschluss korrigiert',font=small,fill='#bdcbd4')
    front={'eye_direction':[-2,.5,5],'target_point':[-.015,1.4,.17],'extent':.69}
    rear={'eye_direction':[-4,.5,-3],'target_point':[-.015,1.4,.17],'extent':.69}
    panels=[('A · URSPRÜNGLICHER WAFFENARM',old,front),('B · GLEICHER WAFFENARM, NEUER GRIFF',new,front),
            ('C · URSPRÜNGLICHER WAFFENARM HINTEN',old,rear),('D · GLEICHER WAFFENARM HINTEN',new,rear),
            ('E · WAFFENHAND UND ABZUGFINGER',hand.firing_scene(new,'R'),{'eye_direction':[-5,.35,.3],'target_point':[0,-.045,0],'extent':.32}),
            ('F · GRIFF MIT STÜTZHAND',hand.firing_scene(new,'RL'),{'eye_direction':[-4,1,3],'target_point':[0,-.045,0],'extent':.32})]
    for i,(caption,scene,camera) in enumerate(panels):
        x=(i%2)*1200;y=180+(i//2)*920;draw.text((x+22,y+8),caption,font=label,fill='#233846')
        image=hand.renderer.render(scene,width=1200,height=850,**camera);sheet.paste(image,(x,y+46))
    angle=f"{new['contactMetrics']['handLocalAttachment']['rightWristBendDegrees']:.1f}".replace('.',',')
    draw.text((35,2950),f'Rechtes Handgelenk: {angle}° wie im Original · Keine Modell- oder Hautgewichtänderung',font=small,fill='#405568')
    draw.text((35,2987),'Statische Vorschau zur Freigabe. Das veröffentlichte Spiel ist unverändert.',font=small,fill='#405568')
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output);return output

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('original',type=Path);p.add_argument('candidate',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();print(render(a.original,a.candidate,a.output))
