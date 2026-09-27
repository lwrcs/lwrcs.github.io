# Bakes the lifetime character into a small skinned GLB for the website.
# usage: python export_character.py <character.blend> <out.glb>   (needs the bpy module, 4.5+)
#    or: blender -b --python export_character.py -- <character.blend> <out.glb>
import bpy, bmesh, mathutils, collections, sys, os
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, OUT = (args + ['char.blend', 'lifetime.glb'][len(args):])[:2]
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(SRC))
arm = bpy.data.objects['Evilcase']
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
    """Return a new mesh = evaluated geometry without armature deformation, in armature space."""
    for m in o.modifiers:
        if m.type=='ARMATURE': m.show_viewport=False
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

for o in bpy.context.selected_objects: o.select_set(False)
arm.select_set(True)
for o in arm.children: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB', use_selection=False, use_active_scene=True,
    export_apply=False, export_skins=True, export_animations=False, export_morph=False, export_yup=True,
    export_materials='EXPORT', export_texcoords=False, export_normals=True, export_tangents=False,
    export_all_influences=False, export_def_bones=False, export_extras=False, export_cameras=False, export_lights=False)
print("GLB bytes", os.path.getsize(OUT))
