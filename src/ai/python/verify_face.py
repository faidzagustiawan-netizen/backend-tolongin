import sys
import json
import re
import math
import hashlib
import tempfile
import os
import base64
import cv2

os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

def extract_hash_from_base64(b64_str):
    clean = re.sub(r'^data:image/\w+;base64,', '', b64_str)
    return hashlib.sha256(clean.encode('utf-8')).hexdigest()

def resize_image_if_needed(img_path, max_dim=800):
    img = cv2.imread(img_path)
    if img is None:
        return
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        img_resized = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        cv2.imwrite(img_path, img_resized)

# Facenet512 menggantikan Facenet 128 dimensi. Embedding-nya memisahkan
# identitas jauh lebih tajam, yang penting di sini karena pasangan
# selfie-vs-KTP memang berjarak lebar dan menyisakan sedikit ruang aman.
#
# PERINGATAN: mengubah model membuat seluruh embedding yang sudah tersimpan
# tidak sebanding lagi. Setelah menggantinya, kosongkan biometricFeatureVector
# dan jalankan ulang scripts/backfill-biometric-vectors.ts.
MODEL_NAME = os.environ.get('FACE_MODEL', 'Facenet512')

# Dimensi keluaran per model, dipakai untuk memastikan vektor cocok dengan
# lebar kolom pgvector.
MODEL_DIMENSIONS = {
    "Facenet": 128,
    "Facenet512": 512,
    "ArcFace": 512,
    "VGG-Face": 4096,
}

# Urutan detektor yang dicoba. opencv ringan dan tersedia bersama cv2;
# mtcnn lebih tahan terhadap wajah miring tetapi lebih lambat, jadi hanya
# dipakai bila yang pertama gagal menemukan wajah.
DETECTOR_CHAIN = ["opencv", "mtcnn"]

# Ambang jarak cosine untuk pasangan selfie-vs-KTP.
#
# CATATAN PENTING soal angka ini. DeepFace menganjurkan 0.40 untuk Facenet
# cosine, tetapi angka itu dikalibrasi pada pasangan foto-vs-foto berkualitas
# wajar (misal LFW). Selfie-vs-KTP adalah domain yang jauh lebih sulit: foto
# pada KTP adalah foto dari hasil cetak, beresolusi rendah, pencahayaan
# berbeda, dan sering berusia bertahun-tahun. Pengukuran pada pasangan asli
# di sini menghasilkan jarak 0,66-0,69 untuk orang yang SAMA — jauh di atas
# 0,40. Memakai 0,40 berarti menolak pemilik KTP yang sah.
#
# Karena itu keputusannya dibuat tiga zona, bukan lolos/tolak. Zona tengah
# diteruskan ke peninjauan manusia: salah menolak pencari kerja yang sah jauh
# lebih mahal daripada meloloskan satu kasus untuk diperiksa petugas.
#
# Ambang baku DeepFace per model untuk jarak cosine, dipakai sebagai titik
# acuan. Ini adalah angka untuk pasangan foto-vs-foto.
MODEL_COSINE_BASELINE = {
    "Facenet": 0.40,
    "Facenet512": 0.30,
    "ArcFace": 0.68,
    "VGG-Face": 0.68,
}

# Pengali domain. Diturunkan dari pengukuran nyata pada Facenet: pasangan
# selfie-vs-KTP milik orang yang sama menghasilkan jarak 0,66-0,69 terhadap
# ambang baku 0,40, yaitu sekitar 1,7 kali. Zona cocok dipasang sedikit di
# bawah rasio itu dan zona tinjau sedikit di atasnya.
#
# Pengali ini BELUM diukur ulang untuk Facenet512. Nilainya sengaja dibiarkan
# sama agar perbandingannya adil, dan harus disetel setelah terkumpul cukup
# pasangan asli maupun pasangan berbeda-orang.
DOMAIN_MATCH_MULTIPLIER = 1.4
DOMAIN_REVIEW_MULTIPLIER = 2.0

_baseline = MODEL_COSINE_BASELINE.get(MODEL_NAME, 0.40)

FACE_MATCH_DISTANCE = float(
    os.environ.get(
        'FACE_MATCH_DISTANCE', _baseline * DOMAIN_MATCH_MULTIPLIER
    )
)
FACE_REVIEW_DISTANCE = float(
    os.environ.get(
        'FACE_REVIEW_DISTANCE', _baseline * DOMAIN_REVIEW_MULTIPLIER
    )
)

