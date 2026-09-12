extends Node3D

const ARENA_X := 22.0
const ARENA_Z := 16.0
const PLAYER_SPEED := 5.4
const DASH_SPEED := 13.0
const ATTACK_RANGE := 2.5
const ATTACK_COOLDOWN := 0.48

var player: CharacterBody3D
var player_visual: Node3D
var weapon_pivot: Node3D
var camera: Camera3D
var hp := 100.0
var max_hp := 100.0
var mana := 60.0
var max_mana := 60.0
var xp := 0
var level := 1
var gold := 0
var attack_cd := 0.0
var dash_time := 0.0
var dash_cd := 0.0
var dash_dir := Vector3.ZERO
var hurt_flash := 0.0
var enemies: Array[Dictionary] = []
var loot: Array[Dictionary] = []
var wave := 1
var alive_in_wave := 0
var spawn_timer := 0.0

var move_touch_id := -1
var move_origin := Vector2.ZERO
var move_current := Vector2.ZERO
var touch_move := Vector2.ZERO

var hp_bar: ProgressBar
var mana_bar: ProgressBar
var xp_bar: ProgressBar
var level_label: Label
var wave_label: Label
var gold_label: Label
var message_label: Label
var joystick_base: Control
var joystick_knob: Control

var mat_stone: StandardMaterial3D
var mat_stone_dark: StandardMaterial3D
var mat_moss: StandardMaterial3D
var mat_wood: StandardMaterial3D
var mat_iron: StandardMaterial3D
var mat_leather: StandardMaterial3D
var mat_skin: StandardMaterial3D
var mat_enemy: StandardMaterial3D
var mat_enemy_elite: StandardMaterial3D
var mat_fire: StandardMaterial3D
var mat_gold: StandardMaterial3D

func _ready() -> void:
    _make_materials()
    _make_environment()
    _build_dungeon()
    _build_player()
    _build_camera()
    _build_hud()
    _spawn_wave()

func _make_materials() -> void:
    mat_stone = _mat(Color("35323a"), 0.88)
    mat_stone_dark = _mat(Color("211f27"), 0.95)
    mat_moss = _mat(Color("344034"), 0.92)
    mat_wood = _mat(Color("493527"), 0.88)
    mat_iron = _mat(Color("5b616a"), 0.38, 0.55)
    mat_leather = _mat(Color("492b24"), 0.82)
    mat_skin = _mat(Color("b68c6d"), 0.84)
    mat_enemy = _mat(Color("6d3b34"), 0.85)
    mat_enemy_elite = _mat(Color("462b62"), 0.72, 0.15)
    mat_fire = _mat(Color("ff7a2f"), 0.28, 0.0, Color("ff5b18"), 4.0)
    mat_gold = _mat(Color("d8aa3d"), 0.38, 0.6, Color("9a5b12"), 0.7)

func _mat(color: Color, rough := 0.8, metallic := 0.0, emission := Color.BLACK, emission_energy := 0.0) -> StandardMaterial3D:
    var m := StandardMaterial3D.new()
    m.albedo_color = color
    m.roughness = rough
    m.metallic = metallic
    if emission_energy > 0.0:
        m.emission_enabled = true
        m.emission = emission
        m.emission_energy_multiplier = emission_energy
    return m

func _make_environment() -> void:
    var world := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_COLOR
    env.background_color = Color("0a0910")
    env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
    env.ambient_light_color = Color("6b7188")
    env.ambient_light_energy = 0.42
    env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
    world.environment = env
    add_child(world)

    var moon := DirectionalLight3D.new()
    moon.rotation_degrees = Vector3(-58, -35, 0)
    moon.light_color = Color("a8b7d8")
    moon.light_energy = 0.72
    moon.shadow_enabled = true
    add_child(moon)

