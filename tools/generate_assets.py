"""One-time asset authoring. Requires the six authoring CLIs; never used by the build."""
import json, math, os, subprocess, tempfile, wave, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
TMP = Path(tempfile.mkdtemp(prefix='volute-art-'))
def run(tool, *args):
    subprocess.run([tool, *map(str,args)], check=True, stdout=subprocess.DEVNULL, cwd=TMP)
def circle(x,y,r,c): return dict(op='fill_circle',cx=x,cy=y,r=r,color=c)
def ring(x,y,r,c): return dict(op='stroke_circle',cx=x,cy=y,r=r,color=c)
def rect(x,y,w,h,c): return dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c)
def line(x,y,x2,y2,c): return dict(op='line',x0=x,y0=y,x1=x2,y1=y2,color=c)
def poly(points,color):
    ops=[]
    for y in range(min(p[1] for p in points), max(p[1] for p in points)+1):
        crosses=[]
        for i,a in enumerate(points):
            b=points[(i+1)%len(points)]
            if min(a[1],b[1]) <= y < max(a[1],b[1]): crosses.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
        if len(crosses)>=2: ops.append(rect(math.ceil(min(crosses)),y,math.floor(max(crosses))-math.ceil(min(crosses))+1,1,color))
    return ops
def sprite(name,w,h,ops,sheet=False):
    log=TMP/(name+'.json'); log.write_text(json.dumps(ops))
    run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',OUT/'sprites'/f'{name}.png','--width',w,'--height',h,'--no-layers')
colors=[('halide','#68efdd','#207b83','#cffff0'),('sulfur','#f7ca65','#9b572d','#fff5bb'),('cobalt','#809aff','#3e4d9c','#d4e5ff'),('garnet','#ed788c','#943b59','#ffd9db'),('olivine','#b8df77','#517145','#ebffc5')]
for i,(name,base,shade,light) in enumerate(colors):
    ops=[circle(14,14,13,'#071217'),circle(14,13,12,shade),circle(13,12,10,base)]
    ops+=poly([(5,8),(12,3),(20,6),(15,10)],light)+poly([(20,6),(24,13),(20,21),(17,13)],shade)
    ops += [line(7,20,13,24,base),rect(6,7,3,2,'#ffffff'),rect(9,5,2,1,light)]
    # Five high-contrast engraved glyphs, backed by dark enamel.
    ops += [circle(14,14,6,'#12313c')]
    glyphs=[[(11,14,17,14),(14,11,14,17)],[(11,16,14,11),(14,11,17,16),(11,16,17,16)],[(11,11,17,11),(17,11,17,17),(17,17,11,17),(11,17,11,11)],[(14,10,18,14),(18,14,14,18),(14,18,10,14),(10,14,14,10)],[(11,12,14,15),(14,15,17,12),(14,15,14,18)]]
    ops += [line(*l,light) for l in glyphs[i]]
    sprite(name,28,28,ops)
for i,name in enumerate(['choke','backflow','bore','sightline']):
    ops=[circle(8,8,7,'#07171f'),ring(8,8,7,'#f3d49b')]
    glyphs=[[(4,5,12,5),(6,8,10,8),(7,11,9,11)],[(4,8,11,8),(4,8,7,5),(4,8,7,11),(11,5,11,11)],[(4,4,12,12),(4,12,12,4),(8,3,8,13),(3,8,13,8)],[(2,8,14,8),(8,2,8,14)]]
    ops += [line(*l,'#ffedbf') for l in glyphs[i]]
    sprite(name,16,16,ops)
def barrel(shift=0,flash=0):
    ops=[rect(3-shift,5,35,12,'#081416'),rect(5-shift,3,28,13,'#927651'),rect(6-shift,4,26,3,'#d1b582'),rect(7-shift,8,28,6,'#334e50'),rect(9-shift,9,25,2,'#6e9993'),rect(32-shift,3,7,15,'#293d3e'),rect(33-shift,3,3,15,'#c1a471'),rect(37-shift,6,6,9,'#132428'),rect(39-shift,7,4,2,'#69d9cc')]
    for x in [12,18,24]:ops += [rect(x-shift,5,2,10,'#172e33')]
    if flash: ops += [rect(40,7,4,7,'#fff2be'),rect(41,5,3,11,'#edbb65')]
    return ops
