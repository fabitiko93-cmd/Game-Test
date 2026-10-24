from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,PngImagePlugin

p=Path('/workspace/scratch/b1c135e31a11/pose-review')
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
title=ImageFont.truetype(font,42);label=ImageFont.truetype(font,29);small=ImageFont.truetype(font,24)
width,height=1800,3040
board=Image.new('RGB',(width,height),'#f6f7f8');draw=ImageDraw.Draw(board)
draw.rectangle((0,0,width,130),fill='#17242d')
draw.text((36,20),'G17 · ANGELEGT · VORSCHAU 01',font=title,fill='white')
draw.text((38,82),'Dein Entwurf + Handreferenz · Originalmodelle · Noch nicht im Spiel aktiviert',font=small,fill='#c8d6df')
panels=[
 ('DEINE FOTOREFERENZ',Path('/workspace/scratch/b1c135e31a11/upload/IMG_3814.jpeg')),
 ('ÜBERARBEITUNG · MÄNNLICH',p/'male-candidate-g-reference.png'),
 ('DEIN EXPORT · HANDDETAIL',p/'male-user-reference-hands.png'),
 ('ÜBERARBEITUNG · HANDDETAIL',p/'male-candidate-g-reference-hands.png'),
 ('KONTROLLE · ANDERE SEITE',p/'male-candidate-g-support-hands.png'),
 ('ÜBERTRAGUNG · WEIBLICH',p/'female-candidate-g-reference.png'),
 ('WEIBLICH · WAFFENHAND',p/'female-candidate-g-reference-hands.png'),
 ('WEIBLICH · STÜTZHAND',p/'female-candidate-g-support-hands.png'),
]
for i,(name,file) in enumerate(panels):
 x=(i%2)*900;y=150+(i//2)*700
 draw.text((x+28,y+8),name,font=label,fill='#253846')
 image=Image.open(file).convert('RGB');image.thumbnail((872,630),Image.Resampling.LANCZOS)
 board.paste(image,(x+(900-image.width)//2,y+57+(630-image.height)//2))
draw.text((32,2972),'Statische Sichtprüfung. Übergänge und Gameplay werden erst nach der Freigabe integriert.',font=small,fill='#3e5362')
meta=PngImagePlugin.PngInfo();meta.add_text('Description','Actual posed SPERRKREIS character and G17 meshes, CPU z-buffer rasterization. Reference comparison, draft awaiting visual approval.')
out=p/'Sperrkreis_G17_Haltung_Vorschau_01.png';board.save(out,pnginfo=meta,optimize=True)
print(str(out));print(f'{out.stat().st_size} bytes')
