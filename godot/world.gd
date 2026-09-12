extends Node3D

const PlayerScript = preload("res://player.gd")
const EnemyScript = preload("res://enemy.gd")

var player: RealmPlayer
var camera: Camera3D
var hp_fill: ColorRect
var mana_fill: ColorRect
var status_label: Label
var objective_label: Label
var pickup_label: Label
var joystick_base: Control
var joystick_knob: Control
var joy_touch := -1
var joy_origin := Vector2.ZERO
var joy_vector := Vector2.ZERO
var crypt_door: StaticBody3D
var gear: Array[String] = []
var objective := "Find the Crypt Key"
var pickup_tween: Tween

func _ready() -> void:
	_build_environment()
	_build_dungeon()
	_spawn_player()
	_spawn_encounters()
	_build_ui()
	_update_hud()

func _process(_delta: float) -> void:
	if is_instance_valid(player) and is_instance_valid(camera):
		var desired := player.global_position + Vector3(10.5, 12.5, 13.5)
		camera.global_position = camera.global_position.lerp(desired, 0.12)
		camera.look_at(player.global_position + Vector3(0, 1.1, 0), Vector3.UP)
		player.move_input = joy_vector
	_check_loot_pickups()

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and event.position.x < get_viewport().get_visible_rect().size.x * 0.48 and event.position.y > get_viewport().get_visible_rect().size.y * 0.42 and joy_touch == -1:
			joy_touch = event.index
			joy_origin = event.position
			_position_joystick(joy_origin)
		elif not event.pressed and event.index == joy_touch:
			joy_touch = -1
			joy_vector = Vector2.ZERO
			joystick_knob.position = Vector2(46, 46)
	if event is InputEventScreenDrag and event.index == joy_touch:
		var delta := event.position - joy_origin
		var limited := delta.limit_length(58.0)
		joy_vector = limited / 58.0
		joystick_knob.position = Vector2(46, 46) + limited

func _build_environment() -> void:
	var env_node := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("08090c")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("58606b")
	env.ambient_light_energy = 0.34
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env_node.environment = env
	add_child(env_node)

	var moon := DirectionalLight3D.new()
	moon.light_color = Color("8192aa")
	moon.light_energy = 0.55
	moon.rotation_degrees = Vector3(-55, -35, 0)
	moon.shadow_enabled = true
	add_child(moon)