func _build_dungeon() -> void:
    var floor_root := Node3D.new()
    floor_root.name = "AshenCrypt"
    add_child(floor_root)

    for x in range(-11, 12):
        for z in range(-8, 9):
            var tile_mat := mat_stone if (x + z) % 4 != 0 else mat_moss
            var tile := _box(Vector3(1.92, 0.16, 1.92), tile_mat)
            tile.position = Vector3(float(x) * 2.0, -0.15, float(z) * 2.0)
            floor_root.add_child(tile)

    _wall(Vector3(0, 1.25, -17.0), Vector3(46, 2.8, 1.0))
    _wall(Vector3(0, 1.25, 17.0), Vector3(46, 2.8, 1.0))
    _wall(Vector3(-23.0, 1.25, 0), Vector3(1.0, 2.8, 34))
    _wall(Vector3(23.0, 1.25, 0), Vector3(1.0, 2.8, 34))

    for x in [-18.0, -9.0, 0.0, 9.0, 18.0]:
        _pillar(Vector3(x, 1.6, -13.5))
        _pillar(Vector3(x, 1.6, 13.5))

    _wall(Vector3(-7.0, 1.0, -4.5), Vector3(7.0, 2.1, 0.75))
    _wall(Vector3(8.0, 1.0, 4.0), Vector3(8.0, 2.1, 0.75))
    _wall(Vector3(0.0, 1.0, 8.0), Vector3(0.75, 2.1, 6.0))

    _brazier(Vector3(-15, 0, -10))
    _brazier(Vector3(15, 0, -10))
    _brazier(Vector3(-15, 0, 10))
    _brazier(Vector3(15, 0, 10))
    _brazier(Vector3(0, 0, -12))

    for p in [Vector3(-11,0,-2), Vector3(12,0,-5), Vector3(-4,0,11), Vector3(15,0,8)]:
        var crate := _box(Vector3(1.15, 1.15, 1.15), mat_wood)
        crate.position = p + Vector3(0, 0.58, 0)
        floor_root.add_child(crate)

func _wall(pos: Vector3, size: Vector3) -> void:
    var body := StaticBody3D.new()
    body.position = pos
    var mesh := _box(size, mat_stone_dark)
    body.add_child(mesh)
    var shape := CollisionShape3D.new()
    var box_shape := BoxShape3D.new()
    box_shape.size = size
    shape.shape = box_shape
    body.add_child(shape)
    add_child(body)

func _pillar(pos: Vector3) -> void:
    var body := StaticBody3D.new()
    body.position = pos
    var mesh := MeshInstance3D.new()
    var cylinder := CylinderMesh.new()
    cylinder.top_radius = 0.75
    cylinder.bottom_radius = 0.88
    cylinder.height = 3.2
    cylinder.radial_segments = 8
    mesh.mesh = cylinder
    mesh.material_override = mat_stone_dark
    body.add_child(mesh)
    var shape := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.8
    capsule.height = 3.2
    shape.shape = capsule
    body.add_child(shape)
    add_child(body)

func _brazier(pos: Vector3) -> void:
    var root := Node3D.new()
    root.position = pos
    add_child(root)
    var stand := _box(Vector3(0.35, 1.0, 0.35), mat_iron)
    stand.position.y = 0.5
    root.add_child(stand)
    var bowl := MeshInstance3D.new()
    var cyl := CylinderMesh.new()
    cyl.top_radius = 0.55
    cyl.bottom_radius = 0.35
    cyl.height = 0.22
    cyl.radial_segments = 10
    bowl.mesh = cyl
    bowl.material_override = mat_iron
    bowl.position.y = 1.05
    root.add_child(bowl)
    var flame := MeshInstance3D.new()
    var sphere := SphereMesh.new()
    sphere.radius = 0.25
    sphere.height = 0.7
    sphere.radial_segments = 8
    sphere.rings = 4
    flame.mesh = sphere
    flame.material_override = mat_fire
    flame.position.y = 1.42
    root.add_child(flame)
    var light := OmniLight3D.new()
    light.light_color = Color("ff914d")
    light.light_energy = 3.0
    light.omni_range = 7.0
    light.position.y = 1.5
    root.add_child(light)

