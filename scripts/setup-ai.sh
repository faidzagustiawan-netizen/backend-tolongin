#!/bin/bash
echo "Installing Python dependencies for Biometric AI..."
pip3 install deepface easyocr opencv-python tf-keras

echo "Pre-downloading EasyOCR and DeepFace models..."
python3 -c "
import easyocr
print('Downloading EasyOCR models...')
reader = easyocr.Reader(['id', 'en'], gpu=False)

from deepface import DeepFace
import numpy as np
import cv2
print('Downloading VGG-Face model...')
# Create a dummy image to force model download
dummy_img = np.zeros((224, 224, 3), dtype=np.uint8)
cv2.imwrite('dummy.jpg', dummy_img)
try:
    DeepFace.verify('dummy.jpg', 'dummy.jpg', model_name='VGG-Face', enforce_detection=False)
except:
    pass
import os
os.remove('dummy.jpg')
print('Setup complete!')
"
