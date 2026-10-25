"""Original-model wrist comparison, relaxed support hand and upper-body context."""
import argparse,importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

spec=importlib.util.spec_from_file_location('hand_renderer',Path(__file__).with_name('render-g17-firing-hand.py'))
hand=importlib.util.module_from_spec(spec);spec.loader.exec_module(hand)

def assemble(source,before,output):
    data=json.loads(Path(source).read_text());old=json.loads(Path(before).read_text())
    right=hand.firing_scene(data,'R');old_right=hand.firing_scene(old,'R');both=hand.firing_scene(data,'RL')
    angles=data['contactMetrics']['alignedRight']
    def angle(n):return f'{n:.1f}'.replace('.',',')+'°'
    sheet=Image.new('RGB',(2400,3250),'#f4f7f9');draw=ImageDraw.Draw(sheet)
    fonts='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title=ImageFont.truetype(fonts,49);label=ImageFont.truetype(fonts,29);small=ImageFont.truetype(fonts,27)
    draw.rectangle((0,0,2400,159),fill='#192630')
    draw.text((35,27),'G17 · ARMANSCHLUSS UND STÜTZHAND · VORSCHAU 06',font=title,fill='white')
    draw.text((37,103),'Rechter Griff erhalten · Armführung korrigiert · Stützhand lockerer ausgerichtet',font=small,fill='#bdcbd4')
    panels=[
        ('A · BISHER: RECHTES HANDGELENK '+angle(angles['beforeDegrees']),old_right,[-5,.35,.3],False,False),
        ('B · NEU: RECHTES HANDGELENK '+angle(angles['afterDegrees']),right,[-5,.35,.3],False,False),
        ('C · NEUER GEMEINSAMER GRIFF',both,[-4,1,3],False,False),
        ('D · STÜTZHAND UND DAUMEN',both,[5,.4,.4],False,False),
        ('E · SCHULTERN UND ARMFÜHRUNG',data,[-2,.5,5],False,True),
        ('F · HANDZUORDNUNG',both,[-4,1,3],True,False),
    ]
    for i,(caption,scene,eye,identify,context)in enumerate(panels):
        x=(i%2)*1200;y=180+(i//2)*990;draw.text((x+22,y+8),caption,font=label,fill='#233846')
        kwargs={'detail':not context,'width':1200,'height':920,'extent':.85 if context else .32,'eye_direction':eye,'identify':identify}
        if not context:kwargs['target_point']=[-.015,-.035,-.015] if i<2 else [0,-.045,0]
        image=hand.renderer.render(scene,**kwargs);sheet.paste(image,(x,y+46))
    draw.rectangle((35,3177,63,3205),fill='#2f77d0');draw.text((76,3174),'Rechts: Waffenhand',font=small,fill='#233846')
    draw.rectangle((575,3177,603,3205),fill='#fa892c');draw.text((616,3174),'Links: Stützhand',font=small,fill='#233846')
    draw.text((35,3216),'3D-Beugewinkel: Unterarm zu Mittelhand. Statische Vorschau; noch nicht im Spiel übernommen.',font=small,fill='#405568')
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output);return output

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--before',required=True,type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args();print(assemble(a.source,a.before,a.output))