func _build_player() -> void:
    player = CharacterBody3D.new()
    player.name = "Warden"
    player.position = Vector3(0, 0, 5)
    add_child(player)

    var collider := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.48
    capsule.height = 1.75
    collider.shape = capsule
    collider.position.y = 0.9
    player.add_child(collider)

    player_visual = Node3D.new()
    player.add_child(player_visual)

    var torso := _capsule_mesh(0.5, 1.15, mat_leather)
    torso.position.y = 1.15
    player_visual.add_child(torso)
    var chest := _box(Vector3(0.92, 0.52, 0.52), mat_iron)
    chest.position = Vector3(0, 1.34, 0)
    player_visual.add_child(chest)
    var head := _sphere(0.34, mat_skin)
    head.position.y = 2.02
    player_visual.add_child(head)
    var helm := _sphere(0.37, mat_iron)
    helm.scale = Vector3(1.0, 0.55, 1.0)
    helm.position = Vector3(0, 2.17, 0.01)
    player_visual.add_child(helm)
    var cloak := _box(Vector3(0.78, 1.05, 0.10), _mat(Color("52222a"), 0.92))
    cloak.position = Vector3(0, 1.18, 0.34)
    cloak.rotation_degrees.x = -7
    player_visual.add_child(cloak)

    weapon_pivot = Node3D.new()
    weapon_pivot.position = Vector3(0.48, 1.15, -0.05)
    player_visual.add_child(weapon_pivot)
    var sword := _box(Vector3(0.13, 1.55, 0.11), mat_iron)
    sword.position = Vector3(0.2, -0.35, -0.5)
    sword.rotation_degrees.x = 18
    weapon_pivot.add_child(sword)
    var guard := _box(Vector3(0.55, 0.09, 0.12), mat_gold)
    guard.position = Vector3(0.2, 0.35, -0.26)
    weapon_pivot.add_child(guard)

func _build_camera() -> void:
    camera = Camera3D.new()
    camera.fov = 48.0
    camera.near = 0.2
    camera.far = 90.0
    camera.position = Vector3(10.5, 12.0, 13.5)
    add_child(camera)
    camera.look_at(player.global_position + Vector3(0, 1.0, 0), Vector3.UP)

func _build_hud() -> void:
    var canvas := CanvasLayer.new()
    add_child(canvas)

    var title := Label.new()
    title.text = "REALMFALL  •  ASHEN VALE"
    title.position = Vector2(34, 22)
    title.add_theme_font_size_override("font_size", 20)
    title.modulate = Color("d9c7a2")
    canvas.add_child(title)

    hp_bar = _bar(Vector2(34, 56), Vector2(280, 18), Color("9b2d31"))
    mana_bar = _bar(Vector2(34, 80), Vector2(230, 12), Color("385f9f"))
    xp_bar = _bar(Vector2(34, 101), Vector2(330, 8), Color("b28c35"))
    canvas.add_child(hp_bar)
    canvas.add_child(mana_bar)
    canvas.add_child(xp_bar)

    level_label = Label.new()
    level_label.position = Vector2(34, 118)
    level_label.add_theme_font_size_override("font_size", 15)
    canvas.add_child(level_label)
    wave_label = Label.new()
    wave_label.position = Vector2(34, 141)
    wave_label.add_theme_font_size_override("font_size", 15)
    canvas.add_child(wave_label)
    gold_label = Label.new()
    gold_label.position = Vector2(34, 164)
    gold_label.add_theme_font_size_override("font_size", 15)
    gold_label.modulate = Color("e9c65f")
    canvas.add_child(gold_label)

    message_label = Label.new()
    message_label.position = Vector2(420, 28)
    message_label.size = Vector2(440, 44)
    message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    message_label.add_theme_font_size_override("font_size", 20)
    message_label.modulate = Color("e2d3bc")
    canvas.add_child(message_label)

    joystick_base = _joystick_panel(Vector2(70, 520), Vector2(150, 150), 0.18)
    joystick_knob = _joystick_panel(Vector2(115, 565), Vector2(60, 60), 0.34)
    canvas.add_child(joystick_base)
    canvas.add_child(joystick_knob)

    var attack := _action_button("STRIKE", Vector2(1080, 520), Vector2(150, 150))
    attack.pressed.connect(_attack)
    canvas.add_child(attack)
    var dash := _action_button("DASH", Vector2(930, 590), Vector2(120, 90))
    dash.pressed.connect(_dash)
    canvas.add_child(dash)

    _update_hud()

