"""Fit preview finger skin against the original grip and the other posed hand."""
import json,sys,subprocess,time,re,os
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree

class Surface:
    def __init__(self,triangles,k=32,ray=None):
        t=np.asarray(triangles);normal=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);self.t=t[np.sum(normal*normal,axis=1)>1e-18]
        self.tree=cKDTree(self.t.mean(1));self.k=min(k,len(self.t))
        ray=np.asarray(ray if ray is not None else [0,0,1],float);ray/=np.linalg.norm(ray)
        u=np.cross([0,1,0],ray)
        if np.linalg.norm(u)<.1:u=np.cross([1,0,0],ray)
        u/=np.linalg.norm(u);v=np.cross(ray,u);self.basis=np.column_stack([u,v,ray])
        projected=self.t@self.basis;self.ray_min=projected.min((0,1));self.ray_max=projected.max((0,1))
        self.ray_tri=projected;aa,bb,cc=projected[:,0],projected[:,1],projected[:,2]
        denominator=(bb[:,1]-cc[:,1])*(aa[:,0]-cc[:,0])+(cc[:,0]-bb[:,0])*(aa[:,1]-cc[:,1])
        self.ray_tri=projected[np.abs(denominator)>1e-13];self.ray_den=denominator[np.abs(denominator)>1e-13]
    def signed(self,points):
        points=np.asarray(points);_,idx=self.tree.query(points,k=self.k);tri=self.t[np.asarray(idx).reshape(len(points),self.k)]
        a,b,c=tri[:,:,0],tri[:,:,1],tri[:,:,2];ab=b-a;ac=c-a;n=np.cross(ab,ac);nn=np.sum(n*n,axis=2)
        delta=points[:,None,:]-a;h=np.sum(delta*n,axis=2)/nn;projected=delta-h[:,:,None]*n
        d00=np.sum(ab*ab,axis=2);d01=np.sum(ab*ac,axis=2);d11=np.sum(ac*ac,axis=2);d20=np.sum(projected*ab,axis=2);d21=np.sum(projected*ac,axis=2);den=d00*d11-d01*d01
        u=(d11*d20-d01*d21)/den;v=(d00*d21-d01*d20)/den
        dist=np.where((u>=0)&(v>=0)&(u+v<=1),h*h*nn,np.inf)
        for start,end in [(a,b),(b,c),(c,a)]:
            e=end-start;d=points[:,None,:]-start;t=np.clip(np.sum(d*e,axis=2)/np.maximum(1e-18,np.sum(e*e,axis=2)),0,1)
            dist=np.minimum(dist,np.sum((d-t[:,:,None]*e)**2,axis=2))
        closest=np.argmin(dist,axis=1);value=np.sqrt(dist[np.arange(len(points)),closest])
        projected_points=points@self.basis;inside_box=np.all(projected_points>self.ray_min-1e-8,axis=1)&np.all(projected_points<self.ray_max+1e-8,axis=1)
        selected=np.flatnonzero(inside_box&(value<.035))
        if len(selected):
            pp=projected_points[selected];aa,bb,cc=self.ray_tri[:,0],self.ray_tri[:,1],self.ray_tri[:,2]
            px=pp[:,0,None]+1.234e-9;py=pp[:,1,None]+2.345e-9
            r=((bb[:,1]-cc[:,1])*(px-cc[:,0])+(cc[:,0]-bb[:,0])*(py-cc[:,1]))/self.ray_den
            s=((cc[:,1]-aa[:,1])*(px-cc[:,0])+(aa[:,0]-cc[:,0])*(py-cc[:,1]))/self.ray_den
            depth=r*aa[:,2]+s*bb[:,2]+(1-r-s)*cc[:,2]
            hits=(r>0)&(s>0)&(r+s<1)&(depth>pp[:,2,None]+1e-8)
            inside=hits.sum(1)%2==1;value[selected[inside]]*=-1
        return value

