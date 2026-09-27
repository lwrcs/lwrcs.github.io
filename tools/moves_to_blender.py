# Writes a Blender script that puts the site's clips (lifetime-moves.json) back onto the
# original rig as actions lifetime_idle / lifetime_walk / lifetime_nod / lifetime_shake.
# The keys go on the rig's own controls (spine and shoulder FK, wristik/heelik IK targets,
# elbowik/kneeik poles, hand/foot/toe rotations), solved so the deform bones land where the
# site puts them. It checks that against the real rig before writing the script.
# usage: python moves_to_blender.py <character.blend> <lifetime.glb> <lifetime-moves.json> <out.py>
#   (needs the bpy module; use 5.0 to match Blender 5)
# The written script is standalone: open the .blend in Blender, Scripting tab, open it, Run.
import bpy, mathutils, json, struct, sys, os, re, zlib, base64, bisect, math
from mathutils import Matrix, Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BLEND, GLB, MOVES, OUT = args[:4]
FPS = 30                    # the rate the site plays at; the script sets the scene to it
PREFIX = 'lifetime_'
LOOPS = {'idle', 'walk'}

# ---- the site side: evaluate each clip on the GLB skeleton, as three.js does ----
raw = open(GLB, 'rb').read()
gltf = json.loads(raw[20:20 + struct.unpack('<I', raw[12:16])[0]])
nodes = gltf['nodes']
joints = set(gltf['skins'][0]['joints'])
parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
sanitize = lambda s: re.sub(r'[\[\]\.:/]', '', re.sub(r'\s', '_', s))   # PropertyBinding.sanitizeNodeName
byname = {sanitize(nodes[j]['name']): j for j in joints}

def trs(t, q, s):
    return Matrix.LocRotScale(Vector(t), Quaternion((q[3], q[0], q[1], q[2])), Vector(s))

def rest_trs(n):
    return list(n.get('translation', (0, 0, 0))), list(n.get('rotation', (0, 0, 0, 1))), list(n.get('scale', (1, 1, 1)))

def world(local):
    """world matrix (glTF space) of every joint, from per-joint local matrices"""
    out = {}
    def get(j):
        if j not in out:
            p = parent.get(j)
            out[j] = (get(p) if p in joints else Matrix.Identity(4)) @ local[j]
        return out[j]
    for j in joints: get(j)
    return out

def sample(track, t):
    ts, vs = track['times'], track['values']
    k = 4 if track['type'] == 'quaternion' else 3
    i = bisect.bisect_right(ts, t) - 1
    if i < 0: return vs[:k]
    if i >= len(ts) - 1: return vs[-k:]
    a, b = vs[i * k:i * k + k], vs[i * k + k:i * k + 2 * k]
    u = (t - ts[i]) / (ts[i + 1] - ts[i])
    if k == 3: return [x + (y - x) * u for x, y in zip(a, b)]
    qa, qb = Quaternion((a[3], *a[:3])), Quaternion((b[3], *b[:3]))
    q = qa.slerp(qb, u)
    return [q.x, q.y, q.z, q.w]

rest_local = {j: trs(*rest_trs(nodes[j])) for j in joints}
rest_world = world(rest_local)
C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))   # Blender -> glTF (+Y up)
Ci = C.inverted()

def deltas(clip, t):
    """per bone: armature-space (Blender) matrix taking its rest pose to its pose at time t"""
    chan = {}
    for tr in clip['tracks']:
        node, prop = tr['name'].rsplit('.', 1)
        chan.setdefault(byname[node], {})[prop] = sample(tr, t)
    local = {}
    for j in joints:
        T, R, S = rest_trs(nodes[j])
        c = chan.get(j, {})
        local[j] = trs(c.get('position', T), c.get('quaternion', R), S)
    w = world(local)
    return {nodes[j]['name']: Ci @ (w[j] @ rest_world[j].inverted()) @ C for j in joints}

moves = json.load(open(MOVES))

