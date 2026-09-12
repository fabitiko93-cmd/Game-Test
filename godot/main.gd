extends Node2D

const W=1280.0
const H=720.0
var player=Vector2(640,360)
var hp=100.0
var max_hp=100.0
var level=1
var xp=0
var xp_need=80
var gold=0
var wave=1
var enemies=[]
var drops=[]
var particles=[]
var move=Vector2.ZERO
var stick_id=-1
var stick_origin=Vector2(150,570)
var stick_pos=Vector2(150,570)
var attack_cd=0.0
var dash_cd=0.0
var skill_cd=0.0
var invuln=0.0
var slash=0.0
var facing=Vector2.RIGHT
var rng=RandomNumberGenerator.new()

func _ready():
 rng.randomize()
 for i in 8: spawn_enemy(false)
 queue_redraw()

func spawn_enemy(boss=false):
 var a=rng.randf_range(0,TAU)
 var d=rng.randf_range(310,520)
 var p=player+Vector2(cos(a),sin(a))*d
 p.x=clamp(p.x,80.0,W-80.0); p.y=clamp(p.y,80.0,H-80.0)
 var elite=boss or rng.randf()<min(.08+wave*.012,.28)
 enemies.append({"p":p,"hp":220.0+wave*25 if boss else (85.0+wave*9)*(1.7 if elite else 1.0),"max":220.0+wave*25 if boss else (85.0+wave*9)*(1.7 if elite else 1.0),"r":36.0 if boss else (27.0 if elite else 22.0),"speed":65.0 if boss else rng.randf_range(75,110),"elite":elite,"boss":boss,"hit":0.0})

func _process(dt):
 attack_cd=max(0.0,attack_cd-dt); dash_cd=max(0.0,dash_cd-dt); skill_cd=max(0.0,skill_cd-dt); invuln=max(0.0,invuln-dt); slash=max(0.0,slash-dt)
 if move.length()>.08:
  facing=move.normalized(); player+=move.normalized()*235.0*dt
 player.x=clamp(player.x,55.0,W-55.0); player.y=clamp(player.y,55.0,H-55.0)
 for e in enemies:
  e.hit=max(0.0,e.hit-dt)
  var v=player-e.p
  if v.length()>1: e.p+=v.normalized()*e.speed*dt
  if v.length()<e.r+25 and invuln<=0:
   hp-=18.0*dt*(1.8 if e.boss else 1.0)
 for i in range(enemies.size()-1,-1,-1):
  if enemies[i].hp<=0:
   var e=enemies[i]; xp+=30 if e.elite else 16; gold+=rng.randi_range(2,8)*(3 if e.boss else 1)
   if rng.randf()<.22: drops.append({"p":e.p,"heal":true})
   burst(e.p, Color(1,.45,.16),14); enemies.remove_at(i)
 while xp>=xp_need:
  xp-=xp_need; level+=1; xp_need=int(xp_need*1.3); max_hp+=14; hp=max_hp; burst(player,Color(.4,.8,1),28)
 if enemies.is_empty():
  wave+=1
  for i in 6+wave: spawn_enemy(false)
  if wave%5==0: spawn_enemy(true)
 for i in range(drops.size()-1,-1,-1):
  if player.distance_to(drops[i].p)<38:
   hp=min(max_hp,hp+32); drops.remove_at(i)
 for p in particles: p.p+=p.v*dt; p.life-=dt; p.v*=.94
 particles=particles.filter(func(q): return q.life>0)
 if hp<=0: restart()
 queue_redraw()

func attack():
 if attack_cd>0:return
 attack_cd=.34; slash=.16
 var center=player+facing*48
 for e in enemies:
  if e.p.distance_to(center)<92:
   e.hp-=38+level*4; e.hit=.12; e.p+=facing*18; burst(e.p,Color(1,.75,.35),5)

func dash():
 if dash_cd>0:return
 dash_cd=1.25; invuln=.28; player+=(facing if move.length()<.1 else move.normalized())*145; burst(player,Color(.35,.75,1),12)

func skill():
 if skill_cd>0:return
 skill_cd=4.5; burst(player,Color(.55,.3,1),36)
 for e in enemies:
  if e.p.distance_to(player)<185: e.hp-=55+level*5; e.hit=.18

func burst(pos,col,n):
 for i in n:
  var a=rng.randf_range(0,TAU); particles.append({"p":pos,"v":Vector2(cos(a),sin(a))*rng.randf_range(40,180),"life":rng.randf_range(.25,.65),"c":col})

