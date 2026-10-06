"""Run one Blender job safely: record its PID, cap its time, and kill only that PID if it runs away.

    python run_blender.py LOG TIMEOUT_S -- <blender args...>

Prints 'BLENDER_PID <pid>' before waiting and 'BLENDER_EXIT <code>' (or 'BLENDER_TIMEOUT <pid> killed') at the end.
Every PID it starts is appended to pids.log with a timestamp, so nothing else is ever touched.
"""
import subprocess, sys, time, os
BLENDER = r'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe'
HERE = os.path.dirname(os.path.abspath(__file__))
log, timeout = sys.argv[1], float(sys.argv[2])
args = sys.argv[sys.argv.index('--') + 1:]
with open(log, 'w', encoding='utf-8') as f:
    p = subprocess.Popen([BLENDER] + args, stdout=f, stderr=subprocess.STDOUT, cwd=HERE)
    with open(os.path.join(HERE, 'pids.log'), 'a', encoding='utf-8') as pl:
        pl.write(f'{time.strftime("%H:%M:%S")} started {p.pid}: {" ".join(args)[:160]}\n')
    print('BLENDER_PID', p.pid, flush=True)
    try:
        code = p.wait(timeout=timeout)
        print('BLENDER_EXIT', code, flush=True)
    except subprocess.TimeoutExpired:
        p.kill(); p.wait()
        with open(os.path.join(HERE, 'pids.log'), 'a', encoding='utf-8') as pl:
            pl.write(f'{time.strftime("%H:%M:%S")} killed {p.pid} after {timeout:.0f} s\n')
        print('BLENDER_TIMEOUT', p.pid, 'killed', flush=True)
        sys.exit(124)
sys.exit(code)
