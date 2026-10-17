# Word-level transcript for one audio file, printed as JSON on stdout.
#   python tools/words.py <audio.wav> [model]
# Prints {"model", "device", "words": [{"text", "start", "end"}], "text"}.
# Needs: pip install openai-whisper  (uses your GPU automatically when CUDA is there)
import json, sys

def main():
    import torch, whisper
    src = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "small.en"
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model(name, device=dev)
    r = model.transcribe(src, word_timestamps=True, fp16=(dev == "cuda"), condition_on_previous_text=False)
    words = []
    for seg in r.get("segments", []):
        for w in seg.get("words", []):
            t = w["word"].strip()
            if t:
                words.append({"text": t, "start": round(float(w["start"]), 3), "end": round(float(w["end"]), 3)})
    print(json.dumps({"model": name, "device": dev, "words": words, "text": r.get("text", "").strip()}))

if __name__ == "__main__":
    main()
