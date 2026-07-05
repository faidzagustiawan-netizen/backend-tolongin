import sys
import json
import re
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

def compare_faces_opencv(s_path, k_path):
    try:
        from deepface import DeepFace
        result = DeepFace.verify(
            img1_path=s_path, 
            img2_path=k_path, 
            model_name="Facenet", 
            enforce_detection=False,
            detector_backend="skip"
        )
        is_match = bool(result.get("verified", False))
        distance = float(result.get("distance", 1.0))
        
        confidence = max(0, min(100, round((1.0 - distance) * 100)))
        
        if is_match:
            return True, max(85, confidence), "Wajah terverifikasi cocok menggunakan DeepFace ML."
        else:
            return False, confidence, "Wajah tidak cocok berdasarkan analisis biometrik."
    except ValueError as ve:
        if "Face could not be detected" in str(ve):
            return False, 0, "Wajah tidak terdeteksi dengan jelas pada foto selfie atau KTP. Pastikan pencahayaan cukup dan wajah terlihat utuh tanpa terpotong."
        return False, 0, f"Gagal mengekstrak fitur wajah: {str(ve)}"
    except Exception as e:
        if "Face could not be detected" in str(e):
            return False, 0, "Wajah tidak terdeteksi dengan jelas pada foto selfie atau KTP. Pastikan pencahayaan cukup dan wajah terlihat utuh tanpa terpotong."
        return False, 0, f"Gagal mengekstrak fitur wajah: {str(e)}"

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
            "biometricHash": None
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

            face_match, conf_score, face_msg = compare_faces_opencv(s_path, k_path)
            
            result["isMatch"] = face_match
            result["confidenceScore"] = conf_score if face_match else 0
            result["reason"] = face_msg
        finally:
            if os.path.exists(s_path): os.remove(s_path)
            if os.path.exists(k_path): os.remove(k_path)

        print("===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===")

    except Exception as e:
        err_res = {
            "isMatch": False,
            "confidenceScore": 0,
            "reason": f"Fatal Python Error: {str(e)}",
            "biometricHash": None
        }
        print("===JSON_START===")
        print(json.dumps(err_res))
        print("===JSON_END===")

if __name__ == "__main__":
    main()