sprite('barrel',44,20,barrel())
ops=[circle(22,22,21,'#060f14'),circle(22,21,20,'#7f7255'),circle(22,21,17,'#263f43'),ring(22,21,15,'#93a99b'),circle(22,21,12,'#10262e'),ring(22,21,10,'#4e7776')]
for x,y in [(9,9),(35,9),(9,35),(35,35)]:ops += [rect(x-2,y-2,5,5,'#131e23'),rect(x-1,y-1,3,2,'#d5bd86')]
sprite('base',44,44,ops)
def maw(opening=0):
    ops=[circle(32,32,31,'#060e13'),circle(32,31,29,'#736449'),ring(32,31,28,'#bda475'),circle(32,31,25,'#26343a'),ring(32,31,22,'#627171'),circle(32,31,20+opening,'#050b10'),circle(32,31,13,'#271b22'),ring(32,31,10,'#593638')]
    for i in range(8):
        a=i*math.pi/4
        x=round(32+24*math.cos(a)); y=round(31+24*math.sin(a))
        ops+=[rect(x-2,y-2,4,4,'#bca478')]
        x=round(32+(17+opening)*math.cos(a)); y=round(31+(17+opening)*math.sin(a))
        ops+=[rect(x-2,y-2,5,5,'#b97a52')]
    ops += [rect(27,2,10,3,'#d4aa66'),rect(29,3,6,2,'#f8d984')]
    return ops
sprite('maw',64,64,maw())
ops=[rect(0,0,64,64,'#182c31'),rect(1,1,62,62,'#21373a'),rect(3,3,58,58,'#192e33')]
for y in range(7,64,12): ops += [line(4,y,59,y,'#1f3539'),line(4,y+1,59,y+1,'#14292e')]
for x,y in [(4,4),(59,4),(4,59),(59,59)]:ops += [rect(x,y,2,2,'#4b615b')]
sprite('plate',64,64,ops)
sprite('cell',24,24,[rect(7,1,10,3,'#c1a577'),rect(4,4,16,18,'#887956'),rect(6,5,12,15,'#193537'),rect(8,7,8,11,'#85dcc3'),rect(8,7,2,10,'#d1f7d4'),rect(6,20,12,2,'#4f655a')])
sprite('pressure',24,24,[circle(12,12,11,'#99805b'),circle(12,12,9,'#152b32'),ring(12,12,7,'#648881'),line(12,12,16,6,'#f1ca79'),circle(12,12,2,'#f6e4b3'),rect(6,18,12,3,'#b3b59b')])
for i,shift in enumerate([4,3,1,0]):sprite(f'recoil-{i}',44,20,barrel(shift,i==0),True)
for i,op in enumerate([1,3,4,3,1,0]):sprite(f'swallow-{i}',64,64,maw(op),True)
for i in range(6):
    r=4+i*3; alpha=['ff','ee','cc','99','66','22'][i]
    ops=[ring(24,24,r,'#ffffff'+alpha),ring(24,24,max(1,r-1),'#ffffff'+alpha)]
    for j in range(8):
        a=j*math.pi/4; x=round(24+math.cos(a)*(r+3));y=round(24+math.sin(a)*(r+3))
        ops += [line(x,y,round(24+math.cos(a)*(r+6)),round(24+math.sin(a)*(r+6)),'#ffffff'+alpha)]
    sprite(f'flash-{i}',48,48,ops,True)
# Real runtime particle systems; origin at the center of the authored field.
for name,count,life,speed,cone,color in [('burst',18,330,100,180,'#94fff0'),('bore',44,750,170,180,'#ffbd69'),('swallow',24,450,70,25,'#e89965'),('pickup',18,650,42,35,'#ffe5ad')]:
    cfg=TMP/f'{name}-particle.json'
    cfg.write_text(json.dumps(dict(width=960,height=540,duration_ms=850,fps=60,seed=42,actions=str(TMP/f'{name}-particle-actions.json'),preview=str(TMP/f'{name}.gif'),system=str(OUT/'effects'/f'{name}.json'))))
    args=['--config',cfg]
    run('particle-2d',*args,'init')
    run('particle-2d',*args,'add-emitter','--name','sparks','--shape','point','--x',480,'--y',270,'--burst',count,'--lifetime',life,'--lifetime-spread',70,'--speed',speed,'--speed-spread',20,'--cone-angle',cone,'--dir-y',-1 if name=='swallow' else 1)
    run('particle-2d',*args,'set-particle','--emitter','sparks','--size-from',1,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient',color+'@0,#ffffff@0.2,'+color+'@1')
    run('particle-2d',*args,'render','--frame',4,'--out',TMP/f'{name}.png')
# Synth cues: two-layer pneumatic and tuned mechanical voices.
def config(name,duration=2000):
    cfg=TMP/f'{name}-sound.json'
    cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=duration,seed=71,actions=str(TMP/f'{name}-sound-actions.json'),preview=str(TMP/f'{name}-wave.png'),wav=str(OUT/'audio'/f'{name}.wav'),mid=str(OUT/'audio'/f'{name}.mid'),sample_pack='combat-core',instrument_bank='synthwave')))
    return ['--config',cfg]