func _bar(pos: Vector2, size: Vector2, tint: Color) -> ProgressBar:
    var b := ProgressBar.new()
    b.position = pos
    b.size = size
    b.max_value = 100.0
    b.value = 100.0
    b.show_percentage = false
    b.modulate = tint
    return b

func _joystick_panel(pos: Vector2, size: Vector2, alpha: float) -> Panel:
    var p := Panel.new()
    p.position = pos
    p.size = size
    p.modulate = Color(0.8, 0.82, 0.88, alpha)
    p.mouse_filter = Control.MOUSE_FILTER_IGNORE
    return p

func _action_button(text: String, pos: Vector2, size: Vector2) -> Button:
    var b := Button.new()
    b.text = text
    b.position = pos
    b.size = size
    b.modulate = Color(0.82, 0.76, 0.68, 0.68)
    b.add_theme_font_size_override("font_size", 19)
    return b

func _physics_process(delta: float) -> void:
    attack_cd = maxf(0.0, attack_cd - delta)
    dash_cd = maxf(0.0, dash_cd - delta)
    hurt_flash = maxf(0.0, hurt_flash - delta)

    var input_vec := Vector2.ZERO
    input_vec.x = Input.get_axis("ui_left", "ui_right")
    input_vec.y = Input.get_axis("ui_down", "ui_up")
    if touch_move.length() > input_vec.length():
        input_vec = touch_move
    if input_vec.length() > 1.0:
        input_vec = input_vec.normalized()

    var cam_right := camera.global_transform.basis.x
    cam_right.y = 0.0
    cam_right = cam_right.normalized()
    var cam_forward := -camera.global_transform.basis.z
    cam_forward.y = 0.0
    cam_forward = cam_forward.normalized()
    var move_dir := (cam_right * input_vec.x + cam_forward * input_vec.y)
    if move_dir.length() > 1.0:
        move_dir = move_dir.normalized()

    if dash_time > 0.0:
        dash_time -= delta
        player.velocity = dash_dir * DASH_SPEED
    else:
        player.velocity = move_dir * PLAYER_SPEED

    player.move_and_slide()
    player.position.x = clampf(player.position.x, -21.5, 21.5)
    player.position.z = clampf(player.position.z, -15.5, 15.5)

    if move_dir.length() > 0.08:
        player.rotation.y = lerp_angle(player.rotation.y, atan2(-move_dir.x, -move_dir.z), minf(1.0, delta * 12.0))

    _update_enemies(delta)
    _update_loot(delta)

    if alive_in_wave <= 0:
        spawn_timer += delta
        if spawn_timer > 2.2:
            wave += 1
            spawn_timer = 0.0
            _spawn_wave()

