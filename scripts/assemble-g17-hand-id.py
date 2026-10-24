from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

p=Path('/workspace/scratch/b1c135e31a11/pose-review')
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
big=ImageFont.truetype(font,44);label=ImageFont.truetype(font,31);small=ImageFont.truetype(font,25)
board=Image.new('RGB',(1800,1760),'#f4f6f8');d=ImageDraw.Draw(board)
d.rectangle((0,0,1800,120),fill='#17242d')
d.text((35,18),'G17 · HANDZUORDNUNG · VORSCHAU 02',font=big,fill='white')
d.text((37,77),'Rechts und links gelten aus Sicht der Figur. Farben dienen nur der Kontrolle.',font=small,fill='#d3dee5')
d.rounded_rectangle((30,140,875,200),radius=12,fill='#236dc2')
d.rounded_rectangle((925,140,1770,200),radius=12,fill='#e97e10')
d.text((50,151),'BLAU = RECHTE HAND · hält die Pistole',font=label,fill='white')
d.text((945,151),'ORANGE = LINKE HAND · stützt',font=label,fill='#17242d')
image=Image.open(p/'hand-id-i-arms.png');image.thumbnail((1100,760),Image.Resampling.LANCZOS);board.paste(image,((1800-image.width)//2,220))
for i,(name,file) in enumerate([
 ('RECHTE HAND ALLEIN',p/'hand-id-i-right-only.png'),
 ('MIT LINKER STÜTZHAND · gleiche Kamera',p/'hand-id-i-hands.png')]):
 x=i*900;d.text((x+28,1001),name,font=label,fill='#253846')
 image=Image.open(file);image.thumbnail((872,630),Image.Resampling.LANCZOS);board.paste(image,(x+(900-image.width)//2,1057))
d.text((32,1710),'Separater Prüfentwurf. Die veröffentlichte Spielversion ist unverändert.',font=small,fill='#3e5362')
out=p/'Sperrkreis_G17_Handzuordnung_Vorschau_02.png';board.save(out,optimize=True)
print(str(out))