# Pasangan yang gagal diluruskan dinilai lebih ketat: jarak pada wajah mentah
# menyebar lebih lebar sehingga kurang bisa dipercaya.
DEGRADED_MATCH_DISTANCE = float(
    os.environ.get('FACE_DEGRADED_MATCH_DISTANCE', FACE_MATCH_DISTANCE * 0.8)
)
DEGRADED_REVIEW_DISTANCE = float(
    os.environ.get('FACE_DEGRADED_REVIEW_DISTANCE', FACE_REVIEW_DISTANCE * 0.875)
)

# --------------------------------------------------------------------------
# Dua jenis pembandingan, dua ambang.
#
# Pelonggaran di atas HANYA sah untuk pasangan selfie-vs-KTP, karena foto pada
# kartu cetak memang menghasilkan jarak besar untuk orang yang sama.
#
# Pengecekan anti-joki membandingkan foto kamera langsung dengan SELFIE yang
# tersimpan — dua foto digital dengan kualitas setara. Itu domain foto-vs-foto
# biasa, dan memakai ambang KTP di sini adalah lubang: batas 0,60 untuk
# Facenet512 melampaui jarak khas antar-orang-berbeda, sehingga dua orang yang
# berlainan sama-sama diloloskan terhadap satu wajah terdaftar.
#
# Karena itu pembandingan selfie-vs-selfie memakai ambang baku model, tanpa
# zona tinjau (tidak ada "cukup mirip" yang diloloskan), dan tanpa jalur wajah
# tak-terdeteksi — foto tanpa wajah tidak boleh menghasilkan embedding acak
# yang kebetulan lolos.
# --------------------------------------------------------------------------
COMPARISON_SELFIE_VS_KTP = "selfie_vs_ktp"
COMPARISON_SELFIE_VS_SELFIE = "selfie_vs_selfie"

SELFIE_MATCH_DISTANCE = float(
    os.environ.get('FACE_SELFIE_MATCH_DISTANCE', _baseline)
)


def resolve_thresholds(comparison, degraded):
    """
    Mengembalikan (match_at, review_at, confidence_at) untuk jenis pembandingan.

    `review_at` sama dengan `match_at` berarti tidak ada zona tinjau: apa pun di
    atas ambang langsung ditolak. `confidence_at` adalah jarak yang dipetakan
    menjadi 0%.
    """
    if comparison == COMPARISON_SELFIE_VS_SELFIE:
        match_at = SELFIE_MATCH_DISTANCE
        # Ambang dipetakan ke 50% supaya angka yang ditampilkan tetap terbaca
        # sebagai "pas di batas", bukan 0%.
        return match_at, match_at, match_at * 2

    match_at = DEGRADED_MATCH_DISTANCE if degraded else FACE_MATCH_DISTANCE
    review_at = DEGRADED_REVIEW_DISTANCE if degraded else FACE_REVIEW_DISTANCE
    return match_at, review_at, review_at


class FaceEngineUnavailable(RuntimeError):
    """
    Mesin pengenalan wajah tidak bisa dimuat (dependensi hilang atau rusak).

    Dibedakan dari "wajah tidak cocok" karena konsekuensinya berlawanan:
    ketidakcocokan adalah jawaban yang sah tentang pengguna, sedangkan ini
    adalah kerusakan sistem. Menyamakan keduanya membuat pengguna diberi tahu
    bahwa wajahnya tidak sesuai KTP padahal servernya yang bermasalah.
    """


def load_deepface():
    """Memuat DeepFace, menerjemahkan dependensi yang hilang menjadi galat khusus."""
    try:
        from deepface import DeepFace
        return DeepFace
    except ImportError as e:
        raise FaceEngineUnavailable(
            f"Pustaka pengenalan wajah tidak lengkap: {e}"
        ) from e


def l2_normalize(vec):
    """
    Menormalkan embedding ke panjang 1.

    Dengan vektor ternormalisasi, jarak cosine menjadi operasi yang stabil dan
    sebanding antar-baris — syarat agar pencarian tetangga terdekat di pgvector
    memberi angka yang berarti.
    """
    norm = math.sqrt(sum(float(x) * float(x) for x in vec))
    if norm == 0:
        return None
    return [float(x) / norm for x in vec]