func _process(delta: float) -> void:
    if player == null or camera == null:
        return
    var target := player.global_position + Vector3(10.5, 12.0, 13.5)
    camera.global_position = camera.global_position.lerp(target, minf(1.0, delta * 4.2))
    camera.look_at(player.global_position + Vector3(0, 0.9, 0), Vector3.UP)

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed and event.position.x < get_viewport().get_visible_rect().size.x * 0.46 and move_touch_id == -1:
            move_touch_id = event.index
            move_origin = event.position
            move_current = event.position
            joystick_base.position = move_origin - Vector2(75, 75)
            joystick_knob.position = move_origin - Vector2(30, 30)
        elif not event.pressed and event.index == move_touch_id:
            move_touch_id = -1
            touch_move = Vector2.ZERO
            joystick_base.position = Vector2(70, 520)
            joystick_knob.position = Vector2(115, 565)
    elif event is InputEventScreenDrag and event.index == move_touch_id:
        move_current = event.position
        var delta_pos := move_current - move_origin
        if delta_pos.length() > 62.0:
            delta_pos = delta_pos.normalized() * 62.0
        touch_move = Vector2(delta_pos.x / 62.0, -delta_pos.y / 62.0)
        joystick_knob.position = move_origin + delta_pos - Vector2(30, 30)
    elif event is InputEventKey and event.pressed:
        if event.keycode == KEY_SPACE:
            _attack()
        elif event.keycode == KEY_SHIFT:
            _dash()

