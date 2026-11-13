"""Bake the top-down character sheets for Dead Sector with Blender (headless, CPU).

    blender -b --factory-startup -P tools/sprites/bake_characters.py -- [--only KEY] [--samples N]

Every character is built from primitives on a small joint hierarchy, posed per frame and rendered
straight down with an orthographic camera. Each sheet is a horizontal strip in the layout the game
already uses (apps/web/src/render/SpriteFactory.ts): frames 0-7 walk cycle (frame 0 doubles as the
idle pose), 8 attack, 9 corpse. Characters face +x; the game rotates the sprite by the actor's
facing, so the light comes from straight above and never bakes a direction into the art.

Inputs: apps/web/src/render/characterLooks.json (colours and gear, shared with the code-drawn
fallback) and packages/content/survivors/survivors.json (each survivor's weapon).
Output: apps/web/public/sprites/<key>.png and manifest.json with per-frame checks.
"""

import hashlib
import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOOKS = os.path.join(ROOT, "apps/web/src/render/characterLooks.json")
SURVIVORS = os.path.join(ROOT, "packages/content/survivors/survivors.json")
OUT = os.path.join(ROOT, "apps/web/public/sprites")

FRAME_PX = 128  # one frame, square
FRAME_CELLS = 2  # the frame spans two map cells, so arms, guns and corpses fit
CELL_M = 0.95  # metres per map cell: a 0.45 m shoulder fills half a cell, as before
WALK_FRAMES = 8
ATTACK_FRAME = 8
CORPSE_FRAME = 9
FRAMES = 10
OUTLINE = (0.043, 0.047, 0.055)  # #0b0c0e, the outline colour of the old sprites
DOWN = Vector((0, 0, -1))

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ONLY = argv[argv.index("--only") + 1] if "--only" in argv else None
SAMPLES = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 32


# --------------------------------------------------------------------------- scene


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.max_bounces = 4
    try:
        sc.cycles.use_denoising = True
    except AttributeError:
        pass
    sc.render.resolution_x = FRAME_PX
    sc.render.resolution_y = FRAME_PX
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = FRAME_CELLS * CELL_M
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0, 0, 10)
    sc.collection.objects.link(cam)
    sc.camera = cam

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 2.6
    sun_data.angle = math.radians(35)
    sun = bpy.data.objects.new("sun", sun_data)
    sc.collection.objects.link(sun)

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.42, 0.44, 0.48, 1)
    bg.inputs["Strength"].default_value = 0.55
    sc.world = world
    return sc


def clear_character():
    for ob in list(bpy.data.objects):
        if ob.type not in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(ob, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


# --------------------------------------------------------------------------- materials

_materials = {}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def shade(h, f):
    r, g, b = hex_rgb(h)
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * 255 * f))) for v in (r, g, b))


def material(h, rough=0.85, metal=0.0):
    key = (h, rough, metal)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(f"m{len(_materials)}")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*(srgb_to_linear(c) for c in hex_rgb(h)), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    _materials[key] = m
    return m


# --------------------------------------------------------------------------- building blocks


