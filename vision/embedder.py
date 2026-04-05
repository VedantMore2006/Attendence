import cv2
import numpy as np
from insightface.app import FaceAnalysis


class FaceEmbedder:
	def __init__(self):
		"""
		Initialize ArcFace recognition model for lazy loading on first use.
		"""
		self.app = None
		self.rec_model = None
		self._init_error = None

	def _ensure_model_loaded(self):
		"""Lazy load the model on first use with error handling."""
		if self.app is not None:
			return  # Already loaded
		
		if self._init_error:
			raise self._init_error
		
		try:
			# Use FaceAnalysis which auto-downloads buffalo_l model
			self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
			self.app.prepare(ctx_id=-1, det_size=(640, 640))
			
			# Extract the recognition model - it's loaded as part of FaceAnalysis
			# The _models attribute contains individual models
			if hasattr(self.app, '_models'):
				for model in self.app._models:
					if hasattr(model, 'taskname') and model.taskname == 'recognition':
						self.rec_model = model
						break
			
			if self.rec_model is None and hasattr(self.app, 'models'):
				if isinstance(self.app.models, dict) and 'recognition' in self.app.models:
					self.rec_model = self.app.models['recognition']
			
			if self.rec_model is None:
				# Fallback: the app has a built-in method for embeddings
				self.rec_model = self.app
				
		except Exception as e:
			self._init_error = RuntimeError(f"Face model initialization failed: {e}")
			raise self._init_error

	def get_embedding(self, face_image):
		"""
		Input:
			face_image -> cropped face (112x112 BGR image)

		Output:
			embedding -> 512 dimensional vector
		"""
		if face_image is None or face_image.size == 0:
			return None

		try:
			self._ensure_model_loaded()
		except Exception as e:
			print(f"Skipping embedding extraction: {e}")
			return None

		try:
			# Ensure 112x112 input
			if face_image.shape[:2] != (112, 112):
				face_image = cv2.resize(face_image, (112, 112))
			
			# Prepare input for the model
			# Most ONNX models expect shape (batch, channels, height, width)
			face_chw = np.transpose(face_image, (2, 0, 1))  # HWC -> CHW
			batch_input = np.expand_dims(face_chw, 0).astype(np.float32)  # Add batch
			
			# Get embedding from the recognition model
			if hasattr(self.rec_model, 'forward'):
				embedding = self.rec_model.forward(batch_input)
			elif hasattr(self.rec_model, 'get_feat'):
				embedding = self.rec_model.get_feat(face_image)
			else:
				# Fallback: if rec_model is the app itself
				print("Warning: Using fallback embedding method")
				return None
			
			if embedding is None or embedding.size == 0:
				return None

			embedding = np.asarray(embedding).squeeze()
			if embedding.size == 0 or embedding.ndim != 1:
				return None

			return embedding
		except Exception as e:
			print(f"Error extracting embedding: {e}")
			return None
