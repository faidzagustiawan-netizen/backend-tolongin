"""
Worker biometrik yang berumur panjang.

Sebelumnya setiap permintaan verifikasi menjalankan `python verify_face.py`
sebagai proses baru. Artinya TensorFlow, bobot Facenet, dan model EasyOCR
dimuat ulang dari nol setiap kali — sekitar 5-10 detik yang dibayar berulang.
Karena pengawasan berkelanjutan memanggil verifikasi tiap 30 detik per
kandidat, biaya itu menjadi penghalang nyata begitu ada beberapa peserta.

Worker ini memuat semua model satu kali, lalu melayani permintaan lewat
protokol JSON baris-per-baris di stdin/stdout:

    masuk : {"id": "...", "op": "verify_face", "payload": {...}}
    keluar: {"id": "...", "ok": true, "result": {...}}
            {"id": "...", "ok": false, "error": "..."}

Satu proses menangani satu permintaan pada satu waktu; paralelisme diatur
pemanggil dengan menjalankan beberapa worker.
"""
import os
import sys
import json
import base64
import tempfile
import traceback

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '-1')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '3')
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

# --------------------------------------------------------------------------
# Pengamanan saluran keluaran.
#
# DeepFace, EasyOCR, dan TensorFlow menulis pesan status ke stdout — sebagian
# lewat print() Python, sebagian langsung ke file descriptor 1 dari kode native.
# Satu baris nyasar akan merusak protokol JSON di sisi Node.
#
# Deskriptor 1 asli disalin ke tempat aman, lalu fd 1 diarahkan ke stderr.
# Dengan begitu apa pun yang menulis ke stdout — Python maupun native — berakhir
# di stderr, dan hanya balasan yang kita tulis sendiri yang lewat saluran asli.
# --------------------------------------------------------------------------
_real_stdout_fd = os.dup(1)
os.dup2(2, 1)
_out = os.fdopen(_real_stdout_fd, 'w', encoding='utf-8')

# Pesan dari pustaka bisa memuat karakter non-ASCII (bilah kemajuan, simbol).
# Tanpa errors='replace', satu karakter yang tidak bisa di-encode cukup untuk
# melempar UnicodeEncodeError dan menjatuhkan permintaan.
try:
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2  # noqa: E402
from verify_face import (  # noqa: E402
    FaceEngineUnavailable,
    compare_faces,
    extract_hash_from_base64,
    resize_image_if_needed,
)

# CATATAN: verify_ktp / EasyOCR sengaja TIDAK diimpor di sini.
#
# EasyOCR berjalan di atas PyTorch sedangkan DeepFace di atas TensorFlow.
# Keduanya membawa runtime OpenMP/MKL sendiri, dan memuatnya dalam satu proses
# membuat proses ini mati dengan SIGSEGV di tengah permintaan. OCR KTP
# ditangani proses terpisah, lihat ocr_worker.py.


def log(message):
    print(f"[face_worker] {message}", file=sys.stderr, flush=True)


def respond(payload):
    _out.write(json.dumps(payload) + "\n")
    _out.flush()


def decode_to_tempfile(data_url):
    """Menulis gambar base64 ke berkas sementara dan mengembalikan pathnya."""
    cleaned = data_url.split(",")[-1].strip()
    cleaned += "=" * ((4 - len(cleaned) % 4) % 4)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as handle:
        handle.write(base64.b64decode(cleaned))
        return handle.name


def op_verify_face(payload):
    selfie_b64 = payload.get("selfiePhotoUrl", "")
    ktp_b64 = payload.get("idCardPhotoUrl", "")

    result = {
        "isMatch": False,
        "confidenceScore": 0,
        "reason": "",
        "biometricHash": extract_hash_from_base64(selfie_b64),
        "featureVector": None,
        "alignmentDegraded": False,
        "faceDistance": None,
        "needsReview": False,
    }

    s_path = decode_to_tempfile(selfie_b64)
    k_path = decode_to_tempfile(ktp_b64)

    try:
        if cv2.imread(s_path) is None:
            raise ValueError("OpenCV gagal membaca berkas selfie.")
        if cv2.imread(k_path) is None:
            raise ValueError("OpenCV gagal membaca berkas KTP.")

        resize_image_if_needed(s_path)
        resize_image_if_needed(k_path)

        (
            is_match,
            confidence,
            reason,
            selfie_vec,
            degraded,
            distance,
            needs_review,
        ) = compare_faces(s_path, k_path)

        result["isMatch"] = is_match
        result["confidenceScore"] = confidence if is_match else 0
        result["reason"] = reason
        result["alignmentDegraded"] = degraded
        result["faceDistance"] = distance
        result["needsReview"] = needs_review

        # Sama seperti jalur skrip mandiri: vektor hanya disimpan bila wajah
        # cocok DAN selfie benar-benar ter-align.
        if is_match and not degraded:
            result["featureVector"] = selfie_vec

        return result
    finally:
        for path in (s_path, k_path):
            if os.path.exists(path):
                os.remove(path)


OPS = {
    "verify_face": op_verify_face,
    "ping": lambda _payload: {"pong": True},
}


def warmup():
    """
    Memaksa bobot model termuat sebelum permintaan pertama datang.

    DeepFace membangun modelnya secara malas pada pemakaian pertama. Tanpa
    pemanasan ini, permintaan pertama tetap menanggung penalti beberapa detik
    dan pool worker terlihat sehat padahal belum siap.
    """
    try:
        import numpy as np
        from verify_face import represent_face

        dummy = (np.random.rand(160, 160, 3) * 255).astype('uint8')
        path = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg").name
        cv2.imwrite(path, dummy)
        try:
            represent_face(path, allow_unaligned=True)
        finally:
            if os.path.exists(path):
                os.remove(path)
        log("model wajah siap")
    except Exception as e:
        log(f"pemanasan model wajah gagal (tidak fatal): {e}")


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
            op_name = request.get("op")
            handler = OPS.get(op_name)

            if handler is None:
                respond({
                    "id": request_id,
                    "ok": False,
                    "error": f"Operasi tidak dikenal: {op_name}",
                })
                continue

            result = handler(request.get("payload") or {})
            respond({"id": request_id, "ok": True, "result": result})
        except FaceEngineUnavailable as e:
            # Ditandai khusus agar sisi Node bisa memperlakukannya sebagai
            # gangguan sistem yang bisa dicoba ulang, bukan sebagai keputusan
            # verifikasi terhadap pengguna.
            log(f"mesin wajah tidak tersedia: {e}")
            respond({
                "id": request_id,
                "ok": False,
                "error": f"ENGINE_UNAVAILABLE: {e}",
            })
        except Exception as e:
            log(traceback.format_exc())
            respond({"id": request_id, "ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
