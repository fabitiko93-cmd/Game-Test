#!/usr/bin/env python3
"""Package the supplied CC0 Quaternius glTF characters and OBJ interiors.

python scripts/prepare-quaternius.py /path/to/quaternius-source
Source layout: male/*.gltf, female/*.gltf, interior/**/*.obj + .mtl.
Original rigs, separate clothing meshes and all authored animation keys survive.
"""
import argparse
import base64
import gzip
import hashlib
import json
import struct
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[1]

def glb(document,binary):
    document['buffers']=[{'byteLength':len(binary)}]
    data=json.dumps(document,separators=(',',':'),allow_nan=False).encode()
    data+=b' '*(-len(data)%4);binary+=b'\0'*(-len(binary)%4)
    return struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary

def write_asset(output,name,raw):
    compressed=gzip.compress(raw,compresslevel=9,mtime=0)
    filename=f'{name}-{hashlib.sha256(compressed).hexdigest()[:12]}.glb.gz'
    (output/filename).write_bytes(compressed)
    return filename

class MeshDocument:
    def __init__(self):
        self.binary=bytearray()
        self.g={'asset':{'version':'2.0','generator':'SPERRKREIS 98 Quaternius metric importer'},'scene':0,
                'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],'meshes':[{'primitives':[]}],
                'materials':[],'accessors':[],'bufferViews':[]}
    def accessor(self,values,kind):
        a=np.asarray(values,dtype='<f4');a=a.reshape((-1,3))
        while len(self.binary)%4:self.binary.append(0)
        view=len(self.g['bufferViews']);self.g['bufferViews'].append({'buffer':0,'byteOffset':len(self.binary),'byteLength':a.nbytes})
        self.binary.extend(a.tobytes())
        index=len(self.g['accessors']);self.g['accessors'].append({'bufferView':view,'componentType':5126,'count':len(a),'type':kind,'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()})
        return index

def read_obj(path):
    vertices=[];normals=[];groups={};material='Default'
    for line in path.read_text().splitlines():
        words=line.split()
        if not words:continue
        if words[0]=='v':vertices.append(list(map(float,words[1:4])))
        elif words[0]=='vn':normals.append(list(map(float,words[1:4])))
        elif words[0]=='usemtl':material=words[1]
        elif words[0]=='f':
            face=[]
            for word in words[1:]:
                parts=word.split('/');face.append((int(parts[0])-1,int(parts[2])-1 if len(parts)>2 and parts[2] else None))
            for i in range(1,len(face)-1):groups.setdefault(material,[]).append([face[0],face[i],face[i+1]])
    colors={};material='Default'
    for line in path.with_suffix('.mtl').read_text().splitlines():
        words=line.split()
        if not words:continue
        if words[0]=='newmtl':material=words[1]
        elif words[0]=='Kd':colors[material]=list(map(float,words[1:4]))
    return np.array(vertices),np.array(normals),groups,colors

def furniture(path):
    v,n,groups,colors=read_obj(path);lo=v.min(axis=0);hi=v.max(axis=0);source_size=hi-lo
    scale=np.array([.5,.5,.5]);panel_depth=None
    if path.stem=='Kitchen_Fridge':scale=np.array([.6,1.86,.665])/source_size
    if path.stem.startswith('Door_'):
        # The bounding depth includes the handles. Calibrate the broad panel,
        # retaining the handle relief rather than treating it as leaf thickness.
        panel=max(groups,key=lambda key:len(groups[key]))
        indices=[i for face in groups[panel] for i,_ in face]
        panel_depth=float(v[indices,2].max()-v[indices,2].min())
        scale=np.array([1.72 if path.stem=='Door_Double' else .86,1.985,.04])/np.array([source_size[0],source_size[1],panel_depth])
    v=(v-np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]))*scale
    n=n/scale;n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-9)
    if path.stem.startswith('Door_'):v[:,[0,2]]*=-1;n[:,[0,2]]*=-1
    doc=MeshDocument()
    for name,faces in groups.items():
        positions=[];norm=[]
        for face in faces:
            p=v[[i for i,_ in face]]
            normal=np.cross(p[1]-p[0],p[2]-p[0]);normal/=max(np.linalg.norm(normal),1e-9)
            positions.extend(p)
            norm.extend([n[j] if j is not None else normal for _,j in face])
        mat=len(doc.g['materials']);doc.g['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':colors.get(name,[.3,.3,.3])+[1],'metallicFactor':0,'roughnessFactor':.85},'doubleSided':True})
        doc.g['meshes'][0]['primitives'].append({'attributes':{'POSITION':doc.accessor(positions,'VEC3'),'NORMAL':doc.accessor(norm,'VEC3')},'material':mat})
    size=v.max(axis=0)-v.min(axis=0)
    return glb(doc.g,bytes(doc.binary)),{'dimensions':dict(zip(['width','height','depth'],map(float,size))),
         'sourceDimensions':source_size.tolist(),'scale':scale.tolist(),'panelDepth':.04 if panel_depth else None,
         'triangles':sum(len(x) for x in groups.values()),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');args=parser.parse_args();source=Path(args.source)
    output=ROOT/'docs/assets/quaternius';output.mkdir(exist_ok=True)
    manifest={'version':1,'author':'Quaternius','license':'CC0-1.0','characters':{},'interiors':{},
      'sources':['https://quaternius.com/packs/ultimatemodularcharacters.html','https://quaternius.com/packs/ultimatemodularwomen.html','https://opengameart.org/content/lowpoly-house-interior-pack'],
      'characterMirror':'https://github.com/agentkaerf/FreeModels','furnitureArchiveSha256':hashlib.sha256((source/'ultimate_house_interior_pack_-_june_2020.zip').read_bytes()).hexdigest()}
    for sex in ['male','female']:
        for path in sorted((source/sex).glob('*.gltf')):
            raw=path.read_bytes();g=json.loads(raw);assert len(g['buffers'])==1 and not g.get('images')
            binary=base64.b64decode(g['buffers'][0]['uri'].split(',')[1])
            key=sex+'-'+path.stem
            parts={}
            for node in g['nodes']:
                if 'mesh' not in node:continue
                for slot in ['Head','Body','Legs','Feet']:
                    if slot in node.get('name',''):parts[{'Head':'head','Body':'torso','Legs':'legs','Feet':'feet'}[slot]]=node['name']
                if node.get('name','').endswith('_Pants'):parts['legs']=node['name']
            assert len(parts)==4,(key,parts)
            filename=write_asset(output,key,glb(g,binary))
            manifest['characters'][key]={'file':filename,'sex':sex,'style':path.stem,'parts':parts,
               'animations':[a['name'] for a in g['animations']], 'sourceSha256':hashlib.sha256(raw).hexdigest()}
    for path in sorted((source/'interior').rglob('*.obj')):
        raw,metadata=furniture(path);manifest['interiors'][path.stem]={'file':write_asset(output,path.stem,raw),**metadata}
    (output/'models.json').write_text(json.dumps(manifest,indent=2)+'\n')
    license_text=(source/'male/License.txt').read_text()
    (output/'LICENSE.txt').write_text('\n'.join(line.rstrip() for line in license_text.splitlines()).rstrip()+'\n')
    retained={m['file'] for m in [*manifest['characters'].values(),*manifest['interiors'].values()]}
    motions=output/'player-animations.json'
    if motions.exists():retained.add(json.loads(motions.read_text())['file'])
    for path in output.glob('*.glb.gz'):
        if path.name not in retained:path.unlink()
    print(json.dumps({'characters':len(manifest['characters']),'interiors':len(manifest['interiors']),'bytes':sum((output/f).stat().st_size for f in retained)}))

if __name__=='__main__':main()
