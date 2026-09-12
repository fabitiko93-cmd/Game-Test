extends CharacterBody3D
class_name RealmPlayer

var move_input := Vector2.ZERO
var hp := 120.0
var max_hp := 120.0
var mana := 60.0
var max_mana := 60.0
var gold := 0
var has_crypt_key := false
var can_control := true

const SPEED := 5.2
const ACCEL := 22.0
const ATTACK_RANGE := 2.35
const ATTACK_ARC := 0.15
const ATTACK_DAMAGE := 24.0

var attack_cooldown := 0.0
var attack_lock := 0.0
var block_held := false
var visual: Node3D
var sword_pivot: Node3D

signal stats_changed
signal player_died

func _ready() -> void:
	add_to_group("player")
	_build_visual()
	emit_signal("stats_changed")

func _physics_process(delta: float) -> void:
	attack_cooldown = maxf(0.0, attack_cooldown - delta)
	attack_lock = maxf(0.0, attack_lock - delta)
	if not can_control:
		velocity = Vector3.ZERO
		return

	var kb := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var input_vec := move_input if move_input.length() > 0.08 else kb
	if attack_lock > 0.0:
		input_vec *= 0.35

	var desired := Vector3(input_vec.x, 0.0, input_vec.y)
	if desired.length() > 1.0:
		desired = desired.normalized()
	var target := desired * SPEED
	velocity.x = move_toward(velocity.x, target.x, ACCEL * delta)
	velocity.z = move_toward(velocity.z, target.z, ACCEL * delta)
	velocity.y = -1.0

	if desired.length() > 0.12:
		var target_yaw := atan2(desired.x, desired.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, minf(1.0, 12.0 * delta))
	move_and_slide()

	if visual:
		visual.position.y = sin(Time.get_ticks_msec() * 0.012) * 0.025 if desired.length() > 0.1 else 0.0

func attack() -> void:
	if attack_cooldown > 0.0 or not can_control:
		return
	attack_cooldown = 0.48
	attack_lock = 0.22
	_animate_attack()
	await get_tree().create_timer(0.10).timeout
	if not is_inside_tree():
		return
	var forward := Vector3(sin(rotation.y), 0.0, cos(rotation.y)).normalized()
	for n in get_tree().get_nodes_in_group("enemies"):
		if not is_instance_valid(n):
			continue
		var offset: Vector3 = n.global_position - global_position
		offset.y = 0.0
		var dist := offset.length()
		if dist <= ATTACK_RANGE and dist > 0.01:
			var facing := forward.dot(offset.normalized())
			if facing >= ATTACK_ARC:
				n.take_damage(ATTACK_DAMAGE, forward * 4.0)

func set_blocking(value: bool) -> void:
	block_held = value

func take_damage(amount: float) -> void:
	if block_held:
		amount *= 0.35
	hp = maxf(0.0, hp - amount)
	emit_signal("stats_changed")
	_flash_hurt()
	if hp <= 0.0:
		can_control = false
		emit_signal("player_died")

func heal(amount: float) -> void:
	hp = minf(max_hp, hp + amount)
	emit_signal("stats_changed")

func add_gold(amount: int) -> void:
	gold += amount
	emit_signal("stats_changed")

func give_key() -> void:
	has_crypt_key = true
	emit_signal("stats_changed")

func _build_visual() -> void:
	visual = Node3D.new()
	add_child(visual)

	# legs
	for x in [-0.23, 0.23]:
		var leg := _mesh_box(Vector3(0.24, 0.8, 0.28), Color("39414b"))
		leg.position = Vector3(x, 0.55, 0.0)
		visual.add_child(leg)

	# boots
	for x in [-0.23, 0.23]:
		var boot := _mesh_box(Vector3(0.31, 0.28, 0.43), Color("191a1d"))
		boot.position = Vector3(x, 0.16, 0.09)
		visual.add_child(boot)

	# armored torso
	var torso := _mesh_box(Vector3(0.9, 1.0, 0.48), Color("59636e"))
	torso.position.y = 1.37
	visual.add_child(torso)
	var chest := _mesh_box(Vector3(0.62, 0.66, 0.12), Color("303943"))
	chest.position = Vector3(0, 1.42, 0.30)
	visual.add_child(chest)

	# shoulders
	for x in [-0.58, 0.58]:
		var shoulder := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.28
		sm.height = 0.45
		shoulder.mesh = sm
		shoulder.material_override = _mat(Color("69747f"), 0.55)
		shoulder.position = Vector3(x, 1.65, 0)
		visual.add_child(shoulder)

	# head + hood/helmet
	var head := MeshInstance3D.new()
	var hs := SphereMesh.new()
	hs.radius = 0.27
	hs.height = 0.54
	head.mesh = hs
	head.material_override = _mat(Color("b58e72"), 0.8)
	head.position.y = 2.12
	visual.add_child(head)
	var helm := MeshInstance3D.new()
	var helm_mesh := CylinderMesh.new()
	helm_mesh.top_radius = 0.24
	helm_mesh.bottom_radius = 0.32
	helm_mesh.height = 0.34
	helm.mesh = helm_mesh
	helm.material_override = _mat(Color("252b31"), 0.6)
	helm.position.y = 2.28
	visual.add_child(helm)

	# cape
	var cape := _mesh_box(Vector3(0.62, 1.15, 0.08), Color("481c20"))
	cape.position = Vector3(0, 1.27, -0.31)
	cape.rotation.x = -0.08
	visual.add_child(cape)

	# sword arm pivot
	sword_pivot = Node3D.new()
	sword_pivot.position = Vector3(0.64, 1.48, 0.0)
	visual.add_child(sword_pivot)
	var arm := _mesh_box(Vector3(0.22, 0.78, 0.22), Color("404852"))
	arm.position = Vector3(0, -0.20, 0.0)
	sword_pivot.add_child(arm)
	var blade := _mesh_box(Vector3(0.11, 1.45, 0.08), Color("bbc4cb"))
	blade.position = Vector3(0, -0.95, 0.10)
	blade.rotation.x = 0.10
	sword_pivot.add_child(blade)
	var guard := _mesh_box(Vector3(0.48, 0.08, 0.12), Color("806b3d"))
	guard.position = Vector3(0, -0.34, 0.08)
	sword_pivot.add_child(guard)

	# offhand arm
	var off := _mesh_box(Vector3(0.22, 0.78, 0.22), Color("404852"))
	off.position = Vector3(-0.65, 1.31, 0)
	visual.add_child(off)

	var shape := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.42
	cap.height = 1.8
	shape.shape = cap
	shape.position.y = 1.0
	add_child(shape)

func _animate_attack() -> void:
	if not sword_pivot:
		return
	sword_pivot.rotation = Vector3(-0.5, 0.0, -1.1)
	var tw := create_tween()
	tw.tween_property(sword_pivot, "rotation", Vector3(0.35, 0.0, 1.0), 0.15).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(sword_pivot, "rotation", Vector3.ZERO, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)

func _flash_hurt() -> void:
	if not visual:
		return
	visual.scale = Vector3(1.08, 0.93, 1.08)
	var tw := create_tween()
	tw.tween_property(visual, "scale", Vector3.ONE, 0.13)

func _mesh_box(size: Vector3, color: Color) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	m.mesh = b
	m.material_override = _mat(color, 0.75)
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	return m

func _mat(color: Color, rough: float = 0.8) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = 0.15
	return m
