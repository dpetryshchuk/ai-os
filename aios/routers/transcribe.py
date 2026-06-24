import os
import subprocess
import tempfile

from fastapi import APIRouter, HTTPException, UploadFile

router = APIRouter()


@router.post("")
async def transcribe_audio(file: UploadFile):
    """
    Accept a WebM/WAV/M4A audio blob, run whisper-cli, return transcript.
    Used by the frontend mic button for voice input.
    """
    # whisper-cli path (mounted read-only in Docker)
    whisper_bin = "/usr/local/bin/whisper-cli"
    models_dir = "/whisper-models"

    if not os.path.exists(whisper_bin):
        raise HTTPException(503, "whisper-cli not available on this server")

    # Pick the fastest available model: tiny.en > base.en > base
    model_path = None
    for candidate in ("ggml-tiny.en.bin", "ggml-base.en.bin", "ggml-base.bin"):
        p = os.path.join(models_dir, candidate)
        if os.path.exists(p):
            model_path = p
            break

    if not model_path:
        raise HTTPException(503, "No whisper model found in /whisper-models")

    # Write upload to a temp file
    data = await file.read()
    suffix = ".webm"
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext in (".wav", ".mp3", ".m4a", ".ogg", ".webm"):
            suffix = ext

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        audio_path = tmp.name

    wav_path = audio_path + ".wav"
    try:
        # Convert to 16kHz mono WAV (whisper-cli requires WAV)
        # ffmpeg is available in most base Docker images; fall back gracefully
        ffmpeg_result = subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", wav_path],
            capture_output=True, timeout=30
        )
        if ffmpeg_result.returncode != 0:
            # If ffmpeg fails, try passing the file directly (might be WAV already)
            wav_path = audio_path

        result = subprocess.run(
            [whisper_bin, "-m", model_path, "-f", wav_path, "--no-timestamps", "-l", "en"],
            capture_output=True, text=True, timeout=60
        )

        if result.returncode != 0:
            raise HTTPException(500, f"Whisper failed: {result.stderr[:200]}")

        transcript = result.stdout.strip()
        # whisper-cli sometimes outputs extra noise like "[BLANK_AUDIO]"
        if transcript.lower() in ("[blank_audio]", "", "[silence]"):
            transcript = ""

        return {"ok": True, "transcript": transcript}

    finally:
        for p in [audio_path, wav_path]:
            try:
                os.unlink(p)
            except OSError:
                pass