func _build_dungeon() -> void:
	# Distinct connected spaces: entry chapel -> cross hall -> side chambers -> sealed descent -> boss crypt.
	_add_floor(Vector3(0, -0.3, 4), Vector3(12, 0.6, 10), Color("29292b"))
	_add_floor(Vector3(0, -0.3, -8), Vector3(8, 0.6, 14), Color("27272a"))
	_add_floor(Vector3(0, -0.3, -18), Vector3(18, 0.6, 10), Color("2d2b2a"))
	_add_floor(Vector3(-15, -0.3, -18), Vector3(12, 0.6, 10), Color("25272a"))
	_add_floor(Vector3(15, -0.3, -18), Vector3(12, 0.6, 10), Color("2a2625"))
	_add_floor(Vector3(0, -0.3, -28), Vector3(7, 0.6, 10), Color("292727"))
	_add_floor(Vector3(0, -0.3, -40), Vector3(22, 0.6, 16), Color("302525"))

	# Entry chapel perimeter and corridor mouth.
	_add_wall(Vector3(-6.2, 1.6, 4), Vector3(0.7, 3.8, 10.8))
	_add_wall(Vector3(6.2, 1.6, 4), Vector3(0.7, 3.8, 10.8))
	_add_wall(Vector3(0, 1.6, 9.2), Vector3(12.8, 3.8, 0.7))
	_add_wall(Vector3(-4.3, 1.6, -1.0), Vector3(3.5, 3.8, 0.7))
	_add_wall(Vector3(4.3, 1.6, -1.0), Vector3(3.5, 3.8, 0.7))

	# Narrow procession corridor.
	_add_wall(Vector3(-4.2, 1.6, -8), Vector3(0.7, 3.8, 14))
	_add_wall(Vector3(4.2, 1.6, -8), Vector3(0.7, 3.8, 14))
	_add_arch(Vector3(0, 0, -3.0))
	_add_arch(Vector3(0, 0, -13.0))

	# Cross hall with open east/west chambers.
	_add_wall(Vector3(-8.8, 1.6, -13.3), Vector3(10.0, 3.8, 0.7))
	_add_wall(Vector3(8.8, 1.6, -13.3), Vector3(10.0, 3.8, 0.7))
	_add_wall(Vector3(-8.8, 1.6, -22.7), Vector3(10.0, 3.8, 0.7))
	_add_wall(Vector3(8.8, 1.6, -22.7), Vector3(10.0, 3.8, 0.7))
	_add_wall(Vector3(-21.0, 1.6, -18), Vector3(0.7, 3.8, 10.8))
	_add_wall(Vector3(21.0, 1.6, -18), Vector3(0.7, 3.8, 10.8))
	_add_wall(Vector3(-15, 1.6, -13.3), Vector3(12.0, 3.8, 0.7))
	_add_wall(Vector3(-15, 1.6, -22.7), Vector3(12.0, 3.8, 0.7))
	_add_wall(Vector3(15, 1.6, -13.3), Vector3(12.0, 3.8, 0.7))
	_add_wall(Vector3(15, 1.6, -22.7), Vector3(12.0, 3.8, 0.7))

	# Sealed descent and boss crypt.
	_add_wall(Vector3(-3.7, 1.6, -28), Vector3(0.7, 3.8, 10))
	_add_wall(Vector3(3.7, 1.6, -28), Vector3(0.7, 3.8, 10))
	crypt_door = _add_door(Vector3(0, 1.5, -23.2))
	_add_wall(Vector3(-11.2, 1.8, -40), Vector3(0.8, 4.2, 16.8))
	_add_wall(Vector3(11.2, 1.8, -40), Vector3(0.8, 4.2, 16.8))
	_add_wall(Vector3(0, 1.8, -48.2), Vector3(22.8, 4.2, 0.8))
	_add_wall(Vector3(-7.0, 1.8, -32.0), Vector3(8.0, 4.2, 0.8))
	_add_wall(Vector3(7.0, 1.8, -32.0), Vector3(8.0, 4.2, 0.8))

	# Pillars, braziers, debris and chamber dressing make each space read as a place rather than an arena.
	for p in [Vector3(-4.5,0,6.5), Vector3(4.5,0,6.5), Vector3(-4.5,0,1.5), Vector3(4.5,0,1.5), Vector3(-6.5,0,-18), Vector3(6.5,0,-18), Vector3(-8,0,-43), Vector3(8,0,-43), Vector3(-8,0,-36), Vector3(8,0,-36)]:
		_add_pillar(p)
	for p in [Vector3(-3.3,0,-5), Vector3(3.3,0,-11), Vector3(-17.8,0,-18), Vector3(17.8,0,-18), Vector3(-8.5,0,-39), Vector3(8.5,0,-39)]:
		_add_brazier(p)
	for p in [Vector3(-2.7,0,5.8), Vector3(3.8,0,-16), Vector3(-13,0,-20), Vector3(13,0,-16.5)]:
		_add_debris(p)

	_add_key_pickup(Vector3(16.0, 0.4, -18.0))
	_add_chest(Vector3(-16.0, 0.55, -18.0))

func _spawn_player() -> void:
	player = PlayerScript.new()
	player.position = Vector3(0, 0, 6.0)
	add_child(player)
	player.stats_changed.connect(_update_hud)
	player.player_died.connect(_on_player_died)

	camera = Camera3D.new()
	camera.fov = 46.0
	camera.position = Vector3(10.5, 12.5, 19.5)
	camera.current = true
	add_child(camera)
	camera.look_at(player.global_position + Vector3(0,1,0), Vector3.UP)

func _spawn_encounters() -> void:
	_spawn_enemy(Vector3(-2.0,0,-9.0), "raider")
	_spawn_enemy(Vector3(2.2,0,-11.0), "raider")
	_spawn_enemy(Vector3(-5.5,0,-18.0), "cultist")
	_spawn_enemy(Vector3(5.5,0,-18.0), "brute")
	_spawn_enemy(Vector3(13.5,0,-19.5), "raider")
	_spawn_enemy(Vector3(17.0,0,-16.5), "cultist")
	_spawn_enemy(Vector3(-14.0,0,-16.0), "raider")
	_spawn_enemy(Vector3(-17.0,0,-20.0), "brute")
	var boss := _spawn_enemy(Vector3(0,0,-42.0), "boss")
	boss.max_hp = 220.0
	boss.hp = 220.0
	boss.damage = 18.0
	boss.aggro_range = 11.0

