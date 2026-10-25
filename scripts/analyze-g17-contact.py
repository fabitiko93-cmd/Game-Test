"""Check the posed skin triangles, separately from skeletal target markers."""
import json,re,sys
from pathlib import Path
import numpy as np

def point_distances(points,triangles,signed=False):
    if not len(points) or not len(triangles):return np.full(len(points),np.inf)
    a,b,c=triangles[:,0],triangles[:,1],triangles[:,2];ab=b-a;ac=c-a
    n=np.cross(ab,ac);nn=np.sum(n*n,axis=1);valid=nn>1e-18
    a,b,c,ab,ac,n,nn=(x[valid] for x in [a,b,c,ab,ac,n,nn])
    result=[]
    for p in np.array_split(points,max(1,len(points)//100)):
        delta=p[:,None,:]-a;h=np.sum(delta*n,axis=2)/nn
        projected=delta-h[:,:,None]*n
        d00=np.sum(ab*ab,axis=1);d01=np.sum(ab*ac,axis=1);d11=np.sum(ac*ac,axis=1)
        d20=np.sum(projected*ab,axis=2);d21=np.sum(projected*ac,axis=2);den=d00*d11-d01*d01
        u=(d11*d20-d01*d21)/den;v=(d00*d21-d01*d20)/den
        dist=np.where((u>=0)&(v>=0)&(u+v<=1),h*h*nn,np.inf)
        for start,end in [(a,b),(b,c),(c,a)]:
            e=end-start;d=p[:,None,:]-start;t=np.clip(np.sum(d*e,axis=2)/np.maximum(1e-18,np.sum(e*e,axis=1)),0,1)
            dist=np.minimum(dist,np.sum((d-t[:,:,None]*e)**2,axis=2))
        closest=np.argmin(dist,axis=1);values=np.sqrt(dist[np.arange(len(p)),closest])
        if signed:values*=np.where(h[np.arange(len(p)),closest]<-1e-9,-1,1)
        result.extend(values)
    return np.array(result)

def segment_hits(start,end,triangles):
    direction=end-start;e1=triangles[:,1]-triangles[:,0];e2=triangles[:,2]-triangles[:,0]
    h=np.cross(direction,e2);det=np.sum(e1*h,axis=1);inv=np.divide(1,det,out=np.zeros_like(det),where=np.abs(det)>1e-13)
    s=start-triangles[:,0];u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=np.sum(direction*q,axis=1)*inv;t=np.sum(e2*q,axis=1)*inv
    return (np.abs(det)>1e-13)&(u>1e-6)&(v>1e-6)&(u+v<1-1e-6)&(t>1e-6)&(t<1-1e-6)

def crossings(a,b,ids_a,ids_b):
    if not len(a) or not len(b):return 0
    low=b.min(1);high=b.max(1);count=0
    for tri,ids in zip(a,ids_a):
        candidates=np.flatnonzero(np.all(high>=tri.min(0)-1e-8,axis=1)&np.all(low<=tri.max(0)+1e-8,axis=1))
        candidates=np.array([i for i in candidates if not (set(ids)&set(ids_b[i]))],dtype=int)
        if not len(candidates):continue
        other=b[candidates];hit=np.zeros(len(other),dtype=bool);same=np.broadcast_to(tri,other.shape)
        for k in range(3):
            hit|=segment_hits(tri[k],tri[(k+1)%3],other)
            hit|=segment_hits(other[:,k],other[:,(k+1)%3],same)
        count+=int(hit.sum())
    return count

def analyze(path):
    d=json.loads(Path(path).read_text());meshes=d['meshes'];x,y,z,w=d['weaponQuaternion']
    rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    def local(p):return (p-d['weaponOrigin'])@rotation/np.array(d['scale'])
    def select(pattern,grip=False,weapon=False):
        faces=[];ids=[];points=[]
        for mi,m in enumerate(meshes):
            p=np.asarray(m['positions']);bones=m.get('boneNames',[]);indexes=np.asarray(m['faces']);lp=local(p)
            if weapon:
                if m['name'] not in ['Receiver','Slide','Magazine']:continue
                mask=np.ones(len(indexes),dtype=bool)
            elif grip:
                if m['name']!='Receiver':continue
                mask=(lp[indexes].mean(1)[:,1]<-.028)&(lp[indexes].mean(1)[:,2]<-.008)
            else:
                weights=np.array([bool(re.match(pattern,n or '')) for n in bones]) if len(bones)==len(p) else np.zeros(len(p),dtype=bool)
                mask=weights[indexes].sum(1)>=2;points.extend(p[weights])
            for f in indexes[mask]:faces.append(p[f]);ids.append(tuple(mi*100000+int(i) for i in f))
        return np.asarray(faces),ids,np.asarray(points)
    right,ri,rp=select(r'^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])R$')
    left,li,lp=select(r'^(Wrist|Index[1-4]|Middle[1-4]|Ring[1-4]|Pinky[1-4]|Thumb[1-3])L$')
    index,ii,ip=select(r'^Index[234]R$');middle,mi,mp=select(r'^Middle[234]R$');grip,gi,gp=select('',True)
    report={'sex':d['sex'],'variant':d['variant'],'rightIndexMiddleCrossingPairs':crossings(index,middle,ii,mi),'handCrossingPairs':crossings(left,right,li,ri),'digits':{},'palms':d.get('contactMetrics')}
    for side in ['R','L']:
        for finger in (['Middle','Ring','Pinky'] if side=='R' else ['Index','Middle','Ring','Pinky']):
            f,fi,fp=select('^'+finger+'[234]'+side+'$');other,oi=(grip,gi) if side=='R' else (right,ri)
            # Vertices and edge midpoints sample the visible skin surface.
            samples=np.concatenate([f.reshape(-1,3),((f[:,0]+f[:,1])/2),((f[:,1]+f[:,2])/2),((f[:,2]+f[:,0])/2)])
            distances=point_distances(samples,other)
            signed=point_distances(samples,other,True)
            report['digits'][finger+side]={'sampledGapMm':round(float(distances.min())*1000,3),'estimatedPenetrationMm':round(max(0,-float(signed.min()))*1000,3),'crossingPairs':crossings(f,other,fi,oi),'skinTriangles':len(f)}
    _,_,palm=select(r'^(Wrist|Index1|Middle1|Ring1|Pinky1|Thumb1)L$');loc=local(palm)
    palm=palm[(loc[:,0]>.018)&(loc[:,1]<-.020)&(loc[:,1]>-.095)&(loc[:,2]<-.020)&(loc[:,2]>-.095)]
    gaps=point_distances(palm,right);report['supportPalmSampledGapMm']=round(float(gaps.min())*1000,3) if len(gaps) else None
    _,_,palm=select(r'^(Wrist|Index1|Middle1|Ring1|Pinky1|Thumb1)R$');loc=local(palm)
    palm=palm[(loc[:,0]<-.018)&(loc[:,1]<-.020)&(loc[:,1]>-.085)&(loc[:,2]<-.025)&(loc[:,2]>-.095)]
    gaps=point_distances(palm,grip);report['firingPalmSampledGapMm']=round(float(gaps.min())*1000,3) if len(gaps) else None
    palm_tri,palm_ids,_=select(r'^(Wrist|Index1|Middle1|Ring1|Pinky1|Thumb1)R$')
    centers=local(palm_tri.mean(1));mask=(centers[:,0]<-.012)&(centers[:,1]<-.020)&(centers[:,1]>-.09)&(centers[:,2]<-.020)&(centers[:,2]>-.105)
    palm_tri=palm_tri[mask];palm_ids=[ids for ids,keep in zip(palm_ids,mask) if keep]
    def sample_faces(t):return np.concatenate([t.reshape(-1,3),t.mean(1),(t[:,0]+t[:,1])/2,(t[:,1]+t[:,2])/2,(t[:,2]+t[:,0])/2])
    palm_cross=crossings(palm_tri,grip,palm_ids,gi)
    distance=min(float(point_distances(sample_faces(palm_tri),grip).min()),float(point_distances(sample_faces(grip),palm_tri).min()))
    report['firingPalmSurfaceGapMm']=0 if palm_cross else round(distance*1000,3);report['firingPalmGripCrossings']=palm_cross
    whole_gun,wi,_=select('',weapon=True);signed=point_distances(ip,whole_gun,True)
    report['triggerFingerGunCrossings']=crossings(index,whole_gun,ii,wi);report['triggerFingerEstimatedPenetrationMm']=round(max(0,-float(signed.min()))*1000,3)
    return report

if __name__=='__main__':
    reports=[analyze(p) for p in sys.argv[1:]]
    print(json.dumps(reports,indent=2))
