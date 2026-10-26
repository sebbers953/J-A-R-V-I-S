"""Offline Kokoro synthesis. Text stays on stdin, never in process arguments/logs."""
import os
import sys
import wave
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['OMP_NUM_THREADS'] = '4'

def main():
    import numpy as np
    import onnxruntime as ort
    ort.disable_telemetry_events()
    from kokoro_onnx import Kokoro
    model_dir, output, voice = sys.argv[1:]
    if voice not in ('bm_george', 'bm_lewis'):
        raise ValueError('Unsupported voice')
    text = sys.stdin.read(24001)
    if not text.strip() or len(text) > 24000:
        raise ValueError('Invalid text')
    options = ort.SessionOptions()
    options.intra_op_num_threads = min(4, os.cpu_count() or 1)
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(Path(model_dir) / 'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    engine = Kokoro.from_session(session, str(Path(model_dir) / 'voices-v1.0.bin'))
    samples, rate = engine.create(text, voice=voice, speed=0.92, lang='en-gb')
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2')
    with wave.open(output, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm.tobytes())

if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No traceback: phonemizer/runtime exceptions can contain the supplied text.
        print('Local speech synthesis failed.', file=sys.stderr)
        sys.exit(1)