def represent_face(img_path, allow_unaligned=False):
    """
    Mengekstrak embedding wajah.

    Mengembalikan (embedding_ternormalisasi, detektor_terpakai, degraded).
    `degraded` bernilai True bila wajah gagal terdeteksi dan gambar terpaksa
    diumpankan mentah tanpa pelurusan.
    """
    DeepFace = load_deepface()

    for backend in DETECTOR_CHAIN:
        try:
            reps = DeepFace.represent(
                img_path=img_path,
                model_name=MODEL_NAME,
                enforce_detection=True,
                detector_backend=backend,
                align=True,
            )
            if isinstance(reps, list) and len(reps) > 0:
                embedding = reps[0].get("embedding")
                if embedding:
                    normalized = l2_normalize(embedding)
                    if normalized:
                        return normalized, backend, False
        except FaceEngineUnavailable:
            raise
        except Exception as e:
            # Dependensi yang hilang muncul sebagai ImportError di dalam
            # DeepFace saat model dibangun; itu kerusakan sistem, bukan
            # "wajah tidak terdeteksi", jadi tidak boleh ditelan di sini.
            if isinstance(e, ImportError) or "No module named" in str(e):
                raise FaceEngineUnavailable(str(e)) from e
            # Detektor ini tidak menemukan wajah; coba yang berikutnya.
            continue

    if not allow_unaligned:
        return None, None, False

    # Jalur terakhir khusus foto KTP: wajah pada kartu cetak sering kecil,
    # memantulkan cahaya, dan lolos dari detektor meskipun kartunya sah.
    # Menolak mentah-mentah akan memblokir KTP asli, jadi gambar diproses
    # tanpa pelurusan dan hasilnya ditandai degraded.
    try:
        reps = DeepFace.represent(
            img_path=img_path,
            model_name=MODEL_NAME,
            enforce_detection=False,
            detector_backend="skip",
        )
        if isinstance(reps, list) and len(reps) > 0:
            embedding = reps[0].get("embedding")
            if embedding:
                normalized = l2_normalize(embedding)
                if normalized:
                    return normalized, "skip", True
    except FaceEngineUnavailable:
        raise
    except Exception as e:
        if isinstance(e, ImportError) or "No module named" in str(e):
            raise FaceEngineUnavailable(str(e)) from e

    return None, None, False


def cosine_distance(a, b):
    """Jarak cosine untuk dua vektor yang sudah dinormalkan (0 = identik)."""
    return 1.0 - sum(x * y for x, y in zip(a, b))


