"""Prepare nonfunctional game-art modules from credited source meshes.

Run prepare-shotgun-sources.mjs first, then pass the baked directory, original
GLB directory, and the previously authored five-shell carrier GLB. numpy required.
"""
from pathlib import Path
from collections import defaultdict
import gzip,hashlib,json,runpy,struct,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
read_glb=runpy.run_path(str(ROOT/'scripts/prepare-vector.py'))['read_glb']
islands=runpy.run_path(str(ROOT/'scripts/prepare-vector.py'))['body_islands']
baked,originals,carrier=map(Path,sys.argv[1:4]);out=ROOT/'docs/assets/weapons'
axis=np.array([[0,0,-1],[0,1,0],[1,0,0]])

def read_art(raw):
 meshes=read_glb(raw);size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
 for mesh,definition in zip(meshes,doc['meshes']):
  attr=definition['primitives'][0]['attributes'].get('COLOR_0')
  if attr is None:continue
  a=doc['accessors'][attr];view=doc['bufferViews'][a['bufferView']];offset=view.get('byteOffset',0)+a.get('byteOffset',0)
  colors=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=offset).copy();mesh['colours']=colors[mesh['faces'][:,0]]
 return meshes

def write_asset(key,parts,source,source_hash,grips,anchors,stock,mechanism,holder_count):
 doc={'asset':{'version':'2.0','generator':'Sperrkreis · shotgun game artwork','extras':{'author':'TastyTony','source':source,'sourceSha256':source_hash,'license':'CC BY 4.0 https://creativecommons.org/licenses/by/4.0/','modifications':'Bind pose baked, metric presentation scale, original flat colour surfaces separated into visible mechanisms. Authored removable textile shell carrier; short Ithaca retains approved reference cut.'}},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[{'name':'Original vertex colours','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':.12,'roughnessFactor':.8}}],'bufferViews':[],'accessors':[],'buffers':[]};binary=bytearray();provenance={}
 def attr(values):
  a=np.asarray(values,dtype='<f4').reshape(-1,3);start=len(binary);binary.extend(a.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':a.nbytes,'target':34962});ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()});return ai
 for name,faces in parts.items():
  p=np.array([p for p,c in faces]);col=np.array([c for p,c in faces]);normal=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);normal/=np.maximum(1e-20,np.linalg.norm(normal,axis=1,keepdims=True));attributes={'POSITION':attr(p),'NORMAL':attr(np.repeat(normal,3,axis=0)),'COLOR_0':attr(np.repeat(col,3,axis=0))};mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[{'attributes':attributes,'material':0}]});doc['scenes'][0]['nodes'].append(mi);doc['nodes'].append({'name':name,'mesh':mi});provenance[name]={'triangles':len(faces),'source':'Sperrkreis authored carrier' if name.startswith(('Backing','Edge','Stitch','Loop','Shell')) else 'TastyTony original'}
 doc['buffers']=[{'byteLength':len(binary)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);raw=struct.pack('<4sII',b'glTF',2,28+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary;gz=gzip.compress(raw,mtime=0);sha=hashlib.sha256(gz).hexdigest();file=f'{key}-{sha[:12]}.glb.gz';(out/file).write_bytes(gz)
 metadata={'file':file,'sha256':sha,'author':'TastyTony','license':'CC BY 4.0','source':source,'sourceSha256':source_hash,'parts':provenance,'grips':grips,'anchors':anchors,'stockContact':stock,'mechanism':mechanism,'carrierParts':[n for n in parts if n.startswith(('Backing','Edge','Stitch','Loop','Shell'))],'shellParts':[[n for n in parts if n.startswith(f'Shell_{i:02d}_')] for i in range(1,holder_count+1)]}
 (out/(key+'.json')).write_text(json.dumps(metadata,indent=2)+'\n');print(key,file,len(gz))
 # Inventory silhouettes come from the same original model triangles.
 faces=[(p,c) for n,a in parts.items() if n not in metadata['carrierParts'] for p,c in a];points=np.concatenate([p for p,c in faces]);lo=points.min(0);hi=points.max(0);factor=min(114/(hi[2]-lo[2]),36/(hi[1]-lo[1]));polygons=[]
 for p,c in sorted(faces,key=lambda x:float(x[0][:,0].mean())):
  rgb=np.asarray(c,dtype=float);rgb=np.where(rgb<=.0031308,rgb*12.92,1.055*rgb**(1/2.4)-.055);color='#'+''.join(f'{int(max(0,min(255,round(x*255)))):02x}' for x in rgb);coords=' '.join(f'{3+(x[2]-lo[2])*factor:.2f},{39-(x[1]-lo[1])*factor:.2f}' for x in p);polygons.append(f'<polygon points="{coords}" fill="{color}"/>')
 (out/(key+'-icon.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 42">'+''.join(polygons)+'</svg>\n')

for key,origin,scale in [('benelli_m4',[-42,0,0],1.01/276.41002633),('mossberg_590',[-70,10,0],1.02/493.348393) ,('ithaca_mag10',[-248,7,0],.001)]:
 d=json.loads((baked/(key+'.json')).read_text());tri=np.array(d['triangles']);cols=np.array(d['colours']);labels=np.array(d['labels']);body=labels=='body_00';raw=tri[body];comp,_=islands([{'vertices':raw.reshape(-1,3),'faces':np.arange(len(raw)*3).reshape(-1,3)}]);ci=0;parts=defaultdict(list)
 for p,c,label in zip(tri,cols,labels):
  group={'bolt_01':'Bolt','bolttilt_02':'Bolt','lifter_02':'Lifter','lifter_05':'Lifter','safety_04':'Safety','safety_03':'Safety','safety_05':'Safety','boltunlock_03':'BoltRelease','boltunlock_04':'BoltRelease','foregrip_01':'Forearm'}.get(label,'ReceiverAndGrip')
  if label.startswith('shell'):continue
  if label=='body_00':
   n=comp[ci];ci+=1
   if key=='benelli_m4':group='Stock' if n<10 else 'Forearm' if n==41 else 'BarrelAndRib' if n>=38 else 'ReceiverAndGrip'
   elif key=='mossberg_590':group='BarrelAndRib' if n in [8,11] else 'MagazineTube' if n in [9,10,12] else 'ReceiverAndGrip'
   else:group='Forearm' if n==1 else 'MagazineTube' if n==2 else 'BarrelAndRib' if n in [3,7,12,13,16,*range(17,30)] else 'ReceiverAndGrip'
  parts[group].append(((p-np.array(origin))@axis.T*scale,c))
 # Five-slot original carrier, on the non-ejection side; Ithaca uses its
 # approved compact three-slot asset with exactly the same source surfaces.
 compact=key=='ithaca_mag10';mount=np.array([.0187,.043,.148]) if compact else np.array([.018,.047,.11]) if key=='benelli_m4' else np.array([.019,.0275,.10])
 carrier_source=ROOT/'tests/fixtures/ithaca-reference-cut.glb.gz' if compact else carrier
 for m in read_art(gzip.decompress(carrier_source.read_bytes()) if compact else carrier_source.read_bytes()):
  if not m['name'].startswith(('Backing','Edge','Stitch','Loop','Shell')):continue
  for i,f in enumerate(m['faces']):
   p=m['vertices'][f] if compact else np.c_[m['vertices'][f,2],m['vertices'][f,1],-m['vertices'][f,0]]+mount
   parts[m['name']].append((p,m.get('colours',[m['color']]*len(m['faces']))[i]))
 anchors={'stock':[0,-.035,-.275] if key=='ithaca_mag10' else [0,-.055,-.35], 'carrier':mount.tolist(),'muzzle':[0,.05,.7], 'loading':[0,-.004,.12 if compact else .065], 'magazine':[0,-.004,.12 if compact else .065]}
 grips={'right':[-.032,0,-.14],'left':[.145,.03,.32 if compact else .30 if key=='benelli_m4' else .31],'rightThumb':[.015,.025,-.015],'leftThumb':[.025,.055,.32 if compact else .30],'leftThumbPole':[.11,.12,.32]}
 mechanism={'kind':'pump' if key=='mossberg_590' else 'shotgun','cycle':.68 if key=='mossberg_590' else .13,'boltTravel':.075,'pumpTravel':.085,'ejectDelay':.31 if key=='mossberg_590' else .025,'ejection':[-.025,.05,.11]}
 write_asset(key,parts,d['source']['source'],hashlib.sha256((originals/(key+'.glb')).read_bytes()).hexdigest(),grips,anchors,anchors['stock'],mechanism,3 if compact else 5)
# The exact approved short geometry is a runtime asset, not a regenerated grip.
raw=gzip.decompress((ROOT/'tests/fixtures/ithaca-reference-cut.glb.gz').read_bytes());parts=defaultdict(list)
for m in read_art(raw):
 for i,face in enumerate(m['faces']):parts[m['name']].append((m['vertices'][face],m.get('colours',[m['color']]*len(m['faces']))[i]))
long=json.loads((out/'ithaca_mag10.json').read_text());write_asset('ithaca_short',parts,long['source'],long['sourceSha256'],long['grips'],long['anchors'],None,long['mechanism'],3)