# ---- the rig side ----
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(BLEND))
arm = bpy.data.objects['Evilcase']
arm.animation_data_clear()
arm.data.pose_position = 'POSE'
P, B = arm.pose.bones, arm.data.bones
for pb in P:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
bpy.context.view_layer.update()
REST = {b.name: b.matrix_local.copy() for b in B}
SPINE = ['spine.001', 'spine.002', 'spine.003', 'spine.004', 'spine.005', 'spine.006']
ROT_ONLY = SPINE + ['shoulder.L', 'shoulder.R', 'toe.L', 'toe.R']   # FK children, keyed by rotation
LIMBS = [('upper_arm', 'forearm', 'wristik', 'elbowik'), ('thigh', 'shin', 'heelik', 'kneeik')]
CHECK = ['spine'] + SPINE + [f'{b}.{s}' for s in 'LR' for b in ('shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe')]

def tail(m, bone):
    return m @ Vector((0, B[bone].length, 0))

def perp(v, axis):
    return v - axis * v.dot(axis)

def frame(a, b):
    """rotation whose columns are a, b, a x b"""
    return Matrix((a, b, a.cross(b))).transposed()

# rest limb frames: hip/shoulder -> wrist/ankle axis, and the way the joint bends
limb0 = {}
for s in 'LR':
    for up, lo, ik, pole in LIMBS:
        S0, E0 = REST[f'{up}.{s}'].translation, REST[f'{lo}.{s}'].translation
        W0 = tail(REST[f'{lo}.{s}'], f'{lo}.{s}')
        a0 = (W0 - S0).normalized()
        limb0[(up, s)] = (a0, perp(E0 - S0, a0).normalized(), REST[f'{pole}.{s}'].translation - E0)

def solve(D):
    """basis values for every control, given per-bone deltas D"""
    T = {n: D[n] @ REST[n] for n in D}           # target armature-space pose of each GLB bone
    basis = {}
    basis['spine'] = REST['spine'].inverted() @ T['spine']
    for n in ROT_ONLY:
        p = B[n].parent.name
        basis[n] = REST[n].inverted() @ REST[p] @ T[p].inverted() @ T[n]
    for s in 'LR':
        basis[f'hand.{s}'] = REST[f'hand.{s}'].inverted() @ T[f'hand.{s}']
        basis[f'foot.{s}'] = Matrix.Identity(4)          # heelik carries the foot
        for up, lo, ik, pole in LIMBS:
            end = 'hand' if up == 'upper_arm' else 'foot'
            R = REST[f'{ik}.{s}']
            basis[f'{ik}.{s}'] = R.inverted() @ D[f'{end}.{s}'] @ R
            # pole: rotate the rest pole offset with the limb's bend plane; when the limb is nearly
            # straight the bend plane is undefined, so fall back to turning it with the upper bone
            S, E = T[f'{up}.{s}'].translation, T[f'{lo}.{s}'].translation
            W = tail(T[f'{lo}.{s}'], f'{lo}.{s}')
            a = (W - S).normalized()
            a0, b0, off = limb0[(up, s)]
            bend = perp(E - S, a)
            b_fk = perp(D[f'{up}.{s}'].to_3x3() @ b0, a).normalized()
            ang = math.degrees(math.atan2(bend.length, (E - S).dot(a)))
            w = min(max((ang - 1.0) / 3.0, 0.0), 1.0)
            b = (b_fk.lerp(bend.normalized() if bend.length > 1e-9 else b_fk, w)).normalized()
            Rp = frame(a, b) @ frame(a0, b0).inverted()
            basis[f'{pole}.{s}'] = pole_basis(f'{pole}.{s}', E + Rp @ off)
    return basis, T

def pole_basis(pole, at):
    PR = REST[pole]
    return Matrix.Translation(PR.to_3x3().inverted() @ (at - PR.translation))

def signed(u, v, axis):
    return math.atan2(axis.dot(u.cross(v)), u.dot(v))