func _spawn_enemy(pos: Vector3, type: String) -> RealmEnemy:
	var e: RealmEnemy = EnemyScript.new()
	e.archetype = type
	if type == "cultist":
		e.max_hp = 42.0; e.move_speed = 3.3; e.damage = 8.0
	elif type == "brute":
		e.max_hp = 90.0; e.move_speed = 2.15; e.damage = 15.0
	elif type == "boss":
		e.max_hp = 220.0; e.move_speed = 2.7; e.damage = 18.0
	e.position = pos
	add_child(e)
	e.defeated.connect(_on_enemy_defeated)
	return e

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	var title := Label.new()
	title.text = "REALMFALL  •  THE SUNKEN CRYPT"
	title.position = Vector2(28, 18)
	title.add_theme_font_size_override("font_size", 18)
	layer.add_child(title)

	status_label = Label.new()
	status_label.position = Vector2(28, 46)
	status_label.add_theme_font_size_override("font_size", 15)
	layer.add_child(status_label)

	objective_label = Label.new()
	objective_label.position = Vector2(28, 76)
	objective_label.add_theme_font_size_override("font_size", 14)
	layer.add_child(objective_label)

	var hp_bg := ColorRect.new()
	hp_bg.color = Color(0.05,0.03,0.03,0.85)
	hp_bg.position = Vector2(28, 104); hp_bg.size = Vector2(220, 15)
	layer.add_child(hp_bg)
	hp_fill = ColorRect.new(); hp_fill.color = Color("8f2527"); hp_fill.size = Vector2(220,15)
	hp_bg.add_child(hp_fill)
	var mana_bg := ColorRect.new(); mana_bg.color = Color(0.03,0.04,0.08,0.85); mana_bg.position = Vector2(28,124); mana_bg.size = Vector2(180,10)
	layer.add_child(mana_bg)
	mana_fill = ColorRect.new(); mana_fill.color = Color("355d91"); mana_fill.size = Vector2(180,10)
	mana_bg.add_child(mana_fill)

	pickup_label = Label.new()
	pickup_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pickup_label.position = Vector2(340, 28); pickup_label.size = Vector2(600, 42)
	pickup_label.add_theme_font_size_override("font_size", 20)
	layer.add_child(pickup_label)

	joystick_base = Control.new(); joystick_base.position = Vector2(70, 500); joystick_base.size = Vector2(150,150)
	layer.add_child(joystick_base)
	var base := _circle_panel(70, Color(0.15,0.15,0.18,0.55)); base.position = Vector2(5,5); joystick_base.add_child(base)
	joystick_knob = _circle_panel(30, Color(0.58,0.58,0.62,0.72)); joystick_knob.position = Vector2(46,46); joystick_base.add_child(joystick_knob)

	var attack := _button("ATTACK", Vector2(1080, 550), Vector2(150, 74))
	layer.add_child(attack); attack.pressed.connect(func(): if player: player.attack())
	var block := _button("BLOCK", Vector2(920, 590), Vector2(130, 60))
	layer.add_child(block); block.button_down.connect(func(): if player: player.set_blocking(true)); block.button_up.connect(func(): if player: player.set_blocking(false))
	var use := _button("USE", Vector2(955, 505), Vector2(118, 58))
	layer.add_child(use); use.pressed.connect(_interact)

func _update_hud() -> void:
	if not is_instance_valid(player) or not is_instance_valid(status_label):
		return
	status_label.text = "HP %d/%d    MANA %d/%d    GOLD %d" % [player.hp, player.max_hp, player.mana, player.max_mana, player.gold]
	objective_label.text = objective
	if player.has_crypt_key:
		objective_label.text += "   •   KEY ACQUIRED"
	hp_fill.size.x = 220.0 * player.hp / player.max_hp
	mana_fill.size.x = 180.0 * player.mana / player.max_mana

