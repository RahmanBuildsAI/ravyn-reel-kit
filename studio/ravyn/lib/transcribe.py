# Voice notes: a long-lived Whisper worker for the editor server. It loads the model once (on the
# GPU when CUDA is there) and then answers one JSON line per request on stdin:
#   {"wav": "C:/.../note.wav"}  ->  {"text": "..."}   or   {"error": "..."}
# Started lazily by server.mjs on the first voice note; the model is RAVYN_WHISPER (default small.en).
import json, os, sys

def main():
    import torch, whisper
    name = os.environ.get("RAVYN_WHISPER", "small.en")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model(name, device=dev)
    print(json.dumps({"ready": True, "model": name, "device": dev}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            r = model.transcribe(req["wav"], language="en", fp16=(dev == "cuda"), condition_on_previous_text=False)
            print(json.dumps({"text": r.get("text", "").strip()}), flush=True)
        except Exception as e:  # one bad clip must not kill the worker
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