func _attack() -> void:
    if attack_cd > 0.0 or hp <= 0.0:
        return
    attack_cd = ATTACK_COOLDOWN
    var tween := create_tween()
    weapon_pivot.rotation_degrees = Vector3(0, -55, -12)
    tween.tween_property(weapon_pivot, "rotation_degrees", Vector3(0, 78, 10), 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    tween.tween_property(weapon_pivot, "rotation_degrees", Vector3.ZERO, 0.20).set_trans(Tween.TRANS_QUAD)

    var forward := -player.global_transform.basis.z
    forward.y = 0
    forward = forward.normalized()
    var damage := 24.0 + float(level - 1) * 4.0
    var hit_any := false
    for e in enemies:
        if not is_instance_valid(e.node):
            continue
        var to_enemy: Vector3 = e.node.global_position - player.global_position
        var dist := to_enemy.length()
        if dist <= ATTACK_RANGE and dist > 0.01:
            var dir := to_enemy.normalized()
            if forward.dot(dir) > -0.05:
                e.hp -= damage
                hit_any = true
                _hit_flash(e.node)
                e.node.position += dir * 0.45
                if e.hp <= 0.0:
                    _kill_enemy(e)
    if hit_any:
        _show_message("Steel finds flesh")

func _dash() -> void:
    if dash_cd > 0.0 or hp <= 0.0:
        return
    var forward := -player.global_transform.basis.z
    forward.y = 0
    if touch_move.length() > 0.1:
        var cam_right := camera.global_transform.basis.x
        cam_right.y = 0
        cam_right = cam_right.normalized()
        var cam_forward := -camera.global_transform.basis.z
        cam_forward.y = 0
        cam_forward = cam_forward.normalized()
        forward = (cam_right * touch_move.x + cam_forward * touch_move.y).normalized()
    dash_dir = forward.normalized()
    dash_time = 0.18
    dash_cd = 1.2

func _spawn_wave() -> void:
    var count := mini(4 + wave * 2, 18)
    alive_in_wave = count
    _show_message("WAVE %d  •  THE CRYPT STIRS" % wave)
    for i in range(count):
        var elite := wave >= 3 and i == count - 1
        var angle := TAU * float(i) / float(count) + float(wave) * 0.31
        var radius := 10.0 + float(i % 3) * 1.4
        var pos := Vector3(cos(angle) * radius, 0, sin(angle) * radius)
        pos.x = clampf(pos.x, -19.0, 19.0)
        pos.z = clampf(pos.z, -13.0, 13.0)
        _spawn_enemy(pos, elite)
    _update_hud()

func _spawn_enemy(pos: Vector3, elite: bool) -> void:
    var body := CharacterBody3D.new()
    body.position = pos
    body.name = "CryptKnight" if not elite else "AshenChampion"
    add_child(body)

    var col := CollisionShape3D.new()
    var cap := CapsuleShape3D.new()
    cap.radius = 0.45 if not elite else 0.60
    cap.height = 1.65 if not elite else 2.15
    col.shape = cap
    col.position.y = 0.85 if not elite else 1.08
    body.add_child(col)

    var visual := Node3D.new()
    body.add_child(visual)
    var enemy_mat := mat_enemy if not elite else mat_enemy_elite
    var torso := _capsule_mesh(0.48 if not elite else 0.62, 1.15 if not elite else 1.55, enemy_mat)
    torso.position.y = 1.1 if not elite else 1.35
    visual.add_child(torso)
    var armor := _box(Vector3(0.88 if not elite else 1.10, 0.46, 0.48), mat_iron)
    armor.position = Vector3(0, 1.33 if not elite else 1.62, 0)
    visual.add_child(armor)
    var head := _sphere(0.31 if not elite else 0.40, _mat(Color("7b776f"), 0.95))
    head.position.y = 1.93 if not elite else 2.45
    visual.add_child(head)
    var horn_l := _box(Vector3(0.10, 0.48, 0.10), mat_iron)
    horn_l.position = Vector3(-0.26, 2.25 if not elite else 2.78, 0)
    horn_l.rotation_degrees.z = -28
    visual.add_child(horn_l)
    var horn_r := horn_l.duplicate()
    horn_r.position.x = 0.26
    horn_r.rotation_degrees.z = 28
    visual.add_child(horn_r)
    var axe := _box(Vector3(0.13, 1.15, 0.12), mat_iron)
    axe.position = Vector3(0.62 if not elite else 0.78, 1.05, 0)
    axe.rotation_degrees.z = -18
    visual.add_child(axe)

    enemies.append({
        "node": body,
        "visual": visual,
        "hp": 54.0 + float(wave) * 13.0 + (80.0 if elite else 0.0),
        "max_hp": 54.0 + float(wave) * 13.0 + (80.0 if elite else 0.0),
        "speed": 2.1 + minf(float(wave) * 0.08, 1.2) + (0.25 if elite else 0.0),
        "attack_cd": randf_range(0.2, 1.1),
        "elite": elite
    })

func _update_enemies(delta: float) -> void:
    for e in enemies.duplicate():
        if not is_instance_valid(e.node) or e.hp <= 0.0:
            continue
        var body: CharacterBody3D = e.node
        var to_player := player.global_position - body.global_position
        to_player.y = 0
        var dist := to_player.length()
        e.attack_cd = maxf(0.0, e.attack_cd - delta)
        if dist > 1.45:
            var dir := to_player.normalized()
            body.velocity = dir * e.speed
            body.move_and_slide()
            body.rotation.y = lerp_angle(body.rotation.y, atan2(-dir.x, -dir.z), minf(1.0, delta * 8.0))
        else:
            body.velocity = Vector3.ZERO
            if e.attack_cd <= 0.0:
                e.attack_cd = 1.05 if not e.elite else 0.78
                _enemy_hit(9.0 + float(wave) * 1.25 + (5.0 if e.elite else 0.0))
                var v: Node3D = e.visual
                var tw := create_tween()
                tw.tween_property(v, "rotation_degrees", Vector3(10, 0, -14), 0.09)
                tw.tween_property(v, "rotation_degrees", Vector3.ZERO, 0.16)

func _enemy_hit(damage: float) -> void:
    hp -= damage
    hurt_flash = 0.15
    _update_hud()
    if hp <= 0.0:
        hp = 0.0
        _show_message("FALLEN  •  TAP STRIKE TO RISE")
        await get_tree().create_timer(1.5).timeout
        hp = max_hp
        mana = max_mana
        player.position = Vector3(0, 0, 5)
        _update_hud()

func _kill_enemy(e: Dictionary) -> void:
    if e.hp > 0.0:
        return
    alive_in_wave -= 1
    xp += 18 + wave * 3 + (35 if e.elite else 0)
    if randf() < 0.64 or e.elite:
        _spawn_loot(e.node.global_position, e.elite)
    var dead: Node3D = e.node
    var tw := create_tween()
    tw.parallel().tween_property(dead, "scale", Vector3(1.25, 0.12, 1.25), 0.22)
    tw.parallel().tween_property(dead, "position:y", -0.35, 0.28)
    tw.tween_callback(dead.queue_free)
    _check_level()
    _update_hud()

func _hit_flash(node: Node3D) -> void:
    var original := node.scale
    var tw := create_tween()
    tw.tween_property(node, "scale", original * 1.10, 0.05)
    tw.tween_property(node, "scale", original, 0.09)

func _spawn_loot(pos: Vector3, elite: bool) -> void:
    var root := Node3D.new()
    root.position = pos + Vector3(0, 0.4, 0)
    add_child(root)
    var gem := MeshInstance3D.new()
    var mesh := OctahedronMesh.new()
    mesh.size = 0.46 if not elite else 0.68
    gem.mesh = mesh
    gem.material_override = mat_gold if not elite else mat_enemy_elite
    root.add_child(gem)
    loot.append({"node": root, "base_y": root.position.y, "t": randf() * 10.0, "elite": elite})

func _update_loot(delta: float) -> void:
    for item in loot.duplicate():
        if not is_instance_valid(item.node):
            loot.erase(item)
            continue
        item.t += delta
        var n: Node3D = item.node
        n.rotation.y += delta * 2.0
        n.position.y = item.base_y + sin(item.t * 3.0) * 0.13
        if n.global_position.distance_to(player.global_position) < 1.35:
            gold += 12 + wave * 2 + (35 if item.elite else 0)
            hp = minf(max_hp, hp + (18.0 if item.elite else 7.0))
            _show_message("RELIC CLAIMED")
            n.queue_free()
            loot.erase(item)
            _update_hud()

func _check_level() -> void:
    var needed := level * 100
    while xp >= needed:
        xp -= needed
        level += 1
        max_hp += 12.0
        max_mana += 6.0
        hp = max_hp
        mana = max_mana
        needed = level * 100
        _show_message("LEVEL %d  •  POWER AWAKENS" % level)

func _update_hud() -> void:
    if hp_bar == null:
        return
    hp_bar.value = (hp / max_hp) * 100.0
    mana_bar.value = (mana / max_mana) * 100.0
    xp_bar.value = (float(xp) / float(level * 100)) * 100.0
    level_label.text = "WARDEN  •  LV %d" % level
    wave_label.text = "CRYPT DEPTH  •  WAVE %d" % wave
    gold_label.text = "RELIC GOLD  •  %d" % gold

func _show_message(text: String) -> void:
    if message_label == null:
        return
    message_label.text = text
    message_label.modulate.a = 1.0
    var tw := create_tween()
    tw.tween_interval(1.2)
    tw.tween_property(message_label, "modulate:a", 0.0, 0.8)

func _box(size: Vector3, material: Material) -> MeshInstance3D:
    var mesh_instance := MeshInstance3D.new()
    var mesh := BoxMesh.new()
    mesh.size = size
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    return mesh_instance

func _sphere(radius: float, material: Material) -> MeshInstance3D:
    var mesh_instance := MeshInstance3D.new()
    var mesh := SphereMesh.new()
    mesh.radius = radius
    mesh.height = radius * 2.0
    mesh.radial_segments = 10
    mesh.rings = 6
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    return mesh_instance

func _capsule_mesh(radius: float, height: float, material: Material) -> MeshInstance3D:
    var mesh_instance := MeshInstance3D.new()
    var mesh := CapsuleMesh.new()
    mesh.radius = radius
    mesh.height = height
    mesh.radial_segments = 10
    mesh.rings = 4
    mesh_instance.mesh = mesh
    mesh_instance.material_override = material
    return mesh_instance
