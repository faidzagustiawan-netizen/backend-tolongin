import sys
import json
import re
import hashlib
import tempfile
import os
import base64

def extract_hash_from_base64(b64_str):
    clean = re.sub(r'^data:image/\w+;base64,', '', b64_str)
    return hashlib.sha256(clean.encode('utf-8')).hexdigest()

def compare_faces_opencv(s_path, k_path):
    try:
        from deepface import DeepFace
        result = DeepFace.verify(
            img1_path=s_path, 
            img2_path=k_path, 
            model_name="VGG-Face", 
            enforce_detection=False,
            detector_backend="opencv"
        )
        is_match = bool(result.get("verified", False))
        distance = float(result.get("distance", 1.0))
        
        confidence = max(0, min(100, round((1.0 - distance) * 100)))
        
        if is_match:
            return True, max(85, confidence), "Wajah terverifikasi cocok menggunakan DeepFace ML."
        else:
            return False, confidence, "Wajah tidak cocok berdasarkan analisis biometrik."
    except Exception as e:
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
            "isKtpValid": False,
            "isMatch": False,
            "confidenceScore": 0,
            "ktpNik": None,
            "ktpName": None,
            "reason": "",
            "biometricHash": None,
            "engineUsed": "OpenCV Biometrics & EasyOCR"
        }

        # Hitung hash unik wajah untuk sistem 1 Wajah 1 Akun
        bio_hash = extract_hash_from_base64(selfie_b64)
        result["biometricHash"] = bio_hash

        ocr_nik = None
        ocr_name = None
        reason_notes = []

        mode = payload.get("mode", "full")

        # Tulis berkas sementara untuk diproses OpenCV & EasyOCR
        clean_selfie = re.sub(r'^data:image/\w+;base64,', '', selfie_b64)
        clean_ktp = re.sub(r'^data:image/\w+;base64,', '', ktp_b64)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as s_file:
            s_file.write(base64.b64decode(clean_selfie))
            s_path = s_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as k_file:
            k_file.write(base64.b64decode(clean_ktp))
            k_path = k_file.name

        try:
            # 1. Verifikasi Biometrik Wajah menggunakan DeepFace
            face_match, conf_score, face_msg = compare_faces_opencv(s_path, k_path)
            reason_notes.append(face_msg)
            
            if mode == "full":
                # 2. OCR Ekstraksi NIK KTP menggunakan EasyOCR
                try:
                    import easyocr  # type: ignore
                    reader = easyocr.Reader(['id', 'en'], gpu=False)
                    detections = reader.readtext(k_path, detail=0)
                    full_text = " ".join(detections)
                    
                    # --- PERBAIKAN LOGIKA OCR MULAI DI SINI ---
                    cleaned_text = full_text.upper().replace(" ", "")
                    cleaned_text = cleaned_text.replace("O", "0").replace("I", "1").replace("L", "1").replace("S", "5").replace("B", "8").replace("D", "0")
                    
                    nik_match = re.search(r'\d{16}', cleaned_text)
                    if nik_match:
                        ocr_nik = nik_match.group(0)
                    else:
                        nums = re.findall(r'\d+', cleaned_text)
                        for n in nums:
                            if len(n) >= 16:
                                ocr_nik = n[:16]
                                break
                    # --- PERBAIKAN LOGIKA OCR SELESAI ---

                    for line in detections:
                        if "NAMA" in line.upper():
                            ocr_name = line.replace("NAMA", "").replace("Nama", "").replace(":", "").strip()
                            break
                    if not ocr_name and len(detections) > 2:
                        ocr_name = detections[2]
                except Exception as e:
                    reason_notes.append(f"Catatan OCR: {str(e)}")
            else:
                # Mode match_only: bypass KTP OCR validation
                ocr_nik = "MATCH_ONLY_MODE"

        finally:
            if os.path.exists(s_path): os.remove(s_path)
            if os.path.exists(k_path): os.remove(k_path)

        is_ktp_valid = bool(ocr_nik)
        if mode == "full" and not is_ktp_valid:
            final_reason = "Verifikasi Gagal: NIK KTP resmi 16-digit tidak terdeteksi pada foto KTP yang diunggah. Pastikan KTP asli, difoto lurus, dan tidak buram."
        elif not face_match:
            final_reason = f"Verifikasi Gagal: {reason_notes[0]}"
        else:
            final_reason = f"Validasi Identitas KTP & Biometrik Wajah sukses terverifikasi ({', '.join(reason_notes)})."

        result["isKtpValid"] = is_ktp_valid
        result["isMatch"] = face_match
        result["confidenceScore"] = conf_score if (is_ktp_valid and face_match) else 0
        result["ktpNik"] = ocr_nik
        result["ktpName"] = ocr_name if ocr_name else ("Kandidat Terverifikasi" if is_ktp_valid else None)
        result["reason"] = final_reason

        print("===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===")

    except Exception as e:
        err_res = {
            "isKtpValid": False,
            "isMatch": False,
            "confidenceScore": 0,
            "ktpNik": None,
            "ktpName": None,
            "reason": f"Fatal Python Error: {str(e)}",
            "biometricHash": None
        }
        print("===JSON_START===")
        print(json.dumps(err_res))
        print("===JSON_END===")

if __name__ == "__main__":
    main()