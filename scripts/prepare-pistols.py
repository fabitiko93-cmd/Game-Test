"""Prepare four authored TastyTony pistols (CC BY 4.0), keeping every source triangle.
Usage: python scripts/prepare-pistols.py --source-dir /path/to/original-glbs
Rigid skin groups become independently addressable meshes; original colours are retained.
"""
import json,struct,numpy as np
from pathlib import Path

def extract(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
 def accessor(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'VEC3':3,'VEC4':4,'SCALAR':1,'MAT4':16}[a['type']];return np.ndarray((a['count'],w),dt,binary,v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()
 def matrix(n):
  if 'matrix'in n:return np.array(n['matrix']).reshape(4,4,order='F')
  x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
 worlds={}
 def walk(i,p):
  n=doc['nodes'][i];worlds[i]=p@matrix(n)
  for c in n.get('children',[]):walk(c,worlds[i])
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,np.eye(4))
 parts={};maxerror=0
 for i,n in enumerate(doc['nodes']):
  if'mesh'not in n:continue
  skin=doc['skins'][n['skin']];bind=accessor(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
  for p in doc['meshes'][n['mesh']]['primitives']:
   a=p['attributes'];verts=accessor(a['POSITION']);faces=accessor(p['indices']).reshape(-1,3);j=accessor(a['JOINTS_0']);weights=accessor(a['WEIGHTS_0']);dominant=j[np.arange(len(j)),weights.argmax(1)]
   v=np.empty_like(verts,dtype=float)
   for joint in np.unique(dominant):
    selected=dominant==joint;matrix=worlds[skin['joints'][joint]]@bind[joint];v[selected]=(np.c_[verts[selected],np.ones(selected.sum())]@matrix.T)[:,:3]
   rigid=np.count_nonzero(weights>.00001,axis=1)==1;assert np.all(rigid)
   names=[doc['nodes'][q]['name']for q in skin['joints']]
   mat=doc['materials'][p['material']];color=mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',mat.get('extensions',{}).get('KHR_materials_pbrSpecularGlossiness',{}).get('diffuseFactor',[.8,.8,.8,1]))[:3]
   for face in faces:
    group=dominant[face];assert np.all(group==group[0]);parts.setdefault(names[group[0]],[]).append((v[face],color))
 return parts,doc

import argparse,gzip,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/assets/weapons'
SOURCES={
 'g17':('60efc54ac59e47d18bdff94b2f5144ff','000-058',.202),
 'usp':('fea998682de9465087c108ae6bee56fc','000-068',.225),
 'scorpion':('afa23b99150d453dac92a875e9dc7b08','000-035',.225),
 'deagle':('b81da261345f4462b2c4412352162287','000-061',.273)}

SOURCE_HASHES={'60efc54ac59e47d18bdff94b2f5144ff': 'fa28b051644ceea0328082eed600a3945dfa6417e42262ecef728ced5b3f4e6f', 'fea998682de9465087c108ae6bee56fc': 'caf1e28e756314c6291134d4d73ba6f1303bccf1579dbd3c49a1f47f72dcf22b', 'afa23b99150d453dac92a875e9dc7b08': '562c8f3113514db7e4c9f3893771c65b74c637ac0f971e21ded52c3f43ff4269', 'b81da261345f4462b2c4412352162287': 'c1467549768efcb566d29632935217d71f446a44d4cb2ae0b2740956aba05173'}

def write_asset(name,parts,extras):
 d={'asset':{'version':'2.0','generator':'SPERRKREIS 98 · rigid pistol modules','extras':extras},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],
    'materials':[{'name':'Original vertex colours','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.8}}], 'buffers':[],'bufferViews':[],'accessors':[]}
 binary=bytearray()
 def acc(values):
  v=np.asarray(values,dtype='<f4').reshape(-1,3);offset=len(binary);binary.extend(v.tobytes());view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':v.nbytes,'target':34962});i=len(d['accessors']);d['accessors'].append({'bufferView':view,'componentType':5126,'count':len(v),'type':'VEC3','min':v.min(0).tolist(),'max':v.max(0).tolist()});return i
 for key,faces in parts.items():
  p=np.array([v for v,c in faces]);n=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-20)
  attrs={'POSITION':acc(p),'NORMAL':acc(np.repeat(n,3,axis=0)),'COLOR_0':acc(np.repeat([c for v,c in faces],3,axis=0))}
  d['meshes'].append({'name':key,'primitives':[{'attributes':attrs,'material':0}]});d['scenes'][0]['nodes'].append(len(d['nodes']));d['nodes'].append({'name':key,'mesh':len(d['meshes'])-1})
 d['buffers']=[{'byteLength':len(binary)}];doc=json.dumps(d,separators=(',',':')).encode();doc+=b' '*(-len(doc)%4);b=struct.pack('<4sII',b'glTF',2,28+len(doc)+len(binary))+struct.pack('<I4s',len(doc),b'JSON')+doc+struct.pack('<I4s',len(binary),b'BIN\0')+binary
 compressed=gzip.compress(b,mtime=0);sha=hashlib.sha256(compressed).hexdigest();file=f'{name}-{sha[:12]}.glb.gz';(OUT/file).write_bytes(compressed);return file,sha

def box(parts,name,low,high,color):
 v=np.array([[x,y,z]for x in [low[0],high[0]]for y in [low[1],high[1]]for z in [low[2],high[2]]]);faces=[(0,1,3),(0,3,2),(4,6,7),(4,7,5),(0,4,5),(0,5,1),(2,3,7),(2,7,6),(0,2,6),(0,6,4),(1,5,7),(1,7,3)]
 parts.setdefault(name,[]).extend((v[list(f)],color)for f in faces)

def main():
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('--source-dir',required=True,type=Path);args=a.parse_args()
 def accessory(asset,part):
  meta=json.loads((OUT/(asset+'.json')).read_text());raw=gzip.decompress((OUT/meta['file']).read_bytes());size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
  def attr(index):
   a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=view.get('byteOffset',0)+a.get('byteOffset',0),strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
  meshes=[]
  for node in doc['nodes']:
   if node.get('name')!=part or 'mesh'not in node:continue
   for primitive in doc['meshes'][node['mesh']]['primitives']:
    at=primitive['attributes'];points=attr(at['POSITION']);faces=attr(primitive['indices']).reshape(-1,3) if 'indices'in primitive else np.arange(len(points)).reshape(-1,3)
    factor=doc['materials'][primitive.get('material',0)].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[:3]
    colors=attr(at['COLOR_0'])[:,:3] if 'COLOR_0'in at else np.tile(factor,(len(points),1))
    meshes.append({'vertices':points,'faces':faces,'colors':colors[faces].mean(axis=1)})
  assert meshes, (asset,part)
  return meshes
 for name,(uid,folder,length)in SOURCES.items():
  path=args.source_dir/(uid+'.glb');assert hashlib.sha256(path.read_bytes()).hexdigest()==SOURCE_HASHES[uid], 'Source revision changed; re-audit before import';original,doc=extract(path);parts={};original_n=sum(len(v)for v in original.values())
  for group,faces in original.items():
   tag=group.lower().split('_')[0];tag={'body':'Receiver','slide':'Slide','sliderelease':'SlideRelease','mag':'Magazine','bullet':'FeedRound','bullets':'MagazineRounds','barrel':'Barrel','hammer':'Hammer','trigger':'Trigger','safety':'Safety'}[tag]
   for p,c in faces:
    p=p[:,[2,1,0]]*np.array([-1,1,1])
    parts.setdefault(tag,[]).append((p,c))
  allpoints=np.concatenate([p for fs in parts.values()for p,c in fs]);scale=length/np.ptp(allpoints[:,2]);mag=np.concatenate([p for p,c in parts['Magazine']]);center=(mag.min(0)+mag.max(0))/2
  origin=np.array([(allpoints[:,0].min()+allpoints[:,0].max())/2,mag[:,1].max()-np.ptp(allpoints[:,1])*.28,center[2]])
  for fs in parts.values():
   for i,(p,c)in enumerate(fs):fs[i]=((p-origin)*scale+np.array([0,-.02,-.035]),c)
  sourceparts={k:{'triangles':len(v),'source':doc['asset']['extras']['source'],'license':'CC BY 4.0'}for k,v in parts.items()}
  visible=['Receiver','Slide','Magazine','Barrel','Hammer','Trigger','Safety','SlideRelease'];base=np.concatenate([p for k,fs in parts.items()if k in visible for p,c in fs]);slide=np.concatenate([p for p,c in parts['Slide']]);y=slide[:,1].max();zmin=slide[:,2].min();zmax=base[:,2].max();bore=float((slide[:,1].min()+slide[:,1].max())/2)
  eject=[float(slide[:,0].max()),bore,float(zmin+(zmax-zmin)*.46)]
  def place(asset,part,target,size,outname):
   meshes=accessory(asset,part);v=np.concatenate([m['vertices']for m in meshes]);lo,hi=v.min(0),v.max(0);factor=size/(hi-lo);center=(lo+hi)/2
   parts[outname]=[((m['vertices'][f]-center)*factor+target,m['colors'][i])for m in meshes for i,f in enumerate(m['faces'])]
   sourceparts[outname]={'triangles':len(parts[outname]),'source':f'Existing {asset}/{part}','license':'CC BY 4.0'if part=='Optic'else'CC0'}
  if name!='deagle':
   place('ak','Suppressor',np.array([0,bore,zmax+.058]),np.array([.027,.027,.115]),'Suppressor')
   place('revolver','Flashlight',np.array([0,bore-.038,zmax-.038]),np.array([.026,.028,.065]),'Flashlight')
   place('vector','Optic',np.array([0,y+.018,zmin+.035]),np.array([.027,.031,.043]),'Reflex')
   # Purpose-built saddle plate: two side feet and a slotted top, not part of
   # TastyTony's original weapon. Original pistol triangles remain untouched.
   for x in [-.012,.009]:box(parts,'OpticMount',[x,y-.005,zmin+.010],[x+.003,y+.005,zmin+.060],[.035,.035,.035])
   for j in range(4):box(parts,'OpticMount',[-.012,y+.003,zmin+.010+j*.012],[.012,y+.007,zmin+.018+j*.012],[.045,.045,.045])
   sourceparts['OpticMount']={'triangles':len(parts['OpticMount']),'source':'SPERRKREIS authored pistol saddle plate','license':'CC0'}
  # Alternate magazines extend only the magazine's authored bottom section.
  mpoints=np.concatenate([p for p,c in parts['Magazine']]);bottom=mpoints[:,1].min();extension=.025
  parts['ExtendedMagazine']=[]
  for p,c in parts['Magazine']:
   q=p.copy();t=np.clip((bottom+.035-q[:,1])/.035,0,1);q[:,1]-=extension*t;parts['ExtendedMagazine'].append((q,c))
  sourceparts['ExtendedMagazine']={'triangles':len(parts['ExtendedMagazine']),'source':'Original magazine, lower section extended 25 mm','license':'CC BY 4.0'}
  file,sha=write_asset(name,parts,{**doc['asset']['extras'],'changes':'Rigid groups split, uniformly scaled and aligned to hand; original colours retained. Accessories credited separately in metadata.'})
  meta={'file':file,'sha256':sha,'author':'TastyTony','license':'CC BY 4.0','source':doc['asset']['extras']['source'],'sourceDownload':f'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/{folder}/{uid}.glb','sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceTriangles':original_n,'length':length,'parts':sourceparts,
   'anchors':{'magazine':[0,-.08,-.035],'muzzle':[0,bore,zmax],'optic':[0,y+.018,zmin+.035],'utility':[0,bore-.038,zmax-.038]},
   'grips':{'handgun':True,'right':[-.032,0,-.14],'left':[.16,-.015,-.025],'leftThumb':[.027,.025,-.035],'leftThumbPole':[.10,.08,-.025]},
   'mechanism':{'slideTravel':.042 if name=='deagle'else .033,'cycle':.11 if name=='deagle'else .085,'ejection':eject,'barrelTilt':0 if name in ['g17','deagle']else .045,'barrelPivot':[0,bore,zmin+.035],'hammerPivot':[0,bore-.01,zmin+.008]},'muzzle':[0,bore,zmax]}
  (OUT/(name+'.json')).write_text(json.dumps(meta,indent=2)+'\n')
  polys=[]
  for p,c in sorted([(p,c)for k,fs in parts.items()if k in visible for p,c in fs],key=lambda f:f[0][:,0].mean()):
   x=(p[:,2]-base[:,2].min())/length*88+4;yy=(base[:,1].max()-p[:,1])/length*88+4;rgb=[round((12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055)*255)for v in c];polys.append(f'<polygon points="'+ ' '.join(f'{a:.2f},{b:.2f}'for a,b in zip(x,yy))+'" fill="rgb('+','.join(map(str,rgb))+')"/>')
  (OUT/(name+'-icon.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 76">'+''.join(polys)+'</svg>\n')
  print(json.dumps({'name':name,'file':file,'sourceTriangles':original_n,'ejection':eject}))
if __name__=='__main__':main()