for name,freq,to,dur,waveform in [('fire',190,65,110,'noise'),('seat',170,85,95,'triangle'),('swap',620,950,70,'sine'),('denied',110,80,190,'square'),('machinery',460,1100,380,'triangle')]:
    args=config(name);run('sfx-synth',*args,'init')
    for v,w,f,g in [('body',waveform,freq,-17),('metal','sine',freq*2,-22)]:
        run('sfx-synth',*args,'add-voice','--name',v,'--wave',w,'--freq',f,'--dur',dur,'--gain',g)
        run('sfx-synth',*args,'set-envelope','--voice',v,'--env','pluck')
        run('sfx-synth',*args,'set-pitch','--voice',v,'--slide-to',to,'--over',dur)
    run('sfx-synth',*args,'render')
for name,sample,pitch in [(f'extract-{i+1}','impact_metal_dry',i*3) for i in range(5)]+[('intake','boom_sub_rumble',-3),('level-clear','clang_metal',7),('cell-lost','cannon_body_heavy',-5)]:
    args=config(name); run('sfx-sample',*args,'init')
    run('sfx-sample',*args,'add-sample','--name',sample,'--t',0,'--pitch',pitch,'--gain',-13 if name.startswith('extract') else -16,'--fade-out',80)
    if name=='level-clear':
        run('sfx-sample',*args,'add-sample','--name','clang_metal','--t',180,'--pitch',14,'--gain',-22,'--fade-out',140)
    run('sfx-sample',*args,'render')
# Four-bar ambient ostinato. A second cycle is rendered so the final exported
# cycle has the natural tails of its predecessor at the loop boundary.
for name,bpm in [('hall-loop',80),('danger-loop',120)]:
    args=config(name,60000);run('music',*args,'init');run('music',*args,'set-tempo','--bpm',bpm)
    for track,instrument,gain in [('bass','synth_bass',-23),('bell','fm_bell',-30),('pulse','kick_808',-26),('air','hat_closed',-37)]:
        run('music',*args,'define-track','--name',track,'--instrument',instrument)
        run('music',*args,'set-track-fx','--track',track,'--gain',gain,'--env','pluck')
    for cycle in range(3):
        for beat in range(16):
            t=cycle*16+beat
            note=[38,38,41,36][beat//4]
            run('music',*args,'add-note','--track','bass','--pitch',note,'--t',t,'--dur',.65,'--velocity',75)
            if beat%2==0:run('music',*args,'add-note','--track','pulse','--pitch',36,'--t',t,'--dur',.25,'--velocity',65)
            if beat%4==0:run('music',*args,'add-note','--track','bell','--pitch',note+36,'--t',t+.5,'--dur',1.2,'--velocity',55)
            for sub in ([0,.5] if name=='danger-loop' else [.5]):run('music',*args,'add-note','--track','air','--pitch',42,'--t',t+sub,'--dur',.12,'--velocity',40)
    run('music',*args,'render')
    path=OUT/'audio'/f'{name}.wav'
    with wave.open(str(path),'rb') as f:
        params=f.getparams(); data=f.readframes(f.getnframes()); rate=f.getframerate(); stride=f.getnchannels()*f.getsampwidth()
    cycleframes=round(16*60/bpm*rate)
    data=data[cycleframes*stride:2*cycleframes*stride]
    with wave.open(str(path),'wb') as f:f.setparams(params);f.writeframes(data)
# Master the bank samples and quiet synthwave instruments against the dry cues.
# Scale whole files uniformly, preserving the music's seamless cycle boundaries.
for path in (OUT / 'audio').glob('*.wav'):
    name = path.stem
    target = 1800 if name == 'cell-lost' else 1500 if name == 'intake' else 1000 if name == 'level-clear' else 900 if name.startswith('extract-') else 500 if name.endswith('-loop') else None
    if target is None: continue
    with wave.open(str(path), 'rb') as f:
        params = f.getparams()
        values = struct.unpack('<' + 'h' * f.getnframes(), f.readframes(f.getnframes()))
    rms = math.sqrt(sum(v*v for v in values) / len(values))
    gain = min(target / max(1, rms), 28000 / max(1, max(abs(v) for v in values)))
    mastered = struct.pack('<' + 'h' * len(values), *(round(v * gain) for v in values))
    with wave.open(str(path), 'wb') as f:
        f.setparams(params)
        f.writeframes(mastered)
print('Authored sprites, sheets, four particle systems, thirteen cues and two music beds.')
