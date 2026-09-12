extends CharacterBody3D
class_name RealmEnemy

@export var archetype := "raider"
@export var max_hp := 55.0
@export var move_speed := 2.8
@export var damage := 10.0
@export var aggro_range := 8.0
@export var attack_range := 1.35

var hp := 55.0
var target: Node3D
var attack_cd := 0.0
var dead := false
var visual: Node3D

signal defeated(enemy)

func _ready() -> void:
	add_to_group("enemies")
	hp = max_hp
	target = get_tree().get_first_node_in_group("player")
	_build_visual()

func _physics_process(delta: float) -> void:
	if dead or not is_instance_valid(target):
		return
	attack_cd = maxf(0.0, attack_cd - delta)
	var d := target.global_position - global_position
	d.y = 0.0
	var dist := d.length()
	if dist <= aggro_range and dist > attack_range:
		var dir := d.normalized()
		velocity = dir * move_speed
		rotation.y = lerp_angle(rotation.y, atan2(dir.x, dir.z), minf(1.0, 8.0 * delta))
		move_and_slide()
	elif dist <= attack_range:
		velocity = Vector3.ZERO
		if attack_cd <= 0.0:
			attack_cd = 1.0 if archetype != "boss" else 0.72
			_attack()
	else:
		velocity = Vector3.ZERO

func take_damage(amount: float, knockback: Vector3 = Vector3.ZERO) -> void:
	if dead:
		return
	hp -= amount
	if knockback.length() > 0.1:
		global_position += knockback * 0.06
	_flash()
	if hp <= 0.0:
		_die()

func _attack() -> void:
	if not is_instance_valid(target):
		return
	var tw := create_tween()
	if visual:
		tw.tween_property(visual, "scale", Vector3(1.08, 0.92, 1.08), 0.08)
		tw.tween_property(visual, "scale", Vector3.ONE, 0.12)
	await get_tree().create_timer(0.12).timeout
	if is_instance_valid(target) and global_position.distance_to(target.global_position) <= attack_range + 0.35:
		target.take_damage(damage)

func _die() -> void:
	dead = true
	velocity = Vector3.ZERO
	remove_from_group("enemies")
	emit_signal("defeated", self)
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector3(1.2, 0.12, 1.2), 0.22)
	await tw.finished
	queue_free()

func _flash() -> void:
	if not visual:
		return
	visual.scale = Vector3(1.12, 0.9, 1.12)
	var tw := create_tween()
	tw.tween_property(visual, "scale", Vector3.ONE, 0.12)

func _build_visual() -> void:
	visual = Node3D.new()
	add_child(visual)
	var body_color := Color("4a3d35")
	var armor_color := Color("353a40")
	var skin := Color("8a6b57")
	if archetype == "cultist":
		body_color = Color("37213f")
		armor_color = Color("211728")
		skin = Color("a28d7d")
	elif archetype == "brute":
		body_color = Color("514328")
		armor_color = Color("5a4930")
		skin = Color("806149")
	elif archetype == "boss":
		body_color = Color("2f2020")
		armor_color = Color("6e1f22")
		skin = Color("756055")

	var scale_mul := 1.0
	if archetype == "brute": scale_mul = 1.22
	if archetype == "boss": scale_mul = 1.55
	visual.scale = Vector3.ONE * scale_mul

	for x in [-0.2, 0.2]:
		var leg := _box(Vector3(0.23, 0.72, 0.25), body_color)
		leg.position = Vector3(x, 0.48, 0)
		visual.add_child(leg)
	var torso := _box(Vector3(0.78, 0.9, 0.44), armor_color)
	torso.position.y = 1.28
	visual.add_child(torso)
	var head := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.25
	sm.height = 0.5
	head.mesh = sm
	head.position.y = 1.95
	head.material_override = _mat(skin)
	visual.add_child(head)

	if archetype == "cultist":
		var hood := MeshInstance3D.new()
		var cone := CylinderMesh.new()
		cone.top_radius = 0.05
		cone.bottom_radius = 0.34
		cone.height = 0.48
		hood.mesh = cone
		hood.position.y = 2.18
		hood.material_override = _mat(Color("24142b"))
		visual.add_child(hood)
	else:
		var helm := _box(Vector3(0.48, 0.22, 0.45), armor_color.lightened(0.08))
		helm.position.y = 2.16
		visual.add_child(helm)

	var weapon := _box(Vector3(0.12, 1.25, 0.1), Color("9a9b91"))
	weapon.position = Vector3(0.55, 0.92, 0.05)
	weapon.rotation.z = -0.35
	visual.add_child(weapon)

	if archetype == "boss":
		for x in [-0.58, 0.58]:
			var horn := MeshInstance3D.new()
			var cm := CylinderMesh.new()
			cm.top_radius = 0.0
			cm.bottom_radius = 0.12
			cm.height = 0.55
			horn.mesh = cm
			horn.position = Vector3(x * 0.6, 2.42, 0)
			horn.rotation.z = -0.5 * sign(x)
			horn.material_override = _mat(Color("b4a37a"))
			visual.add_child(horn)

	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.38 * scale_mul
	cap.height = 1.6 * scale_mul
	cs.shape = cap
	cs.position.y = 0.9 * scale_mul
	add_child(cs)

func _box(size: Vector3, color: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = _mat(color)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return mi

func _mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.88
	m.metallic = 0.08
	return m