func _interact() -> void:
	if not is_instance_valid(player): return
	var nearest: Node3D = null
	var best := 2.7
	for n in get_tree().get_nodes_in_group("interactable"):
		if is_instance_valid(n):
			var d := player.global_position.distance_to(n.global_position)
			if d < best:
				best = d; nearest = n
	if nearest == null:
		_show_pickup("Nothing to use here")
		return
	var kind := str(nearest.get_meta("kind", ""))
	if kind == "key":
		player.give_key(); nearest.queue_free(); objective = "Open the sealed crypt door"; _show_pickup("CRYPT KEY")
	elif kind == "chest":
		if bool(nearest.get_meta("opened", false)):
			_show_pickup("Chest is empty")
		else:
			nearest.set_meta("opened", true); gear.append("Ashen Steel Cuirass"); player.add_gold(38); _show_pickup("ASHEN STEEL CUIRASS  + 38 GOLD")
			nearest.rotation.z = -0.35
	elif kind == "door":
		if player.has_crypt_key:
			objective = "Descend into the crypt and kill the Warden"
			_show_pickup("THE SEAL BREAKS")
			crypt_door.remove_from_group("interactable")
			var tw := create_tween(); tw.tween_property(crypt_door, "position:y", -3.0, 0.75); tw.tween_callback(crypt_door.queue_free)
		else:
			_show_pickup("The door is sealed. A key is required.")
	_update_hud()

func _on_enemy_defeated(enemy) -> void:
	if enemy.archetype == "boss":
		objective = "Warden slain — the crypt is yours"
		_show_pickup("WARDEN DEFEATED  •  RELIC: EMBERFANG")
		gear.append("Emberfang")
		player.add_gold(125)
	else:
		if randf() < 0.55:
			_spawn_loot(enemy.global_position)
	_update_hud()

func _spawn_loot(pos: Vector3) -> void:
	var root := Node3D.new(); root.position = pos + Vector3(0,0.35,0); root.add_to_group("loot")
	var mi := MeshInstance3D.new(); var mesh := CylinderMesh.new(); mesh.top_radius = 0.16; mesh.bottom_radius = 0.28; mesh.height = 0.34; mi.mesh = mesh
	var mat := StandardMaterial3D.new(); mat.albedo_color = Color("d5a54b"); mat.emission_enabled = true; mat.emission = Color("8a5b19"); mat.emission_energy_multiplier = 1.5; mi.material_override = mat
	root.add_child(mi); add_child(root)

func _check_loot_pickups() -> void:
	if not is_instance_valid(player): return
	for n in get_tree().get_nodes_in_group("loot"):
		if is_instance_valid(n):
			n.rotation.y += 0.035
			if n.global_position.distance_to(player.global_position) < 1.05:
				player.add_gold(6 + randi_range(0,9)); _show_pickup("Gold recovered"); n.queue_free()

func _on_player_died() -> void:
	objective = "You have fallen"
	_show_pickup("FALLEN — reload the page to return")
	_update_hud()

func _show_pickup(text: String) -> void:
	if not is_instance_valid(pickup_label): return
	pickup_label.text = text
	pickup_label.modulate = Color.WHITE
	if pickup_tween and pickup_tween.is_valid(): pickup_tween.kill()
	pickup_tween = create_tween(); pickup_tween.tween_interval(1.2); pickup_tween.tween_property(pickup_label, "modulate", Color(1,1,1,0), 0.6)

func _position_joystick(screen_pos: Vector2) -> void:
	joystick_base.position = screen_pos - Vector2(75,75)
	joystick_knob.position = Vector2(46,46)

func _add_floor(pos: Vector3, size: Vector3, color: Color) -> void:
	var body := StaticBody3D.new(); body.position = pos; add_child(body)
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = size; mi.mesh = bm; mi.material_override = _stone_mat(color); body.add_child(mi)
	var cs := CollisionShape3D.new(); var shape := BoxShape3D.new(); shape.size = size; cs.shape = shape; body.add_child(cs)

