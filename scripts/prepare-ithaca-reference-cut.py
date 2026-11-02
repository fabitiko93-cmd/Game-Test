"""Clip the original game-art stock at the user's pictured line; no reshaping."""
from pathlib import Path
import json,struct,gzip,hashlib,sys
import numpy as np
from shapely.geometry import LineString,Polygon
from shapely.ops import unary_union,polygonize
import trimesh

base,original_npz,components_npz,destination=map(Path,sys.argv[1:5])
data=base.read_bytes()
if base.suffix=='.gz':data=gzip.decompress(data)
n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);binary=bytearray(data[28+n:])
source=np.load(original_npz);points=source['triangles'];colours=source['colours'];body=source['labels']=='body_00'
component=np.full(len(points),-1);component[body]=np.load(components_npz)['component']
receiver=body&~np.isin(component,[1,2,3,7,12,13,16,*range(17,30)])
axis=np.array([[0,0,-1],[0,1,0],[1,0,0]])
points=(points[receiver]-np.array([-248.,7.,0.]))@axis.T*.001;colours=colours[receiver]
# Visual registration of the painted line: keep the original flowing neck,
# with the lower end farther aft. The source image is a perspective view.
# These coordinates describe a nonfunctional exterior mesh, not a fabrication.
slope=.44;offset=-.0792
normal=np.array([0.,-slope,1.]);normal/=np.linalg.norm(normal);u=np.array([1.,0.,0.]);v=np.cross(normal,u);origin=np.array([0.,0.,offset])
kept=[];paint=[];segments=[];untouched=0
for tri,col in zip(points,colours):
 d=tri[:,2]-slope*tri[:,1]-offset
 if np.all(d>=0):kept.append(tri);paint.append(col);untouched+=1;continue
 if np.all(d<0):continue
 poly=[];hits=[]
 for i in range(3):
  a,b=tri[i],tri[(i+1)%3];da,db=d[i],d[(i+1)%3]
  if da>=0:poly.append(a)
  if (da>=0)!=(db>=0):
   p=a+(b-a)*da/(da-db);p[2]=slope*p[1]+offset;poly.append(p);hits.append(p)
 for i in range(1,len(poly)-1):kept.append([poly[0],poly[i],poly[i+1]]);paint.append(col)
 if len(hits)==2:segments.append(hits)
lines=[]
for a,b in segments:
 a,b=[np.round([(p-origin)@u,(p-origin)@v],8) for p in [a,b]]
 if np.linalg.norm(a-b)>1e-9:lines.append(LineString([a,b]))
sections=list(polygonize(unary_union(lines)))
if not sections:raise ValueError('Original stock section is not closed')
section=unary_union(sections);polygons=list(section.geoms) if section.geom_type=='MultiPolygon' else [section]
caps=[];covered=[]
for polygon in polygons:
 xy,faces=trimesh.creation.triangulate_polygon(polygon,engine='earcut')
 for face in faces:
  p=origin+xy[face,0,None]*u+xy[face,1,None]*v
  if np.cross(p[1]-p[0],p[2]-p[0])@normal>0:p=p[[0,2,1]]
  caps.append(p);covered.append(Polygon(xy[face]))
assert unary_union(covered).symmetric_difference(section).area<1e-12,'Cut face must completely close the section'
first_cap=len(kept);kept=np.concatenate([np.asarray(kept),np.asarray(caps)]);paint=np.concatenate([np.asarray(paint),np.tile([.255,.168,.108],(len(caps),1))])
area=np.linalg.norm(np.cross(kept[:,1]-kept[:,0],kept[:,2]-kept[:,0]),axis=1);valid=area>1e-12
if not valid.all():raise ValueError('Degenerate source cut triangle')
normals=np.cross(kept[:,1]-kept[:,0],kept[:,2]-kept[:,0])/area[:,None]
def append(values):
 a=np.asarray(values,dtype='<f4').reshape(-1,3);start=len(binary);binary.extend(a.tobytes());vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':a.nbytes,'target':34962});ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(a),'type':'VEC3','min':a.min(0).tolist(),'max':a.max(0).tolist()});return ai
primitive=next(m for m in doc['meshes'] if m['name']=='ReceiverAndGrip')['primitives'][0]
primitive['attributes']={'POSITION':append(kept),'NORMAL':append(np.repeat(normals[:,None,:],3,axis=1)),'COLOR_0':append(np.repeat(paint[:,None,:],3,axis=1))}
extras=doc['asset'].setdefault('extras',{})
extras['title']='Ithaca short · original stock clipped at the marked reference line'
extras['modifications']='Original full stock clipped at the red line supplied by the user. Surviving original surfaces are unchanged; only the new cut face is authored. Previous short barrel and carrier retained. No wrap, stretching, widening or replacement grip.'
extras['purpose']='Nonfunctional low-poly game artwork / stance review.'
extras['stockCut']={'slope':slope,'offset':offset,'firstCapTriangle':first_cap,'capTriangles':len(caps),'reference':'ithaca.jpg · user red-line reference','retainedOriginalTriangles':untouched,'sectionArea':float(section.area),'sectionLoops':[list(p.exterior.coords) for p in polygons]}
extras['originalMeshDataSha256']=hashlib.sha256(original_npz.read_bytes()).hexdigest();extras['basePreviewSha256']=hashlib.sha256(data).hexdigest();doc['buffers'][0]['byteLength']=len(binary)
text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
result=struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary
destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(gzip.compress(result,mtime=0) if destination.suffix=='.gz' else result)
print(json.dumps({'receiverTriangles':len(kept),'untouchedSourceTriangles':untouched,'capTriangles':len(caps),'sourceSurfacesDeformed':False,'sha256':hashlib.sha256(result).hexdigest()}))