def fix_poles(T):
    """The rig's pole angle is a few degrees off (the legs roll ~8 degrees at rest), so turn each
    pole about the limb axis until the elbow/knee lands on the target; for a nearly straight limb
    match the upper bone's roll instead."""
    for s in 'LR':
        for up, lo, ik, pole in LIMBS:
            u, l, pn = f'{up}.{s}', f'{lo}.{s}', f'{pole}.{s}'
            S = T[u].translation
            a = (tail(T[l], l) - S).normalized()
            got, want = P[l].matrix.translation - S, T[l].translation - S
            ang = math.degrees(math.atan2(perp(want, a).length, want.dot(a)))
            w = min(max((ang - 1.0) / 3.0, 0.0), 1.0)
            ax = lambda m: perp(m.to_3x3() @ Vector((1, 0, 0)), a)
            phi = w * signed(perp(got, a), perp(want, a), a) + (1 - w) * signed(ax(P[u].matrix), ax(T[u]), a)
            at = S + Matrix.Rotation(phi, 3, a) @ (P[pn].matrix.translation - S)
            P[pn].location = pole_basis(pn, at).translation

KEYS = {  # control -> channels keyed
    'spine': 'loc rot', **{n: 'rot' for n in ROT_ONLY},
    **{f'{c}.{s}': k for s in 'LR' for c, k in (('hand', 'rot'), ('foot', 'rot'), ('wristik', 'loc rot'), ('heelik', 'loc rot'),
                                                 ('elbowik', 'loc'), ('kneeik', 'loc'))},
}

def apply(basis):
    vals = {}
    for n, m in basis.items():
        pb = P[n]
        loc, q, _ = m.decompose()
        pb.location = loc if 'loc' in KEYS[n] else Vector()
        if pb.rotation_mode == 'QUATERNION':
            prev = pb.rotation_quaternion.copy()
            if q.dot(prev) < 0: q.negate()                 # keep neighbouring keys on the same hemisphere
            pb.rotation_quaternion = q
        else:
            pb.rotation_euler = q.to_euler(pb.rotation_mode, pb.rotation_euler)
        vals[n] = pb
    return vals

def rot_err(a, b):
    d = math.degrees(a.to_quaternion().rotation_difference(b.to_quaternion()).angle)
    return min(d, 360 - d)

out = {'armature': 'Evilcase', 'fps': FPS, 'bones': sorted(KEYS), 'actions': {}}
report = {}
for name, clip in moves.items():
    n = max(1, round(clip['duration'] * FPS))
    chans = {}
    err = {}
    for pb in P:
        pb.rotation_quaternion = (1, 0, 0, 0)
    for f in range(n + 1):
        t = clip['duration'] * f / n
        basis, T = solve(deltas(clip, t))
        apply(basis)
        bpy.context.view_layer.update()
        for _ in range(3):
            fix_poles(T)
            bpy.context.view_layer.update()
        for c, kinds in KEYS.items():
            pb = P[c]
            if 'loc' in kinds:
                for i in range(3): chans.setdefault((c, 'location', i), []).append(pb.location[i])
            if 'rot' in kinds:
                path = 'rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler'
                val = getattr(pb, path)
                for i in range(len(val)): chans.setdefault((c, path, i), []).append(val[i])
        for c in CHECK:
            m = P[c].matrix
            e = err.setdefault(c, [0, 0])
            e[0] = max(e[0], (m.translation - T[c].translation).length, (tail(m, c) - tail(T[c], c)).length)
            e[1] = max(e[1], rot_err(m, T[c]))
    report[name] = err
    out['actions'][PREFIX + name] = {
        'frames': n, 'loop': name in LOOPS,
        'channels': [[c, p, i, [round(v, 5) for v in vs]] for (c, p, i), vs in sorted(chans.items())],
    }
    print(f'{name}: {n + 1} frames, worst position error {max(e[0] for e in err.values()) * 100:.3f} cm')
    for c, (dp, dr) in err.items():
        if dp > 0.002 or dr > 2: print(f'   {c:12s} {dp * 100:6.2f} cm {dr:6.1f} deg')

blob = base64.b64encode(zlib.compress(json.dumps(out, separators=(',', ':')).encode(), 9)).decode()
blob = '\n'.join(blob[i:i + 100] for i in range(0, len(blob), 100))
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lifetime_moves_blender.py.in')).read()
open(OUT, 'w').write(tpl.replace('@DATA@', blob))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