func _add_wall(pos: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new(); body.position = pos; add_child(body)
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = size; mi.mesh = bm; mi.material_override = _stone_mat(Color("39383a")); mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON; body.add_child(mi)
	var cs := CollisionShape3D.new(); var sh := BoxShape3D.new(); sh.size = size; cs.shape = sh; body.add_child(cs)

func _add_arch(pos: Vector3) -> void:
	_add_wall(pos + Vector3(-3.3,1.8,0), Vector3(1.1,4.2,1.0)); _add_wall(pos + Vector3(3.3,1.8,0), Vector3(1.1,4.2,1.0)); _add_wall(pos + Vector3(0,3.45,0), Vector3(5.6,0.9,1.0))

func _add_pillar(pos: Vector3) -> void:
	var mi := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.42; cm.bottom_radius = 0.55; cm.height = 3.0; cm.radial_segments = 8; mi.mesh = cm; mi.position = pos + Vector3(0,1.5,0); mi.material_override = _stone_mat(Color("444145")); mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON; add_child(mi)

func _add_brazier(pos: Vector3) -> void:
	var stand := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.18; cm.bottom_radius = 0.28; cm.height = 1.0; cm.radial_segments = 8; stand.mesh = cm; stand.position = pos + Vector3(0,0.5,0); stand.material_override = _metal_mat(Color("302b29")); add_child(stand)
	var flame := OmniLight3D.new(); flame.position = pos + Vector3(0,1.45,0); flame.light_color = Color("ff8b3d"); flame.light_energy = 2.4; flame.omni_range = 6.5; flame.shadow_enabled = true; add_child(flame)
	var fire := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.16; sm.height = 0.42; fire.mesh = sm; fire.position = pos + Vector3(0,1.25,0); var fm := StandardMaterial3D.new(); fm.albedo_color = Color("ff7b2d"); fm.emission_enabled = true; fm.emission = Color("ff5a1f"); fm.emission_energy_multiplier = 3.0; fire.material_override = fm; add_child(fire)

func _add_debris(pos: Vector3) -> void:
	for i in 3:
		var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(0.7 + i*0.16, 0.28, 0.45); mi.mesh = bm; mi.position = pos + Vector3(i*0.55,0.15,i*0.25); mi.rotation.y = i*0.7; mi.material_override = _stone_mat(Color("343234")); add_child(mi)

func _add_key_pickup(pos: Vector3) -> void:
	var root := Node3D.new(); root.position = pos; root.add_to_group("interactable"); root.set_meta("kind", "key"); add_child(root)
	var shaft := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(0.12,0.12,0.75); shaft.mesh = bm; shaft.rotation.z = 1.1; shaft.material_override = _metal_mat(Color("d0a84d")); root.add_child(shaft)
	var light := OmniLight3D.new(); light.light_color = Color("e4ad46"); light.light_energy = 1.2; light.omni_range = 2.2; root.add_child(light)

func _add_chest(pos: Vector3) -> void:
	var root := Node3D.new(); root.position = pos; root.add_to_group("interactable"); root.set_meta("kind", "chest"); root.set_meta("opened", false); add_child(root)
	var box := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(1.4,0.7,0.8); box.mesh = bm; box.material_override = _metal_mat(Color("5a3d28")); root.add_child(box)
	var band := MeshInstance3D.new(); var bb := BoxMesh.new(); bb.size = Vector3(0.22,0.76,0.86); band.mesh = bb; band.material_override = _metal_mat(Color("6a5b43")); root.add_child(band)

func _add_door(pos: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new(); body.position = pos; body.add_to_group("interactable"); body.set_meta("kind", "door"); add_child(body)
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(5.7,3.4,0.5); mi.mesh = bm; mi.position.y = 0.2; mi.material_override = _metal_mat(Color("302a2a")); body.add_child(mi)
	var cs := CollisionShape3D.new(); var sh := BoxShape3D.new(); sh.size = Vector3(5.7,3.4,0.5); cs.shape = sh; cs.position.y = 0.2; body.add_child(cs)
	return body

func _stone_mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = color; m.roughness = 0.95; return m

func _metal_mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = color; m.roughness = 0.58; m.metallic = 0.35; return m

func _button(text: String, pos: Vector2, size: Vector2) -> Button:
	var b := Button.new(); b.text = text; b.position = pos; b.size = size; b.add_theme_font_size_override("font_size", 18); return b

func _circle_panel(radius: float, color: Color) -> Panel:
	var p := Panel.new(); p.size = Vector2(radius*2,radius*2); var sb := StyleBoxFlat.new(); sb.bg_color = color; sb.corner_radius_top_left = int(radius); sb.corner_radius_top_right = int(radius); sb.corner_radius_bottom_left = int(radius); sb.corner_radius_bottom_right = int(radius); p.add_theme_stylebox_override("panel", sb); return p
