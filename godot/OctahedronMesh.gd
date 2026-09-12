@tool
class_name OctahedronMesh
extends SphereMesh

var size: float = 0.5:
    set(value):
        size = value
        radius = value
        height = value * 1.45
        radial_segments = 4
        rings = 2
