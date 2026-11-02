// Shared normalized action clock for the visible forearm, support contact,
// bolt and ejection event. This never transfers ammunition.
export function shotgunCycle(age,mechanism){
 if(!mechanism||!Number.isFinite(age)||age<0||age>=mechanism.cycle)return 0;
 const start=mechanism.kind==='pump'?.13:0,peak=mechanism.kind==='pump'?.36:mechanism.cycle*.28;
 if(age<start)return 0;
 const t=age<peak?(age-start)/(peak-start):1-(age-peak)/(mechanism.cycle-peak);
 return Math.max(0,t*t*(3-2*t));
}