def compare_faces(s_path, k_path, comparison=COMPARISON_SELFIE_VS_KTP):
    """
    Membandingkan selfie dengan gambar pembanding.

    `comparison` menentukan ambang yang dipakai:
    - COMPARISON_SELFIE_VS_KTP: pembanding adalah foto pada KTP. Ambang longgar
      tiga zona, dan wajah yang tak terdeteksi pada kartu tetap diproses tanpa
      pelurusan.
    - COMPARISON_SELFIE_VS_SELFIE: pembanding adalah selfie tersimpan (anti-joki).
      Ambang baku model, tanpa zona tinjau, dan wajah wajib terdeteksi di kedua
      sisi.

    Mengembalikan (is_match, confidence, reason, selfie_vector, degraded,
    distance, needs_review).

    `needs_review` menandai zona tengah: cukup mirip untuk diloloskan, tetapi
    belum cukup meyakinkan untuk dinyatakan otomatis. Kasus seperti itu tetap
    lolos agar pengguna tidak terhalang, lalu ditandai untuk diperiksa petugas.
    Zona ini tidak pernah aktif pada pembandingan selfie-vs-selfie.
    """
    is_ktp_pair = comparison != COMPARISON_SELFIE_VS_SELFIE
    ref_label = "foto pada KTP" if is_ktp_pair else "wajah terdaftar"

    try:
        selfie_vec, _selfie_backend, selfie_degraded = represent_face(
            s_path, allow_unaligned=False
        )
        if selfie_vec is None:
            return (
                False,
                0,
                "Wajah tidak terdeteksi pada foto selfie. Pastikan wajah menghadap kamera, pencahayaan cukup, dan tidak tertutup masker atau kacamata gelap.",
                None,
                False,
                None,
                False,
            )

        ref_vec, _ref_backend, ref_degraded = represent_face(
            k_path, allow_unaligned=is_ktp_pair
        )
        if ref_vec is None:
            return (
                False,
                0,
                (
                    "Wajah tidak terdeteksi pada foto KTP. Pastikan kartu difoto tegak lurus, tidak buram, dan tidak terkena pantulan cahaya."
                    if is_ktp_pair
                    else "Wajah tidak terdeteksi pada foto acuan yang tersimpan. Silakan ulangi verifikasi KTP & selfie di halaman profil."
                ),
                selfie_vec,
                False,
                None,
                False,
            )

        degraded = selfie_degraded or ref_degraded
        distance = cosine_distance(selfie_vec, ref_vec)

        match_at, review_at, confidence_at = resolve_thresholds(
            comparison, degraded
        )

        # Kepercayaan dipetakan terhadap batas penolakan, sehingga tepat di
        # batas bernilai 0% dan jarak nol bernilai 100%.
        confidence = max(
            0, min(100, round((1.0 - distance / confidence_at) * 100))
        )

        note = " (kualitas foto rendah, dinilai dengan ambang lebih ketat)" if degraded else ""

        if distance <= match_at:
            return (
                True,
                confidence,
                f"Wajah cocok dengan {ref_label} (jarak biometrik {distance:.3f}){note}.",
                selfie_vec,
                degraded,
                distance,
                False,
            )

        if distance <= review_at:
            return (
                True,
                confidence,
                f"Wajah cukup mirip dengan {ref_label} (jarak biometrik {distance:.3f}), "
                f"namun berada di zona yang perlu diperiksa petugas{note}.",
                selfie_vec,
                degraded,
                distance,
                True,
            )

        return (
            False,
            confidence,
            f"Wajah pada foto tidak cocok dengan {ref_label} (jarak biometrik {distance:.3f}, batas {review_at:.2f}){note}.",
            selfie_vec,
            degraded,
            distance,
            False,
        )
    except FaceEngineUnavailable:
        # Diteruskan ke atas: pemanggil harus membedakannya dari ketidakcocokan
        # dan tidak boleh menandai verifikasi pengguna sebagai gagal.
        raise
    except Exception as e:
        return (
            False,
            0,
            f"Gagal mengekstrak fitur wajah: {str(e)}",
            None,
            False,
            None,
            False,
        )

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data or input_data.strip() == "":
            print(json.dumps({"error": "No input payload"}))
            return

        payload = json.loads(input_data)
        selfie_b64 = payload.get("selfiePhotoUrl", "")
        ktp_b64 = payload.get("idCardPhotoUrl", "")
        comparison = payload.get("comparison") or COMPARISON_SELFIE_VS_KTP

        result = {
            "isMatch": False,
            "confidenceScore": 0,
            "reason": "",
            "biometricHash": None,
            "featureVector": None,
            "alignmentDegraded": False,
            "faceDistance": None,
            "needsReview": False
        }

        bio_hash = extract_hash_from_base64(selfie_b64)
        result["biometricHash"] = bio_hash

        clean_selfie = selfie_b64.split(",")[-1].strip()
        clean_ktp = ktp_b64.split(",")[-1].strip()

        clean_selfie += "=" * ((4 - len(clean_selfie) % 4) % 4)
        clean_ktp += "=" * ((4 - len(clean_ktp) % 4) % 4)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as s_file:
            s_file.write(base64.b64decode(clean_selfie))
            s_path = s_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as k_file:
            k_file.write(base64.b64decode(clean_ktp))
            k_path = k_file.name

        try:
            img_s = cv2.imread(s_path)
            if img_s is None:
                raise ValueError(f"OpenCV gagal membaca file Selfie. Base64 info: len={len(selfie_b64)}, start={selfie_b64[:30]}")
            img_k = cv2.imread(k_path)
            if img_k is None:
                raise ValueError(f"OpenCV gagal membaca file KTP. Base64 info: len={len(ktp_b64)}, start={ktp_b64[:30]}")

            resize_image_if_needed(s_path)
            resize_image_if_needed(k_path)

            (
                face_match,
                conf_score,
                face_msg,
                selfie_vec,
                degraded,
                distance,
                needs_review,
            ) = compare_faces(s_path, k_path, comparison)

            result["isMatch"] = face_match
            result["confidenceScore"] = conf_score if face_match else 0
            result["reason"] = face_msg
            result["alignmentDegraded"] = degraded
            result["faceDistance"] = distance
            result["needsReview"] = needs_review

            # Vektor hanya disimpan bila wajah cocok dengan KTP DAN selfie-nya
            # benar-benar ter-align. Embedding dari wajah mentah tidak layak
            # dijadikan acuan pembanding antar-pengguna. Foto dari pengecekan
            # anti-joki juga tidak pernah dijadikan acuan identitas.
            if face_match and not degraded and comparison == COMPARISON_SELFIE_VS_KTP:
                result["featureVector"] = selfie_vec
        finally:
            if os.path.exists(s_path): os.remove(s_path)
            if os.path.exists(k_path): os.remove(k_path)

        print("===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===")

    except FaceEngineUnavailable as e:
        err_res = {
            "isMatch": False,
            "confidenceScore": 0,
            "reason": f"ENGINE_UNAVAILABLE: {str(e)}",
            "engineUnavailable": True,
            "biometricHash": None,
            "featureVector": None,
            "alignmentDegraded": False
        }
        print("===JSON_START===")
        print(json.dumps(err_res))
        print("===JSON_END===")
        return
    except Exception as e:
        err_res = {
            "isMatch": False,
            "confidenceScore": 0,
            "reason": f"Fatal Python Error: {str(e)}",
            "biometricHash": None,
            "featureVector": None,
            "alignmentDegraded": False
        }
        print("===JSON_START===")
        print(json.dumps(err_res))
        print("===JSON_END===")

if __name__ == "__main__":
    main()
