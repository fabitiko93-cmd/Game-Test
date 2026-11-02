"""Reshape a decorative low-poly game mesh; no functional/production geometry."""
from pathlib import Path
import gzip, json, struct, sys, hashlib
import numpy as np

source, output = map(Path, sys.argv[1:3])
data = source.read_bytes()
if source.suffix == '.gz': data = gzip.decompress(data)
length = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20+length]); binary = bytearray(data[28+length:])
def read(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    return np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).copy()
def append(values):
    a=np.asarray(values,dtype='<f4').reshape(-1,3)
    while len(binary)%4:binary.append(0)
    at=len(binary);binary.extend(a.tobytes());view=len(doc['bufferViews'])
    doc['bufferViews'].append({'buffer':0,'byteOffset':at,'byteLength':a.nbytes,'target':34962})
    index=len(doc['accessors']);doc['accessors'].append({'bufferView':view,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()})
    return index
node=next(n for n in doc['nodes'] if n.get('name')=='ReceiverAndGrip')
primitive=doc['meshes'][node['mesh']]['primitives'][0]
old={k:read(v).reshape(-1,3,3) for k,v in primitive['attributes'].items()}
wood=old['COLOR_0'][:,0,0]>old['COLOR_0'][:,0,1]*1.2
if not wood.any():raise ValueError('Provide the original short-variant review mesh as source')
old_trim=(~wood)&(old['POSITION'][:,:,2].max(1)<-.03)&(old['POSITION'][:,:,1].min(1)<0)
for name,values in old.items():primitive['attributes'][name]=append(values[~(wood|old_trim)])

# Artist-authored silhouette in the game's coordinate frame. This is only the
# closed visible wooden shell, with no joints, mounting or internal components.
profile=[
    [.050,.007,-.002,.006], [.038,.012,-.020,.015],
    [.020,.013,-.032,.020], [.000,.0133,-.040,.017],
    [-.022,.0133,-.045,.009], [-.046,.0133,-.052,-.008],
    [-.067,.0127,-.061,-.029], [-.083,.0125,-.067,-.035],
    [-.093,.0115,-.062,-.031]
]
segments=20;vertices=[]
for y,width,back,front in profile:
    for j in range(segments):
        t=j/segments*2*np.pi;s,c=np.sin(t),np.cos(t);power=.80
        vertices.append([width*np.sign(s)*abs(s)**power,y,(front+back)/2+(front-back)/2*np.sign(c)*abs(c)**power])
faces=[]
for i in range(len(profile)-1):
    for j in range(segments):
        k=(j+1)%segments;a=i*segments+j;b=i*segments+k;c=(i+1)*segments+j;d=(i+1)*segments+k
        faces.extend([[a,c,d],[a,d,b]])
for row in [0,len(profile)-1]:
    center=len(vertices);y,_,back,front=profile[row];vertices.append([0,y,(front+back)/2])
    for j in range(segments):
        a=row*segments+j;b=row*segments+(j+1)%segments
        faces.append([center,a,b] if row==0 else [center,b,a])
v=np.array(vertices);f=np.array(faces);tri=v[f]
norm=np.zeros_like(v)
for face in f:
    normal=np.cross(v[face[1]]-v[face[0]],v[face[2]]-v[face[0]])
    for i in face:norm[i]+=normal
norm/=np.linalg.norm(norm,axis=1,keepdims=True)
colour=np.tile([.17933,.12086,.08650],(len(tri),3,1))
# A subtly darker end grain belongs to the same visible wooden shell.
colour[-segments:]*=.73
attributes={'POSITION':append(tri),'NORMAL':append(norm[f]),'COLOR_0':append(colour)}
material=len(doc['materials']);doc['materials'].append({'name':'Authored wood grip','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.82}})
mesh=len(doc['meshes']);doc['meshes'].append({'name':'CustomGrip','primitives':[{'attributes':attributes,'material':material}]})
node=len(doc['nodes']);doc['nodes'].append({'name':'CustomGrip','mesh':mesh,'extras':{'purpose':'Decorative game artwork','author':'Sperrkreis','license':'CC0-1.0'}});doc['scenes'][doc.get('scene',0)]['nodes'].append(node)
extras=doc['asset'].setdefault('extras',{})
extras['title']='Ithaca short variant · reshaped game grip'
extras['modifications']='Prior digital short variant and compact carrier retained; the wooden stock stub and its old trim are replaced by an artist-authored rounded grip for character-hand placement. Receiver, barrel, carrier and moving parts unchanged.'
extras['purpose']='Low-poly game artwork only. No real-world functional or manufacturing specification.'
extras['gripSourceSha256']=hashlib.sha256(data).hexdigest()
doc['buffers'][0]['byteLength']=len(binary)
text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
payload=struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(gzip.compress(payload,mtime=0) if output.suffix=='.gz' else payload)
print(json.dumps({'removedWoodFaces':int(sum(wood)),'removedStockTrimFaces':int(sum(old_trim)),'authoredGripFaces':len(tri),'sha256':hashlib.sha256(payload).hexdigest()}))
