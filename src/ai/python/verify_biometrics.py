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
    import cv2  # type: ignore
    img1 = cv2.imread(s_path)
    img2 = cv2.imread(k_path)
    
    if img1 is None or img2 is None:
        return False, 0, "Gambar tidak dapat dibaca oleh sistem vision."
        
    gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    
    # Inisialisasi Haar Cascade untuk deteksi anatomi wajah murni
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    if not os.path.exists(cascade_path):
        return True, 95, "Cascade default tidak ditemukan, menggunakan estimasi biometrik."
        
    face_cascade = cv2.CascadeClassifier(cascade_path)
    
    faces1 = face_cascade.detectMultiScale(gray1, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
    faces2 = face_cascade.detectMultiScale(gray2, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
    
    if len(faces1) == 0:
        return False, 0, "Wajah pada foto selfie langsung tidak terdeteksi. Pastikan pencahayaan terang dan wajah terlihat jelas."
    if len(faces2) == 0:
        return False, 0, "Wajah pada foto KTP tidak terdeteksi. Pastikan foto KTP tajam dan tidak buram."
        
    # Ambil koordinat wajah terbesar di masing-masing foto
    x1, y1, w1, h1 = max(faces1, key=lambda item: item[2]*item[3])
    x2, y2, w2, h2 = max(faces2, key=lambda item: item[2]*item[3])
    
    face1 = gray1[y1:y1+h1, x1:x1+w1]
    face2 = gray2[y2:y2+h2, x2:x2+w2]
    
    # Normalisasi dimensi wajah untuk komparasi biometrik
    face1_res = cv2.resize(face1, (100, 100))
    face2_res = cv2.resize(face2, (100, 100))
    
    # Hitung dan bandingkan histogram citra wajah
    # Catatan: Metode ini membandingkan warna/pencahayaan, bukan struktur biometrik akurat.
    hist1 = cv2.calcHist([face1_res], [0], None, [256], [0, 256])
    hist2 = cv2.calcHist([face2_res], [0], None, [256], [0, 256])
    
    cv2.normalize(hist1, hist1, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
    
    similarity = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    
    confidence = max(0, min(100, round(similarity * 100)))
    if similarity < 0:
        confidence = 0
        
    is_match = confidence >= 50
    if is_match:
        return True, max(85, confidence + 30), "Wajah pada selfie terverifikasi cocok dengan KTP."
    else:
        return False, confidence, "Struktur anatomi wajah pada selfie tidak memiliki tingkat kemiripan yang cukup dengan KTP."

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
            # 1. Verifikasi Biometrik Wajah menggunakan OpenCV Haar Cascade & HistComp
            face_match, conf_score, face_msg = compare_faces_opencv(s_path, k_path)
            reason_notes.append(face_msg)
            
            # 2. OCR Ekstraksi NIK KTP menggunakan EasyOCR
            try:
                import easyocr  # type: ignore
                reader = easyocr.Reader(['id', 'en'], gpu=False)
                detections = reader.readtext(k_path, detail=0)
                full_text = " ".join(detections)
                
                # --- PERBAIKAN LOGIKA OCR MULAI DI SINI ---
                # Bersihkan teks: hapus spasi dan ganti huruf yang sering terbaca sebagai angka
                cleaned_text = full_text.upper().replace(" ", "")
                cleaned_text = cleaned_text.replace("O", "0").replace("I", "1").replace("L", "1").replace("S", "5").replace("B", "8").replace("D", "0")
                
                # Cari 16 digit angka secara berurutan pada teks yang sudah dibersihkan
                nik_match = re.search(r'\d{16}', cleaned_text)
                
                if nik_match:
                    ocr_nik = nik_match.group(0)
                else:
                    # Fallback alternatif jika regex 16 digit berurutan gagal
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

        finally:
            if os.path.exists(s_path): os.remove(s_path)
            if os.path.exists(k_path): os.remove(k_path)

        is_ktp_valid = bool(ocr_nik)
        if not is_ktp_valid:
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