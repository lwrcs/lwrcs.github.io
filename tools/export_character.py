# Bakes the lifetime character into a small skinned GLB for the website.
# Every action named lifetime_* (see tools/moves_to_blender.py) is evaluated on the full rig,
# IK and constraints included, and baked onto the deform bones as a clip in the GLB.
# usage: python export_character.py <character.blend> <out.glb>   (needs the bpy module, 4.5+)
#    or: blender -b --python export_character.py -- <character.blend> <out.glb>
import bpy, bmesh, mathutils, collections, sys, os, re
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, OUT = (args + ['char.blend', 'lifetime.glb'][len(args):])[:2]
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(SRC))
arm = bpy.data.objects['Evilcase']
scene = bpy.context.scene

# record what each lifetime_* action does to every bone, frame by frame, while the rig is whole
arm.data.pose_position = 'POSE'
ad = arm.animation_data or arm.animation_data_create()
ad.use_nla = False
baked = {}
def rest_pose():
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)

# A control an action doesn't key holds the value it has in the file, which is what Blender shows
# when that action plays (e.g. the walk keeps the idle's forward bend in spine.001, which it
# doesn't key itself). Each action starts from the file's values, not from the last one baked.
ACTS = sorted((a for a in bpy.data.actions if a.name.startswith('lifetime_')), key=lambda a: a.name)
PROPS = ('location', 'rotation_quaternion', 'rotation_euler', 'scale')
saved = {pb.name: {p: tuple(getattr(pb, p)) for p in PROPS} for pb in arm.pose.bones}

def base_pose():
    for pb in arm.pose.bones:
        for p in PROPS:
            setattr(pb, p, saved[pb.name][p])

for act in ACTS:
    base_pose()
    ad.action = act
    if hasattr(ad, 'action_slot') and ad.action_slot is None and len(act.slots):
        ad.action_slot = act.slots[0]
    f0, f1 = (int(round(f)) for f in act.frame_range)
    # a loop plays f0..f1 and wraps to f0; bake the wrap frame too, so the clip's last key is its
    # first again and the site's loop runs across the seam without holding a frame twice
    if act.use_cyclic: f1 += 1
    frames = []
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        frames.append({pb.name: pb.matrix.copy() for pb in arm.pose.bones})
    baked[act.name] = frames
    print("RECORDED", act.name, len(frames), "frames")
ad.action = None
rest_pose()

BODY = ['Arms.001','Body.001','Neck.001','Pants.001','Shoes.001','Sleeves.001']
HEAD = ['Head.001','Hair.001','Glasses.001','Eyebrows']
keep = set(BODY+HEAD+['Evilcase'])
for o in list(bpy.data.objects):
    if o.name not in keep: bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o.animation_data_clear()
    for m in o.modifiers:
        if m.type=='WAVE': m.show_viewport=False
arm.data.pose_position='REST'
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
armW = arm.matrix_world.copy(); armWi = armW.inverted()

def bake(o):
    """Return a new mesh = evaluated geometry without armature deformation, in armature space.
    Modifiers count as they would in a render: one hidden only in the viewport still applies."""
    for m in o.modifiers:
        m.show_viewport = m.show_render and m.type not in ('ARMATURE', 'WAVE')
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    oe = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=dg)
    me.transform(armWi @ oe.matrix_world)
    if (armWi @ oe.matrix_world).determinant() < 0: me.flip_normals()
    for a in list(me.color_attributes): me.color_attributes.remove(a)
    return me

newobjs = {}
for name in BODY+HEAD:
    o = bpy.data.objects[name]
    me = bake(o)
    no = bpy.data.objects.new(name.replace('.001','').lower(), me)
    bpy.context.scene.collection.objects.link(no)
    # vertex groups: names come with mesh in 4.x; ensure object has them
    if name in BODY:
        for vg in o.vertex_groups:
            if vg.name not in no.vertex_groups: no.vertex_groups.new(name=vg.name)
    newobjs[name]=no
    print("BAKED", name, len(me.vertices), "verts", sum(len(p.vertices)-2 for p in me.polygons), "tris", "vgroups", len(no.vertex_groups), "mats",[m.name for m in me.materials])

# head parts: rigid to spine.006
for name in HEAD:
    no = newobjs[name]
    for vg in list(no.vertex_groups): no.vertex_groups.remove(vg)
    g = no.vertex_groups.new(name='spine.006')
    g.add(list(range(len(no.data.vertices))), 1.0, 'REPLACE')

# delete originals
for name in BODY+HEAD: bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

