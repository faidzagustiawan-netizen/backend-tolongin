"""
Worker OCR KTP yang berumur panjang.

Sengaja TERPISAH dari face_worker.py, bukan digabung.

EasyOCR berjalan di atas PyTorch sedangkan DeepFace di atas TensorFlow.
Keduanya membawa runtime OpenMP/MKL masing-masing, dan memuatnya dalam satu
proses membuat proses tersebut mati dengan SIGSEGV. Desain lama tidak pernah
mengalaminya karena setiap skrip dijalankan sebagai proses sendiri; memisahkan
pool per framework mempertahankan keuntungan "model dimuat sekali" tanpa
mengembalikan konflik tersebut.

Protokolnya sama dengan face_worker.py: JSON baris-per-baris di stdin/stdout.
"""
import os
import sys
import json
import base64
import tempfile
import traceback

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '-1')
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

# Deskriptor 1 asli disimpan lalu fd 1 diarahkan ke stderr, sehingga pesan
# status dari pustaka apa pun — termasuk yang menulis langsung ke fd 1 dari
# kode native — tidak merusak protokol JSON. Lihat catatan di face_worker.py.
_real_stdout_fd = os.dup(1)
os.dup2(2, 1)
_out = os.fdopen(_real_stdout_fd, 'w', encoding='utf-8')

# EasyOCR menggambar bilah kemajuan memakai karakter blok (U+2588). Setelah
# stdout dialihkan ke stderr, karakter itu ikut melewati stderr — dan pada
# lingkungan yang encoding bawaannya bukan UTF-8, penulisannya melempar
# UnicodeEncodeError yang mematikan permintaan. errors='replace' membuat
# keluaran hiasan tidak pernah bisa menjatuhkan worker.
try:
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2  # noqa: E402
from verify_ktp import analyze_ktp_image, build_reader  # noqa: E402

_reader = None


def log(message):
    print(f"[ocr_worker] {message}", file=sys.stderr, flush=True)


def respond(payload):
    _out.write(json.dumps(payload) + "\n")
    _out.flush()


def decode_to_tempfile(data_url):
    cleaned = data_url.split(",")[-1].strip()
    cleaned += "=" * ((4 - len(cleaned) % 4) % 4)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as handle:
        handle.write(base64.b64decode(cleaned))
        return handle.name


def op_verify_ktp(payload):
    global _reader

    k_path = decode_to_tempfile(payload.get("idCardPhotoUrl", ""))
    try:
        if cv2.imread(k_path) is None:
            raise ValueError("OpenCV gagal membaca berkas KTP.")

        if _reader is None:
            _reader = build_reader()

        return analyze_ktp_image(k_path, reader=_reader)
    finally:
        if os.path.exists(k_path):
            os.remove(k_path)


OPS = {
    "verify_ktp": op_verify_ktp,
    "ping": lambda _payload: {"pong": True},
}


def warmup():
    """Memuat bobot EasyOCR sebelum permintaan pertama datang."""
    global _reader
    try:
        log("memuat model EasyOCR...")
        _reader = build_reader()
        log("model EasyOCR siap")
    except Exception as e:
        log(f"pemanasan EasyOCR gagal (tidak fatal): {e}")


def main():
    warmup()
    respond({"id": "__ready__", "ok": True, "result": {"ready": True}})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            handler = OPS.get(request.get("op"))

            if handler is None:
                respond({
                    "id": request_id,
                    "ok": False,
                    "error": f"Operasi tidak dikenal: {request.get('op')}",
                })
                continue

            respond({
                "id": request_id,
                "ok": True,
                "result": handler(request.get("payload") or {}),
            })
        except Exception as e:
            log(traceback.format_exc())
            respond({"id": request_id, "ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
