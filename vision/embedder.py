from pathlib import Path

import cv2
import numpy as np
from insightface import model_zoo


class FaceEmbedder:
	def __init__(self):
		"""
		Initialize ArcFace recognition model for direct feature extraction.
		"""
		model_path = Path.home() / ".insightface" / "models" / "buffalo_l" / "w600k_r50.onnx"
		if not model_path.exists():
			raise RuntimeError(f"ArcFace model not found at {model_path}")

		self.recognizer = model_zoo.get_model(str(model_path))
		# CPU mode is stable on this environment (CUDA provider is unavailable).
		self.recognizer.prepare(ctx_id=-1)

	def get_embedding(self, face_image):
		"""
		Input:
			face_image -> cropped face (112x112 BGR image)

		Output:
			embedding -> 512 dimensional vector
		"""
		if face_image is None or face_image.size == 0:
			return None

		# ArcFace ONNX expects 112x112 input.
		resized = cv2.resize(face_image, (112, 112))
		embedding = self.recognizer.get_feat(resized)

		if embedding is None:
			return None

		embedding = np.asarray(embedding).squeeze()
		if embedding.ndim != 1:
			return None

		return embedding