# reset armature transform
arm.constraints.clear()
arm.matrix_world = mathutils.Matrix.Identity(4)
bpy.context.view_layer.update()

# clean bones
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
for pb in arm.pose.bones:
    for c in list(pb.constraints): pb.constraints.remove(c)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for s in 'LR':
    eb['hand.'+s].parent = eb['forearm.'+s]; eb['hand.'+s].use_connect=False
    eb['foot.'+s].parent = eb['shin.'+s]; eb['foot.'+s].use_connect=False
import re
dels = [b.name for b in eb if (not b.use_deform) or re.match(r'^(f_|thumb).*\.00\d$', b.name) or b.name.startswith('fctrl')]
for n in dels: eb.remove(eb[n])
bpy.ops.object.mode_set(mode='OBJECT')
print("DELETED", dels)
print("BONES LEFT", len(arm.data.bones))
bonenames = set(b.name for b in arm.data.bones)

# group into 3 objects: arms (Arms+Sleeves), body (Body, Neck, Pants, Shoes), head (Head, Hair, Glasses, Eyebrows)
groups = {'arms':['Arms.001','Sleeves.001'], 'body':['Body.001','Neck.001','Pants.001','Shoes.001'], 'head':HEAD}
for gname, members in groups.items():
    objs=[newobjs[m] for m in members]
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs)>1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = gname; j.data.name = gname
    # drop vertex groups that are not deform bones
    for vg in list(j.vertex_groups):
        if vg.name not in bonenames: j.vertex_groups.remove(vg)
    j.parent = arm
    j.matrix_parent_inverse = mathutils.Matrix.Identity(4)
    mod = j.modifiers.new('Armature','ARMATURE'); mod.object = arm
    # clean: merge doubles? keep as is. triangulate count
    me=j.data
    print("GROUP", gname, len(me.vertices),"verts", sum(len(p.vertices)-2 for p in me.polygons),"tris", "mats",[m.name for m in me.materials], "vgroups",len(j.vertex_groups))

# rebuild the recorded actions on what is left of the skeleton: parent-relative rotations
# (and the root's location) that reproduce each bone's recorded pose
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
arm.animation_data_clear()
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
if baked:
    ad = arm.animation_data_create()
    for name, frames in baked.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for b in arm.data.bones:
            p = b.parent
            rel = b.matrix_local.inverted() @ p.matrix_local if p else b.matrix_local.inverted()
            locs, quats = [], []
            for M in frames:
                loc, q, _ = (rel @ (M[p.name].inverted() if p else mathutils.Matrix.Identity(4)) @ M[b.name]).decompose()
                if quats and q.dot(quats[-1]) < 0: q.negate()
                locs.append(loc); quats.append(q)
            # only channels that ever leave the rest pose; the rest stay out of the GLB
            chans = []
            if max(1 - abs(q.w) for q in quats) > 1e-9:
                chans += [('rotation_quaternion', i, [q[i] for q in quats]) for i in range(4)]
            if p is None and max(l.length for l in locs) > 1e-4:   # only the root travels; joints never pull apart
                chans += [('location', i, [l[i] for l in locs]) for i in range(3)]
            for path, i, vals in chans:
                if max(vals) - min(vals) < 1e-6: vals = vals[:1] + [None] * (len(vals) - 2) + vals[-1:]
                keys = [(f, v) for f, v in enumerate(vals) if v is not None]
                dp = f'pose.bones["{b.name}"].{path}'
                if hasattr(act, 'fcurve_ensure_for_datablock'): fc = act.fcurve_ensure_for_datablock(arm, dp, index=i, group_name=b.name)
                else: fc = act.fcurves.new(dp, index=i, action_group=b.name)
                fc.keyframe_points.add(len(keys))
                fc.keyframe_points.foreach_set('co', [c for k in keys for c in k])
                for k in fc.keyframe_points: k.interpolation = 'LINEAR'
                fc.update()
        act.use_fake_user = True
    ad.action = None
    arm.data.pose_position = 'POSE'

for o in bpy.context.selected_objects: o.select_set(False)
arm.select_set(True)
for o in arm.children: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=False, use_active_scene=True,
    export_apply=False, export_skins=True, export_animations=bool(baked), export_animation_mode='ACTIONS',
    export_force_sampling=False, export_optimize_animation_size=True, export_rest_position_armature=True, export_morph=False, export_yup=True,
    export_materials='EXPORT', export_texcoords=False, export_normals=True, export_tangents=False,
    export_all_influences=False, export_def_bones=False, export_extras=False, export_cameras=False, export_lights=False)
print("GLB bytes", os.path.getsize(OUT))
