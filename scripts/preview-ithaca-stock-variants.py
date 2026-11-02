"""Two source-contour alternatives for a decorative low-poly game mesh."""
from pathlib import Path
import json,struct,gzip,sys,hashlib
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

source=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
data=source.read_bytes()
if source.suffix=='.gz':data=gzip.decompress(data)
n=struct.unpack_from('<I',data,12)[0];original=json.loads(data[20:20+n]);original_binary=data[28+n:]
def read(doc,i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
 return np.frombuffer(original_binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3,3).copy()
styles={'a':dict(rear=1.70,widen=1.08,lower=1.25,round=.006,side_round=.008,fill=.006),
        'b':dict(rear=2.55,widen=1.15,lower=1.20,round=.010,side_round=.018,fill=.004)}
for label,style in styles.items():
 doc=json.loads(json.dumps(original));binary=bytearray(original_binary)
 primitive=next(m for m in doc['meshes'] if m['name']=='ReceiverAndGrip')['primitives'][0]
 arrays={k:read(doc,i) for k,i in primitive['attributes'].items()};p=arrays['POSITION'];col=arrays['COLOR_0']
 wood=col[:,0,0]>col[:,0,1]*1.2
 cap=wood&(np.max(np.abs(p[:,:,2]+.062),axis=1)<1e-6)
 trim=(~wood)&(p[:,:,2].max(1)<-.03)&(p[:,:,1].min(1)<0)
 section=unary_union([Polygon(t[:,:2]) for t in p[cap]])
 assert section.geom_type=='Polygon' and not section.interiors and section.area/section.convex_hull.area>.99
 def append(values):
  a=np.asarray(values,dtype='<f4').reshape(-1,3);offset=len(binary);binary.extend(a.tobytes());vi=len(doc['bufferViews'])
  doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes,'target':34962});ai=len(doc['accessors'])
  doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()});return ai
 for name,a in arrays.items():primitive['attributes'][name]=append(a[~(wood|trim)])
 def deform(points):
  q=np.asarray(points).copy();z=q[...,2].copy();y=q[...,1].copy();t=np.clip((-.035-z)/.027,0,1)
  q[...,2]=np.where(z<-.035,-.035+(z+.035)*style['rear'],z)
  q[...,2]+=style['side_round']*t*np.clip((y+.008)/.034,-1,1)**2
  q[...,0]*=1+(style['widen']-1)*t
  q[...,1]=np.where(y<-.026,-.026+(y+.026)*style['lower'],y)
  lower=np.clip(-y/.026,0,1);front=np.clip((z+.062)/.027,0,1)
  q[...,2]+=style['fill']*lower*front
  return q
 triangles=deform(p[wood&~cap]);colours=col[wood&~cap]
 neck=(p[wood&~cap][:,:,2]>=-.035)&(p[wood&~cap][:,:,1]>=0)
 assert np.array_equal(triangles[neck],p[wood&~cap][neck]),'Original stock neck must remain unchanged'
 # Keep every edge point of the original cut outline. Bevel only that end;
 # the original flowing stock neck and its upper source surfaces remain.
 xy=np.array(section.exterior.coords[:-1]);area=np.sum(xy[:,0]*np.roll(xy[:,1],-1)-np.roll(xy[:,0],-1)*xy[:,1])
 if area>0:xy=xy[::-1]
 border=deform(np.c_[xy,np.full(len(xy),-.062)]);center=border.mean(0)
 rings=[border]
 for scale,depth in [(.92,.40),(.67,.85)]:
  r=border.copy();r[:,:2]=center[:2]+(r[:,:2]-center[:2])*scale;r[:,2]-=style['round']*depth;rings.append(r)
 added=[]
 for a,b in zip(rings[:-1],rings[1:]):
  for i in range(len(a)):
   j=(i+1)%len(a);added.extend([[a[i],a[j],b[j]],[a[i],b[j],b[i]]])
 tip=center.copy();tip[2]-=style['round']
 for i in range(len(border)):
  j=(i+1)%len(border);added.append([tip,rings[-1][i],rings[-1][j]])
 added=np.array(added);triangles=np.concatenate([triangles,added]);colours=np.concatenate([colours,np.tile([.23,.152,.10],(len(added),3,1))])
 normal=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]);length=np.linalg.norm(normal,axis=1)
 good=length>1e-12;triangles=triangles[good];colours=colours[good];normal=normal[good]/length[good,None]
 attrs={'POSITION':append(triangles),'NORMAL':append(np.repeat(normal[:,None,:],3,axis=1)),'COLOR_0':append(colours)}
 mesh=len(doc['meshes']);doc['meshes'].append({'name':'CustomGrip','primitives':[{'attributes':attrs,'material':primitive.get('material',0)}]})
 node=len(doc['nodes']);doc['nodes'].append({'name':'CustomGrip','mesh':mesh,'extras':{'sourceAuthor':'TastyTony','license':'CC-BY-4.0','variant':label}});doc['scenes'][doc.get('scene',0)]['nodes'].append(node)
 extras=doc['asset'].setdefault('extras',{});extras['title']='Ithaca short stock contour review '+label.upper();extras['stockVariant']=label
 extras['modifications']='Original short stock surfaces retained and reshaped at the rear; rounded artistic end. Separate inactive game-art alternative, with no functional/internal geometry.'
 extras['stockSourceSha256']=hashlib.sha256(data).hexdigest();doc['buffers'][0]['byteLength']=len(binary)
 text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
 result=struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
 (output/f'ithaca-stock-{label}.glb').write_bytes(result)
 print(json.dumps({'variant':label,'retainedWoodFaces':int(sum(wood&~cap)),'gripFaces':len(triangles),'sha256':hashlib.sha256(result).hexdigest()}))
