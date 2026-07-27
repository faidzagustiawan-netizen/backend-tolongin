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

MODEL_NAME = "Facenet"

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
# Angka di bawah adalah titik awal yang bisa ditimpa lewat variabel
# lingkungan, dan HARUS dikalibrasi ulang begitu ada cukup pasangan asli
# maupun pasangan berbeda-orang.
FACE_MATCH_DISTANCE = float(os.environ.get('FACE_MATCH_DISTANCE', '0.55'))
FACE_REVIEW_DISTANCE = float(os.environ.get('FACE_REVIEW_DISTANCE', '0.80'))

# Pasangan yang gagal diluruskan dinilai lebih ketat: jarak pada wajah mentah
# menyebar lebih lebar sehingga kurang bisa dipercaya.
DEGRADED_MATCH_DISTANCE = float(
    os.environ.get('FACE_DEGRADED_MATCH_DISTANCE', '0.45')
)
DEGRADED_REVIEW_DISTANCE = float(
    os.environ.get('FACE_DEGRADED_REVIEW_DISTANCE', '0.70')
)


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


def compare_faces(s_path, k_path):
    """
    Membandingkan selfie dengan foto pada KTP.

    Mengembalikan (is_match, confidence, reason, selfie_vector, degraded,
    distance, needs_review).

    `needs_review` menandai zona tengah: cukup mirip untuk diloloskan, tetapi
    belum cukup meyakinkan untuk dinyatakan otomatis. Kasus seperti itu tetap
    lolos agar pengguna tidak terhalang, lalu ditandai untuk diperiksa petugas.
    """
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

        ktp_vec, _ktp_backend, ktp_degraded = represent_face(
            k_path, allow_unaligned=True
        )
        if ktp_vec is None:
            return (
                False,
                0,
                "Wajah tidak terdeteksi pada foto KTP. Pastikan kartu difoto tegak lurus, tidak buram, dan tidak terkena pantulan cahaya.",
                selfie_vec,
                False,
                None,
                False,
            )

        degraded = selfie_degraded or ktp_degraded
        distance = cosine_distance(selfie_vec, ktp_vec)

        match_at = DEGRADED_MATCH_DISTANCE if degraded else FACE_MATCH_DISTANCE
        review_at = DEGRADED_REVIEW_DISTANCE if degraded else FACE_REVIEW_DISTANCE

        # Kepercayaan dipetakan terhadap batas peninjauan, sehingga tepat di
        # batas bernilai 0% dan jarak nol bernilai 100%.
        confidence = max(0, min(100, round((1.0 - distance / review_at) * 100)))

        note = " (kualitas foto rendah, dinilai dengan ambang lebih ketat)" if degraded else ""

        if distance <= match_at:
            return (
                True,
                confidence,
                f"Wajah cocok dengan foto pada KTP (jarak biometrik {distance:.3f}){note}.",
                selfie_vec,
                degraded,
                distance,
                False,
            )

        if distance <= review_at:
            return (
                True,
                confidence,
                f"Wajah cukup mirip dengan foto pada KTP (jarak biometrik {distance:.3f}), "
                f"namun berada di zona yang perlu diperiksa petugas{note}.",
                selfie_vec,
                degraded,
                distance,
                True,
            )

        return (
            False,
            confidence,
            f"Wajah pada selfie tidak cocok dengan foto pada KTP (jarak biometrik {distance:.3f}, batas {review_at:.2f}){note}.",
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
            ) = compare_faces(s_path, k_path)

            result["isMatch"] = face_match
            result["confidenceScore"] = conf_score if face_match else 0
            result["reason"] = face_msg
            result["alignmentDegraded"] = degraded
            result["faceDistance"] = distance
            result["needsReview"] = needs_review

            # Vektor hanya disimpan bila wajah cocok dengan KTP DAN selfie-nya
            # benar-benar ter-align. Embedding dari wajah mentah tidak layak
            # dijadikan acuan pembanding antar-pengguna.
            if face_match and not degraded:
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