func restart():
 hp=100;max_hp=100;level=1;xp=0;xp_need=80;gold=0;wave=1;player=Vector2(640,360);enemies.clear();drops.clear()
 for i in 8:spawn_enemy(false)

func _input(event):
 if event is InputEventScreenTouch:
  if event.pressed:
   if event.position.x<360 and event.position.y>360:
    stick_id=event.index;stick_origin=event.position;stick_pos=event.position
   elif event.position.x>1090 and event.position.y>500: attack()
   elif event.position.x>965 and event.position.y>525: dash()
   elif event.position.x>1000 and event.position.y>380: skill()
  elif event.index==stick_id:
   stick_id=-1;move=Vector2.ZERO;stick_pos=stick_origin
 elif event is InputEventScreenDrag and event.index==stick_id:
  var v=event.position-stick_origin
  if v.length()>70:v=v.normalized()*70
  stick_pos=stick_origin+v;move=v/70.0

func _draw():
 draw_rect(Rect2(0,0,W,H),Color("17131d"))
 # dungeon floor
 for y in range(0,720,64):
  for x in range(0,1280,64):
   var c=Color("24202b") if ((x/64 as int)+(y/64 as int))%2==0 else Color("201c27")
   draw_rect(Rect2(x+2,y+2,60,60),c)
 for x in range(0,1280,160): draw_circle(Vector2(x+60,100+(x%320)),48,Color(0.12,0.08,0.14,.45))
 for d in drops:
  draw_circle(d.p,14,Color(.2,1,.45));draw_circle(d.p,7,Color(.75,1,.8))
 for e in enemies:
  draw_circle(e.p+Vector2(8,10),e.r,Color(0,0,0,.35))
  draw_circle(e.p,e.r,Color("7b2738") if not e.elite else Color("a35a24"))
  if e.boss: draw_circle(e.p,e.r-8,Color("401524"))
  draw_circle(e.p+Vector2(-7,-5),4,Color("ffbd66"));draw_circle(e.p+Vector2(7,-5),4,Color("ffbd66"))
  var bw=e.r*2.1;draw_rect(Rect2(e.p.x-bw/2,e.p.y-e.r-13,bw,5),Color(.12,.08,.1));draw_rect(Rect2(e.p.x-bw/2,e.p.y-e.r-13,bw*(e.hp/e.max),5),Color(.9,.2,.25))
 # hero shadow/body/weapon
 draw_ellipse(player+Vector2(0,14),Vector2(28,13),Color(0,0,0,.4))
 draw_circle(player,25,Color("386a8a"));draw_circle(player+Vector2(0,-8),15,Color("b9a28b"));draw_line(player+facing*10,player+facing*48,Color("d7e5ef"),8)
 if slash>0:
  var a=facing.angle();draw_arc(player,72,a-.85,a+.85,20,Color(1,.8,.4,slash/.16),10)
 for p in particles: draw_circle(p.p,4,p.c)
 # HUD
 draw_rect(Rect2(22,20,310,18),Color(.08,.06,.1,.85));draw_rect(Rect2(22,20,310*(hp/max_hp),18),Color("b52f48"))
 draw_string(ThemeDB.fallback_font,Vector2(22,62),"LV %d   WAVE %d   GOLD %d"%[level,wave,gold],HORIZONTAL_ALIGNMENT_LEFT,400,22,Color("eee5d8"))
 draw_rect(Rect2(22,72,240,7),Color(.08,.06,.1));draw_rect(Rect2(22,72,240*(float(xp)/xp_need),7),Color("6d7ee8"))
 # touch controls
 draw_circle(stick_origin,76,Color(.7,.8,1,.08));draw_arc(stick_origin,76,0,TAU,40,Color(.7,.8,1,.22),3);draw_circle(stick_pos,31,Color(.7,.8,1,.22))
 button(Vector2(1160,590),66,Color("8f3042"),"ATTACK")
 button(Vector2(1015,600),49,Color("345f7d"),"DASH")
 button(Vector2(1080,445),52,Color("633f91"),"ARC")

func draw_ellipse(c:Vector2,r:Vector2,col:Color):
 var pts=PackedVector2Array()
 for i in 24:
  var a=TAU*i/24.0;pts.append(c+Vector2(cos(a)*r.x,sin(a)*r.y))
 draw_colored_polygon(pts,col)
func button(p:Vector2,r:float,col:Color,text:String):
 draw_circle(p,r,Color(0,0,0,.35));draw_circle(p,r-4,col);draw_string(ThemeDB.fallback_font,p+Vector2(-r*.55,7),text,HORIZONTAL_ALIGNMENT_CENTER,r*1.1,16,Color.WHITE)