sex='female' if '--female' in sys.argv else 'male';root=Path(__file__).resolve().parent.parent
out=Path(os.environ.get('SPERRKREIS_POSE_OUTPUT',root/'previews/rendered-g17'))
cmd=['node','scripts/preview-g17-reference.mjs','--serve']+(['--female'] if sex=='female' else [])
process=subprocess.Popen(cmd,cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
def receive():
    line=process.stdout.readline()
    if not line:raise RuntimeError('Pose process ended: '+process.stderr.read()[-2000:])
    r=json.loads(line)
    if 'error' in r:raise RuntimeError(r['error'])
    return r
def request(mode,values=None):
    process.stdin.write(json.dumps({'mode':mode,'values':list(values) if values is not None else None})+'\n');process.stdin.flush();return receive()

try:
    initial=receive();assert initial['type']=='init';print(f'{sex}: original skin meshes loaded',flush=True)
    if '--replay' in sys.argv:
        result_file=out/f'{sex}-surface-fit.json'
        saved=json.loads(result_file.read_text()) if result_file.exists() else json.loads((root/'previews/g17-reference-pose.json').read_text())['rigs'][sex]['surfaceFit']
        request('commit-right',saved['rightAngles']);request('left',saved['leftParams']);result=request('save');request('quit');process.wait(timeout=10)
        print(json.dumps(result),flush=True);sys.exit(0)
    labels={s:np.array(initial['labels'][s]) for s in ['R','L']};faces={s:np.array(initial['faces'][s]) for s in ['R','L']}
    x,y,z,w=initial['gunQuaternion'];rotation=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    grip=Surface(initial['grip'],48,rotation[:,0]);gun=Surface(initial['weapon'],48,rotation[:,0])
    angles=np.array(initial['rightAngles']);right_prior=angles.copy()
    right_points=np.array(initial['points']['R'])
    for number,finger in enumerate(['Middle','Ring','Pinky']):
        own=np.array([bool(re.match('^'+finger+'[234]R$',n)) for n in labels['R']]);prior=angles[number*3:number*3+3].copy();own_faces=faces['R'][own[faces['R']].sum(1)>=2]
        neighbor=np.array([bool(re.match('^'+('Index' if number==0 else ['Middle','Ring'][number-1])+'[34]R$',n)) for n in labels['R']])
        mask=neighbor[faces['R']].sum(1)>=2;neighbor_surface=Surface(right_points[faces['R'][mask]])
        def right_cost(p):
            values=angles.copy();values[number*3:number*3+3]=p
            points=np.array(request('right',values)['points']);skin=np.concatenate([points[own],points[own_faces].mean(1)])
            distance=grip.signed(skin)
            return np.concatenate([np.minimum(distance-.0012,0)*2,
                (np.sort(np.maximum(distance,0))[:4]-.0015)*5,(p-prior)*.0003])
        fit=least_squares(right_cost,prior,bounds=([.45,.45,.05],[1.65,1.65,.85]),diff_step=.003,max_nfev=35,ftol=1e-5,xtol=1e-5,gtol=1e-6)
        angles[number*3:number*3+3]=fit.x;right_points=np.array(request('right',angles)['points'])
        print(f'{sex}: {finger} grip fitted, cost={fit.cost:.7g}',flush=True)
    right_points=np.array(request('commit-right',angles)['points']);right=Surface(right_points[faces['R']],48,rotation[:,2])
    left_labels=labels['L'];left_faces=faces['L'];sample_faces=left_faces
    face_labels=left_labels[sample_faces[:,1]];all_labels=np.concatenate([left_labels,face_labels])
    contact_masks=[np.array([bool(re.match('^'+f+'[34]L$',n)) for n in all_labels]) for f in ['Index','Middle','Ring','Pinky']]
    palm_mask=np.array([bool(re.match('^(Wrist|Index1|Middle1|Ring1|Pinky1|Thumb1)L$',n)) for n in all_labels])
    thumb_mask=np.array([n=='Thumb3L' for n in all_labels])
    prior=np.array([.041,-.058,.030,.20,.001,.001,1.20,.70,.35,1.65,.65,.35,1.65,.70,.35,1.65,.70,.35,.033,-.016,-.012]+[.001]*6)
    lower=np.array([.022,-.085,-.035,.05,-.40,-1.5]+[.50,.40,.05]*4+[.016,-.040,-.060]+[-.18]*6)
    upper=np.array([.070,-.035,.065,.40,.40,1.5]+[1.90,1.65,.90]*4+[.060,.005,.025]+[.18]*6)
    calls=0;best=None;started=time.monotonic();cached=None
    def left_cost(p):
        global calls,best,cached
        result=request('left',p);points=np.asarray(result['points']);samples=np.concatenate([points,points[sample_faces].mean(1)])
        distance=right.signed(samples);weapon=gun.signed(samples)
        residual=[np.minimum(distance-.0007,0)*2,np.minimum(weapon-.0005,0)*2]
        for mask in contact_masks:residual.append((np.sort(np.maximum(distance[mask],0))[:4]-.0009)*6)
        residual.append((np.sort(np.maximum(distance[palm_mask],0))[:4]-.0010)*5)
        residual.append((np.sort(np.maximum(np.minimum(distance[thumb_mask],weapon[thumb_mask]),0))[:3]-.0010)*4)
        m=result['metrics'];residual.append(np.array([m['palmError']*4,max(0,m['wristBend']-np.deg2rad(38))*.04,max(0,abs(m['wristTwist'])-np.deg2rad(35))*.04]))
        weights=np.array([.025,.025,.025,.0007,.0007,.0004]+[.00035]*12+[.025]*3+[.001]*6)
        residual.append((p-prior)*weights);r=np.concatenate(residual);score=float(r@r)
        calls+=1
        if best is None or score<best[0]:best=(score,p.copy(),float(distance.min()),float(weapon.min()))
        if calls%150==0:print(f'{sex}: skin-contact fit {calls}, best={best[0]:.7g}, elapsed={time.monotonic()-started:.1f}s',flush=True)
        cached=(p.copy(),r.copy());return r
    def left_jacobian(p):
        base=cached[1].copy() if cached is not None and np.array_equal(cached[0],p) else left_cost(p)
        jac=np.empty((len(base),len(p)))
        for j in range(len(p)):
            # Skin matrices use float32. Relative steps near zero can be below
            # one vertex ULP and falsely signal a converged finger pose.
            step=.00002 if j<3 or 18<=j<21 else .0003
            if p[j]+step>upper[j]:step=-step
            q=p.copy();q[j]+=step;jac[:,j]=(left_cost(q)-base)/step
        return jac
    fit=least_squares(left_cost,prior,jac=left_jacobian,bounds=(lower,upper),x_scale=np.array([.02]*3+[.4]*3+[.5]*12+[.02]*3+[.15]*6),max_nfev=55,ftol=2e-5,xtol=1e-6,gtol=1e-6)
    p=best[1];result=request('left',p);saved=request('save');request('quit');process.wait(timeout=10)
    output={'sex':sex,'rightAngles':angles.tolist(),'leftParams':p.tolist(),'objective':best[0],'calls':calls,'metrics':result['metrics'],'file':saved['saved'],'status':int(fit.status),'message':fit.message}
    (out/f'{sex}-surface-fit.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps(output),flush=True)
finally:
    if process.poll() is None:process.terminate();process.wait(timeout=10)