def joint(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_mode = "QUATERNION"
    return ob


def _finish(ob, parent, mat, smooth, bevel):
    ob.parent = parent
    ob.data.materials.append(mat)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return ob


def box(parent, size, loc, mat, bevel=0.015, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.location = loc
    if rot is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = rot
    return _finish(ob, parent, mat, False, bevel)


def ball(parent, radii, loc, mat, segments=18, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    ob = bpy.context.active_object
    ob.scale = radii
    bpy.ops.object.transform_apply(scale=True)
    ob.location = loc
    return _finish(ob, parent, mat, True, 0)


def rod(parent, radius, length, mat, loc=None, direction=DOWN, start=None):
    """A capsule-ish cylinder. By default it hangs from the parent's origin along -z."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=length)
    ob = bpy.context.active_object
    ob.rotation_mode = "QUATERNION"
    d = Vector(direction).normalized()
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    if start is None:
        start = Vector((0, 0, 0))
    ob.location = loc if loc is not None else Vector(start) + d * (length / 2)
    _finish(ob, parent, mat, True, 0)
    # rounded ends hide the flat caps from above
    ball(parent, (radius, radius, radius), Vector(start) + d * length, mat, 10, 6)
    return ob


# --------------------------------------------------------------------------- the body


class Rig:
    """Joint hierarchy in metres. z is up, the character faces +x and its left is +y."""

    def __init__(self, look, infected):
        self.look = look
        self.infected = infected
        bulk = look.get("bulk", 1.0)
        self.bulk = bulk
        top = look["shirt"] if infected else look["jacket"]
        self.top = top
        cloth = material(top, 0.9)
        pants = material(look["pants"], 0.9)
        skin = material(look["skin"], 0.6)
        hair = material(look["hair"], 0.8)
        boots = material("#17181a", 0.7)
        sleeve = skin if infected else cloth

        self.root = joint("root", (0, 0, 0))
        self.pelvis = joint("pelvis", (0, 0, 0.95), self.root)
        box(self.pelvis, (0.2, 0.32 * bulk, 0.18), (0, 0, 0), pants, 0.04)

        # legs
        self.hips = {}
        self.knees = {}
        for side in (1, -1):
            hip = joint(f"hip{side}", (0, 0.1 * side * bulk, -0.06), self.pelvis)
            rod(hip, 0.068 * bulk, 0.45, pants)
            knee = joint(f"knee{side}", (0, 0, -0.45), hip)
            rod(knee, 0.055 * bulk, 0.4, pants)
            ankle = joint(f"ankle{side}", (0, 0, -0.42), knee)
            box(ankle, (0.24, 0.1, 0.08), (0.05, 0, -0.01), boots, 0.03)
            self.hips[side] = hip
            self.knees[side] = knee

        # torso
        self.spine = joint("spine", (0, 0, 0.07), self.pelvis)
        box(self.spine, (0.24 * bulk, 0.42 * bulk, 0.5), (0, 0, 0.25), cloth, 0.08)
        # a lighter fold on the upper back so the torso reads as cloth from above
        box(self.spine, (0.12, 0.3 * bulk, 0.02), (-0.04, 0, 0.5), material(shade(top, 1.18), 0.9), 0.01)
        self.neck = joint("neck", (0.02, 0, 0.5), self.spine)
        ball(self.neck, (0.05, 0.05, 0.06), (0, 0, 0.03), skin, 10, 6)
        self.head = joint("head", (0.01, 0, 0.1), self.neck)
        ball(self.head, (0.105, 0.095, 0.115), (0, 0, 0), skin)

        # arms
        self.shoulders = {}
        self.elbows = {}
        shoulder_y = 0.2 * bulk
        self.shoulder_pos = {}
        for side in (1, -1):
            pos = Vector((0, shoulder_y * side, 0.44))
            sh = joint(f"shoulder{side}", pos, self.spine)
            ball(sh, (0.07 * bulk, 0.07 * bulk, 0.07 * bulk), (0, 0, 0), cloth)
            rod(sh, 0.05 * bulk, 0.28, cloth)
            el = joint(f"elbow{side}", (0, 0, -0.28), sh)
            rod(el, 0.044 * bulk, 0.22, sleeve)
            ball(el, (0.05, 0.045, 0.05), (0, 0, -0.26), skin, 10, 6)
            self.shoulders[side] = sh
            self.elbows[side] = el
            self.shoulder_pos[side] = pos

        self.gear = []

    # ---- posing helpers

    def arm_to(self, side, target, pole):
        """Two-bone IK in spine space: point the upper arm and forearm so the hand reaches target."""
        a, b = 0.28, 0.26
        s = self.shoulder_pos[side]
        d = Vector(target) - s
        dist = max(abs(a - b) + 1e-3, min(a + b - 1e-3, d.length))
        dn = d.normalized()
        cos_a = (a * a + dist * dist - b * b) / (2 * a * dist)
        ang = math.acos(max(-1, min(1, cos_a)))
        p = Vector(pole)
        pn = (p - dn * p.dot(dn)).normalized()
        elbow = s + dn * math.cos(ang) * a + pn * math.sin(ang) * a
        hand = s + dn * dist
        q1 = DOWN.rotation_difference(elbow - s)
        self.shoulders[side].rotation_quaternion = q1
        local = q1.inverted() @ (hand - elbow)
        self.elbows[side].rotation_quaternion = DOWN.rotation_difference(local)
        return hand

    def arm_swing(self, side, pitch, bend=0.2, out=0.12):
        q = Quaternion((0, 1, 0), pitch) @ Quaternion((1, 0, 0), out * side)
        self.shoulders[side].rotation_quaternion = q
        self.elbows[side].rotation_quaternion = Quaternion((0, 1, 0), -bend)

    def leg(self, side, swing, knee, spread=0.0):
        """swing > 0 moves the foot forward (+x); knee > 0 bends the shin back."""
        self.hips[side].rotation_quaternion = Quaternion((0, 1, 0), -swing) @ Quaternion(
            (1, 0, 0), spread * side
        )
        self.knees[side].rotation_quaternion = Quaternion((0, 1, 0), knee)


def euler_q(x=0.0, y=0.0, z=0.0):
    return Quaternion((0, 0, 1), z) @ Quaternion((0, 1, 0), y) @ Quaternion((1, 0, 0), x)


# --------------------------------------------------------------------------- gear


def survivor_gear(rig, look):
    spine, head = rig.spine, rig.head
    dark = material("#16181b", 0.45, 0.6)
    hg = look["headgear"]
    if hg == "helmet":
        ball(head, (0.13, 0.122, 0.1), (-0.005, 0, 0.035), material(shade(look["jacket"], 0.8), 0.55))
    elif hg == "cap":
        capm = material(shade(look["jacket"], 0.75), 0.8)
        ball(head, (0.112, 0.102, 0.08), (-0.005, 0, 0.04), capm)
        box(head, (0.09, 0.15, 0.015), (0.1, 0, 0.035), capm, 0.006)
    else:
        ball(head, (0.1, 0.1, 0.09), (-0.035, 0, 0.035), material(look["hair"], 0.8))
    if look.get("band"):
        band = material(look["band"], 0.5)
        for side in (1, -1):
            box(spine, (0.11, 0.07, 0.025), (0, rig.shoulder_pos[side].y * 0.92, 0.505), band, 0.008)
            ball(rig.shoulders[side], (0.056, 0.056, 0.03), (0, 0, -0.08), band, 12, 6)
    if look.get("medic"):
        bag = material("#e6e2d8", 0.8)
        red = material("#d8343a", 0.6)
        box(spine, (0.14, 0.26, 0.3), (-0.18, 0, 0.28), bag, 0.03)
        box(spine, (0.05, 0.16, 0.01), (-0.18, 0, 0.435), red, 0.003)
        box(spine, (0.12, 0.05, 0.01), (-0.18, 0, 0.436), red, 0.003)
    elif look["weapon"] in ("carbine", "shotgun"):
        # ammo pouch on the back for long-gun carriers
        box(spine, (0.1, 0.24, 0.2), (-0.16, 0, 0.3), material(shade(look["jacket"], 0.7), 0.85), 0.03)
    return dark


def weapon_model(rig, kind, recoil):
    sp = rig.spine
    dark = material("#16181b", 0.45, 0.6)
    steel = material("#2a2e33", 0.5, 0.5)
    wood = material("#5b3b22", 0.7)
    r = -recoil
    if kind == "pistol":
        box(sp, (0.17, 0.034, 0.075), (0.58 + r, 0, 0.45), dark, 0.008)
    elif kind == "carbine":
        box(sp, (0.62, 0.042, 0.065), (0.48 + r, -0.03, 0.45), dark, 0.008)
        box(sp, (0.22, 0.05, 0.1), (0.09 + r, -0.05, 0.44), steel, 0.015)
        box(sp, (0.06, 0.03, 0.1), (0.33 + r, -0.03, 0.39), steel, 0.006)
        box(sp, (0.1, 0.03, 0.03), (0.3 + r, -0.03, 0.495), steel, 0.006)
    elif kind == "shotgun":
        box(sp, (0.58, 0.05, 0.055), (0.42 + r, -0.03, 0.455), dark, 0.008)
        box(sp, (0.22, 0.055, 0.1), (0.07 + r, -0.05, 0.44), wood, 0.02)
        box(sp, (0.17, 0.065, 0.065), (0.48 + r, -0.03, 0.43), wood, 0.015)


def pose_survivor(rig, look, frame):
    kind = look["weapon"]
    walking = frame < WALK_FRAMES
    ph = frame / WALK_FRAMES * 2 * math.pi
    s = math.sin(ph) if walking else 0.0
    rig.pelvis.location.z = 0.95 + (0.018 * math.cos(2 * ph) if walking else 0)
    # legs: feet together on frame 0 (it is also the idle pose)
    if walking:
        for side in (1, -1):
            sw = 0.34 * s * side
            rig.leg(side, sw, 0.1 + 0.6 * max(0.0, sw), 0.03)
    else:
        rig.leg(1, 0.18, 0.12, 0.06)
        rig.leg(-1, -0.18, 0.2, 0.06)
    attack = frame == ATTACK_FRAME
    recoil = 0.05 if attack else 0.0
    rig.spine.rotation_quaternion = euler_q(y=0.06, z=s * (0.06 if kind != "none" else 0.14))
    rig.head.rotation_quaternion = euler_q(z=-s * 0.05)

    if kind == "pistol":
        rig.arm_to(-1, (0.5 - recoil, -0.03, 0.43), (-0.3, -1, -0.6))
        rig.arm_to(1, (0.48 - recoil, 0.03, 0.41), (-0.3, 1, -0.6))
        weapon_model(rig, kind, recoil)
    elif kind in ("carbine", "shotgun"):
        rig.arm_to(-1, (0.2 - recoil, -0.07, 0.42), (-0.4, -1, -0.5))
        rig.arm_to(1, (0.46 - recoil, 0.0, 0.42), (-0.2, 1, -0.7))
        weapon_model(rig, kind, recoil)
    elif kind == "melee":
        if attack:
            hand = rig.arm_to(-1, (0.5, -0.04, 0.45), (-0.2, -1, -0.4))
            d = Vector((0.45, 0.85, 0.05)).normalized()
        else:
            hand = rig.arm_to(-1, (0.14 + 0.05 * s, -0.27, 0.16), (-0.4, -1, 0.2))
            d = Vector((0.75, -0.15, 0.6)).normalized()
        rod(rig.spine, 0.022, 0.62, material("#6d4a2c", 0.75), start=hand, direction=d)
        rig.arm_swing(1, -s * 0.45 if not attack else -0.6, 0.35)
    else:
        rig.arm_swing(1, -s * 0.5, 0.25)
        rig.arm_swing(-1, s * 0.5, 0.25)


# --------------------------------------------------------------------------- infected


def infected_gear(rig, look, seed):
    head = rig.head
    hair = material(look["hair"], 0.85)
    ball(head, (0.1, 0.095, 0.08), (-0.03, 0.01, 0.04), hair)
    eye = material("#d9d26a", 0.3)
    for side in (1, -1):
        ball(head, (0.016, 0.016, 0.016), (0.095, 0.035 * side, 0.02), eye, 8, 4)
    if look.get("mouth"):
        ball(head, (0.03, 0.045, 0.055), (0.1, 0, -0.045), material("#2a0806", 0.4), 10, 6)
        ball(head, (0.016, 0.026, 0.032), (0.112, 0, -0.045), material("#6a1410", 0.4), 8, 4)
    # torn, stained shirt: dark patches on the back and shoulders, placed from the seed
    stain = material("#3d1d1a", 0.6)
    rng = np.random.default_rng(seed)
    for _ in range(4):
        x = rng.uniform(-0.1, 0.06)
        y = rng.uniform(-0.17, 0.17) * rig.bulk
        box(rig.spine, (rng.uniform(0.05, 0.1), rng.uniform(0.05, 0.11), 0.015), (x, y, 0.5), stain, 0.01)


def pose_infected(rig, look, frame):
    walking = frame < WALK_FRAMES
    attack = frame == ATTACK_FRAME
    ph = frame / WALK_FRAMES * 2 * math.pi
    s = math.sin(ph) if walking else 0.0
    lean = look.get("lean", 0.0)
    arms = look.get("arms", 0.0)
    rig.pelvis.location.z = 0.93 + (0.025 * abs(math.cos(ph)) if walking else 0)
    if walking:
        # dragging gait: one leg steps long, the other short
        rig.leg(1, 0.36 * s, 0.15 + 0.5 * max(0.0, s), 0.05)
        rig.leg(-1, -0.22 * s, 0.25 + 0.3 * max(0.0, -s), 0.05)
    else:
        rig.leg(1, 0.3, 0.15, 0.07)
        rig.leg(-1, -0.25, 0.3, 0.07)
    pitch = 0.32 + 0.1 * lean + (0.25 if attack else 0)
    rig.spine.rotation_quaternion = euler_q(x=s * 0.09, y=pitch, z=s * 0.08)
    if look.get("mouth"):
        rig.head.rotation_quaternion = euler_q(y=-0.85 - pitch * 0.4, x=0.15)
    else:
        rig.head.rotation_quaternion = euler_q(y=-pitch * 0.6, x=0.12 + s * 0.05)
    reach = 0.5 + 0.035 * arms + (0.15 if attack else 0)
    sway = 0.06 * s
    rig.arm_to(1, (reach + sway, 0.17 * rig.bulk, 0.4), (-0.3, 1, -0.5))
    rig.arm_to(-1, (reach - 0.05 - sway, -0.16 * rig.bulk, 0.38), (-0.3, -1, -0.5))


# --------------------------------------------------------------------------- corpse


def pose_corpse(rig, infected):
    """Lying on the back (survivors) or face down (infected), one knee bent, laid on the diagonal
    so the whole body fits the frame; the game rotates it by the facing at death anyway."""
    lie = euler_q(y=math.pi / 2) if infected else euler_q(z=math.pi) @ euler_q(y=-math.pi / 2)
    rig.root.rotation_quaternion = euler_q(z=math.radians(40)) @ lie
    rig.root.location = (0, 0, 0.12)
    rig.spine.rotation_quaternion = euler_q(x=0.2)
    rig.head.rotation_quaternion = euler_q(x=0.7)
    rig.leg(1, 0.55, 1.3, 0.25)
    rig.leg(-1, -0.05, 0.1, 0.12)
    rig.arm_to(1, (0.3, 0.45, 0.42), (0, 1, 0))
    rig.arm_to(-1, (0.05, -0.42, 0.2), (0, -1, 0))
    centre_on_bounds()


def centre_on_bounds():
    """Move the root so the posed body's bounding box is centred in the frame."""
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 0))
    hi = Vector((-1e9, -1e9, 0))
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            lo.x, lo.y = min(lo.x, w.x), min(lo.y, w.y)
            hi.x, hi.y = max(hi.x, w.x), max(hi.y, w.y)
    root = bpy.data.objects["root"]
    root.location.x -= (lo.x + hi.x) / 2
    root.location.y -= (lo.y + hi.y) / 2


# --------------------------------------------------------------------------- render + sheet


def read_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    return px


def outline(px, radius=2):
    a = px[..., 3]
    grown = a.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius + 1:
                continue
            grown = np.maximum(grown, np.roll(np.roll(a, dy, 0), dx, 1))
    oa = np.clip(grown - a, 0, 1) * 0.85
    out_a = a + oa * (1 - a)
    rgb = px[..., :3] * a[..., None] + np.array(OUTLINE) * (oa * (1 - a))[..., None]
    rgb = np.where(out_a[..., None] > 1e-5, rgb / np.maximum(out_a[..., None], 1e-5), 0)
    return np.dstack([rgb, out_a])


def frame_checks(px):
    a = px[..., 3]
    border = max(a[:3].max(), a[-3:].max(), a[:, :3].max(), a[:, -3:].max())
    return float((a > 0.5).mean()), float(border)


def save_sheet(frames, path):
    sheet = np.concatenate(frames, axis=1)  # rows are bottom-up in Blender; frames stay aligned
    h, w = sheet.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels[:] = sheet.ravel()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def bake(key, build, pose, tmp, sc):
    frames, checks = [], []
    for f in range(FRAMES):
        clear_character()
        rig = build()
        if f == CORPSE_FRAME:
            pose_corpse(rig, rig.infected)
        else:
            pose(rig, f)
        path = os.path.join(tmp, f"{key}_{f}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        px = outline(read_png(path))
        frames.append(px)
        checks.append(frame_checks(px))
    out = os.path.join(OUT, f"{key}.png")
    save_sheet(frames, out)
    data = open(out, "rb").read()
    return {
        "coverage": [round(c, 3) for c, _ in checks],
        "borderAlpha": round(max(b for _, b in checks), 3),
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }


def main():
    looks = json.load(open(LOOKS))
    weapons = {s["id"]: s["weaponId"] for s in json.load(open(SURVIVORS))}
    os.makedirs(OUT, exist_ok=True)
    sc = setup_scene()
    jobs = []
    for tid, base in looks["survivors"].items():
        look = dict(base)
        if weapons.get(tid) in ("pistol", "carbine", "shotgun", "melee"):
            look["weapon"] = weapons[tid]
        key = "sv-civilian" if tid == "civilian" else f"sv-{tid}"

        def build(look=look):
            rig = Rig(look, False)
            survivor_gear(rig, look)
            return rig

        jobs.append((key, build, lambda rig, f, look=look: pose_survivor(rig, look, f)))
    infected = [(f"zb-walker-{i}", l) for i, l in enumerate(looks["walkers"])]
    infected += [("zb-runner", looks["runner"]), ("zb-heavy", looks["heavy"]), ("zb-screamer", looks["screamer"])]
    for n, (key, look) in enumerate(infected):

        def build(look=look, n=n):
            rig = Rig(look, True)
            infected_gear(rig, look, 1000 + n)
            return rig

        jobs.append((key, build, lambda rig, f, look=look: pose_infected(rig, look, f)))

    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {"sheets": {}}
    manifest.update(
        {
            "tool": f"blender {bpy.app.version_string}",
            "frames": FRAMES,
            "frameSize": FRAME_PX,
            "pxPerCell": FRAME_PX // FRAME_CELLS,
        }
    )
    failed = []
    with tempfile.TemporaryDirectory() as tmp:
        for key, build, pose in jobs:
            if ONLY and key != ONLY:
                continue
            entry = bake(key, build, pose, tmp, sc)
            manifest["sheets"][key] = entry
            ok = min(entry["coverage"]) >= 0.03 and entry["borderAlpha"] < 0.05
            if not ok:
                failed.append(key)
            print(f"{key}: coverage {min(entry['coverage'])}-{max(entry['coverage'])} border {entry['borderAlpha']} {'ok' if ok else 'FAIL'}")
    manifest["sheets"] = dict(sorted(manifest["sheets"].items()))
    with open(manifest_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    if failed:
        print("FAILED:", ", ".join(failed))
        sys.exit(1)


main()
