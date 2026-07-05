import sys
import json
import re
import tempfile
import os
import base64
import cv2

os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

def resize_image_if_needed(img_path, max_dim=1024):
    img = cv2.imread(img_path)
    if img is None:
        return
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        img_resized = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        cv2.imwrite(img_path, img_resized)

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data or input_data.strip() == "":
            print(json.dumps({"error": "No input payload"}))
            return

        payload = json.loads(input_data)
        ktp_b64 = payload.get("idCardPhotoUrl", "")

        result = {
            "isKtpValid": False,
            "ktpNik": None,
            "ktpName": None,
            "reason": ""
        }

        clean_ktp = re.sub(r'^data:image/\w+;base64,', '', ktp_b64)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as k_file:
            k_file.write(base64.b64decode(clean_ktp))
            k_path = k_file.name

        try:
            resize_image_if_needed(k_path, max_dim=1200) # Slightly larger for OCR

            import easyocr  # type: ignore
            reader = easyocr.Reader(['id', 'en'], gpu=False)
            detections = reader.readtext(k_path, detail=0)
            full_text = " ".join(detections)
            
            cleaned_text = full_text.upper().replace(" ", "")
            cleaned_text = cleaned_text.replace("O", "0").replace("I", "1").replace("L", "1").replace("S", "5").replace("B", "8").replace("D", "0")
            
            ocr_nik = None
            ocr_name = None

            nik_match = re.search(r'\d{16}', cleaned_text)
            if nik_match:
                ocr_nik = nik_match.group(0)
            else:
                nums = re.findall(r'\d+', cleaned_text)
                for n in nums:
                    if len(n) >= 16:
                        ocr_nik = n[:16]
                        break

            for line in detections:
                if "NAMA" in line.upper():
                    ocr_name = line.replace("NAMA", "").replace("Nama", "").replace(":", "").strip()
                    break
            if not ocr_name and len(detections) > 2:
                ocr_name = detections[2]

            is_ktp_valid = bool(ocr_nik)
            if not is_ktp_valid:
                result["reason"] = "Verifikasi Gagal: NIK KTP resmi 16-digit tidak terdeteksi pada foto KTP yang diunggah. Pastikan KTP asli, difoto lurus, dan tidak buram."
            else:
                result["reason"] = "OCR KTP Sukses."

            result["isKtpValid"] = is_ktp_valid
            result["ktpNik"] = ocr_nik
            result["ktpName"] = ocr_name if ocr_name else ("Kandidat Terverifikasi" if is_ktp_valid else None)

        finally:
            if os.path.exists(k_path): os.remove(k_path)

        print("===JSON_START===")
        print(json.dumps(result))
        print("===JSON_END===")

    except Exception as e:
        err_res = {
            "isKtpValid": False,
            "ktpNik": None,
            "ktpName": None,
            "reason": f"Fatal Python Error: {str(e)}"
        }
        print("===JSON_START===")
        print(json.dumps(err_res))
        print("===JSON_END===")

if __name__ == "__main__":
    main()
