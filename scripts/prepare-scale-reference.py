#!/usr/bin/env python3
"""Measure the original pack and render the agreed scale reference, not new art.

python scripts/prepare-scale-reference.py /path/to/original.glb
Requires the same numpy/Pillow environment as prepare-zombies.py.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("zombies", ROOT / "scripts/prepare-zombies.py")
zombies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(zombies)
W, H, S, P, BASE = 1600, 820, 2, 240, 650
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


class Plate:
    def __init__(self, iso, reference):
        self.iso, self.reference = iso, reference
        self.base = BASE - 60 if iso else BASE
        self.image = Image.new("RGB", (W*S, H*S), "#15231e")
        self.draw = ImageDraw.Draw(self.image)
        self.camera = np.array([math.sqrt(.375), .5, math.sqrt(.375)]) if iso else np.array([0., 0., 1.])
        self.right = np.array([1., 0., -1.])/math.sqrt(2) if iso else np.array([1., 0., 0.])
        self.up = np.cross(self.camera, self.right)
        self.y_scale = self.up[1]

    def text(self, x, y, text, size=22, color="#e2e9df", bold=False, anchor="lt"):
        self.draw.text((x*S, y*S), text, fill=color,
                       font=ImageFont.truetype(BOLD if bold else FONT, size*S), anchor=anchor)

    def line(self, points, color="#697a6c", width=1):
        self.draw.line([(x*S, y*S) for x,y in points], fill=color, width=max(1, round(width*S)))

    def polygon(self, points, color):
        self.draw.polygon([(x*S, y*S) for x,y in points], fill=color)

    def point(self, v, x):
        return x + float(v @ self.right)*P, self.base - float(v @ self.up)*P

    def mesh(self, vertices, indices, colors, x, cull=False):
        triangles = vertices[indices]
        normals = np.cross(triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0])
        normals /= np.maximum(np.linalg.norm(normals, axis=1)[:,None], 1e-9)
        visible = normals @ self.camera > 0 if cull else np.ones(len(indices),dtype=bool)
        normals *= np.where(normals @ self.camera < 0, -1, 1)[:,None]
        light = np.array([-.3, .85, .45]); light /= np.linalg.norm(light)
        shade = .65 + .35*np.maximum(0, normals @ light)
        lit = np.clip(colors * shade[:,None], 0, 255).astype(np.uint8)
        points = [self.point(v, x) for v in vertices]
        for i in np.argsort(triangles.mean(axis=1) @ self.camera, kind="stable"):
            if not visible[i]: continue
            self.polygon([points[j] for j in indices[i]], tuple(lit[i]))

    def box(self, x, width, height, depth, color):
        v = np.array([[a,b,c] for a,b,c in [
            (-width/2,0,-depth/2),(width/2,0,-depth/2),(width/2,0,depth/2),(-width/2,0,depth/2),
            (-width/2,height,-depth/2),(width/2,height,-depth/2),(width/2,height,depth/2),(-width/2,height,depth/2)]])
        indices = np.array([[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7],[4,5,6],[4,6,7]])
        self.mesh(v, indices[:,[0,2,1]], np.tile(color,(len(indices),1)), x,cull=True)

    def front_line(self, x, width, height, depth, y, inset=.04):
        self.line([self.point(np.array([-width/2+inset,y,depth/2+.001]),x),
                   self.point(np.array([width/2-inset,y,depth/2+.001]),x)], "#596258", 2)

    def placeholder(self, x, height, future=False):
        # Exact same silhouette coordinates as the current untextured player.
        sx = self.reference['player']['shoulderWidth'] * P / 22
        sy = height * P * self.y_scale / 41
        def pt(a,b): return x+a*sx, self.base+(b-3)*sy
        def rect(a,b,w,h,color):
            self.polygon([pt(a,b),pt(a+w,b),pt(a+w,b+h),pt(a,b+h)],color)
        def stroke(points,color,width):
            a,b = np.array(points[0],dtype=float),np.array(points[1],dtype=float)
            d=b-a;normal=np.array([-d[1],d[0]])/np.linalg.norm(d)*width/2
            self.polygon([pt(*v) for v in [a+normal,b+normal,b-normal,a-normal]],color)
        skin = "#c0a894" if future else "#b78e6e"
        coat = "#64726a" if future else "#46564a"
        stroke([(-4,-7),(-7,1)],"#303a33",5)
        stroke([(4,-7),(7,1)],"#303a33",5)
        rect(-9,0,7,3,"#303a33");rect(2,0,7,3,"#303a33")
        rect(-9,-27,18,20,coat); rect(-9,-22,5,15,"#26382d")
        rect(-5,-36,10,10,skin); rect(-6,-38,12,5,"#45392e")
        rect(-11,-25,4,14,"#778578"); rect(7,-25,4,14,"#778578")

    def background(self):
        name = "Spielperspektive · 2:1" if self.iso else "Frontalansicht"
        self.text(54,32,"SPERRKREIS 98",20,"#c5b77b",True)
        self.text(54,69,"Gemeinsamer Größenmaßstab",34,bold=True)
        self.text(W-54,80,name,22,"#becbbc",anchor="rt")
        for value in [0,.5,1,1.5,2]:
            y = self.base-value*P*self.y_scale
            self.line([(108,y),(W-45,y)],"#3a4d40" if value else "#a0ac92",1.5 if not value else 2)
            label = (f"{value:.1f}".replace('.',','))+" m"
            self.text(91,y,label,17,"#acbca9",anchor="rm")
        self.text(54,136,"Höhe am Objektmittelpunkt" if self.iso else "Referenzhöhe über Boden",15,"#9fb29f")

    def label(self, x, name, value, detail):
        self.text(x,688,name,21,bold=True,anchor="mt")
        self.text(x,722,value,25,"#d1c38b",anchor="mt")
        self.text(x,758,detail,15,"#adbdab",anchor="mt")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb")
    args = parser.parse_args()
    pack = zombies.Pack(args.glb)
    ref_file = ROOT / "docs/assets/reference-scale.json"
    reference = json.loads(ref_file.read_text())
    assert pack.sha == reference['zombies']['sourceSha256']
    poses = [pack.pose(i,2,0) for i in range(10)]
    measured = [float(np.ptp(pose[0][:,1])) for pose in poses]
    reference['zombies']['sourceReferenceHeights'] = [round(h,6) for h in measured]
    ref_file.write_text(json.dumps(reference,ensure_ascii=False,indent=2)+"\n")
    output = ROOT / "docs/assets/scale-reference"
    output.mkdir(parents=True,exist_ok=True)
    for iso in [False,True]:
        plate = Plate(iso,reference);plate.background()
        plate.placeholder(225,reference['player']['height'])
        plate.placeholder(435,reference['player']['futureFemaleHeight'],True)
        for variant,x,height in [(2,665,reference['zombies']['femaleHeights'][2]),
                                 (7,895,reference['zombies']['maleHeights'][2])]:
            v,idx,colors = poses[variant]
            v = v.copy();v[:,1] -= v[:,1].min()
            # One fixed uniform scale per model, shared with the game profile.
            v *= height / reference['zombies']['sourceReferenceHeights'][variant]
            plate.mesh(v,idx,colors,x)
        door,fridge = reference['door'],reference['fridge']
        plate.box(1135,door['width'],door['height'],door['depth'],[125,94,63])
        for level in [.22,1.13,1.74]:plate.front_line(1135,door['width'],door['height'],door['depth'],level,.1)
        h1 = plate.point(np.array([.25,1.,door['depth']/2+.005]),1135)
        h2 = plate.point(np.array([.34,1.,door['depth']/2+.005]),1135)
        plate.line([h1,h2],"#d0b46e",4)
        plate.box(1400,fridge['width'],fridge['height'],fridge['depth'],[205,210,196])
        plate.front_line(1400,fridge['width'],fridge['height'],fridge['depth'],.65,.005)
        for lower,upper in [(.39,.55),(.76,1.02)]:
            plate.line([plate.point(np.array([.24,lower,fridge['depth']/2+.003]),1400),
                        plate.point(np.array([.24,upper,fridge['depth']/2+.003]),1400)],"#788375",4)
        plate.label(225,"Player · Platzhalter","1,80 m","aktuelle Referenzfigur")
        plate.label(435,"Spätere Figur","1,68 m","für später vorgemerkt")
        plate.label(665,"Zombie · weiblich","1,68 m","Originalmodell")
        plate.label(895,"Zombie · männlich","1,80 m","Originalmodell")
        plate.label(1135,"DIN-Türblatt","1,985 m","0,86 m breit · DIN 18101")
        plate.label(1400,"Kühlgerät","1,86 m","0,60 m breit · 0,665 m tief")
        plate.text(54,796,"Maßreferenzen: DIN-Türblatt und Bosch KGN362LAF. Kühlschrankmaß ist keine DIN und kein belegter nationaler Verkaufsrang.",14,"#92a68f")
        result = plate.image.resize((W,H),Image.Resampling.LANCZOS)
        filename = output / ("isometric.png" if iso else "front.png")
        result.save(filename,optimize=True)
        print(filename,filename.stat().st_size)


if __name__ == "__main__": main()
